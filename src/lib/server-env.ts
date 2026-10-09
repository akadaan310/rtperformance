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

/**
 * Credentials for The Tech Guy. Preferred: a direct ANTHROPIC_API_KEY. On Vercel, with no key set, the app uses the
 * project's linked Vercel AI Gateway (VERCEL_OIDC_TOKEN, provided automatically, or AI_GATEWAY_API_KEY).
 */
export function assistantCredentials(): { apiKey: string; baseURL?: string; model: string } | null {
  if (serverEnv.anthropicApiKey && serverEnv.anthropicModel) return { apiKey: serverEnv.anthropicApiKey, model: serverEnv.anthropicModel };
  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (gatewayKey) return { apiKey: gatewayKey, baseURL: "https://ai-gateway.vercel.sh", model: serverEnv.anthropicModel || "anthropic/claude-haiku-4.5" };
  return null;
}

export function isAssistantConfigured(): boolean {
  return assistantCredentials() !== null;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
