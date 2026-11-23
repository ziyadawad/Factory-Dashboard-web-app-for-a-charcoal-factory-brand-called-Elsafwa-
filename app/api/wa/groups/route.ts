import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { listGroups, waStatus } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";
import { WaGroupsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
// مفيش كاش خالص: لا Next ولا CDN ولا المتصفح، فالصفحة والإيجنت شايفين نفس الـ Postgres دايما
// No cache at all (Next, CDN or browser): the page and the agent always see the same Postgres
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
    const [groups, status] = await Promise.all([listGroups(seen), waStatus()]);
    const body: WaGroupsResponse = { groups, status, lastSyncAt: status.lastSyncAt };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "groups");
  }
}
