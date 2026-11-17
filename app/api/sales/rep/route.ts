import { NextRequest, NextResponse } from "next/server";
import { repDetails, repYear } from "@/lib/sales";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// تفاصيل مندوب يوم بيوم: بتتسأل بس لما لوحة التفاصيل تتفتح (أو يتختار شهر)، وكاش 60 ثانية على السيرفر (قراية بس من ERPNext)
// A rep's daily details: requested only when the panel opens (or a month is picked); 60 s server cache (read-only from ERPNext)
// GET /api/sales/rep?rep=<warehouse | name | van>[&month=YYYY-MM]   (من غير month = الشهر الحالي - no month = the current month)
// GET /api/sales/rep?rep=<...>&year=YYYY                           (ملخص السنة شهر بشهر - the year summary, month by month)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rep = params.get("rep") ?? "";
  const year = params.get("year");
  try {
    const details = year ? await repYear(rep, Number(year)) : await repDetails(rep, params.get("month"));
    if (!details) return NextResponse.json({ error: "unknown rep or year" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(details, {
      headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "max-age=60" },
    });
  } catch (error) {
    console.error("[erp] rep details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
