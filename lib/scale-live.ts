// آخر قراية من الميزان (الإيجنت بيبعتها لـ /api/scale/live) - السيرفر بس
// في Upstash Redis (مفتاح واحد، بيتمسح لوحده بعد ساعة) + نسخة في الذاكرة. القراية بتتكاش ثانية واحدة في نفس الـ instance
// عشان كذا موبايل بيسألوا كل ثانيتين ميعملوش طلب Redis لكل واحد
// The latest scale reading (posted by the agent to /api/scale/live) - server only. Kept in Upstash Redis (one key,
// expires after an hour) plus an in-memory copy. Reads are cached for 1 s per instance so several phones polling every
// 2 s don't each cost a Redis request
import { redis, redisSettings } from "./redis";
import { dashboardConfig } from "@/config/dashboard.config";
import { LiveScaleReading } from "./types";

const KEY = "elsafwa:scale:live";

export class LiveScaleError extends Error {}

// الشكل اللي الإيجنت بيبعته: {weight_kg, stable, online, at} - the agent's payload
export function parseLive(body: unknown): LiveScaleReading {
  if (!body || typeof body !== "object") throw new LiveScaleError("body must be a JSON object {weight_kg, stable, online, at}");
  const b = body as Record<string, unknown>;
  const online = b.online === undefined ? true : b.online === true || b.online === 1 || b.online === "true";
  const raw = b.weight_kg ?? b.weight ?? b.gross_kg;
  let weightKg: number | null = null;
  if (raw !== undefined && raw !== null && raw !== "") {
    const kg = Number(raw);
    if (!Number.isFinite(kg) || kg < -100 || kg > dashboardConfig.operator.maxKg) {
      throw new LiveScaleError(`weight_kg must be a number up to ${dashboardConfig.operator.maxKg}`);
    }
    weightKg = Math.round(kg * 10) / 10;
  } else if (online) {
    throw new LiveScaleError("weight_kg is required while online");
  }
  const stable = b.stable === true || b.stable === 1 || b.stable === "true";
  const rawAt = b.at === undefined || b.at === null || b.at === "" ? new Date().toISOString() : String(b.at);
  const at = Date.parse(rawAt);
  if (!Number.isFinite(at)) throw new LiveScaleError("at must be an ISO date-time");
  // ساعة الإيجنت ممكن تكون مقدمة: مش بنقبل وقت في المستقبل - never a time in the future (agent clock ahead)
  const atIso = new Date(Math.min(at, Date.now())).toISOString();
  return { weightKg, stable: online && stable, online, at: atIso, receivedAt: new Date().toISOString() };
}

let memory: LiveScaleReading | null = null;
let cache: { at: number; value: LiveScaleReading | null } | null = null;

export async function saveLive(reading: LiveScaleReading): Promise<"redis" | "memory"> {
  memory = reading;
  cache = { at: Date.now(), value: reading };
  if (!redisSettings()) return "memory";
  await redis(["SET", KEY, JSON.stringify(reading), "EX", 3600]);
  return "redis";
}

export async function loadLive(): Promise<LiveScaleReading | null> {
  if (cache && Date.now() - cache.at < 1000) return cache.value;
  let value = memory;
  if (redisSettings()) {
    try {
      const raw = await redis<string>(["GET", KEY]);
      const stored = raw ? (JSON.parse(raw) as LiveScaleReading) : null;
      // الأحدث يكسب - the newest wins
      if (stored && (!value || stored.receivedAt >= value.receivedAt)) value = stored;
    } catch (error) {
      console.error("[scale] live read failed, using memory:", error instanceof Error ? error.message : error);
    }
  }
  cache = { at: Date.now(), value };
  return value;
}
