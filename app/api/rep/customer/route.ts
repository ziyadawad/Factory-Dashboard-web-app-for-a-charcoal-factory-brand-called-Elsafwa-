import { NextRequest } from "next/server";
import { repAuth } from "@/lib/rep-auth";
import { repErrorResponse, repJson } from "@/lib/rep-http";
import { createCustomer, customerBalance } from "@/lib/rep-sales";

export const dynamic = "force-dynamic";

// رصيد عميل: ?id= - a customer's balance
export async function GET(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return repJson({ error: "id is required" }, 400);
  try {
    return repJson({ balance: await customerBalance(id) });
  } catch (e) {
    return repErrorResponse(e, "balance");
  }
}

// عميل جديد: { name, phone } - a new customer
export async function POST(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  try {
    const body = (await request.json()) as { name?: unknown; phone?: unknown };
    return repJson({ customer: await createCustomer(body.name, body.phone) });
  } catch (e) {
    return repErrorResponse(e, "new customer");
  }
}
