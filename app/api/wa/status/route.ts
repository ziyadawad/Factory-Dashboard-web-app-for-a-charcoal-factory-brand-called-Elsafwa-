import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { secretMatches } from "@/lib/it-store";
import { waStatus } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";
// مفيش كاش خالص - no cache at all
export const fetchCache = "force-no-store";
export const revalidate = 0;

// حالة الواتساب: عدد الجروبات / الرسايل / الملفات في Postgres، آخر رسالة وصلت، آخر مزامنة، وآخر طلب من الإيجنت
// (اتبعت كام واتحفظ كام وليه اترفض). لكمبيوتر الـ IT (x-it-secret) أو للداشبورد بعد الدخول
// WhatsApp status: group / message / file counts in Postgres, the latest received message, the last sync and the
// agent's last request (sent / saved / rejected and why). For the IT PC (x-it-secret) or the logged-in dashboard
export async function GET(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-it-secret"))) {
    const denied = salaryAuthError(request);
    if (denied) return denied;
  }
  try {
    return NextResponse.json(await waStatus(), { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "status");
  }
}
