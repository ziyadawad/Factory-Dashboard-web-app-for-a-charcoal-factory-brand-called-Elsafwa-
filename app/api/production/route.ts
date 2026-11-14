import { NextResponse } from "next/server";
import { productionData } from "@/lib/production";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";
// ERPNext ممكن ياخد لحد 3 محاولات × 8 ثواني - ERPNext may take up to 3 attempts × 8s
export const maxDuration = 30;

const CACHE_SECONDS = dashboardConfig.production.cacheSeconds;

// الإنتاج والأفران: طرحات الشهر + حالة الأفران (قراية بس، كاش production.cacheSeconds على السيرفر والـ CDN)
// Production and kilns: this month's exits + kiln status (read-only; cached production.cacheSeconds on the server and CDN)
export async function GET() {
  try {
    return NextResponse.json(await productionData(), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Vercel-CDN-Cache-Control": `max-age=${CACHE_SECONDS}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
