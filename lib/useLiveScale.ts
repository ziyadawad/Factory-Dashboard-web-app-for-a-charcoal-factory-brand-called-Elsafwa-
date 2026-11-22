"use client";

// الوزن المباشر من الميزان: المتصفح بيسأل الإيجنت على شبكة المصنع على طول ({it.cameraBaseUrl}{operator.scalePath})
// زي الكاميرات بالظبط، فمفيش أي طلب على Vercel. برا المصنع الإيجنت مش بيرد = "الميزان مش متصل" وبيجرب تاني كل شوية
// والصفحة مستخبية = مفيش ولا طلب. الشكل المتوقع: { "weight_kg": 1193, "stable": true } (أو weight / gross_kg و is_stable)
// Live scale weight: the browser asks the agent on the factory LAN directly, like the cameras, so Vercel is never
// involved. Outside the factory the agent never answers ("الميزان مش متصل") and it retries now and then; a hidden
// page sends nothing. Expected JSON: { "weight_kg": 1193, "stable": true } (or weight / gross_kg and is_stable)

import { useEffect, useState } from "react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePageVisible } from "./usePolling";

const cfg = dashboardConfig.operator;
const BASE = dashboardConfig.it.cameraBaseUrl.replace(/\/+$/, "");
const URL_ = BASE ? `${BASE}${cfg.scalePath}` : "";
const FAILS_TOLERATED = 2;

export type LiveScale = { online: boolean; weightKg: number | null; stable: boolean };

function parse(body: unknown): { weightKg: number; stable: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.online === false || b.connected === false) return null;
  const raw = [b.weight_kg, b.weight, b.gross_kg, b.kg].find((v) => v !== undefined && v !== null && v !== "");
  const kg = Number(raw);
  if (!Number.isFinite(kg)) return null;
  const stable = b.stable ?? b.is_stable ?? b.steady;
  return { weightKg: Math.round(kg * 10) / 10, stable: stable === true || stable === 1 || stable === "true" };
}

export function useLiveScale(): LiveScale {
  const visible = usePageVisible();
  const [state, setState] = useState<LiveScale>({ online: false, weightKg: null, stable: false });

  useEffect(() => {
    if (!URL_ || !visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = FAILS_TOLERATED; // بيبدأ "مش متصل" لحد أول رد - starts offline until the first answer
    const tick = async () => {
      let next: { weightKg: number; stable: boolean } | null = null;
      try {
        const res = await fetch(URL_, { cache: "no-store", signal: AbortSignal.timeout(cfg.scaleTimeoutMs) });
        if (res.ok) next = parse(await res.json());
      } catch {
        next = null;
      }
      if (stopped) return;
      if (next) {
        fails = 0;
        setState({ online: true, weightKg: next.weightKg, stable: next.stable });
      } else if (++fails >= FAILS_TOLERATED) {
        setState({ online: false, weightKg: null, stable: false });
      }
      // متصل: كل ثانية. مش متصل: كل scaleRetrySeconds - online: every second; offline: every scaleRetrySeconds
      timer = setTimeout(tick, fails >= FAILS_TOLERATED ? cfg.scaleRetrySeconds * 1000 : cfg.scalePollMs);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [visible]);

  return state;
}
