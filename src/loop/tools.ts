import fs from "node:fs";
import path from "node:path";

import type { Tool } from "../llm/client.js";
import {
  MANUSCRIPT_FILE,
  MEMORY_FILE,
  PROJECT_FILES,
  isProjectFile,
} from "../project-files.js";
import {
  listNotes,
  outline,
  patchSection,
  readSection,
  render,
  replaceInSection,
  resolveNote,
  unresolved,
} from "../util/sections.js";
import { defineEntity, findReferences, resolveTerms } from "../util/entities.js";
import { check, suppress } from "../util/diagnostics.js";

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
  {
    name: "outline",
    description:
      "Return the manuscript's section outline: id, optional title/summary, word count, and content hash per section. Cheap structural read; prefer this over reading the whole file. Unsectioned manuscripts return one synthetic entry with id '__whole_file__'.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "read_section",
    description:
      "Read one section of the manuscript by id. Returns body and current hash. Save the hash if you intend to edit the section.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "section id" } },
      required: ["id"],
    },
  },
  {
    name: "patch_section",
    description:
      "Replace a section's body with new content. `content` is the BODY ONLY — do NOT include the surrounding <section ...> ... </section> tags; the harness keeps those (and their id/title/summary attributes) in place. To change those attributes, you must rewrite the file via write() or use replace_in_section on the open tag. Requires expectedHash from the most recent read_section/outline. Inside content, reserved tags (<section>, <note>) must still be well-formed; non-reserved markup-shaped text passes through.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "section id" },
        content: { type: "string", description: "new section body" },
        expectedHash: { type: "string", description: "section hash from your last read" },
      },
      required: ["id", "content", "expectedHash"],
    },
  },
  {
    name: "replace_in_section",
    description:
      "Find/replace inside one section. 'find' must match exactly once inside the section. Requires expectedHash. Use this for local edits; use patch_section for whole-section rewrites.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "section id" },
        find: { type: "string", description: "literal substring; must match exactly once in the section" },
        replace: { type: "string", description: "replacement text" },
        expectedHash: { type: "string", description: "section hash from your last read" },
      },
      required: ["id", "find", "replace", "expectedHash"],
    },
  },
  {
    name: "render",
    description:
      "Return the manuscript with structural markup stripped: <section> tags removed (body kept), all <note> blocks removed, entity escapes decoded. The publish-clean view.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "notes",
    description:
      "List every <note> in the manuscript, grouped with its containing section, source (agent|user), and status (open|addressed|deferred). Each entry includes an index for resolve_note.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "unresolved",
    description:
      "Return user-authored notes (<note source=\"user\">) with status=open. The agent's punch list. Address them and call resolve_note.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "check",
    description:
      "Run mechanical lints over the manuscript. Reports missing summaries, pacing outliers (sections far from median word count), and word-level repetition. Each finding has a stable id; pass it to suppress() if the call-out is intentional. Semantic issues (continuity, POV/tense drift, dangling promises) are not lints — read the prose and judge them yourself.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "suppress",
    description:
      "Mark a check() finding as intentional. Adds the id to the `## Suppressed` block in memory.md with a reason. Idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "finding id (12 hex chars from check())" },
        reason: { type: "string", description: "short rationale recorded alongside the id" },
      },
      required: ["id", "reason"],
    },
  },
  {
    name: "define",
    description:
      "Look up an entity (character, place, theme) by name in memory.md. Returns the matching `## Name` block. Case-insensitive name match. Use this for go-to-definition on prose entities.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "entity name (case-insensitive)" } },
      required: ["name"],
    },
  },
  {
    name: "references",
    description:
      "Find every mention of an entity in the manuscript. Searches the canonical name plus any aliases declared in the entity's `## Name` block in memory.md (a single line `aliases: a, b, c`). Returns excerpts grouped by section with which alias matched. Pronouns are not aliases by convention; prefer names, nicknames, titles, and distinctive phrases.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "entity name (case-insensitive)" } },
      required: ["name"],
    },
  },
  {
    name: "resolve_note",
    description:
      "Transition a note's status. The expectedHash here is the NOTE hash returned by notes() / unresolved() — NOT a section hash. If you just edited the containing section, the notes inside it got new hashes too; call unresolved() again before resolving. Status preserves the audit trail; deletion would lose it.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "section id containing the note (empty string for top-level)" },
        index: { type: "integer", description: "per-section note index from notes() / unresolved()" },
        expectedHash: {
          type: "string",
          description: "note hash from notes() / unresolved() — NOT a section hash from outline / read_section / patch_section",
        },
        status: {
          type: "string",
          enum: ["open", "addressed", "deferred"],
          description: "new status",
        },
      },
      required: ["section", "index", "expectedHash", "status"],
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
    case "outline":
      return handleOutline(state);
    case "read_section":
      return handleReadSection(state, String(input.id ?? ""));
    case "patch_section":
      return handlePatchSection(
        state,
        String(input.id ?? ""),
        String(input.content ?? ""),
        String(input.expectedHash ?? ""),
      );
    case "replace_in_section":
      return handleReplaceInSection(
        state,
        String(input.id ?? ""),
        String(input.find ?? ""),
        String(input.replace ?? ""),
        String(input.expectedHash ?? ""),
      );
    case "render":
      return handleRender(state);
    case "notes":
      return handleNotes(state);
    case "unresolved":
      return handleUnresolved(state);
    case "resolve_note":
      return handleResolveNote(
        state,
        String(input.section ?? ""),
        typeof input.index === "number" ? input.index : Number(input.index ?? -1),
        String(input.expectedHash ?? ""),
        String(input.status ?? ""),
      );
    case "define":
      return handleDefine(state, String(input.name ?? ""));
    case "references":
      return handleReferences(state, String(input.name ?? ""));
    case "check":
      return handleCheck(state);
    case "suppress":
      return handleSuppress(state, String(input.id ?? ""), String(input.reason ?? ""));
    default:
      return `error: unknown tool '${name}'`;
  }
}

