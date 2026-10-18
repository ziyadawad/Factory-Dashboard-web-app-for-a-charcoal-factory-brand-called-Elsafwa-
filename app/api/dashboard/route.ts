import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getDashboardData();

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
