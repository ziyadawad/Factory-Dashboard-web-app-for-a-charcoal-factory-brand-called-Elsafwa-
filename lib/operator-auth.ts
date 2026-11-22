// دخول شاشة الأوبريتر: رقم سري 4 أرقام في OPERATOR_PIN بيتشيك على السيرفر بس، وكوكي httpOnly 30 يوم
// الكوكي فيه HMAC للرقم (مش الرقم نفسه)، فلو الرقم اتغير في Vercel كل الأجهزة بتخرج لوحدها
// الغلط محدود: pinMaxTries لكل IP في pinLockMinutes، وحد عام (لكل الأجهزة) عشان محدش يجرب الـ 10000 رقم من IPs كتير
// Operator login: a 4-digit OPERATOR_PIN checked on the server only, httpOnly cookie for 30 days. The cookie holds an
// HMAC of the PIN (never the PIN), so changing the PIN in Vercel logs every device out. Wrong PINs are rate limited per
// IP, plus a global cap so the 10,000 PINs can't be walked from many IPs
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dashboardConfig } from "@/config/dashboard.config";
import { NO_STORE } from "./api-auth";
import { redis, redisSettings } from "./redis";

export const OPERATOR_COOKIE = "operator-session";
const GLOBAL_MAX_FAILS = 30; // لكل الأجهزة مع بعض في نفس الوقت - all devices together within the same window

export function operatorPin(): string {
  return (process.env.OPERATOR_PIN ?? "").trim();
}

// قيمة الكوكي الصح - the expected cookie value
function sessionToken(pin: string): string {
  return createHmac("sha256", `elsafwa-operator:${pin}`).update("operator-session-v1").digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function pinMatches(given: string): boolean {
  const pin = operatorPin();
  return !!pin && same(given.trim(), pin);
}

// الكوكي سليم؟ (بيتقري من الـ cookie value) - is this cookie value a valid session?
export function operatorSessionValid(value: string | undefined): boolean {
  const pin = operatorPin();
  return !!pin && !!value && same(value, sessionToken(pin));
}

export function setOperatorCookie(response: NextResponse) {
  response.cookies.set(OPERATOR_COOKIE, sessionToken(operatorPin()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: dashboardConfig.operator.sessionDays * 86_400,
    path: "/",
  });
}

export function clearOperatorCookie(response: NextResponse) {
  response.cookies.set(OPERATOR_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
}

// null = مسموح، غير كده الرد اللي يترجع - null = allowed, otherwise the response to return
export function operatorAuthError(request: NextRequest): NextResponse | null {
  if (!operatorPin()) return NextResponse.json({ error: "OPERATOR_PIN is not set on the server" }, { status: 503, headers: NO_STORE });
  if (!operatorSessionValid(request.cookies.get(OPERATOR_COOKIE)?.value)) {
    return NextResponse.json({ error: "login required" }, { status: 401, headers: NO_STORE });
  }
  return null;
}

// ===== حد الغلطات - wrong-PIN rate limit =====

export function clientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// في الذاكرة لو مفيش Redis (لكل instance) - in memory when Redis is missing (per instance)
const memoryFails = new Map<string, { count: number; until: number }>();

async function count(key: string, add: boolean): Promise<number> {
  const windowSec = dashboardConfig.operator.pinLockMinutes * 60;
  if (redisSettings()) {
    try {
      if (!add) return Number((await redis<string>(["GET", key])) ?? 0);
      const value = Number((await redis<number>(["INCR", key])) ?? 0);
      if (value === 1) await redis(["EXPIRE", key, windowSec]);
      return value;
    } catch (error) {
      console.error("[operator] redis rate limit failed, using memory:", error instanceof Error ? error.message : error);
    }
  }
  const now = Date.now();
  const hit = memoryFails.get(key);
  const current = hit && hit.until > now ? hit : { count: 0, until: now + windowSec * 1000 };
  if (add) current.count += 1;
  memoryFails.set(key, current);
  return current.count;
}

const ipKey = (ip: string) => `elsafwa:operator:pinfail:${ip}`;
const GLOBAL_KEY = "elsafwa:operator:pinfail:all";

// متقفل؟ - locked out?
export async function pinLocked(ip: string): Promise<boolean> {
  const [mine, all] = await Promise.all([count(ipKey(ip), false), count(GLOBAL_KEY, false)]);
  return mine >= dashboardConfig.operator.pinMaxTries || all >= GLOBAL_MAX_FAILS;
}

// غلطة: بترجع فاضل كام محاولة - a wrong PIN: returns the tries left
export async function pinFailed(ip: string): Promise<number> {
  const [mine] = await Promise.all([count(ipKey(ip), true), count(GLOBAL_KEY, true)]);
  return Math.max(0, dashboardConfig.operator.pinMaxTries - mine);
}
