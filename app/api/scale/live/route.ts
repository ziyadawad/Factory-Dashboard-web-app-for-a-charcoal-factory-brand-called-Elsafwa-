import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { IT_SECRET_ENV_NAME, itAgentSecret, secretMatches } from "@/lib/it-store";
import { OPERATOR_COOKIE, operatorSessionValid } from "@/lib/operator-auth";
import { LiveScaleError, loadLive, parseLive, saveLive } from "@/lib/scale-live";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";

// الوزن المباشر من الميزان عن طريق Vercel (من غير أي طلب على شبكة المصنع) - الشكل في docs/it-agent-payload.md
// POST: الإيجنت بالهيدر x-it-secret، والـ body {weight_kg, stable, online, at}
// GET: شاشة الأوبريتر (كوكي الأوبريتر) أو شاشة الداشبورد (كوكي الدخول)، والسيرفر بيحسب عمر القراية
// Live scale weight through Vercel (no factory-LAN request at all) - schema in docs/it-agent-payload.md.
// POST: the agent (x-it-secret). GET: the operator screen or the dashboard; the server computes the reading's age

export async function POST(request: NextRequest) {
  if (!itAgentSecret()) {
    return NextResponse.json({ error: `${IT_SECRET_ENV_NAME} is not set on the server` }, { status: 503, headers: NO_STORE });
  }
  if (!secretMatches(request.headers.get("x-it-secret"))) {
    return NextResponse.json({ error: "bad or missing x-it-secret" }, { status: 401, headers: NO_STORE });
  }
  try {
    const raw = await request.text();
    if (raw.length > 2048) return NextResponse.json({ error: "payload too large" }, { status: 413, headers: NO_STORE });
    const reading = parseLive(JSON.parse(raw));
    const storage = await saveLive(reading);
    return NextResponse.json({ ok: true, storage }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "body is not valid JSON" }, { status: 400, headers: NO_STORE });
    if (error instanceof LiveScaleError) return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE });
    console.error("[scale] live save failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "save failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(request: NextRequest) {
  // الأوبريتر أو الداشبورد - the operator or the dashboard
  if (!operatorSessionValid(request.cookies.get(OPERATOR_COOKIE)?.value)) {
    const denied = salaryAuthError(request);
    if (denied) return denied;
  }
  const reading = await loadLive();
  const ageSeconds = reading ? Math.max(0, Math.round((Date.now() - Date.parse(reading.receivedAt)) / 1000)) : null;
  // متصل = الميزان قال online وآخر تحديث من أقل من liveStaleSeconds - connected = online and recently updated
  const connected = !!reading && reading.online && reading.weightKg !== null && ageSeconds !== null && ageSeconds < dashboardConfig.operator.liveStaleSeconds;
  return NextResponse.json(
    {
      connected,
      weightKg: connected ? reading!.weightKg : null,
      stable: connected ? reading!.stable : false,
      at: reading?.at ?? null,
      ageSeconds,
    },
    { headers: NO_STORE }
  );
}
