// "🧠 تحليل واقتراحات" في صفحة العملاء: قواعد ثابتة من الداتا (من غير AI)، والحدود في customers.insights
// The customers page "🧠 تحليل واقتراحات": fixed rules over the data (no AI), thresholds in customers.insights
import { dashboardConfig } from "@/config/dashboard.config";
import type { CustomerRow, CustomersRep } from "./customer-types";

const T = dashboardConfig.customers.insights;
export const NO_REP = "__none__";

// lost = اشترى آخر 3 شهور ووقف أكتر من inactiveDays (بيتفتح من الاقتراحات بس) - bought in 90 days then stopped (from suggestions)
export type CustomerStatus = "active" | "inactive" | "new" | "debt" | "lost";
export const isLost = (r: CustomerRow, inactiveDays: number) => r.daysSince !== null && r.daysSince > inactiveDays && r.three.invoices > 0;
// فلتر بيتطبق لما تدوس على اقتراح - the filter a suggestion applies
export type InsightLink = { rep: string; area: string | null; status: CustomerStatus | null };

export type Suggestion = { icon: string; tone: "good" | "warn" | "bad" | "info"; text: string; detail?: string; link: InsightLink };

export type AreaStat = {
  key: string;
  label: string;
  customers: number;
  active: number;
  lost: number; // اشتروا آخر 90 يوم ووقفوا أكتر من inactiveDays - bought in 90 days, then stopped
  month: number;
  lastMonthToDate: number;
  three: number;
  threeAmount: number;
  threeInvoices: number;
  debt: number;
  growth: number | null; // % مقارنة بالشهر اللي فات لحد نفس اليوم - % vs last month to the same day
  avgOrder: number | null;
  reps: { id: string; count: number }[]; // الأكتر الأول - most customers first
  noRep: number;
};

export type Insights = {
  areas: AreaStat[]; // بالمبيعات - by sales
  growthUp: AreaStat[];
  growthDown: AreaStat[];
  losing: AreaStat[];
  highDebt: AreaStat[];
  bestAvg: AreaStat[];
  worstAvg: AreaStat[];
  overlaps: { area: AreaStat; reps: { id: string; count: number }[] }[];
  uncovered: { area: AreaStat; count: number; mainRep: string | null }[];
  suggestions: Suggestion[];
  total: { month: number; lastMonthToDate: number; growth: number | null };
};

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

