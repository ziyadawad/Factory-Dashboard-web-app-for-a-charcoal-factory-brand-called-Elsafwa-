"use client";

import { useMemo, useRef } from "react";
import { Batches, DashboardData, SectionKey } from "./types";

// آخر نتيجة نجحت لكل كارت في المتصفح (localStorage)، عشان تفضل بعد الـ reload كل 5 دقايق
// وحتى لو السيرفر (Vercel serverless) اتعمله restart ونسي آخر قيمة. بتتمسح لما اليوم يتغير
// Last good result per card in the browser (localStorage), so it survives the automatic reload and
// serverless restarts that wipe the server's memory. Cleared when the Cairo day changes.

const STORAGE_KEY = "dashboard-last-good";

type Saved = Partial<Pick<DashboardData, SectionKey>> & { batches?: Batches; day: string };

const cairoDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

function readSaved(day: string): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
    if (saved?.day === day) return saved;
  } catch {
    // مفيش localStorage أو الداتا بايظة - no localStorage or bad data
  }
  return { day };
}

function writeSaved(saved: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // مفيش localStorage: الذاكرة بس - no localStorage: memory only
  }
}

export type CardState = { offline: boolean; missing: boolean };

// بيرجع الداتا اللي هتتعرض + حالة كل كارت: offline = بادج "غير متصل"، missing = مفيش أي رقم حقيقي
// Returns the data to show and each card's state: offline = badge, missing = no real value at all
export function useLastGood(data: DashboardData | undefined) {
  const memory = useRef<Saved | null>(null);

  return useMemo(() => {
    const ok: CardState = { offline: false, missing: false };
    const cards: Record<SectionKey, CardState> = { attendance: ok, treasury: ok, kilns: ok };
    if (!data) return { view: data, cards };

    const day = cairoDay();
    if (memory.current?.day !== day) memory.current = readSaved(day);
    const saved = memory.current;
    const view: DashboardData = { ...data };
    let changed = false;

    // داتا قديمة من سيرفر قبل التحديث ده (مفيهاش sections) تتعامل كأنها ok - older server without sections = ok
    for (const key of ["attendance", "treasury", "kilns"] as const) {
      const status = data.sections?.[key] ?? "ok";
      if (status === "ok") {
        (saved as unknown as Record<string, unknown>)[key] = data[key];
        changed = true;
        cards[key] = ok;
      } else if (status === "stale") {
        cards[key] = { offline: true, missing: false };
      } else if (saved[key]) {
        (view as unknown as Record<string, unknown>)[key] = saved[key];
        cards[key] = { offline: true, missing: false };
      } else {
        cards[key] = { offline: true, missing: true };
      }
    }

    // الطرحات: null = فشل ومفيش نتيجة على السيرفر، نجرب اللي في المتصفح - batches null: try the browser copy
    if (data.batches && !data.batches.offline) {
      saved.batches = data.batches;
      changed = true;
    } else if (!data.batches && saved.batches) {
      view.batches = { ...saved.batches, offline: true };
    }

    if (changed) writeSaved(saved);
    return { view, cards };
  }, [data]);
}
