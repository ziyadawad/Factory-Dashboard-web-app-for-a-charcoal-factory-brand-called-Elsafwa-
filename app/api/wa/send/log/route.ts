import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { waErrorResponse } from "@/lib/wa-http";
import { sendLog } from "@/lib/wa-send";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// "سجل الإرسال": آخر 50 محاولة إرسال (الوقت، الجروب، الكلام، النتيجة) - the last 50 send attempts
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ entries: await sendLog(50) }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "send log");
  }
}
