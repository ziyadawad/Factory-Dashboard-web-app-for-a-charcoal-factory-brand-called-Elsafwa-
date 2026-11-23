import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { search } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";

// البحث (للداشبورد بعد الدخول بس): ?q= كلام، sender= الراسل، date=YYYY-MM-DD، group= جروب واحد (فاضي = كلهم)
// Search (dashboard login only): q = text, sender, date = a Cairo day, group = one group (empty = all)
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const p = request.nextUrl.searchParams;
  try {
    const messages = await search({ q: p.get("q") ?? "", sender: p.get("sender") ?? "", date: p.get("date") ?? "", groupId: p.get("group") ?? "" });
    return NextResponse.json({ messages }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "search");
  }
}
