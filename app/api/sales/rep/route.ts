import { NextRequest, NextResponse } from "next/server";
import { repDetails } from "@/lib/sales";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// تفاصيل مندوب يوم بيوم: بتتسأل بس لما لوحة التفاصيل تتفتح، وكاش 60 ثانية على السيرفر (قراية بس من ERPNext)
// A rep's daily details: requested only when the panel opens; 60 s server cache (read-only from ERPNext)
// GET /api/sales/rep?rep=<warehouse | name | van>
export async function GET(request: NextRequest) {
  const rep = request.nextUrl.searchParams.get("rep") ?? "";
  try {
    const details = await repDetails(rep);
    if (!details) return NextResponse.json({ error: "unknown rep" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(details, {
      headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "max-age=60" },
    });
  } catch (error) {
    console.error("[erp] rep details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
