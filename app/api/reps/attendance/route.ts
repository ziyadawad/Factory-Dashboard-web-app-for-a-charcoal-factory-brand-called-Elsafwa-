import { NextResponse } from "next/server";
import { cdnCache } from "@/lib/cdn-cache";
import { repAttendance } from "@/lib/rep-attendance";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// حضور المناديب النهارده (حاضر + أول بصمة) لعربية الخط - today's rep attendance (present + first punch) for the route van
// GET /api/reps/attendance → { [repId]: { present, since } }   كاش 60 ثانية - 60 s cache
export async function GET() {
  try {
    return NextResponse.json(await repAttendance(), { headers: cdnCache(60) });
  } catch (error) {
    console.error("[erp] rep attendance failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "ERPNext failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
