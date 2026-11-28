import { NextRequest, NextResponse } from "next/server";
import { dashboardAuthError, NO_STORE, xlsxResponse } from "@/lib/api-auth";
import { customersWorkbook } from "@/lib/customer-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// كشف العملاء Excel بالفلتر والترتيب اللي على الشاشة - the customers sheet with the on-screen filter and order
// POST /api/customers/export  { ids?: string[] }  (من غير ids = كل العملاء - no ids = every customer)
export async function POST(request: NextRequest) {
  const denied = dashboardAuthError(request);
  if (denied) return denied;
  let ids: string[] | null = null;
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((x): x is string => typeof x === "string");
  } catch {}
  try {
    const { buffer, fileName } = await customersWorkbook(ids);
    return xlsxResponse(buffer, fileName);
  } catch (error) {
    console.error("[erp] customers export failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "export failed" }, { status: 502, headers: NO_STORE });
  }
}
