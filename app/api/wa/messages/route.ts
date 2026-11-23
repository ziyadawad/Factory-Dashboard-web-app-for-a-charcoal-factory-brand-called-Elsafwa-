import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { lastSyncAt, listMessages } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";
import { WaMessagesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// رسايل جروب (للداشبورد بعد الدخول بس): ?group=ID و before=ISO~id (الأقدم، الأحدث الأول) أو after=ISO~id (الجديد، الأقدم الأول)
// A group's messages (dashboard login only): before=ISO~id (older, newest first) or after=ISO~id (newer, oldest first)
const cursor = (v: string | null) => {
  if (!v) return undefined;
  const i = v.indexOf("~");
  return i > 0 ? { at: v.slice(0, i), id: v.slice(i + 1) } : undefined;
};

export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const group = params.get("group");
  if (!group) return NextResponse.json({ error: "group is required" }, { status: 400, headers: NO_STORE });
  try {
    const [page, sync] = await Promise.all([
      listMessages(group, { before: cursor(params.get("before")), after: cursor(params.get("after")) }),
      lastSyncAt(),
    ]);
    const body: WaMessagesResponse = { ...page, lastSyncAt: sync };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "messages");
  }
}
