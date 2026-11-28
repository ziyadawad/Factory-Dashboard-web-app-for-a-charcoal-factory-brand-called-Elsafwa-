import { NextRequest, NextResponse } from "next/server";
import { dashboardAuthError, NO_STORE } from "@/lib/api-auth";
import { customerDetails } from "@/lib/customers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// تفاصيل عميل: الشهور والمنتجات والفواتير والدفعات وأعمار المديونية - a customer's months, products, invoices, payments, aging
// GET /api/customers/details?id=<ERPNext customer id>
export async function GET(request: NextRequest) {
  const denied = dashboardAuthError(request);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  try {
    const details = id ? await customerDetails(id) : null;
    if (!details) return NextResponse.json({ error: "unknown customer" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(details, { headers: NO_STORE });
  } catch (error) {
    console.error("[erp] customer details failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
