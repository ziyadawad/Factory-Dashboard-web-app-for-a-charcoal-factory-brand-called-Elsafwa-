import { NextRequest, NextResponse } from "next/server";
import { attendanceDetails, isAttendanceSection } from "@/lib/attendance-details";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// تفاصيل قسم حضور: بتتسأل بس لما اللوحة تتفتح، وكاش 60 ثانية على السيرفر (قراية بس من ERPNext)
// An attendance section's details: requested only when the panel opens; 60 s server cache (read-only)
// GET /api/attendance/details?section=management|production|workshop|operators|packing|daily|drivers|reps|guards
export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get("section") ?? "";
  if (!isAttendanceSection(section)) {
    return NextResponse.json({ error: "unknown section" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return NextResponse.json(await attendanceDetails(section), {
      headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "max-age=60" },
    });
  } catch (error) {
    console.error("[erp] attendance details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