function areaStats(rows: CustomerRow[], inactiveDays: number): AreaStat[] {
  const map = new Map<string, AreaStat & { repCount: Map<string, number> }>();
  for (const r of rows) {
    if (!r.areaKey) continue; // من غير منطقة مش بيدخل التحليل - no area = not analysed
    let a = map.get(r.areaKey);
    if (!a) {
      a = {
        key: r.areaKey, label: r.area ?? r.areaKey, customers: 0, active: 0, lost: 0, month: 0, lastMonthToDate: 0, three: 0,
        threeAmount: 0, threeInvoices: 0, debt: 0, growth: null, avgOrder: null, reps: [], noRep: 0, repCount: new Map(),
      };
      map.set(r.areaKey, a);
    }
    a.customers += 1;
    if (!r.inactive) a.active += 1;
    if (isLost(r, inactiveDays)) a.lost += 1;
    a.month += r.month.packets;
    a.lastMonthToDate += r.lastMonthToDate.packets;
    a.three += r.three.packets;
    a.threeAmount += r.three.amount;
    a.threeInvoices += r.three.invoices;
    a.debt += r.debt;
    if (r.repId) a.repCount.set(r.repId, (a.repCount.get(r.repId) ?? 0) + 1);
    else a.noRep += 1;
  }
  return Array.from(map.values()).map(({ repCount, ...a }) => ({
    ...a,
    growth: Math.max(a.month, a.lastMonthToDate) >= T.minAreaPackets ? pct(a.month, a.lastMonthToDate) : null,
    avgOrder: a.threeInvoices >= T.avgOrderMinInvoices ? a.threeAmount / a.threeInvoices : null,
    reps: Array.from(repCount.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((x, y) => y.count - x.count),
  }));
}

// rows = عملاء النطاق (مندوب أو الكل)، all = كل العملاء (للتداخل والمناطق من غير مندوب)
// rows = the customers in scope (a rep or all), all = every customer (for overlaps and uncovered areas)
export function buildInsights(rows: CustomerRow[], all: CustomerRow[], repId: string, reps: Map<string, CustomersRep>, inactiveDays: number): Insights {
  const name = (id: string | null | undefined) => (id ? reps.get(id)?.name ?? id : "بدون مندوب");
  const scoped = repId !== "all";
  const areas = areaStats(rows, inactiveDays).sort((a, b) => b.month - a.month || b.three - a.three);
  const allAreas = areaStats(all, inactiveDays);
  // الاقتراح بيفتح المنطقة في نفس النطاق (المندوب المختار أو الكل) عشان العدد يطابق - a suggestion keeps the scope so counts match

  const growthUp = areas.filter((a) => a.growth !== null && a.growth >= T.growthUpPercent).sort((a, b) => b.growth! - a.growth!);
  const growthDown = areas.filter((a) => a.growth !== null && a.growth <= T.growthDownPercent).sort((a, b) => a.growth! - b.growth!);
  const losing = areas.filter((a) => a.lost >= T.lostMinCustomers).sort((a, b) => b.lost - a.lost);
  const highDebt = areas
    .filter((a) => a.debt >= T.highDebtAmount || (a.debt > 0 && a.threeAmount > 0 && a.debt / a.threeAmount >= T.highDebtRatio))
    .sort((a, b) => b.debt - a.debt);
  const withAvg = areas.filter((a) => a.avgOrder !== null).sort((a, b) => b.avgOrder! - a.avgOrder!);
  const bestAvg = withAvg.slice(0, 5);
  const worstAvg = withAvg.length > 5 ? withAvg.slice(-5).reverse() : [];

  const inScope = new Set(areas.map((a) => a.key));
  const overlaps = allAreas
    .map((area) => ({ area, reps: area.reps.filter((r) => r.count >= T.overlapMinCustomers) }))
    .filter((o) => o.reps.length >= 2 && (!scoped || o.reps.some((r) => r.id === repId)))
    .sort((a, b) => b.area.customers - a.area.customers);
  const uncovered = allAreas
    .filter((a) => a.noRep > 0 && (!scoped || inScope.has(a.key)))
    .map((area) => ({ area, count: area.noRep, mainRep: area.reps[0]?.id ?? null }))
    .sort((a, b) => b.count - a.count);

  // ===== الاقتراحات بالترتيب: خسارة عملاء، مديونية، نزول، نقل منطقة، مناطق من غير مندوب، نمو =====
  // Suggestions in order: lost customers, debt, drops, area moves, uncovered areas, growth
  const s: Suggestion[] = [];
  for (const a of losing.slice(0, 4)) {
    s.push({
      icon: "🚶", tone: "bad",
      text: `زوّد زيارات منطقة ${a.label}: ${a.lost} عميل متوقف`,
      detail: `اشتروا آخر 3 شهور ووقفوا أكتر من ${inactiveDays} يوم — من ${a.customers} عميل في المنطقة`,
      link: { rep: repId, area: a.key, status: "lost" },
    });
  }
  for (const a of highDebt.slice(0, 3)) {
    s.push({
      icon: "💰", tone: "warn",
      text: `منطقة ${a.label} مديونيتها عالية (${fmt(a.debt)} ج.م): ركز على التحصيل`,
      detail: a.threeAmount > 0 ? `المديونية = ${Math.round((a.debt / a.threeAmount) * 100)}% من مبيعات آخر 3 شهور` : undefined,
      link: { rep: repId, area: a.key, status: "debt" },
    });
  }
  for (const a of growthDown.slice(0, 3)) {
    s.push({
      icon: "📉", tone: "bad",
      text: `مبيعات منطقة ${a.label} نازلة ${Math.abs(a.growth!)}% عن الشهر اللي فات`,
      detail: `${fmt(a.month)} باكت الشهر ده مقابل ${fmt(a.lastMonthToDate)} لحد نفس اليوم الشهر اللي فات`,
      link: { rep: repId, area: a.key, status: null },
    });
  }
  for (const o of overlaps.slice(0, 3)) {
    const [main, ...others] = o.reps;
    // المندوب اللي عنده أقل عملاء هناك يسيبها للي عنده أكتر - the rep with fewer customers there hands it to the main one
    const minor = scoped && main.id !== repId ? o.reps.find((r) => r.id === repId)! : others[0];
    const major = main;
    if (!minor || minor.id === major.id || minor.count / (minor.count + major.count) > T.moveMaxShare) continue;
    s.push({
      icon: "🔀", tone: "info",
      text: `اقترح نقل منطقة ${o.area.label} من ${name(minor.id)} لـ ${name(major.id)}`,
      detail: `${name(major.id)} عنده ${major.count} عميل هناك و${name(minor.id)} عنده ${minor.count} — مندوب واحد للمنطقة يوفر مشاوير`,
      link: { rep: minor.id, area: o.area.key, status: null },
    });
  }
  for (const u of uncovered.slice(0, 3)) {
    s.push({
      icon: "🧭", tone: "info",
      text: u.mainRep
        ? `${u.count} عميل في ${u.area.label} من غير مندوب: ضمهم لـ ${name(u.mainRep)}`
        : `منطقة ${u.area.label} مفيهاش مندوب: ${u.count} عميل`,
      detail: u.mainRep ? `${name(u.mainRep)} بيغطي ${u.area.reps[0].count} عميل في نفس المنطقة` : "العملاء دول بيشتروا من المصنع على طول",
      link: { rep: NO_REP, area: u.area.key, status: null },
    });
  }
  for (const a of growthUp.slice(0, 2)) {
    s.push({
      icon: "📈", tone: "good",
      text: `منطقة ${a.label} طالعة +${a.growth}%: كمّل عليها`,
      detail: `${fmt(a.month)} باكت الشهر ده مقابل ${fmt(a.lastMonthToDate)} لحد نفس اليوم الشهر اللي فات`,
      link: { rep: repId, area: a.key, status: "active" },
    });
  }

  const month = rows.reduce((t, r) => t + r.month.packets, 0);
  const lastMonthToDate = rows.reduce((t, r) => t + r.lastMonthToDate.packets, 0);
  return {
    areas, growthUp, growthDown, losing, highDebt, bestAvg, worstAvg, overlaps, uncovered,
    suggestions: s.slice(0, T.maxSuggestions),
    total: { month, lastMonthToDate, growth: pct(month, lastMonthToDate) },
  };
}
