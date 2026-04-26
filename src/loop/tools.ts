import fs from "node:fs";
import path from "node:path";

import type { Tool } from "../llm/client.js";
import { PROJECT_FILES, isProjectFile } from "../project-files.js";

const MAX_FILE_BYTES = 500_000;
// Overwriting an existing file larger than this threshold is refused — the
// model's output budget would silently truncate a long manuscript. Force
// patch() for mature content. 8KB comfortably covers haikus, poems, short
// stories, and small essays, while blocking chapter-scale accidents.
const WRITE_OVERWRITE_LIMIT_BYTES = 8_000;
const HARNESS_SUBDIR = ".claude-write";
const PROJECT_FILE_ERROR = `error: project files are ${PROJECT_FILES.join(" and ")}`;

export interface AgentState {
  projectRoot: string;
}

export const agentTools: Tool[] = [
  {
    name: "read",
    description:
      "Read manuscript.md or memory.md. Optionally restrict to a 1-indexed inclusive line range.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", enum: PROJECT_FILES, description: "project file" },
        startLine: { type: "integer", description: "optional; 1-indexed first line to include" },
        endLine: { type: "integer", description: "optional; 1-indexed last line to include (inclusive)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write",
    description:
      "Replace manuscript.md or memory.md with full content. For local edits or growth, prefer patch.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", enum: PROJECT_FILES, description: "project file" },
        content: { type: "string", description: "full file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "patch",
    description:
      "Edit manuscript.md or memory.md locally. If `find` is non-empty, it must match exactly once and is replaced with `replace`. If `find` is empty, `replace` is appended.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", enum: PROJECT_FILES, description: "project file" },
        find: { type: "string", description: "literal substring to replace; must appear exactly once. Empty string means append." },
        replace: { type: "string", description: "replacement text (or text to append when find is empty)" },
      },
      required: ["path", "find", "replace"],
    },
  },
  {
    name: "list",
    description:
      "List project files with byte sizes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ask",
    description:
      "Pause and ask the user a clarifying question. Use only when missing user input is required for correctness.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "the question" },
      },
      required: ["question"],
    },
  },
];

function resolveInsideProject(state: AgentState, relPath: string): string | null {
  const abs = path.resolve(state.projectRoot, relPath);
  if (abs === state.projectRoot) return abs;
  if (!abs.startsWith(state.projectRoot + path.sep)) return null;
  return abs;
}

function isInsideHarnessDir(state: AgentState, abs: string): boolean {
  const harnessDir = path.join(state.projectRoot, HARNESS_SUBDIR);
  return abs === harnessDir || abs.startsWith(harnessDir + path.sep);
}

function relativeProjectPath(state: AgentState, abs: string): string {
  return path.relative(state.projectRoot, abs).split(path.sep).join("/");
}

function isAgentProjectFile(state: AgentState, abs: string): boolean {
  return isProjectFile(relativeProjectPath(state, abs));
}

export function handleTool(
  state: AgentState,
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    case "read":
      return handleRead(
        state,
        String(input.path ?? ""),
        typeof input.startLine === "number" ? input.startLine : undefined,
        typeof input.endLine === "number" ? input.endLine : undefined,
      );
    case "write":
      return handleWrite(state, String(input.path ?? ""), String(input.content ?? ""));
    case "patch":
      return handlePatch(
        state,
        String(input.path ?? ""),
        String(input.find ?? ""),
        String(input.replace ?? ""),
      );
    case "list":
      return handleList(state, input.path ? String(input.path) : "");
    default:
      return `error: unknown tool '${name}'`;
  }
}

function handleRead(
  state: AgentState,
  relPath: string,
  startLine?: number,
  endLine?: number,
): string {
  if (!relPath) return "error: 'path' is required";
  const abs = resolveInsideProject(state, relPath);
  if (!abs) return "error: path must be inside the project";
  if (!isAgentProjectFile(state, abs)) return PROJECT_FILE_ERROR;
  if (!fs.existsSync(abs)) return `error: file not found: ${relPath}`;
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return `error: not a file: ${relPath}`;
  if (stat.size > MAX_FILE_BYTES) {
    return `error: file is ${stat.size} bytes (max ${MAX_FILE_BYTES})`;
  }
  const content = fs.readFileSync(abs, "utf8");
  if (startLine === undefined && endLine === undefined) return content;
  const lines = content.split("\n");
  const start = Math.max(1, Math.floor(startLine ?? 1));
  const end = Math.min(lines.length, Math.floor(endLine ?? lines.length));
  if (start > end) {
    return `error: startLine (${start}) > endLine (${end}); file has ${lines.length} lines`;
  }
  const slice = lines.slice(start - 1, end).join("\n");
  return `[lines ${start}-${end} of ${lines.length}]\n${slice}`;
}

