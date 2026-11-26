import { NextRequest } from "next/server";
import { repAuth } from "@/lib/rep-auth";
import { repErrorResponse, repJson } from "@/lib/rep-http";
import { requestCancel } from "@/lib/rep-sales";

export const dynamic = "force-dynamic";

// طلب إلغاء فاتورة (الحسابات هي اللي بتلغي في ERPNext): { name, reason? } - a cancel request (accounts cancel in ERPNext)
export async function POST(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  try {
    const body = (await request.json()) as { name?: unknown; reason?: unknown };
    if (typeof body.name !== "string" || !body.name) return repJson({ error: "name is required" }, 400);
    await requestCancel(rep, body.name, body.reason);
    return repJson({ ok: true });
  } catch (e) {
    return repErrorResponse(e, "cancel request");
  }
}