function manuscriptAbs(state: AgentState): string {
  return path.join(state.projectRoot, MANUSCRIPT_FILE);
}

// Returns the manuscript content or a marker. The structural tools call
// this from handlers; if the file is too large, the handler surfaces an
// error rather than silently loading and bloating the conversation.
type ManuscriptRead = { ok: true; content: string } | { ok: false; error: string };

function readManuscript(state: AgentState): ManuscriptRead {
  return readBoundedFile(manuscriptAbs(state), "manuscript.md");
}

function readMemory(state: AgentState): ManuscriptRead {
  return readBoundedFile(path.join(state.projectRoot, MEMORY_FILE), "memory.md");
}

function readBoundedFile(abs: string, label: string): ManuscriptRead {
  if (!fs.existsSync(abs)) return { ok: true, content: "" };
  const stat = fs.statSync(abs);
  if (stat.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `${label} is ${stat.size} bytes (max ${MAX_FILE_BYTES}); structural tools refuse to load it. Reduce the file before continuing.`,
    };
  }
  return { ok: true, content: fs.readFileSync(abs, "utf8") };
}

function sectionLabel(id: string): string {
  return id === "" ? "(top)" : id;
}

function handleOutline(state: AgentState): string {
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "(manuscript is empty)";
  const { entries, errors } = outline(r.content);
  const lines: string[] = [];
  if (errors.length) {
    lines.push("[parse errors]");
    for (const e of errors) lines.push(`- ${e.message} (pos ${e.position})`);
    lines.push("");
  }
  if (!entries.length) {
    lines.push("(no sections)");
    return lines.join("\n");
  }
  for (const e of entries) {
    const tag = e.synthetic ? `${e.id} [whole-file fallback]` : e.id;
    const title = e.title ? ` — ${e.title}` : "";
    const head = `- ${tag}${title} (${e.words} words, hash=${e.hash})`;
    lines.push(head);
    if (e.summary) lines.push(`    summary: ${e.summary}`);
  }
  return lines.join("\n");
}

