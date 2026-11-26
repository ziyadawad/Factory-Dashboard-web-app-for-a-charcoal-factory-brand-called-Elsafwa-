import { NextRequest } from "next/server";
import { clientIp, repAuth } from "@/lib/rep-auth";
import { repErrorResponse, repJson } from "@/lib/rep-http";
import { createInvoice, invoiceReceipt } from "@/lib/rep-sales";
import { RepInvoiceRequest } from "@/lib/rep-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// فاتورة للطباعة تاني: ?name= - an invoice to reprint
export async function GET(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  const name = request.nextUrl.searchParams.get("name");
  if (!name) return repJson({ error: "name is required" }, 400);
  try {
    return repJson({ receipt: await invoiceReceipt(rep, name) });
  } catch (e) {
    return repErrorResponse(e, "invoice");
  }
}

// حفظ واعتماد فاتورة بيع (+ الدفعة) - create and submit a Sales Invoice (+ the payment)
export async function POST(request: NextRequest) {
  const { rep, error } = repAuth(request);
  if (!rep) return error;
  try {
    const body = (await request.json()) as RepInvoiceRequest;
    return repJson(await createInvoice(rep, body, clientIp(request)));
  } catch (e) {
    return repErrorResponse(e, "invoice");
  }
}
