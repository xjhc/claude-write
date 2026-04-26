import { createAnthropicClient } from "./anthropic.js";
import { createAzureClient } from "./azure.js";
import { createOpenAIClient } from "./openai.js";

export type Provider = "anthropic" | "azure" | "openai";

export interface CompleteOpts {
  maxTokens?: number;
  temperature?: number;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolLoopOpts {
  maxTokens?: number;
  maxIterations?: number;
  onTurn?: (turn: TurnLog) => void;
}

export type ToolHandler = (
  name: string,
  input: Record<string, unknown>,
) => string | Promise<string>;

export interface ToolUseLog {
  name: string;
  input: Record<string, unknown>;
  output: string;
}

// Sizes of what was actually sent in this turn's API request, measured in
// chars of the outgoing payload. Used for honest context-engineering
// visibility — not a reconstructed "what the model saw" summary.
export interface RequestSizes {
  systemChars: number;
  toolsChars: number;
  messagesChars: number;
  totalChars: number;
}

// One LLM round-trip: the assistant's text from this turn, plus any tool
// uses the model issued during this turn (and the outputs we fed back).
export interface TurnLog {
  text: string;
  toolUses: ToolUseLog[];
  request?: RequestSizes;
}

export interface ToolLoopResult {
  finalText: string;
  turns: TurnLog[];
}

export class ToolLoopCappedError extends Error {
  constructor(
    public readonly maxIterations: number,
    public readonly turns: TurnLog[],
  ) {
    super(`Tool loop exceeded ${maxIterations} iterations without a final response.`);
    this.name = "ToolLoopCappedError";
  }
}

// Serializable conversation message (Anthropic-compatible content structure).
// Stored to conversation.json; both provider clients convert to/from their
// native wire formats at API call time. No cache_control fields — those are
// added transiently at API call time and never persisted.
export type TextContent = { type: "text"; text: string };
export type ToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type UserContent = string | Array<TextContent | ToolResultContent>;
export type AssistantContent = Array<TextContent | ToolUseContent>;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: UserContent | AssistantContent;
}

export interface LlmClient {
  provider: Provider;
  model: string;
  complete(system: string, user: string, opts?: CompleteOpts): Promise<string>;
  // messages is mutated in-place: assistant turns and tool-result user turns
  // are appended during the loop. The caller owns the array and persists it
  // across passes.
  toolLoop(
    system: string,
    messages: ConversationMessage[],
    tools: Tool[],
    handler: ToolHandler,
    opts?: ToolLoopOpts,
  ): Promise<ToolLoopResult>;
}

export const PROVIDERS: Provider[] = ["anthropic", "azure", "openai"];

export function createClient(opts: { provider?: Provider; model?: string } = {}): LlmClient {
  const provider = opts.provider ?? "anthropic";
  switch (provider) {
    case "anthropic":
      return createAnthropicClient(opts.model);
    case "azure":
      return createAzureClient(opts.model);
    case "openai":
      return createOpenAIClient(opts.model);
  }
}

export function defaultModel(provider: Provider): string {
  switch (provider) {
    case "anthropic":
      return "claude-opus-4-7";
    case "azure":
      return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";
    case "openai":
      return process.env.OPENAI_MODEL ?? "gpt-5.4";
  }
}
