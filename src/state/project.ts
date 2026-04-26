import fs from "node:fs";
import path from "node:path";

import type { ConversationMessage, Provider } from "../llm/client.js";
import { PROJECT_FILES } from "../project-files.js";

export interface Meta {
  provider: Provider;
  model: string;
  task: string;
}

export interface Project {
  root: string;
  dir: string;
  meta: Meta;
}

const SUBDIR = ".claude-write";

export function projectDir(root: string): string {
  return path.join(root, SUBDIR);
}

export function exists(root: string): boolean {
  return fs.existsSync(path.join(projectDir(root), "meta.json"));
}

export function init(
  root: string,
  opts: { task: string; provider: Provider; model: string },
): Project {
  const dir = projectDir(root);
  fs.mkdirSync(path.join(dir, "sessions"), { recursive: true });
  const meta: Meta = {
    provider: opts.provider,
    model: opts.model,
    task: opts.task.trim(),
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  for (const file of PROJECT_FILES) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) fs.writeFileSync(p, "");
  }

  return { root, dir, meta };
}

export function load(root: string): Project {
  if (!exists(root)) {
    throw new Error(
      `No claude-write project at ${root}. Run 'claude-write new "<task>"' first.`,
    );
  }
  const dir = projectDir(root);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")) as Meta;
  return { root, dir, meta };
}

export function findProjectRoot(startDir: string): string | null {
  let cur = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(cur, SUBDIR, "meta.json"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export interface SessionDir {
  index: number;
  path: string;
}

export function allocateSession(project: Project): SessionDir {
  const root = path.join(project.dir, "sessions");
  fs.mkdirSync(root, { recursive: true });
  const existing = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map((d) => parseInt(d.name, 10))
    .sort((a, b) => a - b);
  const next = existing.length ? existing[existing.length - 1] + 1 : 1;
  const p = path.join(root, String(next).padStart(4, "0"));
  fs.mkdirSync(p, { recursive: true });
  return { index: next, path: p };
}

export function writeSessionText(dir: SessionDir, name: string, text: string): void {
  fs.writeFileSync(path.join(dir.path, name), text);
}

export function writeSessionJson(dir: SessionDir, name: string, obj: unknown): void {
  fs.writeFileSync(path.join(dir.path, name), JSON.stringify(obj, null, 2));
}

const CONVERSATION_FILE = "conversation.json";
const TRANSCRIPTS_SUBDIR = "transcripts";

export function loadConversation(project: Project): ConversationMessage[] {
  const p = path.join(project.dir, CONVERSATION_FILE);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("conversation root is not an array");
    }
    return parsed as ConversationMessage[];
  } catch (err) {
    const backup = path.join(project.dir, `conversation.corrupt.${Date.now()}.json`);
    fs.renameSync(p, backup);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not parse ${p} (${reason}). Moved it to ${backup}; restore or inspect it before retrying.`,
    );
  }
}

export function saveConversation(project: Project, messages: ConversationMessage[]): void {
  const p = path.join(project.dir, CONVERSATION_FILE);
  fs.writeFileSync(p, JSON.stringify(messages, null, 2));
}

export function saveTranscript(project: Project, messages: ConversationMessage[]): string {
  const dir = path.join(project.dir, TRANSCRIPTS_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `transcript_${Date.now()}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join("\n");
  fs.writeFileSync(p, lines + "\n");
  return p;
}
