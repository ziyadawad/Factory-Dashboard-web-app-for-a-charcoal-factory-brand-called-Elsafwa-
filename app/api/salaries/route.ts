import { NextRequest, NextResponse } from "next/server";
import { isAttendanceSection } from "@/lib/attendance-details";
import { sectionSalaries } from "@/lib/salaries";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ممنوع أي كاش (لا CDN ولا المتصفح) عشان كل طلب يعدي على فحص الدخول - no cache anywhere: every request is checked
const NO_STORE = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store", "CDN-Cache-Control": "no-store" };

// مرتبات قسم حضور: بتتسأل بس لما زرار "💰 المرتب" يتداس في اللوحة (مش مع بيانات الشاشة)
// الـ middleware مش بيحمي /api، فالطلب ده لازم يبقى معاه كوكي الدخول بتاع الشاشة (من غير PIN)
// A section's salaries: requested only from the panel button. The middleware skips /api, so this route itself
// requires the dashboard login cookie (no PIN). Amounts are never logged
// GET /api/salaries?section=management|production|...
export async function GET(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "DASHBOARD_PASSWORD is not set" }, { status: 403, headers: NO_STORE });
  }
  if (password && request.cookies.get("dashboard-session")?.value !== password) {
    return NextResponse.json({ error: "login required" }, { status: 401, headers: NO_STORE });
  }

  const section = request.nextUrl.searchParams.get("section") ?? "";
  if (!isAttendanceSection(section)) {
    return NextResponse.json({ error: "unknown section" }, { status: 404, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await sectionSalaries(section), { headers: NO_STORE });
  } catch (error) {
    // رسالة الغلط بس (من غير أرقام) - the error message only (no amounts)
    console.error("[erp] salaries failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
