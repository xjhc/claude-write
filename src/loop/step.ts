import readline from "node:readline";

import type { ConversationMessage, LlmClient, TurnLog } from "../llm/client.js";
import type { Project } from "../state/project.js";
import {
  allocateSession,
  load as loadProject,
  loadConversation,
  saveConversation,
  saveTranscript,
  writeSessionJson as writeJson,
  writeSessionText as writeText,
} from "../state/project.js";
import { buildPerPassMessage } from "./compile-context.js";
import { runAgent, type AgentResult } from "./agent.js";
import { agentPrompt } from "./prompts.js";
import { MANUSCRIPT_FILE } from "../project-files.js";
import { xmlEscape } from "../util/xml.js";

const COMPACT_TOKEN_THRESHOLD = 80_000;
const COMPACT_CHAR_ESTIMATE_DIVISOR = 4;
const COMPACT_HEAD_CHARS = 120_000;
const COMPACT_TAIL_CHARS = 200_000;
const ONE_SHOT_REMINDER =
  "<reminder>Revise manuscript.md if useful.</reminder>";

export interface StepResult {
  finalText: string;
  stopReason: "final" | "capped" | "error";
  sessionPath: string;
}

export async function step(
  root: string,
  client: LlmClient,
  userMessage?: string,
): Promise<StepResult> {
  const project = loadProject(root);
  const sdir = allocateSession(project);

  const messages = loadConversation(project);
  const isFirstPass = messages.length === 0;

  // Auto-compact before running if conversation is getting large.
  if (!isFirstPass) {
    const estimatedTokens =
      JSON.stringify(messages).length / COMPACT_CHAR_ESTIMATE_DIVISOR;
    if (estimatedTokens > COMPACT_TOKEN_THRESHOLD) {
      process.stdout.write("[auto-compact: conversation too large, summarizing...]\n");
      const compacted = await compactMessages(messages, client, project);
      messages.length = 0;
      messages.push(...compacted);
    }
  }

  // Mark where this pass's new messages begin (for messages.md).
  const passStart = messages.length;
  const persistedUserMessages: ConversationMessage[] = [];

  const trimmedUserMessage = userMessage?.trim();
  if (trimmedUserMessage) {
    const msg: ConversationMessage = { role: "user", content: trimmedUserMessage };
    messages.push(msg);
    persistedUserMessages.push(msg);
  }

  // Per-pass context: filesystem state + (task on first pass).
  const passMessage = buildPerPassMessage(project, isFirstPass);
  messages.push({ role: "user", content: passMessage });
  writeText(sdir, "context.md", passMessage);

  process.stdout.write("thinking...\n");
  let turnIdx = 0;
  const observedTurns: TurnLog[] = [];
  const recordTurn = (turn: TurnLog) => {
    observedTurns.push(turn);
    turnIdx += 1;
    if (turn.text.trim()) {
      process.stdout.write(`\n[${turnIdx}] ${oneLine(turn.text, 200)}\n`);
    } else if (turn.toolUses.length > 0) {
      process.stdout.write(`\n[${turnIdx}]\n`);
    }
    for (const use of turn.toolUses) {
      process.stdout.write(
        `  → ${use.name}(${summarizeInput(use.input)})\n    ${oneLine(use.output, 80)}\n`,
      );
    }
  };
  let result: AgentResult | null = null;
  let runError: unknown = null;

  try {
    result = await runAgent(
      client,
      agentPrompt,
      messages,
      project.root,
      askUser,
      recordTurn,
    );
    if (result.stopReason === "final" && countSuccessfulManuscriptEdits(observedTurns) === 1) {
      messages.push({
        role: "user",
        content: [
          ONE_SHOT_REMINDER,
          buildPerPassMessage(project, false),
        ].join("\n\n"),
      });
      result = await runAgent(
        client,
        agentPrompt,
        messages,
        project.root,
        askUser,
        recordTurn,
      );
    }
  } catch (err) {
    runError = err;
  }

  const turns = observedTurns.length ? observedTurns : result?.turns ?? [];
  const conversationSaved = runError === null;
  if (conversationSaved) {
    // Save conversation-shaped continuity, not raw tool-call payloads. The
    // files on disk are durable state; exact raw turns are kept in this
    // session's messages.json/messages.md for audit and replay.
    saveConversation(
      project,
      buildPersistedConversation(
        messages,
        passStart,
        sdir.index,
        turns,
        isFirstPass,
        project.meta.task,
        persistedUserMessages,
      ),
    );
  }

  // Compute edit summaries from successful tool uses only.
  const edits = collectEdits(turns);

  writeJson(sdir, "agent.json", {
    finalText: result?.finalText ?? null,
    error: runError ? serializeError(runError) : null,
    stopReason: runError ? "error" : result?.stopReason ?? null,
    edits,
    conversationSaved,
    turns: turns.map((t) => ({
      text: truncate(t.text),
      toolUses: t.toolUses.map((u) => ({
        name: u.name,
        input: truncateInput(u.input),
        output: truncate(u.output),
      })),
    })),
  });

  // messages.md: system prompt + full conversation history as persisted in memory.
  writeText(
    sdir,
    "messages.md",
    renderMessagesLog(agentPrompt, messages, passStart, turns),
  );
  writeJson(sdir, "messages.json", {
    system: agentPrompt,
    messages,
  });

  writeJson(sdir, "telemetry.json", {
    turns: turns.map((t, i) => ({
      turn: i + 1,
      request: t.request,
      responseTextChars: t.text.length,
      toolCalls: t.toolUses.length,
    })),
  });

  if (runError) {
    throw runError;
  }
  if (!result) {
    throw new Error("Agent finished without a result.");
  }

  return {
    finalText: result.finalText,
    stopReason: result.stopReason,
    sessionPath: sdir.path,
  };
}

