import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { operatorAuthError } from "@/lib/operator-auth";
import { operatorOptions } from "@/lib/operator";

export const dynamic = "force-dynamic";

// اختيارات الفورم: الأفران والغرف والأنواع والترولات - the form choices
export async function GET(request: NextRequest) {
  const denied = operatorAuthError(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await operatorOptions(), { headers: NO_STORE });
  } catch (error) {
    console.error("[operator] options failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext مش بيرد" }, { status: 502, headers: NO_STORE });
  }
}
