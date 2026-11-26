import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { agentAuthError, waErrorResponse } from "@/lib/wa-http";
import { claimOutbox, reportOutbox } from "@/lib/wa-send";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// كمبيوتر الـ IT بس (x-it-secret): بيسأل كل 5 ثواني على الرسايل اللي مستنية (docs/whatsapp-agent.md)
// The IT PC only (x-it-secret): polls every 5 s for pending messages (docs/whatsapp-agent.md)
export async function GET(request: NextRequest) {
  const denied = agentAuthError(request);
  if (denied) return denied;
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 10) || 10;
    return NextResponse.json({ items: await claimOutbox(limit) }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "outbox");
  }
}

// بعد الإرسال: { id, status: "sent" | "failed", error?, messageId? } (أو list منهم) - after sending: one item or a list
export async function PATCH(request: NextRequest) {
  const denied = agentAuthError(request);
  if (denied) return denied;
  try {
    const result = await reportOutbox(await request.json());
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "outbox report");
  }
}
