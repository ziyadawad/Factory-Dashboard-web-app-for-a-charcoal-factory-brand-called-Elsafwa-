import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError, xlsxResponse } from "@/lib/api-auth";
import { dailyWeekWorkbook } from "@/lib/salary-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// كشف اليومية Excel للأسبوع ده (السبت → الجمعة) - محمي بكوكي الدخول، وممنوع تسجيل أي مبلغ
// The daily workers' sheet for this week (Saturday → Friday) - behind the login cookie; amounts are never logged
// GET /api/salaries/export-daily
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    const { buffer, fileName } = await dailyWeekWorkbook();
    return xlsxResponse(buffer, fileName);
  } catch (error) {
    console.error("[erp] daily export failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "export failed" }, { status: 502, headers: NO_STORE });
  }
}
