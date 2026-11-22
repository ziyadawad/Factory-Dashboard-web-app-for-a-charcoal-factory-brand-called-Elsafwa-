import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { operatorAuthError } from "@/lib/operator-auth";
import { todayExits } from "@/lib/operator";

export const dynamic = "force-dynamic";

// طرحات النهارده (الأحدث الأول) - today's exits, newest first
export async function GET(request: NextRequest) {
  const denied = operatorAuthError(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ exits: await todayExits() }, { headers: NO_STORE });
  } catch (error) {
    console.error("[operator] today failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext مش بيرد" }, { status: 502, headers: NO_STORE });
  }
}
