import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data-source";
import { DashboardData } from "@/lib/types";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";
// ERPNext ممكن ياخد لحد 3 محاولات × 8 ثواني - ERPNext may take up to 3 attempts × 8s
export const maxDuration = 30;

// كاش على مستويين: ERPNext بيتكلم مرة واحدة بالكتير كل erp.cacheSeconds مهما الشاشات سألت
// 1) Vercel CDN (Vercel-CDN-Cache-Control): مشترك بين كل الـ serverless instances وكل الشاشات
// 2) ذاكرة الـ instance: لو اتنين سألوا مع بعض على نفس الـ instance بيستنوا نفس الطلب
// Two cache levels so ERPNext is called at most once per erp.cacheSeconds however often screens poll:
// 1) Vercel CDN (Vercel-CDN-Cache-Control): shared by every serverless instance and every screen
// 2) Instance memory: concurrent requests on the same instance share one ERPNext round
const CACHE_SECONDS = dashboardConfig.erp.cacheSeconds;
const CACHE_MS = CACHE_SECONDS * 1000;
let cached: { data: DashboardData; at: number } | null = null;
let inFlight: Promise<DashboardData> | null = null;

function freshData(): Promise<DashboardData> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.data);
  if (!inFlight) {
    inFlight = getDashboardData()
      .then((data) => {
        cached = { data, at: Date.now() };
        if (data.erpErrors.length > 0) console.error("[erp] errors this refresh:", data.erpErrors);
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
        // المتصفح دايما يسأل، والـ CDN بيحتفظ بالرد CACHE_SECONDS - the browser always asks; the CDN keeps it CACHE_SECONDS
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Vercel-CDN-Cache-Control": `max-age=${CACHE_SECONDS}`,
      },
    });
  } catch (error) {
    console.error("Error in dashboard API route:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