function handleReadSection(state: AgentState, id: string): string {
  if (!id) return "error: 'id' is required";
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "error: manuscript is empty";
  const got = readSection(r.content, id);
  if (!got.ok) return `error: ${got.error}`;
  const tag = got.value.synthetic ? `${id} [whole-file fallback]` : id;
  return `[section ${tag}; hash=${got.value.hash}]\n${got.value.content}`;
}

function handlePatchSection(
  state: AgentState,
  id: string,
  content: string,
  expectedHash: string,
): string {
  if (!id) return "error: 'id' is required";
  if (!expectedHash) return "error: 'expectedHash' is required (read the section first)";
  const abs = manuscriptAbs(state);
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  const got = patchSection(r.content, id, content, expectedHash);
  if (!got.ok) return `error: ${got.error}`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, got.value.newSource);
  return `ok: patched section "${id}"; new hash=${got.value.hash}; ${fileStats(abs)}`;
}

function handleReplaceInSection(
  state: AgentState,
  id: string,
  find: string,
  replace: string,
  expectedHash: string,
): string {
  if (!id) return "error: 'id' is required";
  if (!expectedHash) return "error: 'expectedHash' is required (read the section first)";
  const abs = manuscriptAbs(state);
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "error: manuscript is empty";
  const got = replaceInSection(r.content, id, find, replace, expectedHash);
  if (!got.ok) return `error: ${got.error}`;
  fs.writeFileSync(abs, got.value.newSource);
  return `ok: replaced in section "${id}"; new hash=${got.value.hash}; ${fileStats(abs)}`;
}

function handleRender(state: AgentState): string {
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "(manuscript is empty)";
  const { rendered, errors } = render(r.content);
  if (errors.length) {
    const errLines = errors.map((e) => `- ${e.message}`).join("\n");
    return `[parse warnings]\n${errLines}\n\n[rendered]\n${rendered}`;
  }
  return rendered;
}

function handleNotes(state: AgentState): string {
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "(manuscript is empty)";
  const { entries, errors } = listNotes(r.content);
  const lines: string[] = [];
  if (errors.length) {
    lines.push("[parse errors]");
    for (const e of errors) lines.push(`- ${e.message}`);
    lines.push("");
  }
  if (!entries.length) {
    lines.push("(no notes)");
    return lines.join("\n");
  }
  for (const n of entries) {
    lines.push(
      `- [${sectionLabel(n.section)} #${n.indexInSection} hash=${n.hash}] ${n.source}/${n.status}: ${n.content}`,
    );
  }
  return lines.join("\n");
}

function handleUnresolved(state: AgentState): string {
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "(no unresolved user notes)";
  const { entries, errors } = unresolved(r.content);
  const lines: string[] = [];
  if (errors.length) {
    lines.push("[parse errors]");
    for (const e of errors) lines.push(`- ${e.message}`);
    lines.push("");
  }
  if (!entries.length) {
    lines.push("(no unresolved user notes)");
    return lines.join("\n");
  }
  for (const n of entries) {
    lines.push(`- [${sectionLabel(n.section)} #${n.indexInSection} hash=${n.hash}] ${n.content}`);
  }
  return lines.join("\n");
}

function memoryAbs(state: AgentState): string {
  return path.join(state.projectRoot, MEMORY_FILE);
}

function handleCheck(state: AgentState): string {
  const m = readManuscript(state);
  if (!m.ok) return `error: ${m.error}`;
  if (!m.content) return "(manuscript is empty)";
  const mem = readMemory(state);
  if (!mem.ok) return `error: ${mem.error}`;
  const { findings, errors } = check(m.content, mem.content);
  if (errors.length) {
    const lines = ["error: manuscript has parse errors:"];
    for (const e of errors) lines.push(`  - ${e.message}`);
    return lines.join("\n");
  }
  if (!findings.length) return "(no findings)";
  // Group by section for readability.
  const grouped = new Map<string, typeof findings>();
  for (const f of findings) {
    const arr = grouped.get(f.section) ?? [];
    arr.push(f);
    grouped.set(f.section, arr);
  }
  const lines: string[] = [];
  lines.push(`${findings.length} ${findings.length === 1 ? "finding" : "findings"}:`);
  for (const [section, fs] of grouped) {
    lines.push("");
    lines.push(`[${section}]`);
    for (const f of fs) {
      const tail = f.suggestion ? ` — ${f.suggestion}` : "";
      lines.push(`  - ${f.id} (${f.kind}) ${f.message}${tail}`);
    }
  }
  return lines.join("\n");
}

