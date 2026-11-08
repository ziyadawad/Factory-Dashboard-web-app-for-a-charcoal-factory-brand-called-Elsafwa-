import { NextResponse } from "next/server";
import { treasuryDetails } from "@/lib/treasury-details";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// تفاصيل الخزنة: بتتسأل بس لما اللوحة تتفتح، وكاش 30 ثانية على السيرفر (قراية بس من ERPNext)
// Treasury details: requested only when the panel opens; 30 s server cache (read-only)
// GET /api/treasury/details
export async function GET() {
  try {
    return NextResponse.json(await treasuryDetails(), {
      headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "max-age=30" },
    });
  } catch (error) {
    console.error("[erp] treasury details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
