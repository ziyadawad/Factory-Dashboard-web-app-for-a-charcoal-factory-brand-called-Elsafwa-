import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { lastSyncAt, listGroups } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";
import { WaGroupsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// الجروبات (للداشبورد بعد الدخول بس). seen = "groupId~ISO,groupId~ISO" آخر زيارة لكل جروب من المتصفح
// The groups (dashboard login only). seen = each group's last visit, from the browser
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    const seen: Record<string, string> = {};
    for (const part of (request.nextUrl.searchParams.get("seen") ?? "").split(",").slice(0, 300)) {
      const i = part.lastIndexOf("~");
      if (i > 0) seen[part.slice(0, i)] = part.slice(i + 1);
    }
    const [groups, sync] = await Promise.all([listGroups(seen), lastSyncAt()]);
    const body: WaGroupsResponse = { groups, lastSyncAt: sync };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "groups");
  }
}