function handleSuppress(state: AgentState, id: string, reason: string): string {
  if (!id) return "error: 'id' is required";
  if (!reason.trim()) return "error: 'reason' is required";
  const mem = readMemory(state);
  if (!mem.ok) return `error: ${mem.error}`;
  const r = suppress(mem.content, id, reason);
  if (!r.ok) return `error: ${r.error}`;
  fs.writeFileSync(memoryAbs(state), r.value.newMemorySource);
  return `ok: suppressed ${id}`;
}

function handleDefine(state: AgentState, name: string): string {
  if (!name) return "error: 'name' is required";
  const mem = readMemory(state);
  if (!mem.ok) return `error: ${mem.error}`;
  if (!mem.content) return `error: memory.md is empty; no entity entries`;
  const r = defineEntity(mem.content, name);
  if (!r.ok) return `error: ${r.error}`;
  return r.value;
}

function handleReferences(state: AgentState, name: string): string {
  if (!name) return "error: 'name' is required";
  const m = readManuscript(state);
  if (!m.ok) return `error: ${m.error}`;
  if (!m.content) return "(manuscript is empty)";
  const mem = readMemory(state);
  if (!mem.ok) return `error: ${mem.error}`;
  const { entity, terms } = resolveTerms(mem.content, name);
  const r = findReferences(m.content, terms);
  if (!r.ok) return `error: ${r.error}`;

  const lines: string[] = [];
  if (entity) {
    const aliasNote =
      entity.aliases.length === 0
        ? "no aliases declared"
        : `${entity.aliases.length} ${entity.aliases.length === 1 ? "alias" : "aliases"}: ${entity.aliases.join(", ")}`;
  lines.push(`[entity "${entity.name}" — ${aliasNote}]`);
  } else {
    lines.push(`[no memory.md entry for "${name}"; searching name only]`);
  }

  const entries = r.value.entries;
  if (!entries.length) {
    lines.push("(no references found)");
    return lines.join("\n");
  }

  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = grouped.get(e.section) ?? [];
    arr.push(e);
    grouped.set(e.section, arr);
  }
  for (const [section, refs] of grouped) {
    const label = section === "" ? "(top)" : section;
    lines.push("");
    lines.push(`[${label}] ${refs.length} ${refs.length === 1 ? "match" : "matches"}`);
    for (const ref of refs) {
      lines.push(`  - via "${ref.matched}": ${ref.excerpt}`);
    }
  }
  return lines.join("\n");
}

function handleResolveNote(
  state: AgentState,
  section: string,
  index: number,
  expectedHash: string,
  status: string,
): string {
  // Empty string is a valid section attribution (top-level notes), so we
  // don't reject it. Only reject undefined-shaped input.
  if (!Number.isInteger(index) || index < 0) {
    return "error: 'index' must be a non-negative integer";
  }
  if (!expectedHash) return "error: 'expectedHash' is required (read via notes() / unresolved() first)";
  if (status !== "open" && status !== "addressed" && status !== "deferred") {
    return `error: 'status' must be one of open|addressed|deferred (got '${status}')`;
  }
  const abs = manuscriptAbs(state);
  const r = readManuscript(state);
  if (!r.ok) return `error: ${r.error}`;
  if (!r.content) return "error: manuscript is empty";
  const got = resolveNote(r.content, section, index, expectedHash, status);
  if (!got.ok) return `error: ${got.error}`;
  fs.writeFileSync(abs, got.value.newSource);
  return `ok: note [${sectionLabel(section)} #${index}] → ${status}; ${fileStats(abs)}`;
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
