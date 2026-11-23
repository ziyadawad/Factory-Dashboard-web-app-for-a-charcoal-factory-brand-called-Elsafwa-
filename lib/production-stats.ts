// ملخصات الإنتاج من قايمة الترولات (بتتحسب في المتصفح، فمفيش طلب زيادة لـ ERPNext)
// كل سجل = ترول، والطرحة = 2 أو 3 ترولات (lib/batches.ts): العدد بالطرحات، والأطنان من الترولات زي ما هي
// Production summaries from the trolley list (computed in the browser: no extra ERPNext request).
// Each record = one trolley, a batch = 2 or 3 of them (lib/batches.ts): counts are batches, tons come from trolleys
// الوزن: طرحة من غير وزن (kg = null) بتتعد في العدد بس، ومش بتدخل في الأطنان ولا المتوسط
// Weights: an exit with no weight (kg = null) counts in the number of exits only, never in tons or the average

import { useEffect, useState } from "react";
import { KilnStatus, ProductionData, ProductionExit } from "./types";
import { Batch, batchOf, BatchRules, groupBatches } from "./batches";
import { dashboardConfig } from "@/config/dashboard.config";

// قاعدة تجميع الترولات في طرحات (production.batchWindowMinutes / maxTrolleysPerBatch) - the grouping rule
export const BATCH_RULES: BatchRules = {
  windowMinutes: dashboardConfig.production.batchWindowMinutes,
  maxTrolleys: dashboardConfig.production.maxTrolleysPerBatch,
};
export type ProductionBatch = Batch<ProductionExit>;

export const NO_TYPE = "غير محدد";
export const NO_TYPE_COLOR = "#6B7280";

const tonsFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// كيلو ← "1,234.56" طن (رقمين عشريين) - kg to tons with 2 decimals
export const formatTons = (kg: number) => tonsFormat.format(kg / 1000);
export const formatKg = (kg: number) => kgFormat.format(kg);

// مجموعة ترولات: العدد، المتوزن منهم، والكيلوهات، وعدد الطرحات - a set of trolleys: count, weighed, kg, and batches
export type Tally = { count: number; weighed: number; kg: number; batches: number; weighedBatches: number; batchKg: number };
export const emptyTally = (): Tally => ({ count: 0, weighed: 0, kg: 0, batches: 0, weighedBatches: 0, batchKg: 0 });
// طرحة في المجموعة (للعدد ومتوسط وزن الطرحة) - a batch into the set (count and average batch weight)
export function addBatch(tally: Tally, batch: ProductionBatch) {
  tally.batches += 1;
  if (batch.weighed > 0) {
    tally.weighedBatches += 1;
    tally.batchKg += batch.kg;
  }
}
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
  batches: ProductionBatch[]; // كل الطرحات، الأحدث الأول - every batch, newest first
  todayBatches: ProductionBatch[]; // طرحات النهارده، الأحدث الأول - today's batches, newest first
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

  // الطرحات: بتتعد في يوم أول ترول فيها - batches count on their first trolley's day
  const batches = groupBatches(data.exits, BATCH_RULES);
  const todayBatches = batches.filter((b) => b.date === data.today);
  for (const b of batches) {
    if (b.date === data.today) addBatch(today, b);
    if (b.date === data.yesterday) addBatch(yesterday, b);
    if (b.date >= data.monthStart) addBatch(month, b);
  }

  const byTons = today.weighed + yesterday.weighed > 0;
  const now = byTons ? today.kg : today.batches;
  const before = byTons ? yesterday.kg : yesterday.batches;

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
  for (const b of batches) {
    if (b.date < data.monthStart) continue;
    const k = kilnMap.get(b.kiln);
    if (!k) continue;
    addBatch(k.month, b);
    if (b.date === data.today) addBatch(k.today, b);
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
  for (const b of batches) {
    if (b.date < data.monthStart) continue;
    const t = types.find((x) => x.label === (b.type || NO_TYPE));
    if (!t) continue;
    addBatch(t.month, b);
    if (b.date === data.today) addBatch(t.today, b);
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
    batches,
    todayBatches,
    last: data.exits[0] ?? null,
    compare: { by: byTons ? "tons" : "count", today: now, yesterday: before, pct: before > 0 ? ((now - before) / before) * 100 : null },
    kilns,
    working: kilns.filter((k) => k.status === "working").length,
    types,
    hours,
  };
}

// ترولات الشهر لفرن أو نوع، يوم بيوم (الأحدث الأول)، والطرحات معدودة في كل يوم
// A kiln's or type's trolleys this month, day by day (newest first), with the batches counted per day
export function monthDays(data: ProductionData, kind: "kiln" | "type", name: string) {
  const match = (x: { kiln: string; type: string }) => (kind === "kiln" ? x.kiln === name : (x.type || NO_TYPE) === name);
  const exits = data.exits.filter((e) => e.date >= data.monthStart && match(e));
  const batches = groupBatches(data.exits, BATCH_RULES).filter((b) => b.date >= data.monthStart && match(b));
  const days = new Map<string, ProductionExit[]>();
  for (const e of exits) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const total = tallyOf(exits);
  batches.forEach((b) => addBatch(total, b));
  return {
    total,
    days: Array.from(days, ([date, list]) => {
      const tally = tallyOf(list);
      batches.filter((b) => b.date === date).forEach((b) => addBatch(tally, b));
      return { date, exits: list, tally };
    }),
  };
}

// الطرحة اللي فيها الترول ده وترتيبه - the batch holding this trolley and its position
export function batchOfExit(batches: ProductionBatch[], exit: ProductionExit) {
  return batchOf(batches, exit.id);
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
export function cairoTime(date: string, time: string): number {
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
