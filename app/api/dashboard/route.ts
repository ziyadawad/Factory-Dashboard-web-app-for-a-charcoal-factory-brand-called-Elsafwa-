import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data-source";
import { DashboardData } from "@/lib/types";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";

// كاش في ذاكرة السيرفر: ERPNext بيتكلم مرة واحدة بالكتير كل erp.cacheSeconds مهما الشاشات سألت
// In-memory cache: ERPNext is called at most once per erp.cacheSeconds, however often screens poll
const CACHE_MS = dashboardConfig.erp.cacheSeconds * 1000;
let cached: { data: DashboardData; at: number } | null = null;
// طلب واحد شغال في نفس الوقت (الشاشات اللي بتسأل مع بعض بتستنى نفس الطلب) - one ERPNext round at a time
let inFlight: Promise<DashboardData> | null = null;

function freshData(): Promise<DashboardData> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.data);
  if (!inFlight) {
    inFlight = getDashboardData()
      .then((data) => {
        cached = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export async function GET() {
  try {
    const data = await freshData();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error in dashboard API route:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
