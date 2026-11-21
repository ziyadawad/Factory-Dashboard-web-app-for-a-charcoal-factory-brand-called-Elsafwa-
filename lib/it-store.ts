// آخر بيانات وصلت من إيجنت IT: في الذاكرة، وفي Upstash Redis (أو Vercel KV) لو متظبط عشان تعيش بعد الـ cold start
// السيرفر بس. أي حقل مش في الشكل المتفق عليه بيترمي (مفيش أي باسورد بيتخزن أبدا)
// The latest IT agent data: in memory, plus Upstash Redis (or Vercel KV) when configured so it survives cold starts.
// Server only. Any field outside the agreed schema is dropped (no password is ever stored)
import { timingSafeEqual } from "node:crypto";
import { dashboardConfig } from "@/config/dashboard.config";
import { ItSnapshot, ItStatus } from "./types";
import { mergeEvents } from "./it-sanitize";

// التنضيف في it-sanitize (نفس القواعد في المتصفح) - sanitizing lives in it-sanitize (the browser uses the same rules)
export { ItPayloadError, sanitizePayload } from "./it-sanitize";

const KEY = "elsafwa:it:status";

type Stored = { receivedAt: string; data: ItSnapshot };

// ===== التخزين: Upstash Redis REST (نفس الـ API بتاع Vercel KV) - storage: Upstash Redis REST (same API as Vercel KV) =====
// تكامل Upstash في Vercel بيضيف KV_REST_API_URL / KV_REST_API_TOKEN (أو UPSTASH_REDIS_REST_*)، وأحيانا بـ prefix
// زي STORAGE_KV_REST_API_URL لو اتختار prefix وقت الربط. أي واحد منهم بيشتغل (التوكن اللي read-only مبيتاخدش)
// The Vercel Upstash integration adds KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*), sometimes with a
// custom prefix such as STORAGE_KV_REST_API_URL. Any of them works (the read-only token is never used)
function envEndingWith(suffix: string): string | undefined {
  const key = Object.keys(process.env).find((k) => k.endsWith(suffix) && process.env[k]);
  return key ? process.env[key] : undefined;
}

function redisSettings() {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    envEndingWith("UPSTASH_REDIS_REST_URL") ||
    envEndingWith("KV_REST_API_URL")
  )?.trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    envEndingWith("UPSTASH_REDIS_REST_TOKEN") ||
    envEndingWith("KV_REST_API_TOKEN")
  )?.trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

async function redis<T>(command: (string | number)[]): Promise<T | null> {
  const settings = redisSettings();
  if (!settings) return null;
  const response = await fetch(settings.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`redis HTTP ${response.status}`);
  const body = (await response.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(`redis ${body.error}`);
  return body.result ?? null;
}

let memory: Stored | null = null;

async function readStored(): Promise<Stored | null> {
  if (redisSettings()) {
    try {
      const raw = await redis<string>(["GET", KEY]);
      if (raw) {
        const stored = JSON.parse(raw) as Stored;
        // الأحدث يكسب (لو الذاكرة أحدث من Redis) - the newest wins (memory may be newer than Redis)
        if (!memory || stored.receivedAt >= memory.receivedAt) memory = stored;
      }
    } catch (error) {
      console.error("[it] redis read failed, using memory:", error instanceof Error ? error.message : error);
    }
  }
  return memory;
}

export async function saveItStatus(snapshot: ItSnapshot): Promise<{ receivedAt: string; storage: ItStatus["storage"] }> {
  const previous = await readStored();
  const stored: Stored = {
    receivedAt: new Date().toISOString(),
    data: { ...snapshot, events: mergeEvents(previous?.data.events ?? [], snapshot.events) },
  };
  memory = stored;
  let storage: ItStatus["storage"] = "memory";
  if (redisSettings()) {
    try {
      // 7 أيام وبعدين يتمسح لوحده لو الإيجنت وقف خالص - expires after 7 days if the agent stops for good
      await redis(["SET", KEY, JSON.stringify(stored), "EX", 7 * 86_400]);
      storage = "redis";
    } catch (error) {
      console.error("[it] redis write failed, kept in memory:", error instanceof Error ? error.message : error);
    }
  }
  return { receivedAt: stored.receivedAt, storage };
}

// كام ثانية لازم الإيجنت يستنى قبل التحديث الجاي (0 = يبعت دلوقتي). 10 ثواني سماح عشان فرق الساعة / تأخير النت
// Seconds the agent must still wait before its next update (0 = may post now). 10 s grace for clock / network jitter
const POST_GRACE_SECONDS = 10;
export async function itPostWaitSeconds(): Promise<number> {
  const stored = await readStored();
  if (!stored) return 0;
  const minMs = (dashboardConfig.it.agentMinPostSeconds - POST_GRACE_SECONDS) * 1000;
  const waitMs = Date.parse(stored.receivedAt) + minMs - Date.now();
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

export async function loadItStatus(): Promise<ItStatus> {
  const stored = await readStored();
  const offlineMs = dashboardConfig.it.agentOfflineSeconds * 1000;
  return {
    receivedAt: stored?.receivedAt ?? null,
    agentOnline: !!stored && Date.now() - Date.parse(stored.receivedAt) < offlineMs,
    data: stored?.data ?? null,
    storage: redisSettings() ? "redis" : "memory",
  };
}

// اسم متغير البيئة اللي فيه سر الإيجنت (بالظبط كده) - the exact env var name holding the agent secret
export const IT_SECRET_ENV_NAME = "IT_AGENT_SECRET";

// السر من البيئة بعد trim (مسافة أو سطر جديد زيادة في Vercel كانت بتبوظ المقارنة) - the env secret, trimmed
// (a stray space / newline pasted into Vercel used to break the comparison)
export function itAgentSecret(): string {
  return (process.env.IT_AGENT_SECRET ?? "").trim();
}

// مقارنة السر من غير ما الوقت يفضح حاجة، بعد trim للناحيتين - compare in constant time, both sides trimmed
export function secretMatches(header: string | null): boolean {
  const expected = itAgentSecret();
  const given = (header ?? "").trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
