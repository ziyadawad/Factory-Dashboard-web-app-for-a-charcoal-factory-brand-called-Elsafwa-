import { NextRequest } from "next/server";
import { dashboardConfig } from "@/config/dashboard.config";
import { clearRepCookie, clientIp, pinFailed, pinLocked, pinMatches, repById, repPins, repsConfigured, setRepCookie } from "@/lib/rep-auth";
import { repJson } from "@/lib/rep-http";

export const dynamic = "force-dynamic";

// دخول المندوب: { rep, pin } (الرقم بيتشيك هنا على السيرفر بس) - rep login (the PIN is checked here only)
export async function POST(request: NextRequest) {
  if (!repsConfigured()) return repJson({ error: "REP_PINS مش متظبط على السيرفر" }, 503);
  let id = "";
  let pin = "";
  try {
    const body = (await request.json()) as { rep?: unknown; pin?: unknown };
    id = String(body.rep ?? "");
    pin = String(body.pin ?? "");
  } catch {
    return repJson({ error: "bad request" }, 400);
  }
  const rep = repById(id);
  if (!rep) return repJson({ error: "اختار المندوب" }, 400);
  if (!repPins()[id]) return repJson({ error: `${rep.name} ملوش رقم سري لسه (REP_PINS)` }, 403);
  const ip = clientIp(request);
  const lockedMsg = `محاولات غلط كتير — استنى ${dashboardConfig.sales.repApp.pinLockMinutes} دقيقة`;
  if (await pinLocked(ip, id)) return repJson({ error: lockedMsg }, 429);
  if (!/^\d{4}$/.test(pin) || !pinMatches(id, pin)) {
    const left = await pinFailed(ip, id);
    return repJson({ error: left > 0 ? `الرقم غلط — فاضل ${left} محاولات` : lockedMsg }, left > 0 ? 401 : 429);
  }
  const response = repJson({ ok: true });
  setRepCookie(response, rep);
  return response;
}

// خروج - log out
export async function DELETE() {
  const response = repJson({ ok: true });
  clearRepCookie(response);
  return response;
}
