import fs from "node:fs";
import path from "node:path";

import { createClient, defaultModel, PROVIDERS } from "./llm/client.js";
import type { Provider } from "./llm/client.js";
import {
  exists as projectExists,
  findProjectRoot,
  init as initProject,
  load as loadProject,
} from "./state/project.js";
import { step } from "./loop/step.js";

function resolveRoot(workDir?: string): string {
  if (workDir) return path.resolve(workDir);
  const found = findProjectRoot(process.cwd());
  return found ?? process.cwd();
}

function parseProvider(raw: string | undefined): Provider | undefined {
  if (!raw) return undefined;
  if (!PROVIDERS.includes(raw as Provider)) {
    throw new Error(
      `Unknown provider "${raw}". Expected one of: ${PROVIDERS.join(", ")}`,
    );
  }
  return raw as Provider;
}

export async function cmdNew(
  prompt: string,
  opts: { dir?: string; model?: string; provider?: string },
): Promise<void> {
  const root = opts.dir ? path.resolve(opts.dir) : process.cwd();
  fs.mkdirSync(root, { recursive: true });
  if (projectExists(root)) {
    throw new Error(`A claude-write project already exists at ${root}`);
  }
  const provider: Provider = parseProvider(opts.provider) ?? "anthropic";
  const model = opts.model ?? defaultModel(provider);
  initProject(root, { task: prompt, provider, model });
  console.log(`Created claude-write project at ${root}`);
  console.log(`  provider: ${provider}`);
  console.log(`  model:    ${model}`);
  console.log(`\nNext: run 'claude-write step -d ${root}'`);
}

export function cmdStatus(opts: { dir?: string }): void {
  const root = resolveRoot(opts.dir);
  if (!projectExists(root)) {
    console.error(`No claude-write project at ${root}.`);
    process.exitCode = 1;
    return;
  }
  const p = loadProject(root);
  console.log(`Project: ${path.basename(p.root)}`);
  console.log(`  root:     ${p.root}`);
  console.log(`  provider: ${p.meta.provider}`);
  console.log(`  model:    ${p.meta.model}`);
  console.log(`  task:     ${firstLine(p.meta.task)}`);
}

function firstLine(s: string): string {
  const line = s.split("\n")[0];
  return line.length > 100 ? line.slice(0, 99) + "…" : line;
}

export async function cmdStep(opts: {
  dir?: string;
  model?: string;
  message?: string;
  provider?: string;
}): Promise<void> {
  const root = resolveRoot(opts.dir);
  const project = loadProject(root);
  const provider = parseProvider(opts.provider) ?? project.meta.provider;
  const model = opts.model ?? project.meta.model;
  const client = createClient({ provider, model });

  const result = await step(root, client, opts.message);
  const finalText = result.finalText.trim();
  if (finalText) {
    console.log(`\nfinal: ${firstLine(finalText)}`);
  }
  if (result.stopReason === "capped") {
    process.exitCode = 3;
    return;
  }
}
