import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { waErrorResponse } from "@/lib/wa-http";
import { checkPassword, clientIp, logRelock, newSessionCookie, sameOrigin, SEND_COOKIE, sessionOf } from "@/lib/wa-send";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/wa" };

// الكتابة مفتوحة؟ - is the composer unlocked?
export async function GET(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  return NextResponse.json(sessionOf(request), { headers: NO_STORE });
}

// فتح الكتابة بالباسورد (بيتفحص هنا على السيرفر بس) - unlock with the password (checked here on the server only)
export async function POST(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403, headers: NO_STORE });
  try {
    const body = (await request.json()) as { password?: unknown };
    const candidate = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    const result = await checkPassword(candidate, clientIp(request));
    if (!result.ok) {
      const status = result.lockedUntil ? 429 : 401;
      return NextResponse.json(
        { configured: true, unlocked: false, expiresAt: null, lockedUntil: result.lockedUntil, triesLeft: result.triesLeft },
        { status, headers: NO_STORE }
      );
    }
    const cookie = newSessionCookie();
    const res = NextResponse.json({ configured: true, unlocked: true, expiresAt: cookie.expiresAt, lockedUntil: null }, { headers: NO_STORE });
    res.cookies.set(SEND_COOKIE, cookie.value, { ...cookieBase, maxAge: cookie.maxAge });
    return res;
  } catch (error) {
    return waErrorResponse(error, "unlock");
  }
}

// "قفل" - relock
export async function DELETE(request: NextRequest) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    await logRelock(clientIp(request));
  } catch {
    // القفل أهم من السجل - relocking matters more than the log
  }
  const res = NextResponse.json({ ...sessionOf(request), unlocked: false, expiresAt: null }, { headers: NO_STORE });
  res.cookies.set(SEND_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
