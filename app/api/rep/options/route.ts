import { NextRequest } from "next/server";
import { repAuth } from "@/lib/rep-auth";
import { repErrorResponse, repJson } from "@/lib/rep-http";
import { repOptions } from "@/lib/rep-sales";

export const dynamic = "force-dynamic";

// الأصناف (بالسعر ورصيد العربية) والعملاء - items (with rate and van stock) and customers
export async function GET(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  try {
    return repJson(await repOptions(rep));
  } catch (e) {
    return repErrorResponse(e, "options");
  }
}
