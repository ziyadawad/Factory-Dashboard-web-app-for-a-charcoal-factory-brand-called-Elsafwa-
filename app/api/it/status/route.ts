import { NextRequest, NextResponse } from "next/server";
import { IT_SECRET_ENV_NAME, ItPayloadError, itAgentSecret, itPostWaitSeconds, loadItStatus, sanitizePayload, saveItStatus, secretMatches } from "@/lib/it-store";
import { dashboardConfig } from "@/config/dashboard.config";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 256 * 1024; // أكبر حجم للتحديث الواحد - the largest accepted update

// إيجنت IT بيبعت حالة الشبكة والأجهزة: POST /api/it/status بالهيدر x-it-secret = IT_AGENT_SECRET (الشكل في docs/it-agent-payload.md)
// The IT agent posts the network / device status with header x-it-secret = env IT_AGENT_SECRET (schema in docs/it-agent-payload.md)
export async function POST(request: NextRequest) {
  // السر بيتقرا من IT_AGENT_SECRET بالظبط (بعد trim) - the secret is read from exactly IT_AGENT_SECRET (trimmed)
  if (!itAgentSecret()) {
    return NextResponse.json({ error: `${IT_SECRET_ENV_NAME} is not set on the server` }, { status: 503, headers: NO_STORE });
  }
  if (!secretMatches(request.headers.get("x-it-secret"))) {
    return NextResponse.json({ error: "bad or missing x-it-secret" }, { status: 401, headers: NO_STORE });
  }
  // تحديث واحد بس كل it.agentMinPostSeconds (دقيقتين): الأسرع بيترفض بـ 429 من غير ما يتخزن
  // One update per it.agentMinPostSeconds (2 minutes): anything faster is refused with 429 and not stored
  const wait = await itPostWaitSeconds();
  if (wait > 0) {
    return NextResponse.json(
      { error: `too many updates: at most one per ${dashboardConfig.it.agentMinPostSeconds} s`, retryAfterSeconds: wait },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(wait) } }
    );
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: `payload larger than ${MAX_BYTES} bytes` }, { status: 413, headers: NO_STORE });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: `payload larger than ${MAX_BYTES} bytes` }, { status: 413, headers: NO_STORE });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400, headers: NO_STORE });
  }
  try {
    const snapshot = sanitizePayload(body);
    const saved = await saveItStatus(snapshot);
    return NextResponse.json(
      {
        ok: true,
        receivedAt: saved.receivedAt,
        storage: saved.storage,
        counts: { routers: snapshot.routers.length, devices: snapshot.devices.length, cameras: snapshot.cameras.length, events: snapshot.events.length },
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof ItPayloadError) return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE });
    console.error("[it] save failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "save failed" }, { status: 500, headers: NO_STORE });
  }
}

// الشاشة بتقرا آخر حالة (لازم كوكي الدخول، لأن فيها أسامي وعناوين أجهزة المصنع)
// The screen reads the latest status (login cookie required: it holds factory device names and addresses)
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  return NextResponse.json(await loadItStatus(), { headers: NO_STORE });
}
