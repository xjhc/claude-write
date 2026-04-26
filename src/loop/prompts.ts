import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Build copies src/prompts/ → dist/prompts/, so from either layout the
// prompts live at `../prompts` relative to this file's dir.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

function read(name: string): string {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) throw new Error(`prompt template missing: ${p}`);
  return fs.readFileSync(p, "utf8");
}

export const agentPrompt = read("agent.md");
