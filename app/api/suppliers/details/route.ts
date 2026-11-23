import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { supplierDetails } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

// لوحة مورد (للداشبورد بعد الدخول بس): ?name=اسم المورد - one supplier's panel (dashboard login only)
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await supplierDetails(name.slice(0, 140)), { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[suppliers] details failed:", message);
    const notFound = message === "supplier not found";
    return NextResponse.json({ error: notFound ? "المورد مش موجود" : "ERPNext مش بيرد" }, { status: notFound ? 404 : 502, headers: NO_STORE });
  }
}
