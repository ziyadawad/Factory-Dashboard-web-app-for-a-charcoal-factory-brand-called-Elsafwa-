import { NextRequest, NextResponse } from "next/server";
import { stockDetails, UnknownStockItemError } from "@/lib/stock-details";
import { StockGroup } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GROUPS: StockGroup[] = ["packaged", "sacks", "wood", "packaging"];
const NO_STORE = { "Cache-Control": "no-store" };

// تفاصيل كارت في أرصدة المخازن: بتتسأل بس لما اللوحة تتفتح، كاش 60 ثانية على السيرفر (قراية بس من ERPNext)
// A stock card's details: requested only when the panel opens; 60 s server cache (read-only)
// GET /api/stock/details?group=packaged&name=ربع كيلو[&variant=عادي][&month=2026-11]
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const group = params.get("group") as StockGroup | null;
  const name = params.get("name") ?? "";
  const variant = params.get("variant") || null;
  const month = params.get("month");
  if (!group || !GROUPS.includes(group) || !name || (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    return NextResponse.json({ error: "bad group, name or month" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await stockDetails(group, name, variant, month), {
      headers: { ...NO_STORE, "Vercel-CDN-Cache-Control": "max-age=60" },
    });
  } catch (error) {
    if (error instanceof UnknownStockItemError) {
      return NextResponse.json({ error: error.message }, { status: 404, headers: NO_STORE });
    }
    console.error("[erp] stock details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
