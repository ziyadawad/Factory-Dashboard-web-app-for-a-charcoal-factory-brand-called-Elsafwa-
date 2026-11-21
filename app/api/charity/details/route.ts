import { NextRequest, NextResponse } from "next/server";
import { cdnCache } from "@/lib/cdn-cache";
import { charityDetails, UnknownFundError } from "@/lib/charity-details";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

// تفاصيل صندوق صدقات: بتتسأل بس لما اللوحة تتفتح، كاش 30 ثانية على السيرفر (قراية بس من ERPNext)
// A charity fund's details: requested only when the panel opens; 30 s server cache (read-only)
// GET /api/charity/details?fund=خزينة خارجية 1&month=2026-11   (من غير fund = كل الصناديق - no fund = all funds)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fund = params.get("fund");
  const month = params.get("month");
  if ((fund !== null && (fund.length === 0 || fund.length > 140)) || (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    return NextResponse.json({ error: "bad fund or month" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await charityDetails(fund, month), {
      headers: cdnCache(),
    });
  } catch (error) {
    if (error instanceof UnknownFundError) return NextResponse.json({ error: "unknown fund" }, { status: 404, headers: NO_STORE });
    console.error("[erp] charity details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
