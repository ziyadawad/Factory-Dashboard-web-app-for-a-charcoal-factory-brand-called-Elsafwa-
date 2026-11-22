"use client";

// الوزن المباشر من الميزان: من /api/scale/live بس (الإيجنت بيبعته لـ Vercel)، فبيشتغل من أي مكان ومفيش أي طلب على
// شبكة المصنع. بيسأل كل operator.livePollSeconds والصفحة ظاهرة وactive بس. لو مفيش تحديث من liveStaleSeconds
// (السيرفر بيحسبها بساعته هو) أو الطلب فشل = "الميزان مش متصل"
// Live scale weight: only from /api/scale/live (the agent posts it to Vercel), so it works anywhere and never calls
// the factory LAN. Polls every operator.livePollSeconds only while the page is visible and active. No update for
// liveStaleSeconds (aged by the server's own clock) or a failed request = "الميزان مش متصل"

import { useEffect, useState } from "react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePageVisible } from "./usePolling";

const cfg = dashboardConfig.operator;
const FAILS_TOLERATED = 2; // طلب واحد فاشل مش بيقلب الكارت - one failed request does not flip the card

export type LiveScale = { online: boolean; weightKg: number | null; stable: boolean };

const OFFLINE: LiveScale = { online: false, weightKg: null, stable: false };

export function useLiveScale(active = true): LiveScale {
  const visible = usePageVisible();
  const [state, setState] = useState<LiveScale>(OFFLINE);
  const on = active && visible;

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;
    const tick = async () => {
      try {
        const res = await fetch("/api/scale/live", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { connected?: boolean; weightKg?: number | null; stable?: boolean };
        if (stopped) return;
        fails = 0;
        setState(
          body.connected && typeof body.weightKg === "number"
            ? { online: true, weightKg: body.weightKg, stable: body.stable === true }
            : OFFLINE
        );
      } catch {
        if (stopped) return;
        if (++fails >= FAILS_TOLERATED) setState(OFFLINE);
      }
      if (!stopped) timer = setTimeout(tick, cfg.livePollSeconds * 1000);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [on]);

  return state;
}
