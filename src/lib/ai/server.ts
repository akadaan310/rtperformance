import "server-only";
import { serverEnv, isAssistantConfigured } from "@/lib/server-env";
import { createAnthropicModel } from "./provider";
import type { RunnerLimits } from "./runner";

export function assistantLimits(): RunnerLimits {
  const effort = process.env.AI_EFFORT;
  return {
    dailyRequests: serverEnv.aiDailyRequestLimit,
    dailyTokens: serverEnv.aiDailyTokenLimit,
    effort: effort === "low" || effort === "medium" || effort === "high" ? effort : "low",
  };
}

export function getAssistantModel() {
  return isAssistantConfigured() ? createAnthropicModel() : null;
}

export { isAssistantConfigured };
