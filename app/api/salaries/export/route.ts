import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError, xlsxResponse } from "@/lib/api-auth";
import { monthlySalaryWorkbook } from "@/lib/salary-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// كشف المرتبات Excel لكل الشهريين (كل الأقسام + خارج البصمة) - محمي بكوكي الدخول، وممنوع تسجيل أي مبلغ
// The monthly salary sheet for every monthly employee - behind the login cookie; amounts are never logged
// GET /api/salaries/export
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    const { buffer, fileName } = await monthlySalaryWorkbook();
    return xlsxResponse(buffer, fileName);
  } catch (error) {
    console.error("[erp] salary export failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "export failed" }, { status: 502, headers: NO_STORE });
  }
}
