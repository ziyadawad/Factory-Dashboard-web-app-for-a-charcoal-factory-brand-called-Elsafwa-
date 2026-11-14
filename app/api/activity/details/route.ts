import { NextRequest, NextResponse } from "next/server";
import { activityDetails, DETAIL_DOCTYPES, UnknownDocError } from "@/lib/activity-details";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

// تفاصيل حدث: GET /api/activity/details?doctype=Payment Entry&name=ACC-PAY-… (قراية بس، كاش 30 ثانية على السيرفر)
// An activity event's details (read-only; 30 s server cache)
export async function GET(request: NextRequest) {
  const doctype = request.nextUrl.searchParams.get("doctype") ?? "";
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!DETAIL_DOCTYPES.has(doctype) || !name || name.length > 140) {
    return NextResponse.json({ error: "bad doctype or name" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await activityDetails(doctype, name), {
      headers: { ...NO_STORE, "Vercel-CDN-Cache-Control": "max-age=30" },
    });
  } catch (error) {
    if (error instanceof UnknownDocError) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
    console.error("[erp] activity details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
