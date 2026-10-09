import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantCard } from "./tools";

/** Boundary around the model provider so the runtime can be tested with a deterministic fake. */
export interface AssistantModel {
  modelId: string;
  createMessage(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

export interface ToolActivity {
  tool: string;
  ok: boolean;
  label: string;
}

/** UI-facing rendering of an assistant or user message. */
export interface DisplayPayload {
  text: string;
  cards?: AssistantCard[];
  activity?: ToolActivity[];
  error?: boolean;
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  display: DisplayPayload;
  created_at: string;
}
