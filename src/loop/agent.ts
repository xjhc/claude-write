import type { ConversationMessage, LlmClient, ToolLoopOpts, TurnLog } from "../llm/client.js";
import { ToolLoopCappedError } from "../llm/client.js";
import { agentTools, handleTool } from "./tools.js";

export interface AgentResult {
  finalText: string;
  turns: TurnLog[];
  stopReason: "final" | "capped";
}

export async function runAgent(
  client: LlmClient,
  systemPrompt: string,
  messages: ConversationMessage[],
  projectRoot: string,
  askUser: (question: string) => Promise<string>,
  onTurn?: ToolLoopOpts["onTurn"],
): Promise<AgentResult> {
  const state = { projectRoot };

  let finalText = "";
  let turns: TurnLog[] = [];
  let capped = false;

  try {
    const result = await client.toolLoop(
      systemPrompt,
      messages,
      agentTools,
      async (name, input) => {
        if (name === "ask") {
          const q = String(input.question ?? "").trim();
          if (!q) return "error: 'question' is required";
          return await askUser(q);
        }
        return handleTool(state, name, input);
      },
      { maxTokens: 16384, maxIterations: 30, onTurn },
    );
    finalText = result.finalText;
    turns = result.turns;
  } catch (e) {
    if (e instanceof ToolLoopCappedError) {
      capped = true;
      turns = e.turns;
    } else {
      throw e;
    }
  }

  if (capped) {
    return {
      finalText: "Agent exceeded tool iteration budget.",
      turns,
      stopReason: "capped",
    };
  }

  return { finalText, turns, stopReason: "final" };
}
