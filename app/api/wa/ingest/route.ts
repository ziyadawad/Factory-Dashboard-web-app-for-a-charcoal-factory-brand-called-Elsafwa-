import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { ingest } from "@/lib/wa-store";
import { agentAuthError, waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";
// مفيش كاش خالص: لا Next ولا CDN ولا المتصفح، فالصفحة والإيجنت شايفين نفس الـ Postgres دايما
// No cache at all (Next, CDN or browser): the page and the agent always see the same Postgres
export const fetchCache = "force-no-store";
export const revalidate = 0;

// كمبيوتر الـ IT بيبعت الجروبات والرسايل الجديدة (الشكل في docs/whatsapp-agent.md). body فاضي {} = نبضة (آخر مزامنة)
// The IT PC sends groups and new messages (schema in docs/whatsapp-agent.md). An empty {} body = a heartbeat (last sync)
export async function POST(request: NextRequest) {
  const denied = agentAuthError(request);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (raw.length > 4_000_000) {
      return NextResponse.json({ error: "payload too large (max ~4 MB): send fewer messages per request" }, { status: 413, headers: NO_STORE });
    }
    const saved = await ingest(raw ? JSON.parse(raw) : {});
    return NextResponse.json({ ok: true, ...saved }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "ingest");
  }
}
