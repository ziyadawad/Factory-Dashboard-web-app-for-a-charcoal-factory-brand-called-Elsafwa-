// ردود الـ API بتاعة الواتساب: فحص سر الإيجنت، والأخطاء - WhatsApp API helpers: the agent secret check and errors
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "./api-auth";
import { IT_SECRET_ENV_NAME, itAgentSecret, secretMatches } from "./it-store";
import { WaError } from "./wa-store";

// كمبيوتر الـ IT بس (x-it-secret = IT_AGENT_SECRET) - the IT PC only
export function agentAuthError(request: NextRequest): NextResponse | null {
  if (!itAgentSecret()) return NextResponse.json({ error: `${IT_SECRET_ENV_NAME} is not set on the server` }, { status: 503, headers: NO_STORE });
  if (!secretMatches(request.headers.get("x-it-secret"))) return NextResponse.json({ error: "bad or missing x-it-secret" }, { status: 401, headers: NO_STORE });
  return null;
}

export function waErrorResponse(error: unknown, what: string): NextResponse {
  if (error instanceof WaError) return NextResponse.json({ error: error.message, setup: error.status === 503 }, { status: error.status, headers: NO_STORE });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "body is not valid JSON" }, { status: 400, headers: NO_STORE });
  console.error(`[wa] ${what} failed:`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: `${what} failed` }, { status: 500, headers: NO_STORE });
}
