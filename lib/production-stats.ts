// ملخصات الإنتاج من قايمة الطرحات (بتتحسب في المتصفح، فمفيش طلب زيادة لـ ERPNext)
// Production summaries from the exits list (computed in the browser: no extra ERPNext request)
// الوزن: طرحة من غير وزن (kg = null) بتتعد في العدد بس، ومش بتدخل في الأطنان ولا المتوسط
// Weights: an exit with no weight (kg = null) counts in the number of exits only, never in tons or the average

import { useEffect, useState } from "react";
import { KilnStatus, ProductionData, ProductionExit } from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

export const NO_TYPE = "غير محدد";
export const NO_TYPE_COLOR = "#6B7280";

const tonsFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// كيلو ← "1,234.56" طن (رقمين عشريين) - kg to tons with 2 decimals
export const formatTons = (kg: number) => tonsFormat.format(kg / 1000);
export const formatKg = (kg: number) => kgFormat.format(kg);

// مجموعة طرحات: العدد، المتوزن منهم، والكيلوهات - a set of exits: count, how many are weighed, and kg
export type Tally = { count: number; weighed: number; kg: number };
export const emptyTally = (): Tally => ({ count: 0, weighed: 0, kg: 0 });
export function addExit(tally: Tally, exit: ProductionExit) {
  tally.count += 1;
  if (exit.kg !== null) {
    tally.weighed += 1;
    tally.kg += exit.kg;
  }
}
export function tallyOf(exits: ProductionExit[]): Tally {
  const tally = emptyTally();
  exits.forEach((e) => addExit(tally, e));
  return tally;
}

export type KilnSummary = { name: string; status: KilnStatus; today: Tally; month: Tally; last: ProductionExit | null };
export type TypeSummary = { label: string; color: string; today: Tally; month: Tally };
export type HourBar = { hour: number; label: string; tons: number; count: number };

export interface ProductionSummary {
  today: Tally;
  yesterday: Tally;
  month: Tally;
  todayExits: ProductionExit[]; // الأحدث الأول - newest first
  last: ProductionExit | null; // آخر طرحة (حتى لو امبارح) - the latest exit (even yesterday's)
  // مقارنة بإمبارح: بالأطنان لو فيه أوزان، وإلا بعدد الطرحات. pct = null لو امبارح صفر
  // Compared with yesterday: in tons when there are weights, else by exits; pct = null when yesterday is zero
  compare: { by: "tons" | "count"; today: number; yesterday: number; pct: number | null };
  kilns: KilnSummary[];
  working: number;
  types: TypeSummary[];
  hours: HourBar[];
}

// لون كل نوع (والفاضي رمادي) - each type's color (empty = gray)
export function typeColor(data: ProductionData, label: string): string {
  return data.types.find((t) => t.label === label)?.color ?? NO_TYPE_COLOR;
}

