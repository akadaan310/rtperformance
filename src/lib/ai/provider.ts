import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { assistantCredentials, serverEnv } from "@/lib/server-env";
import type { AssistantModel } from "./types";

/** Production model client. The key stays on the server and is never logged or returned. */
export function createAnthropicModel(): AssistantModel {
  const creds = assistantCredentials();
  if (!creds) throw new Error("Assistant not configured");
  const client = new Anthropic({ apiKey: creds.apiKey, baseURL: creds.baseURL, timeout: serverEnv.aiTimeoutMs, maxRetries: 1 });
  return { modelId: creds.model, createMessage: (params) => client.messages.create(params) };
}
