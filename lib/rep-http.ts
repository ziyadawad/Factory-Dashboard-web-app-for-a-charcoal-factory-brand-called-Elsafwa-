// ردود الـ API بتاعة تطبيق المناديب - rep app API responses
import { NextResponse } from "next/server";
import { NO_STORE } from "./api-auth";
import { ErpError } from "./erp";
import { erpDown, RepError } from "./rep-sales";

export function repJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

// RepError = رسالة للمندوب، ERPNext مش بيرد = 503 + queue (الموبايل يحفظها ويبعتها بعدين)، غير كده 502
// RepError = a message for the rep; ERPNext not answering = 503 + queue (the phone keeps it for later); else 502
export function repErrorResponse(error: unknown, what: string): NextResponse {
  if (error instanceof RepError) return repJson({ error: error.message, ...error.extra }, error.status);
  if (error instanceof SyntaxError) return repJson({ error: "bad request" }, 400);
  if (erpDown(error)) {
    console.error(`[rep] ${what}: ERPNext unavailable:`, error instanceof Error ? error.message : error);
    return repJson({ error: "ERPNext مش بيرد دلوقتي", queue: true }, 503);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[rep] ${what} failed:`, message);
  // رسالة ERPNext نفسها (زي "الكمية مش كفاية") تفيد المندوب - ERPNext's own message (e.g. insufficient stock) helps
  return repJson({ error: error instanceof ErpError ? `ERPNext رفض: ${message.replace(/^ERPNext [^:]+: /, "")}` : `${what} failed` }, 502);
}
