import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { IT_SECRET_ENV_NAME, itAgentSecret } from "@/lib/it-store";
import { NO_STORE } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// مؤقت: يتأكد إن IT_AGENT_SECRET واصل للسيرفر - الطول وأول 12 حرف من sha256 بس، عمره ما بيرجع السر نفسه. امسحه بعد التأكد
// TEMPORARY: checks IT_AGENT_SECRET reaches the server - only its length and the first 12 hex chars of its sha256,
// never the value itself. Delete once verified
export async function GET() {
  const secret = itAgentSecret();
  return NextResponse.json(
    {
      envName: IT_SECRET_ENV_NAME,
      configured: secret.length > 0,
      length: secret.length,
      sha256prefix: secret ? createHash("sha256").update(secret).digest("hex").slice(0, 12) : null,
    },
    { headers: NO_STORE }
  );
}
