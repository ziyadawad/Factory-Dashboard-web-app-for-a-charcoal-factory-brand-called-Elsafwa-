import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { clearOperatorCookie, clientIp, operatorPin, pinFailed, pinLocked, pinMatches, setOperatorCookie } from "@/lib/operator-auth";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";

// دخول شاشة الأوبريتر بالرقم السري (بيتشيك هنا على السيرفر بس) - operator login with the PIN (checked here only)
export async function POST(request: NextRequest) {
  if (!operatorPin()) return NextResponse.json({ error: "OPERATOR_PIN مش متظبط على السيرفر" }, { status: 503, headers: NO_STORE });
  const ip = clientIp(request);
  const lockedMsg = `محاولات غلط كتير — استنى ${dashboardConfig.operator.pinLockMinutes} دقيقة`;
  if (await pinLocked(ip)) return NextResponse.json({ error: lockedMsg }, { status: 429, headers: NO_STORE });
  let pin = "";
  try {
    pin = String(((await request.json()) as { pin?: unknown }).pin ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400, headers: NO_STORE });
  }
  if (!/^\d{4}$/.test(pin) || !pinMatches(pin)) {
    const left = await pinFailed(ip);
    return NextResponse.json(
      { error: left > 0 ? `الرقم غلط — فاضل ${left} محاولات` : lockedMsg },
      { status: left > 0 ? 401 : 429, headers: NO_STORE }
    );
  }
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  setOperatorCookie(response);
  return response;
}

// خروج - log out
export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  clearOperatorCookie(response);
  return response;
}
