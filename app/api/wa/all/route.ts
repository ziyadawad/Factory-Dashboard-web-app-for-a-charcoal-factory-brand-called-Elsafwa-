import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { listAllMessages } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// قراءة جميع الرسائل من كل الجروبات (لملخص الصباح): ?since=ISO (اختياري) & limitPerGroup=N (اختياري، الافتراضي 50)
// Read all messages from all groups (for morning summary): ?since=ISO (optional) & limitPerGroup=N (optional, default 50)
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const since = params.get("since");
  const limitPerGroup = params.get("limitPerGroup");
  try {
    const options: { since?: string; limitPerGroup?: number } = {};
    if (since && !Number.isNaN(Date.parse(since))) {
      options.since = since;
    }
    if (limitPerGroup) {
      const num = Number(limitPerGroup);
      if (!Number.isNaN(num) && num > 0 && num <= 200) {
        options.limitPerGroup = num;
      }
    }
    return NextResponse.json(await listAllMessages(options), { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "all");
  }
}
