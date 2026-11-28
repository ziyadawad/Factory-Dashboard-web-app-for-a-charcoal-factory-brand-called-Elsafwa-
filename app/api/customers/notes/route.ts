import { NextRequest, NextResponse } from "next/server";
import { dashboardAuthError, NO_STORE } from "@/lib/api-auth";
import { customerExists, notesEnabled, saveNote } from "@/lib/customers";

export const dynamic = "force-dynamic";

// ملاحظات العميل (نص + تاجات) في Redis عندنا، مش في ERPNext - a customer's notes (text + tags) in our Redis, not ERPNext
// POST /api/customers/notes  { id, text, tags: string[] }
export async function POST(request: NextRequest) {
  const denied = dashboardAuthError(request);
  if (denied) return denied;
  if (!notesEnabled()) return NextResponse.json({ error: "Redis مش متظبط" }, { status: 503, headers: NO_STORE });
  let body: { id?: unknown; text?: unknown; tags?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400, headers: NO_STORE });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const text = typeof body.text === "string" ? body.text : "";
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
  try {
    if (!id || !(await customerExists(id))) return NextResponse.json({ error: "unknown customer" }, { status: 404, headers: NO_STORE });
    const note = await saveNote(id, text, tags);
    return NextResponse.json({ note }, { headers: NO_STORE });
  } catch (error) {
    console.error("[customers] note save failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "save failed" }, { status: 502, headers: NO_STORE });
  }
}
