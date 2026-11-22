import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { operatorAuthError } from "@/lib/operator-auth";
import { OperatorError, saveExit } from "@/lib/operator";
import { OperatorSaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

// حفظ طرحة جديدة (Kiln Exit) - save a new kiln exit
export async function POST(request: NextRequest) {
  const denied = operatorAuthError(request);
  if (denied) return denied;
  let body: OperatorSaveRequest;
  try {
    const raw = (await request.json()) as Partial<OperatorSaveRequest>;
    body = {
      kiln: String(raw.kiln ?? ""),
      room: String(raw.room ?? ""),
      type: String(raw.type ?? ""),
      trolley: Number(raw.trolley),
      tareKg: raw.tareKg === null || raw.tareKg === undefined ? null : Number(raw.tareKg),
      saveTrolley: raw.saveTrolley === true,
      grossKg: Number(raw.grossKg),
      pendingId: raw.pendingId ? String(raw.pendingId) : null,
      fromScale: raw.fromScale === true,
      confirmDuplicate: raw.confirmDuplicate === true,
    };
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json({ ok: true, ...(await saveExit(body)) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperatorError) {
      return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status, headers: NO_STORE });
    }
    console.error("[operator] save failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "الحفظ فشل — جرب تاني" }, { status: 500, headers: NO_STORE });
  }
}
