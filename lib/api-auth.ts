import { NextRequest, NextResponse } from "next/server";

// ممنوع أي كاش (لا CDN ولا المتصفح) عشان كل طلب يعدي على فحص الدخول - no cache anywhere: every request is checked
export const NO_STORE = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store", "CDN-Cache-Control": "no-store" };

// الـ middleware مش بيحمي /api، فطلبات المرتبات لازم يبقى معاها كوكي الدخول بتاع الشاشة
// The middleware skips /api, so salary requests must carry the dashboard login cookie.
// null = مسموح، غير كده = الرد اللي يترجع - null = allowed, otherwise the response to return
export function salaryAuthError(request: NextRequest): NextResponse | null {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "DASHBOARD_PASSWORD is not set" }, { status: 403, headers: NO_STORE });
  }
  if (password && request.cookies.get("dashboard-session")?.value !== password) {
    return NextResponse.json({ error: "login required" }, { status: 401, headers: NO_STORE });
  }
  return null;
}

// رد ملف Excel باسم عربي - an Excel file response with an Arabic file name
export function xlsxResponse(buffer: ArrayBuffer, fileName: string): NextResponse {
  return new NextResponse(buffer, {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
