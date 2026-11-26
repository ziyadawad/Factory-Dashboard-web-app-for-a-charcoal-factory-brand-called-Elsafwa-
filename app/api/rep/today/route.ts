import { NextRequest } from "next/server";
import { repAuth } from "@/lib/rep-auth";
import { repErrorResponse, repJson } from "@/lib/rep-http";
import { repToday } from "@/lib/rep-sales";

export const dynamic = "force-dynamic";

// فواتيري النهارده - my invoices today
export async function GET(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  try {
    return repJson(await repToday(rep));
  } catch (e) {
    return repErrorResponse(e, "today");
  }
}
