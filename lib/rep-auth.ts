// دخول تطبيق المناديب (/rep): كل مندوب برقم سري 4 أرقام في REP_PINS (JSON في Vercel بس: {"karim":"1234",...})
// الكوكي httpOnly فيه id المندوب + HMAC للرقم بتاعه (مش الرقم نفسه)، فلو رقمه اتغير بيخرج لوحده
// الغلط محدود: pinMaxTries لكل (IP + مندوب) في pinLockMinutes، وحد عام لكل الأجهزة
// Rep app login: each rep has a 4-digit PIN in REP_PINS (JSON, Vercel only). The httpOnly cookie holds the rep id + an
// HMAC of his PIN (never the PIN), so changing his PIN logs him out. Wrong PINs are limited per IP+rep plus globally
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dashboardConfig } from "@/config/dashboard.config";
import { NO_STORE } from "./api-auth";
import { redis, redisSettings } from "./redis";

export const REP_COOKIE = "rep-session";
const app = dashboardConfig.sales.repApp;
const GLOBAL_MAX_FAILS = 40;

export type RepConfig = (typeof dashboardConfig.sales.reps)[number];

// REP_PINS = {"karim":"1234"} - بيتقري كل مرة (Vercel بيغيره من غير build) - read every time
export function repPins(): Record<string, string> {
  try {
    const raw = JSON.parse(process.env.REP_PINS ?? "{}") as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, pin] of Object.entries(raw)) if (/^\d{4}$/.test(String(pin ?? "").trim())) out[id] = String(pin).trim();
    return out;
  } catch {
    return {};
  }
}
export const repsConfigured = () => Object.keys(repPins()).length > 0;
export const repById = (id: string) => dashboardConfig.sales.reps.find((r) => r.id === id) ?? null;

const token = (id: string, pin: string) => createHmac("sha256", `elsafwa-rep:${id}:${pin}`).update("rep-session-v1").digest("hex");
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function pinMatches(id: string, given: string): boolean {
  const pin = repPins()[id];
  return !!pin && same(given.trim(), pin);
}

// المندوب من الكوكي (null = مش داخل) - the rep from the cookie (null = not logged in)
export function repFromCookie(value: string | undefined): RepConfig | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const pin = repPins()[id];
  const rep = repById(id);
  if (!pin || !rep || !same(value.slice(dot + 1), token(id, pin))) return null;
  return rep;
}

export function setRepCookie(response: NextResponse, rep: RepConfig) {
  response.cookies.set(REP_COOKIE, `${rep.id}.${token(rep.id, repPins()[rep.id])}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: app.sessionDays * 86_400,
    path: "/",
  });
}

export function clearRepCookie(response: NextResponse) {
  response.cookies.set(REP_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
}

// المندوب أو رد الخطأ - the rep, or the error response
export function repAuth(request: NextRequest): { rep: RepConfig; error: null } | { rep: null; error: NextResponse } {
  if (!repsConfigured()) return { rep: null, error: NextResponse.json({ error: "REP_PINS مش متظبط على السيرفر" }, { status: 503, headers: NO_STORE }) };
  const rep = repFromCookie(request.cookies.get(REP_COOKIE)?.value);
  if (!rep) return { rep: null, error: NextResponse.json({ error: "login required" }, { status: 401, headers: NO_STORE }) };
  return { rep, error: null };
}

// ===== حد الغلطات - wrong-PIN rate limit =====
export function clientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

const memoryFails = new Map<string, { count: number; until: number }>();
async function count(key: string, add: boolean): Promise<number> {
  const windowSec = app.pinLockMinutes * 60;
  if (redisSettings()) {
    try {
      if (!add) return Number((await redis<string>(["GET", key])) ?? 0);
      const value = Number((await redis<number>(["INCR", key])) ?? 0);
      if (value === 1) await redis(["EXPIRE", key, windowSec]);
      return value;
    } catch (error) {
      console.error("[rep] redis rate limit failed, using memory:", error instanceof Error ? error.message : error);
    }
  }
  const now = Date.now();
  const hit = memoryFails.get(key);
  const current = hit && hit.until > now ? hit : { count: 0, until: now + windowSec * 1000 };
  if (add) current.count += 1;
  memoryFails.set(key, current);
  return current.count;
}
const keyOf = (ip: string, id: string) => `elsafwa:rep:pinfail:${ip}:${id}`;
const GLOBAL_KEY = "elsafwa:rep:pinfail:all";

export async function pinLocked(ip: string, id: string): Promise<boolean> {
  const [mine, all] = await Promise.all([count(keyOf(ip, id), false), count(GLOBAL_KEY, false)]);
  return mine >= app.pinMaxTries || all >= GLOBAL_MAX_FAILS;
}

export async function pinFailed(ip: string, id: string): Promise<number> {
  const [mine] = await Promise.all([count(keyOf(ip, id), true), count(GLOBAL_KEY, true)]);
  return Math.max(0, app.pinMaxTries - mine);
}
