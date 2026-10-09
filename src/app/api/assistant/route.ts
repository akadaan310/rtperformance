import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { assistantLimits, getAssistantModel } from "@/lib/ai/server";
import { providerErrorMessage, runAssistantTurn } from "@/lib/ai/runner";
import { ServiceError } from "@/lib/result";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({ slug: z.string().min(1).max(60), conversation_id: z.string().uuid().nullable().optional(), message: z.string() });

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ctx = await getWorkspaceContext(parsed.data.slug);
  if (!ctx) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (ctx.org.status !== "active" || !can(ctx, "assistant.use")) return NextResponse.json({ error: "The Tech Guy is available to coaches in this workspace." }, { status: 403 });

  const model = getAssistantModel();
  if (!model) {
    return NextResponse.json(
      { error: "The Tech Guy isn't connected yet. An administrator needs to set ANTHROPIC_API_KEY and ANTHROPIC_MODEL on the server.", code: "not_configured" },
      { status: 503 },
    );
  }
  try {
    const result = await runAssistantTurn(ctx, { conversation_id: parsed.data.conversation_id ?? null, message: parsed.data.message }, model, assistantLimits());
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ServiceError ? 400 : 502;
    return NextResponse.json({ error: providerErrorMessage(err) }, { status });
  }
}
