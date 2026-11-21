import { NextRequest, NextResponse } from "next/server";
import { cdnCache } from "@/lib/cdn-cache";
import { duplicatesReport } from "@/lib/duplicates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

// العمليات المكررة الموجودة (قراية بس، آخر 60 يوم): بتتسأل بس لما تاب "⚠ عمليات مكررة" يتفتح، كاش دقيقة
// Suspected duplicates (read-only, last 60 days): requested only when the tab opens; 1 min server cache
// GET /api/duplicates?scope=money (الخزنة) | stock (المخازن)
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");
  if (scope !== "money" && scope !== "stock") {
    return NextResponse.json({ error: "bad scope" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await duplicatesReport(scope), { headers: cdnCache(300) });
  } catch (error) {
    console.error("[erp] duplicates failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
