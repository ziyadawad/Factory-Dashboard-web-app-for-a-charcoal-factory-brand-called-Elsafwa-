"use client";

import { useEffect, useRef, useState } from "react";
import { usePolling } from "./usePolling";
import type { RepPresence } from "./types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// حضور المناديب كل دقيقة (والصفحة ظاهرة بس). arrived = المناديب اللي بصموا والصفحة مفتوحة (فلاش الفوانيس مرتين)
// Rep attendance every minute (only while visible). arrived = reps who punched while the page is open (headlight flash)
export function useRepAttendance(active: boolean): { presence: Record<string, RepPresence>; arrived: Set<string> } {
  const { data } = usePolling<Record<string, RepPresence>>("/api/reps/attendance", fetcher, 60_000, active, { revalidateOnReconnect: true });
  const prev = useRef<Record<string, RepPresence> | null>(null);
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data || (data as { error?: string }).error) return;
    const before = prev.current;
    prev.current = data;
    if (!before) return; // أول تحميل: من غير فلاش - the first load: no flash
    const fresh = Object.keys(data).filter((id) => data[id]?.present && !before[id]?.present);
    if (fresh.length === 0) return;
    setArrived(new Set(fresh));
    const t = setTimeout(() => setArrived(new Set()), 1600);
    return () => clearTimeout(t);
  }, [data]);
  return { presence: data && !(data as { error?: string }).error ? data : {}, arrived };
}
