import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { newMessages } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";
// مفيش كاش خالص - no cache at all
export const fetchCache = "force-no-store";
export const revalidate = 0;

// الرسايل الجديدة نفسها للـ spotlight (بيتنده بس لما /api/wa/latest يقول فيه جديد): ?since=ISO&groups=id1,id2
// The new messages themselves for the spotlight (called only when /api/wa/latest reports something): ?since=ISO&groups=id1,id2
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const since = params.get("since");
  if (!since || Number.isNaN(Date.parse(since))) return NextResponse.json({ error: "since is required" }, { status: 400, headers: NO_STORE });
  const groups = (params.get("groups") ?? "").split(",").filter(Boolean);
  try {
    return NextResponse.json(await newMessages(new Date(since).toISOString(), groups), { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "new");
  }
}
