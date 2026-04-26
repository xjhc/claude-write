import Anthropic from "@anthropic-ai/sdk";
import type {
  PromptCachingBetaCacheControlEphemeral,
  PromptCachingBetaMessageParam,
  PromptCachingBetaTextBlockParam,
  PromptCachingBetaTool,
  PromptCachingBetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/prompt-caching/messages";

import type {
  AssistantContent,
  CompleteOpts,
  ConversationMessage,
  LlmClient,
  Tool,
  ToolHandler,
  ToolLoopOpts,
  ToolLoopResult,
  ToolUseLog,
  TurnLog,
} from "./client.js";
import { ToolLoopCappedError } from "./client.js";
import { withRetries } from "./retry.js";

const PROMPT_CACHE: PromptCachingBetaCacheControlEphemeral = {
  type: "ephemeral",
};

export function createAnthropicClient(model?: string): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it in your shell and retry.",
    );
  }
  const sdk = new Anthropic({ apiKey });
  const resolved = model ?? "claude-opus-4-7";

  return {
    provider: "anthropic",
    model: resolved,
    async complete(system: string, user: string, opts: CompleteOpts = {}) {
      const messages: PromptCachingBetaMessageParam[] = [
        { role: "user", content: user },
      ];
      const res = await withRetries("anthropic complete", () =>
        sdk.beta.promptCaching.messages.create({
          model: resolved,
          ...(system ? { system: cachedSystem(system) } : {}),
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 1.0,
          messages: addCacheBreakpoints(messages),
        }),
      );
      const parts: string[] = [];
      for (const block of res.content) {
        if (block.type === "text") parts.push(block.text);
      }
      return parts.join("\n");
    },
    async toolLoop(
      system: string,
      messages: ConversationMessage[],
      tools: Tool[],
      handler: ToolHandler,
      opts: ToolLoopOpts = {},
    ): Promise<ToolLoopResult> {
      const maxIters = opts.maxIterations ?? 10;
      const anthropicSystem = system ? cachedSystem(system) : undefined;
      const anthropicTools = cachedTools(tools);

      const turns: TurnLog[] = [];
      const systemChars = system.length;
      const toolsChars = JSON.stringify(anthropicTools).length;

      for (let i = 0; i < maxIters; i++) {
        const apiMessages = toAnthropicMessages(messages);
        const messagesChars = JSON.stringify(apiMessages).length;
        const request = {
          systemChars,
          toolsChars,
          messagesChars,
          totalChars: systemChars + toolsChars + messagesChars,
        };

        const res = await withRetries("anthropic tool loop", () =>
          sdk.beta.promptCaching.messages.create({
            model: resolved,
            ...(anthropicSystem ? { system: anthropicSystem } : {}),
            messages: apiMessages,
            ...(anthropicTools.length ? { tools: anthropicTools } : {}),
            max_tokens: opts.maxTokens ?? 16384,
          }),
        );

        // Store assistant turn as plain ConversationMessage (no cache_control).
        const assistantContent: AssistantContent = res.content.map((block) => {
          if (block.type === "text") return { type: "text", text: block.text };
          if (block.type === "tool_use") {
            return {
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            };
          }
          // Preserve unrecognised block types (e.g. thinking) as-is.
          return block as unknown as AssistantContent[number];
        });
        messages.push({ role: "assistant", content: assistantContent });

        const textParts: string[] = [];
        for (const block of res.content) {
          if (block.type === "text") textParts.push(block.text);
        }
        const text = textParts.join("\n");

        if (res.stop_reason !== "tool_use") {
          const finalTurn: TurnLog = { text, toolUses: [], request };
          turns.push(finalTurn);
          if (opts.onTurn) opts.onTurn(finalTurn);
          return { finalText: text, turns };
        }

        const toolUses: ToolUseLog[] = [];
        const toolResults: PromptCachingBetaToolResultBlockParam[] = [];

        for (const block of res.content) {
          if (block.type === "tool_use") {
            let out: string;
            try {
              out = await handler(block.name, block.input as Record<string, unknown>);
            } catch (e) {
              out = `error: ${e instanceof Error ? e.message : String(e)}`;
            }
            toolUses.push({
              name: block.name,
              input: block.input as Record<string, unknown>,
              output: out,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: out,
            });
          }
        }

        messages.push({
          role: "user",
          content: toolResults.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.tool_use_id as string,
            content: r.content as string,
          })),
        });

        const turn: TurnLog = { text, toolUses, request };
        turns.push(turn);
        if (opts.onTurn) opts.onTurn(turn);
      }

      throw new ToolLoopCappedError(maxIters, turns);
    },
  };
}

// Convert ConversationMessage[] to Anthropic API format with cache_control.
// Two message-level breakpoints: messages[0] (stable task/summary) and the
// last user message (rolling). Together with system (1) and last tool (1),
// this fills the 4-breakpoint quota.
function toAnthropicMessages(
  messages: ConversationMessage[],
): PromptCachingBetaMessageParam[] {
  const lastUserIdx = findLastUserIdx(messages);
  return messages.map((msg, i) => {
    const addCache = i === 0 || i === lastUserIdx;
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        const content: PromptCachingBetaTextBlockParam[] = addCache
          ? [{ type: "text", text: msg.content, cache_control: PROMPT_CACHE }]
          : [{ type: "text", text: msg.content }];
        return { role: "user" as const, content };
      }
      const blocks = msg.content as Array<Record<string, unknown>>;
      const content = blocks.map((block, bi) => {
        const isLast = bi === blocks.length - 1;
        return addCache && isLast ? { ...block, cache_control: PROMPT_CACHE } : block;
      });
      return {
        role: "user" as const,
        content: content as unknown as PromptCachingBetaMessageParam["content"],
      };
    } else {
      return {
        role: "assistant" as const,
        content: msg.content as PromptCachingBetaMessageParam["content"],
      };
    }
  });
}

function findLastUserIdx(messages: ConversationMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

function addCacheBreakpoints(
  messages: PromptCachingBetaMessageParam[],
): PromptCachingBetaMessageParam[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const cachedMessage: PromptCachingBetaMessageParam =
      typeof message.content === "string"
        ? {
            role: "user",
            content: [{ type: "text", text: message.content, cache_control: PROMPT_CACHE }],
          }
        : {
            role: "user",
            content: (message.content as unknown as Array<Record<string, unknown>>).map(
              (block, index, arr) =>
                index === arr.length - 1
                  ? { ...block, cache_control: PROMPT_CACHE }
                  : block,
            ) as unknown as PromptCachingBetaMessageParam["content"],
          };
    return [...messages.slice(0, i), cachedMessage, ...messages.slice(i + 1)];
  }
  return messages;
}

function cachedSystem(system: string): PromptCachingBetaTextBlockParam[] {
  return [{ type: "text", text: system, cache_control: PROMPT_CACHE }];
}

function cachedTools(tools: Tool[]): PromptCachingBetaTool[] {
  return tools.map((tool, index) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as PromptCachingBetaTool["input_schema"],
    ...(index === tools.length - 1 ? { cache_control: PROMPT_CACHE } : {}),
  }));
}