function handleWrite(state: AgentState, relPath: string, content: string): string {
  if (!relPath) return "error: 'path' is required";
  const abs = resolveInsideProject(state, relPath);
  if (!abs) return "error: path must be inside the project";
  if (isInsideHarnessDir(state, abs)) return "error: cannot write inside .claude-write/";
  if (!isAgentProjectFile(state, abs)) return PROJECT_FILE_ERROR;
  if (fs.existsSync(abs)) {
    const stat = fs.statSync(abs);
    if (stat.isFile() && stat.size > WRITE_OVERWRITE_LIMIT_BYTES) {
      return `error: ${relPath} already exists at ${stat.size} bytes (over ${WRITE_OVERWRITE_LIMIT_BYTES}B threshold). write() would likely truncate — use patch() to edit this file locally.`;
    }
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return `ok: wrote ${content.length} chars to ${relPath}; ${fileStats(abs)}`;
}

function handlePatch(
  state: AgentState,
  relPath: string,
  find: string,
  replace: string,
): string {
  if (!relPath) return "error: 'path' is required";
  const abs = resolveInsideProject(state, relPath);
  if (!abs) return "error: path must be inside the project";
  if (isInsideHarnessDir(state, abs)) return "error: cannot patch inside .claude-write/";
  if (!isAgentProjectFile(state, abs)) return PROJECT_FILE_ERROR;

  if (find === "") {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
    const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(abs, current + sep + replace);
    return `ok: appended ${replace.length} chars to ${relPath}; ${fileStats(abs)}`;
  }

  if (!fs.existsSync(abs)) return `error: file not found: ${relPath}`;
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return `error: not a file: ${relPath}`;
  const content = fs.readFileSync(abs, "utf8");
  const count = countOccurrences(content, find);
  if (count === 0) {
    return "error: 'find' not found in file. read the relevant section first or include more surrounding context.";
  }
  if (count > 1) {
    return `error: 'find' matches ${count} places in ${relPath}; include more surrounding context to make it unique.`;
  }
  fs.writeFileSync(abs, content.replace(find, replace));
  return `ok: patched ${relPath} (replaced ${find.length} chars with ${replace.length}); ${fileStats(abs)}`;
}

function fileStats(abs: string): string {
  const content = fs.readFileSync(abs, "utf8");
  const bytes = fs.statSync(abs).size;
  const lines = countTextLines(content);
  const words = (content.match(/\S+/g) || []).length;
  return `now ${formatCount(lines, "line")}, ${formatCount(words, "word")}, ${formatCount(bytes, "byte")}`;
}

function countTextLines(content: string): number {
  if (content.length === 0) return 0;
  const withoutFinalNewline = content.endsWith("\n") ? content.slice(0, -1) : content;
  return withoutFinalNewline.split("\n").length;
}

function formatCount(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

function handleList(state: AgentState, relPath: string): string {
  if (relPath && relPath !== ".") return PROJECT_FILE_ERROR;
  const entries = walkProjectFiles(state.projectRoot).map(
    (e) => `${e.path} (${e.bytes} bytes)`,
  );
  return entries.length ? entries.join("\n") : "(no files)";
}

export function walkProjectFiles(
  projectRoot: string,
  relativeTo: string = projectRoot,
): Array<{ path: string; bytes: number }> {
  const out: Array<{ path: string; bytes: number }> = [];
  for (const rel of PROJECT_FILES) {
    const full = path.join(projectRoot, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    out.push({ path: path.relative(relativeTo, full), bytes: stat.size });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export interface MarkdownDescription {
  words: number;
  lines: number;
  headings: Array<{ line: number; level: number; text: string }>;
  headingsTotal: number;
}

const MAX_HEADINGS_PER_FILE = 50;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

// Describe a markdown file's shape so compile-context can surface it to the
// agent without forcing a full-file read. Cheap: one file read, one pass.
// Skips headings inside fenced code blocks — a Python comment like "# tests/x.py"
// is not a real heading, and treating it as one pollutes the filesystem map.
export function describeMarkdownFile(absPath: string): MarkdownDescription {
  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  const headings: Array<{ line: number; level: number; text: string }> = [];
  let headingsTotal = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(HEADING_RE);
    if (!m) continue;
    const text = m[2].replace(/[*_`]/g, "").trim();
    if (!text) continue;
    headingsTotal++;
    if (headings.length < MAX_HEADINGS_PER_FILE) {
      headings.push({ line: i + 1, level: m[1].length, text });
    }
  }
  const words = (content.match(/\S+/g) || []).length;
  return { words, lines: countTextLines(content), headings, headingsTotal };
}
