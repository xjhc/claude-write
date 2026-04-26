#!/usr/bin/env node
import "dotenv/config";

import { Command } from "commander";
import { cmdNew, cmdStatus, cmdStep } from "./main.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("claude-write")
    .description("A minimal writing agent")
    .version("0.1.0", "-V, --version", "print version")
    .helpOption("-h, --help", "show help");

  program
    .command("new")
    .argument("<task>", "the task")
    .option("-d, --dir <path>", "project directory (default: current directory)")
    .option("-p, --provider <provider>", "llm provider: anthropic | azure | openai")
    .option("-m, --model <model>", "model id (anthropic/openai) or deployment name (azure)")
    .description("create a new project in <dir>")
    .action(async (task: string, opts) => {
      await cmdNew(task, opts);
    });

  program
    .command("status")
    .option("-d, --dir <path>", "project directory")
    .description("show project summary")
    .action((opts) => cmdStatus(opts));

  program
    .command("step")
    .option("-d, --dir <path>", "project directory")
    .option("-p, --provider <provider>", "override provider")
    .option("-m, --model <model>", "override model")
    .option("--message <text>", "add a user message before this pass")
    .description("run one agent pass")
    .action(async (opts) => {
      await cmdStep(opts);
    });

  program.showHelpAfterError("(add -h for help)");

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`claude-write: ${msg}`);
    process.exit(1);
  }
}

main();
