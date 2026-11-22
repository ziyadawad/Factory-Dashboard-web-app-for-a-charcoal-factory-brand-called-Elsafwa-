import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { IT_SECRET_ENV_NAME, itAgentSecret, secretMatches } from "@/lib/it-store";
import { operatorAuthError } from "@/lib/operator-auth";
import { PendingError, addPending, listPending, parsePending, takePending } from "@/lib/scale-pending";

export const dynamic = "force-dynamic";

// الوزنات المستنية (الشكل في docs/it-agent-payload.md) - pending weighings (schema in docs/it-agent-payload.md)
// POST: الإيجنت بالهيدر x-it-secret = IT_AGENT_SECRET، والـ body {id, gross_kg, time}
// GET: شاشة الأوبريتر (كوكي الأوبريتر) أو الإيجنت (x-it-secret)
// DELETE ?id=…: "مش طرحة" من شاشة الأوبريتر
// POST: the agent (x-it-secret). GET: the operator screen (operator cookie) or the agent. DELETE ?id=…: "مش طرحة"

function agentAuthError(request: NextRequest): NextResponse | null {
  if (!itAgentSecret()) {
    return NextResponse.json({ error: `${IT_SECRET_ENV_NAME} is not set on the server` }, { status: 503, headers: NO_STORE });
  }
  if (!secretMatches(request.headers.get("x-it-secret"))) {
    return NextResponse.json({ error: "bad or missing x-it-secret" }, { status: 401, headers: NO_STORE });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const denied = agentAuthError(request);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "payload too large" }, { status: 413, headers: NO_STORE });
    const pending = parsePending(JSON.parse(raw));
    const result = await addPending(pending);
    return NextResponse.json(
      { ok: true, id: pending.id, added: result.added, storage: result.storage, ...(result.added ? {} : { note: "already resolved" }) },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "body is not valid JSON" }, { status: 400, headers: NO_STORE });
    if (error instanceof PendingError) return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE });
    console.error("[scale] pending save failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "save failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(request: NextRequest) {
  const denied = request.headers.get("x-it-secret") ? agentAuthError(request) : operatorAuthError(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ pending: await listPending() }, { headers: NO_STORE });
  } catch (error) {
    console.error("[scale] pending read failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "read failed" }, { status: 502, headers: NO_STORE });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = operatorAuthError(request);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, removed: await takePending(id) }, { headers: NO_STORE });
  } catch (error) {
    console.error("[scale] pending delete failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "delete failed" }, { status: 502, headers: NO_STORE });
  }
}
