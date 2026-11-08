import { NextRequest, NextResponse } from "next/server";
import { accountDetails, UnknownAccountError } from "@/lib/account-details";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// تفاصيل حساب (الخزنة / محفظة): بتتسأل بس لما اللوحة تتفتح، وكاش 30 ثانية على السيرفر (قراية بس من ERPNext)
// An account's details (treasury / a wallet): requested only when the panel opens; 30 s server cache (read-only)
// GET /api/account/details?account=1110            -> treasury mode (last 15 days / this month)
// GET /api/account/details?account=1112&month=2026-11 -> that month only
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const account = params.get("account") ?? "";
  const month = params.get("month");
  if (!/^\d{1,10}$/.test(account) || (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    return NextResponse.json({ error: "bad account or month" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return NextResponse.json(await accountDetails(account, month), {
      headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "max-age=30" },
    });
  } catch (error) {
    if (error instanceof UnknownAccountError) {
      return NextResponse.json({ error: error.message }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[erp] account details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
