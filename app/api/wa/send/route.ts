import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { waErrorResponse } from "@/lib/wa-http";
import { clientIp, outboxForGroup, queueMessage, sameOrigin, sessionOf } from "@/lib/wa-send";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// رسايل الداشبورد لجروب (آخر 24 ساعة) بحالتها - the dashboard's messages to a group (last 24 h) with their status
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const group = request.nextUrl.searchParams.get("group");
  if (!group) return NextResponse.json({ error: "group is required" }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ items: await outboxForGroup(group) }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "outbox");
  }
}

// إرسال رسالة (بعد الدخول + الكتابة مفتوحة بالباسورد): { group, text, replyId? } ← الطابور
// Send a message (login + composer unlocked by the password): { group, text, replyId? } → the outbox
export async function POST(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403, headers: NO_STORE });
  const session = sessionOf(request);
  if (!session.configured) return NextResponse.json({ error: "WA_SEND_PASSWORD مش متظبط في Vercel", setup: true }, { status: 503, headers: NO_STORE });
  if (!session.unlocked) return NextResponse.json({ error: "الكتابة مقفولة — اكتب الباسورد", locked: true }, { status: 403, headers: NO_STORE });
  try {
    const body = (await request.json()) as { group?: unknown; text?: unknown; replyId?: unknown };
    const item = await queueMessage({ groupId: body.group, text: body.text, replyId: body.replyId }, clientIp(request));
    return NextResponse.json({ ok: true, item }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "send");
  }
}
