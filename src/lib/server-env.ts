import "server-only";

/** Server-only configuration. Never import from client components. */
export const serverEnv = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Model id for The Tech Guy, e.g. a current Haiku model. Required to enable the assistant. */
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "",
  aiDailyRequestLimit: positiveInt(process.env.AI_DAILY_REQUEST_LIMIT, 150),
  aiDailyTokenLimit: positiveInt(process.env.AI_DAILY_TOKEN_LIMIT, 400_000),
  aiTimeoutMs: positiveInt(process.env.AI_TIMEOUT_MS, 45_000),
};

export function isAssistantConfigured(): boolean {
  return Boolean(serverEnv.anthropicApiKey && serverEnv.anthropicModel);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