export function summarize(data: ProductionData): ProductionSummary {
  const { hourFrom, hourTo } = dashboardConfig.production;
  const todayExits = data.exits.filter((e) => e.date === data.today);
  const monthExits = data.exits.filter((e) => e.date >= data.monthStart);
  const today = tallyOf(todayExits);
  const yesterday = tallyOf(data.exits.filter((e) => e.date === data.yesterday));
  const month = tallyOf(monthExits);

  const byTons = today.weighed + yesterday.weighed > 0;
  const now = byTons ? today.kg : today.count;
  const before = byTons ? yesterday.kg : yesterday.count;

  // الأفران: من Workstation، وأي فرن في الطرحات مش في القايمة بيتضاف (متوقف) - kilns from Workstation (+ unknown ones, stopped)
  const kilnMap = new Map<string, KilnSummary>();
  for (const k of data.kilns) kilnMap.set(k.name, { name: k.name, status: k.status, today: emptyTally(), month: emptyTally(), last: null });
  for (const e of monthExits) {
    if (!e.kiln) continue;
    let k = kilnMap.get(e.kiln);
    if (!k) {
      k = { name: e.kiln, status: "stopped", today: emptyTally(), month: emptyTally(), last: null };
      kilnMap.set(e.kiln, k);
    }
    addExit(k.month, e);
    if (e.date === data.today) addExit(k.today, e);
  }
  for (const e of data.exits) {
    const k = kilnMap.get(e.kiln);
    if (k && !k.last) k.last = e; // الأحدث الأول - newest first
  }

  // الأنواع بترتيب ERPNext، والفاضي في الآخر لو موجود - types in ERPNext order, the empty one last when present
  const types: TypeSummary[] = data.types.map((t) => ({ label: t.label, color: t.color, today: emptyTally(), month: emptyTally() }));
  for (const e of monthExits) {
    const label = e.type || NO_TYPE;
    let t = types.find((x) => x.label === label);
    if (!t) {
      t = { label, color: NO_TYPE_COLOR, today: emptyTally(), month: emptyTally() };
      types.push(t);
    }
    addExit(t.month, e);
    if (e.date === data.today) addExit(t.today, e);
  }

  // بالساعة: طرحة قبل hourFrom في أول عمود وبعد hourTo في آخر عمود - hourly: earlier / later exits go to the edge bars
  const hours: HourBar[] = [];
  for (let h = hourFrom; h <= hourTo; h++) hours.push({ hour: h, label: String(h), tons: 0, count: 0 });
  for (const e of todayExits) {
    const h = Math.min(hourTo, Math.max(hourFrom, Number(e.time.slice(0, 2)) || 0));
    const bar = hours[h - hourFrom];
    bar.count += 1;
    if (e.kg !== null) bar.tons += e.kg / 1000;
  }

  const kilns = Array.from(kilnMap.values());
  return {
    today,
    yesterday,
    month,
    todayExits,
    last: data.exits[0] ?? null,
    compare: { by: byTons ? "tons" : "count", today: now, yesterday: before, pct: before > 0 ? ((now - before) / before) * 100 : null },
    kilns,
    working: kilns.filter((k) => k.status === "working").length,
    types,
    hours,
  };
}

// طرحات الشهر لفرن أو نوع، يوم بيوم (الأحدث الأول) - a kiln's or type's exits this month, day by day (newest first)
export function monthDays(data: ProductionData, kind: "kiln" | "type", name: string) {
  const exits = data.exits.filter(
    (e) => e.date >= data.monthStart && (kind === "kiln" ? e.kiln === name : (e.type || NO_TYPE) === name)
  );
  const days = new Map<string, ProductionExit[]>();
  for (const e of exits) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return { total: tallyOf(exits), days: Array.from(days, ([date, list]) => ({ date, exits: list, tally: tallyOf(list) })) };
}

// "من X دقيقة" من وقت الطرحة (بتوقيت القاهرة)، بيتحدث كل 30 ثانية - "since X minutes", refreshed every 30 s
export function useMinutesSince(exit: ProductionExit | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!exit) return null;
  return Math.max(0, Math.floor((now - cairoTime(exit.date, exit.time)) / 60_000));
}

// تاريخ ووقت بتوقيت القاهرة ← ملي ثانية - a Cairo date and time to epoch ms
function cairoTime(date: string, time: string): number {
  const guess = Date.parse(`${date}T${time || "00:00"}:00Z`);
  // فرق توقيت القاهرة في اللحظة دي (صيفي / شتوي) - Cairo's offset at that moment (summer / winter time)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asCairo = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess - (asCairo - guess);
}

// "من 5 دقايق" / "من ساعتين" / "من يومين" - a short Arabic "ago"
export function agoText(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return `من ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `من ${hours} ساعة${minutes % 60 ? ` و${minutes % 60} دقيقة` : ""}`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "من يوم" : days === 2 ? "من يومين" : `من ${days} أيام`;
}

// مقاسات صفحة الإنتاج: العادية أو الأصغر على شاشة أضيق من 1600 - page sizes: normal, or compact under 1600 wide
export function useCompact(maxWidth = 1599): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [maxWidth]);
  return compact;
}
