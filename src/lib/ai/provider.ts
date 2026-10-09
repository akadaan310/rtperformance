import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/server-env";
import type { AssistantModel } from "./types";

/** Production model client. The API key stays on the server and is never logged or returned. */
export function createAnthropicModel(): AssistantModel {
  const client = new Anthropic({ apiKey: serverEnv.anthropicApiKey, timeout: serverEnv.aiTimeoutMs, maxRetries: 1 });
  return {
    modelId: serverEnv.anthropicModel,
    createMessage: (params) => client.messages.create(params),
  };
}
