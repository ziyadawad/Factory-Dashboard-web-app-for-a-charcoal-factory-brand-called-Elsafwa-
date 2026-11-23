import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { suppliersData } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

// صفحة الموردين (للداشبورد بعد الدخول بس) - the suppliers page (dashboard login only)
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await suppliersData(), { headers: NO_STORE });
  } catch (error) {
    console.error("[suppliers] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext مش بيرد" }, { status: 502, headers: NO_STORE });
  }
}
