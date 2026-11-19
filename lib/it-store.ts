// آخر بيانات وصلت من إيجنت IT: في الذاكرة، وفي Upstash Redis (أو Vercel KV) لو متظبط عشان تعيش بعد الـ cold start
// السيرفر بس. أي حقل مش في الشكل المتفق عليه بيترمي (مفيش أي باسورد بيتخزن أبدا)
// The latest IT agent data: in memory, plus Upstash Redis (or Vercel KV) when configured so it survives cold starts.
// Server only. Any field outside the agreed schema is dropped (no password is ever stored)
import { timingSafeEqual } from "node:crypto";
import { dashboardConfig } from "@/config/dashboard.config";
import { ItCamera, ItDevice, ItDeviceType, ItEvent, ItRouter, ItSnapshot, ItStatus } from "./types";

const KEY = "elsafwa:it:status";
const MAX_EVENTS = 200; // آخر 200 حدث - keep the last 200 events
const EVENT_DAYS = 3; // والأحداث الأقدم من 3 أيام بتتمسح - and drop events older than 3 days

type Stored = { receivedAt: string; data: ItSnapshot };

// ===== التخزين: Upstash Redis REST (نفس الـ API بتاع Vercel KV) - storage: Upstash Redis REST (same API as Vercel KV) =====
function redisSettings() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
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

// ===== التنضيف: الشكل المتفق عليه بس - sanitizing: the agreed schema only =====
const text = (value: unknown, max = 120): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const bool = (value: unknown): boolean => value === true;
const optBool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const num = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value * 10) / 10)) : null;
// تاريخ ISO صحيح بس - a valid ISO date only
const iso = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
// IP أو اسم جهاز بس (مفيش user:pass@ ولا مسافات) - an IP or host name only (no user:pass@, no spaces)
const ip = (value: unknown): string => {
  const v = text(value, 64);
  return /^[A-Za-z0-9.:\-\[\]]+$/.test(v) ? v : "";
};
const list = (value: unknown, max = 200): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === "object").slice(0, max) : [];
const DEVICE_TYPES: ItDeviceType[] = ["fingerprint", "nvr", "printer", "pc", "scale", "other"];

export class ItPayloadError extends Error {}

export function sanitizePayload(body: unknown): ItSnapshot {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ItPayloadError("body must be a JSON object");
  const b = body as Record<string, unknown>;
  const agent = b.agent && typeof b.agent === "object" ? (b.agent as Record<string, unknown>) : null;
  const internet = b.internet && typeof b.internet === "object" ? (b.internet as Record<string, unknown>) : null;

  const routers: ItRouter[] = list(b.routers, 50)
    .map((r) => ({
      id: text(r.id, 64),
      name: text(r.name),
      kind: r.kind === "ap" ? ("ap" as const) : ("router" as const),
      ip: ip(r.ip),
      up: bool(r.up),
      latencyMs: num(r.latencyMs, 0, 60_000),
      internet: optBool(r.internet),
      since: iso(r.since),
      uptimeTodayPct: num(r.uptimeTodayPct, 0, 100),
    }))
    .filter((r) => r.id && r.name);

  const devices: ItDevice[] = list(b.devices, 300)
    .map((d) => ({
      id: text(d.id, 64),
      name: text(d.name),
      type: DEVICE_TYPES.includes(d.type as ItDeviceType) ? (d.type as ItDeviceType) : ("other" as const),
      ip: ip(d.ip),
      up: bool(d.up),
      latencyMs: num(d.latencyMs, 0, 60_000),
      lastSeen: iso(d.lastSeen),
      since: iso(d.since),
    }))
    .filter((d) => d.id && d.name);

  // الكاميرات: id واسم وحالة بس - أي رابط أو باسورد بيترمي - cameras: id, name and status only; any URL / password is dropped
  const cameras: ItCamera[] = list(b.cameras, 64)
    .map((c) => ({ id: text(c.id, 64), name: text(c.name), online: optBool(c.online) }))
    .filter((c) => /^[A-Za-z0-9_-]+$/.test(c.id) && c.name);

  const TARGETS = ["internet", "router", "ap", ...DEVICE_TYPES];
  const events: ItEvent[] = list(b.events, MAX_EVENTS)
    .map((e) => ({
      id: text(e.id, 80),
      at: iso(e.at) ?? "",
      kind: e.kind === "up" ? ("up" as const) : ("down" as const),
      targetName: text(e.targetName),
      targetType: (TARGETS.includes(e.targetType as string) ? e.targetType : "other") as ItEvent["targetType"],
      ip: ip(e.ip) || null,
    }))
    .filter((e) => e.id && e.at && e.targetName);

  if (!internet && routers.length === 0 && devices.length === 0 && cameras.length === 0 && events.length === 0) {
    throw new ItPayloadError("payload has none of internet / routers / devices / cameras / events");
  }

  return {
    agent: agent ? { name: text(agent.name, 60), version: text(agent.version, 30) } : null,
    sentAt: iso(b.sentAt),
    internet: internet ? { up: bool(internet.up), since: iso(internet.since), latencyMs: num(internet.latencyMs, 0, 60_000) } : null,
    routers,
    devices,
    cameras,
    events,
  };
}

// الأحداث من كل التحديثات مع بعض (من غير تكرار)، الأحدث الأول - events from every update merged (no duplicates), newest first
function mergeEvents(old: ItEvent[], fresh: ItEvent[]): ItEvent[] {
  const byId = new Map<string, ItEvent>();
  for (const event of [...old, ...fresh]) byId.set(event.id, event);
  const cutoff = new Date(Date.now() - EVENT_DAYS * 86_400_000).toISOString();
  return Array.from(byId.values())
    .filter((e) => e.at >= cutoff)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, MAX_EVENTS);
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