async function compactMessages(
  messages: ConversationMessage[],
  client: LlmClient,
  project: Project,
): Promise<ConversationMessage[]> {
  const transcriptPath = saveTranscript(project, messages);
  const timestamp = Date.now();
  process.stdout.write(`[transcript saved: ${transcriptPath}]\n`);

  const conversationText = buildCompactionInput(project, messages);
  const summary = await client.complete(
    "You are a conversation summarizer.",
    "Summarize this conversation for continuity. Preserve: " +
      "1) the original task, 2) what has been accomplished, " +
      "3) current state of the draft and files, 4) key decisions made, " +
      "5) any open threads or next steps. Be concise but complete.\n\n" +
      conversationText,
    { maxTokens: 2000 },
  );

  return [
    {
      role: "user",
      content: `[Conversation compressed at ${new Date(timestamp).toISOString()}]\n\n${summary}`,
    },
  ];
}

function buildCompactionInput(project: Project, messages: ConversationMessage[]): string {
  const serialized = JSON.stringify(messages);
  const currentState = buildPerPassMessage(project, false);
  const excerpt =
    serialized.length <= COMPACT_HEAD_CHARS + COMPACT_TAIL_CHARS
      ? serialized
      : [
          serialized.slice(0, COMPACT_HEAD_CHARS),
          `\n...[${serialized.length - COMPACT_HEAD_CHARS - COMPACT_TAIL_CHARS} chars elided]...\n`,
          serialized.slice(-COMPACT_TAIL_CHARS),
        ].join("");

  return [
    `<original_task>\n${project.meta.task}\n</original_task>`,
    `<current_state>\n${currentState}\n</current_state>`,
    `<conversation_json_excerpt>\n${excerpt}\n</conversation_json_excerpt>`,
  ].join("\n\n");
}

function renderMessagesLog(
  system: string,
  messages: ConversationMessage[],
  passStart: number,
  turns: TurnLog[],
): string {
  const parts: string[] = [];
  const sep = "=".repeat(72);

  parts.push(`${sep}\nSYSTEM (${system.length} chars)\n${sep}\n\n${system}`);

  messages.forEach((msg, i) => {
    const marker = i >= passStart ? " / current pass" : "";
    const body = renderConversationMessage(msg);
    parts.push(
      `${sep}\n${msg.role.toUpperCase()} ${i + 1}${marker} (${body.length} chars)\n${sep}\n\n${body}`,
    );
  });

  if (turns.length > 0) {
    const rows = turns.map((turn, i) => {
      const req = turn.request
        ? `${turn.request.totalChars} chars (system ${turn.request.systemChars} / tools ${turn.request.toolsChars} / messages ${turn.request.messagesChars})`
        : "unknown";
      return `turn ${i + 1}: request ${req}; responseTextChars ${turn.text.length}; toolCalls ${turn.toolUses.length}`;
    });
    parts.push(`${sep}\nTURN TELEMETRY\n${sep}\n\n${rows.join("\n")}`);
  }

  return parts.join("\n\n") + "\n";
}

