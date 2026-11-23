import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { latestEvents } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";
// مفيش كاش خالص - no cache at all
export const fetchCache = "force-no-store";
export const revalidate = 0;

// سؤال صغير كل whatsapp.latestPollSeconds من أي صفحة (للداشبورد بعد الدخول بس): فيه رسايل جديدة من آخر مرة؟
// ?since=<cursor اللي جه المرة اللي فاتت>. من غير since = الـ cursor بس (من غير تنبيه أول ما الصفحة تفتح)
// A tiny check every whatsapp.latestPollSeconds from any page (dashboard login only): any new messages since last time?
// ?since=<the previous cursor>. Without since: the cursor only (no alert when the page opens)
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const since = request.nextUrl.searchParams.get("since");
  const valid = since && !Number.isNaN(Date.parse(since)) ? since : null;
  try {
    return NextResponse.json(await latestEvents(valid), { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "latest");
  }
}
