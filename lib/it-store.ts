// آخر بيانات وصلت من إيجنت IT: في الذاكرة، وفي Upstash Redis (أو Vercel KV) لو متظبط عشان تعيش بعد الـ cold start
// السيرفر بس. أي حقل مش في الشكل المتفق عليه بيترمي (مفيش أي باسورد بيتخزن أبدا)
// The latest IT agent data: in memory, plus Upstash Redis (or Vercel KV) when configured so it survives cold starts.
// Server only. Any field outside the agreed schema is dropped (no password is ever stored)
import { timingSafeEqual } from "node:crypto";
import { dashboardConfig } from "@/config/dashboard.config";
import { ItSnapshot, ItStatus } from "./types";
import { mergeEvents } from "./it-sanitize";
import { redis, redisSettings } from "./redis";

// التنضيف في it-sanitize (نفس القواعد في المتصفح) - sanitizing lives in it-sanitize (the browser uses the same rules)
export { ItPayloadError, sanitizePayload } from "./it-sanitize";

const KEY = "elsafwa:it:status";

type Stored = { receivedAt: string; data: ItSnapshot };

// التخزين في lib/redis.ts - storage helpers live in lib/redis.ts

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
