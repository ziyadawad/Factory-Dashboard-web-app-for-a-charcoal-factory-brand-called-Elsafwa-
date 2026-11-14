import { NextRequest, NextResponse } from "next/server";
import { activity } from "@/lib/activity";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

// اللي بيحصل دلوقتي: GET /api/activity[?since=2026-11-14 13:40:00] (قراية بس، كاش activity.cacheSeconds على السيرفر)
// The live activity feed (read-only; cached activity.cacheSeconds on the server)
export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");
  if (since !== null && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(since)) {
    return NextResponse.json({ error: "since must be YYYY-MM-DD HH:MM:SS" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await activity(since), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Vercel-CDN-Cache-Control": `max-age=${dashboardConfig.activity.cacheSeconds}`,
      },
    });
  } catch (error) {
    console.error("[erp] activity failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: NO_STORE });
  }
}