function renderConversationMessage(msg: ConversationMessage): string {
  if (typeof msg.content === "string") return msg.content;
  const blocks = msg.content as Array<Record<string, unknown>>;
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(String(block.text ?? ""));
    } else if (block.type === "tool_use") {
      parts.push(`[tool_use] ${String(block.name ?? "")}`);
      const input = block.input && typeof block.input === "object"
        ? (block.input as Record<string, unknown>)
        : {};
      parts.push(formatToolInput(input));
    } else if (block.type === "tool_result") {
      parts.push(`[tool_result] ${String(block.tool_use_id ?? "")}`);
      parts.push(String(block.content ?? ""));
    } else {
      parts.push(JSON.stringify(block));
    }
  }
  return parts.join("\n").trim() || "(empty)";
}

function buildPersistedConversation(
  messages: ConversationMessage[],
  passStart: number,
  passIndex: number,
  turns: TurnLog[],
  isFirstPass: boolean,
  task: string,
  persistedUserMessages: ConversationMessage[],
): ConversationMessage[] {
  const base = JSON.parse(JSON.stringify(messages.slice(0, passStart))) as ConversationMessage[];
  if (isFirstPass) {
    base.push({ role: "user", content: `<task>\n${xmlEscape(task)}\n</task>` });
  }
  base.push(...persistedUserMessages);
  base.push({
    role: "assistant",
    content: [{ type: "text", text: summarizePass(passIndex, turns) }],
  });
  return base;
}

function summarizePass(
  passIndex: number,
  turns: TurnLog[],
): string {
  const edits = collectEdits(turns);
  const editText = edits.length
    ? edits
        .map((e) => `${e.tool} ${e.path} (${e.chars} chars)`)
        .join("; ")
    : "no successful edits";
  const failedTools = turns.flatMap((turn) =>
    turn.toolUses
      .filter((use) => isToolError(use.output))
      .map((use) => `${use.name}: ${oneLine(use.output, 160)}`),
  );
  const parts = [
    `Pass ${String(passIndex).padStart(4, "0")}: ${editText}.`,
  ];
  if (failedTools.length) parts.push(`Tool errors: ${failedTools.join("; ")}.`);
  return parts.join(" ");
}

function isToolError(output: string): boolean {
  return output.startsWith("error:");
}

function countSuccessfulManuscriptEdits(turns: TurnLog[]): number {
  let count = 0;
  for (const turn of turns) {
    for (const use of turn.toolUses) {
      if (
        String(use.input?.path ?? "") === MANUSCRIPT_FILE &&
        (use.name === "write" || use.name === "patch") &&
        use.output.startsWith("ok:")
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function collectEdits(turns: TurnLog[]): Array<{ path: string; tool: string; chars: number }> {
  const edits: Array<{ path: string; tool: string; chars: number }> = [];
  for (const t of turns) {
    for (const u of t.toolUses) {
      const ok = typeof u.output === "string" && u.output.startsWith("ok:");
      if (!ok) continue;
      if (u.name === "write") {
        edits.push({
          path: String(u.input?.path ?? ""),
          tool: "write",
          chars: String(u.input?.content ?? "").length,
        });
      } else if (u.name === "patch") {
        const find = String(u.input?.find ?? "");
        const replace = String(u.input?.replace ?? "");
        edits.push({
          path: String(u.input?.path ?? ""),
          tool: find === "" ? "append" : "patch",
          chars: replace.length,
        });
      }
    }
  }
  return edits;
}

function serializeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
    };
  }
  return { name: "Error", message: String(err) };
}

function formatToolInput(input: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") {
      if (v.includes("\n") || v.length > 80) {
        lines.push(`${k} (${v.length} chars):`);
        lines.push("  " + v.split("\n").join("\n  "));
      } else {
        lines.push(`${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines.join("\n");
}

function truncate(text: string): string {
  if (text.length <= 400) return text;
  return text.slice(0, 200) + ` …[${text.length - 400} chars elided]… ` + text.slice(-200);
}

function truncateInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === "string" && v.length > 400 ? truncate(v) : v;
  }
  return out;
}

function oneLine(s: string, cap: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > cap ? flat.slice(0, cap - 1) + "…" : flat;
}

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const str = typeof v === "string" ? `"${oneLine(v, 60)}"` : JSON.stringify(v);
    parts.push(`${k}=${str}`);
  }
  return oneLine(parts.join(", "), 120);
}

async function askUser(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return `error: cannot ask user because stdin is not a TTY. Question was: ${question}`;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve) => {
      rl.question(`\n? ${question}\n> `, (a) => resolve(a.trim()));
    });
  } finally {
    rl.close();
  }
}
