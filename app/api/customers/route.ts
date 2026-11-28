import { NextRequest, NextResponse } from "next/server";
import { dashboardAuthError, NO_STORE } from "@/lib/api-auth";
import { customersData } from "@/lib/customers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// صفحة العملاء: كل العملاء بأرقامهم (كاش customers.cacheMinutes على السيرفر، قراية بس من ERPNext) - محمي بكوكي الدخول
// The customers page: every customer with their numbers (server cache, read-only from ERPNext) - behind the login cookie
// GET /api/customers
export async function GET(request: NextRequest) {
  const denied = dashboardAuthError(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await customersData(), { headers: NO_STORE });
  } catch (error) {
    console.error("[erp] customers failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
