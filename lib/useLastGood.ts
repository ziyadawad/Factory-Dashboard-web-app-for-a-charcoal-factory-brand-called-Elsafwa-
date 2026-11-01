"use client";

import { useMemo, useRef } from "react";
import { Batches, DashboardData, Distributors, SalesReps, SectionKey, WalletNumbers } from "./types";

// آخر نتيجة نجحت لكل كارت في المتصفح (localStorage)، عشان تفضل بعد الـ reload التلقائي (pages.reloadMinutes)
// وحتى لو السيرفر (Vercel serverless) اتعمله restart ونسي آخر قيمة. بتتمسح لما اليوم يتغير
// Last good result per card in the browser (localStorage), so it survives the automatic reload and
// serverless restarts that wipe the server's memory. Cleared when the Cairo day changes.

const STORAGE_KEY = "dashboard-last-good";

type Saved = Partial<Pick<DashboardData, SectionKey>> & {
  batches?: Batches;
  sales?: SalesReps;
  distributors?: Distributors;
  wallets?: Record<string, WalletNumbers>; // باسم المحفظة - by wallet name
  day: string;
};

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

    // المبيعات والموزعين بنفس الطريقة - sales and distributors the same way
    if (data.sales && !data.sales.offline) {
      saved.sales = data.sales;
      changed = true;
    } else if (!data.sales && saved.sales) {
      view.sales = { ...saved.sales, offline: true };
    }
    if (data.distributors && !data.distributors.offline) {
      saved.distributors = data.distributors;
      changed = true;
    } else if (!data.distributors && saved.distributors) {
      view.distributors = { ...saved.distributors, offline: true };
    }

    // الخزن والمحافظ: كل كارت لوحده - wallets: each card on its own
    if (data.wallets) {
      view.wallets = {
        list: data.wallets.list.map((card) => {
          if (!card.linked) return card;
          if (card.numbers && !card.offline) {
            saved.wallets = { ...saved.wallets, [card.name]: card.numbers };
            changed = true;
            return card;
          }
          const copy = saved.wallets?.[card.name];
          return !card.numbers && copy ? { ...card, numbers: copy, offline: true } : card;
        }),
      };
    }

    if (changed) writeSaved(saved);
    return { view, cards };
  }, [data]);
}
