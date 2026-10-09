import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/context";
import { decidePendingAction } from "@/lib/ai/runner";
import { failure } from "@/lib/result";

export const runtime = "nodejs";

const body = z.object({ slug: z.string().min(1).max(60), decision: z.enum(["confirm", "cancel"]) });

/** Explicit human confirmation (or cancellation) of an action proposed by The Tech Guy. */
export async function POST(request: NextRequest, context: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(actionId).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ctx = await getWorkspaceContext(parsed.data.slug);
  if (!ctx || ctx.org.status !== "active") return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await decidePendingAction(ctx, actionId, parsed.data.decision);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: failure(err).error }, { status: 400 });
  }
}
