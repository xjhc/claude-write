import { AzureOpenAI } from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

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

type AzurePromptCachingParams = ChatCompletionCreateParamsNonStreaming & {
  prompt_cache_key?: string;
};

const AZURE_PROMPT_CACHE_KEY_PREFIX = "claude-write";

export function createAzureClient(model?: string): LlmClient {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = model ?? process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";

  const missing: string[] = [];
  if (!apiKey) missing.push("AZURE_OPENAI_API_KEY");
  if (!endpoint) missing.push("AZURE_OPENAI_ENDPOINT");
  if (!deployment) missing.push("AZURE_OPENAI_DEPLOYMENT (or pass --model)");
  if (missing.length) {
    throw new Error(`Azure OpenAI requires: ${missing.join(", ")}`);
  }

  const sdk = new AzureOpenAI({ apiKey, endpoint, apiVersion, deployment });
  const promptCacheKey = `${AZURE_PROMPT_CACHE_KEY_PREFIX}:${deployment!}`;

  return {
    provider: "azure",
    model: deployment!,
    async complete(system: string, user: string, opts: CompleteOpts = {}) {
      const params: AzurePromptCachingParams = {
        model: deployment!,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: opts.maxTokens ?? 4096,
        prompt_cache_key: promptCacheKey,
      };
      if ((opts.temperature ?? 1.0) === 1.0) params.temperature = 1.0;
      const res = await withRetries("azure complete", () =>
        sdk.chat.completions.create(params),
      );
      return res.choices[0]?.message?.content ?? "";
    },
    async toolLoop(
      system: string,
      messages: ConversationMessage[],
      tools: Tool[],
      handler: ToolHandler,
      opts: ToolLoopOpts = {},
    ): Promise<ToolLoopResult> {
      const maxIters = opts.maxIterations ?? 10;
      const openaiTools: ChatCompletionTool[] = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));

      const turns: TurnLog[] = [];
      const toolsChars = JSON.stringify(openaiTools).length;

      for (let i = 0; i < maxIters; i++) {
        const azureMessages: ChatCompletionMessageParam[] = [
          { role: "system", content: system },
          ...toAzureMessages(messages),
        ];

        // Exclude the system message from messagesChars to avoid double-counting.
        const systemChars = system.length;
        const messagesChars = JSON.stringify(azureMessages.slice(1)).length;
        const request = {
          systemChars,
          toolsChars,
          messagesChars,
          totalChars: systemChars + toolsChars + messagesChars,
        };

        const params: AzurePromptCachingParams = {
          model: deployment!,
          messages: azureMessages,
          tools: openaiTools,
          max_completion_tokens: opts.maxTokens ?? 16384,
          prompt_cache_key: promptCacheKey,
        };

        const res = await withRetries("azure tool loop", () =>
          sdk.chat.completions.create(params),
        );
        const msg = res.choices[0]?.message;
        if (!msg) {
          throw new Error("Azure returned no message in tool loop.");
        }

        const text = msg.content ?? "";

        // Store assistant turn as ConversationMessage.
        const assistantContent: AssistantContent = [];
        if (msg.content) assistantContent.push({ type: "text", text: msg.content });
        for (const tc of msg.tool_calls ?? []) {
          if (tc.type !== "function") continue;
          let input: Record<string, unknown>;
          try {
            input = JSON.parse(tc.function.arguments || "{}");
          } catch {
            input = {};
          }
          assistantContent.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
        messages.push({ role: "assistant", content: assistantContent });

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          const finalTurn: TurnLog = { text, toolUses: [], request };
          turns.push(finalTurn);
          if (opts.onTurn) opts.onTurn(finalTurn);
          return { finalText: text, turns };
        }

        const toolUses: ToolUseLog[] = [];
        const toolResults: Array<{ tool_use_id: string; content: string }> = [];

        for (const call of msg.tool_calls) {
          if (call.type !== "function") continue;
          let input: Record<string, unknown>;
          let out: string;
          try {
            input = JSON.parse(call.function.arguments || "{}");
          } catch {
            out = "error: arguments were not valid JSON";
            toolUses.push({ name: call.function.name, input: {}, output: out });
            toolResults.push({ tool_use_id: call.id, content: out });
            continue;
          }
          try {
            out = await handler(call.function.name, input);
          } catch (e) {
            out = `error: ${e instanceof Error ? e.message : String(e)}`;
          }
          toolUses.push({ name: call.function.name, input, output: out });
          toolResults.push({ tool_use_id: call.id, content: out });
        }

        messages.push({
          role: "user",
          content: toolResults.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
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

// Convert ConversationMessage[] to Azure ChatCompletionMessageParam[].
// Tool results (user content blocks) expand to separate tool-role messages.
function toAzureMessages(messages: ConversationMessage[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
        continue;
      }
      const blocks = msg.content as Array<Record<string, unknown>>;
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      const textBlocks = blocks.filter((b) => b.type === "text");
      for (const tr of toolResults) {
        result.push({
          role: "tool",
          tool_call_id: tr.tool_use_id as string,
          content: tr.content as string,
        });
      }
      if (textBlocks.length > 0) {
        result.push({
          role: "user",
          content: textBlocks.map((b) => b.text as string).join("\n"),
        });
      }
    } else {
      const blocks = msg.content as Array<Record<string, unknown>>;
      const textParts = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text as string)
        .join("\n");
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: b.id as string,
          type: "function" as const,
          function: {
            name: b.name as string,
            arguments: JSON.stringify(b.input),
          },
        }));
      result.push({
        role: "assistant",
        content: textParts || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      } as ChatCompletionMessageParam);
    }
  }
  return result;
}
