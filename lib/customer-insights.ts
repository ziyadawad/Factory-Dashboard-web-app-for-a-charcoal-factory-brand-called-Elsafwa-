// "🧠 تحليل واقتراحات" في صفحة العملاء: قواعد ثابتة من الداتا (من غير AI)، والحدود في customers.insights
// The customers page "🧠 تحليل واقتراحات": fixed rules over the data (no AI), thresholds in customers.insights
import { dashboardConfig } from "@/config/dashboard.config";
import type { CustomerRow, CustomersRep, Segment } from "./customer-types";

const T = dashboardConfig.customers.insights;
export const NO_REP = "__none__";
export const DISTRIBUTORS = "__dist__"; // رابط لصفحة الموزعين - a link to the distributors page

// العميل اللي "مش متظبط": مش موزع، ومن غير مندوب أو اشترى من أكتر من عربية آخر 90 يوم (إلا لو متثبت بالإيد)
// A "not settled" customer: not a distributor, and no rep or bought from 2+ vans in 90 days (unless pinned by hand)
export const isMisfit = (r: CustomerRow) => !r.isDistributor && !r.repFromOverride && (r.repId === null || r.reps.length > 1);
// عميل جوه خط المندوب ده - a customer inside this rep's route
export const inRoute = (r: CustomerRow, repId: string) => !r.isDistributor && !isMisfit(r) && r.repId === repId;
export type SegKey = "wholesale" | "retail";
export const SEG_OF: Record<SegKey, Segment> = { wholesale: "جملة", retail: "قطاعي" };

// lost = اشترى آخر 3 شهور ووقف أكتر من inactiveDays (بيتفتح من الاقتراحات بس) - bought in 90 days then stopped (from suggestions)
// month = اشترى الشهر ده (من كارت المؤشرات) - bought this month (from the KPI card)
export type CustomerStatus = "active" | "inactive" | "new" | "debt" | "lost" | "month";
export const isLost = (r: CustomerRow, inactiveDays: number) => r.daysSince !== null && r.daysSince > inactiveDays && r.three.invoices > 0;
// فلتر بيتطبق لما تدوس على اقتراح - the filter a suggestion applies
export type InsightLink = { rep: string; area: string | null; status: CustomerStatus | null; seg?: SegKey | null };

// أرقام مجموعة عملاء (جملة / قطاعي / موزعين / خطوط) - the numbers of a customer set
export type SegStat = {
  customers: number; active: number; lost: number; month: number; amount: number; lastMonthToDate: number;
  growth: number | null; debt: number; threeAmount: number;
};

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
  // جملة مقابل قطاعي لكل خط (أو للخط المختار) - wholesale vs retail per route (or the chosen route)
  segments: { repId: string; name: string; w: SegStat; r: SegStat }[];
  // الموزعين مقابل الخطوط (في نطاق "الكل" بس) - distributors vs routes ("all" scope only)
  distVsRoutes: { dist: SegStat; routes: SegStat; share: number | null } | null;
};

export function segStat(rows: CustomerRow[], inactiveDays: number): SegStat {
  const s: SegStat = { customers: rows.length, active: 0, lost: 0, month: 0, amount: 0, lastMonthToDate: 0, growth: null, debt: 0, threeAmount: 0 };
  for (const r of rows) {
    if (!r.inactive) s.active += 1;
    if (isLost(r, inactiveDays)) s.lost += 1;
    s.month += r.month.packets;
    s.amount += r.month.amount;
    s.lastMonthToDate += r.lastMonthToDate.packets;
    s.debt += r.debt;
    s.threeAmount += r.three.amount;
  }
  s.growth = Math.max(s.month, s.lastMonthToDate) >= T.minAreaPackets ? pct(s.month, s.lastMonthToDate) : null;
  return s;
}

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
export function buildInsights(
  rows: CustomerRow[], all: CustomerRow[], repId: string, reps: Map<string, CustomersRep>, inactiveDays: number,
  routes: { repId: string; name: string }[] = []
): Insights {
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
  // ===== جملة مقابل قطاعي لكل خط، والموزعين مقابل الخطوط - wholesale vs retail per route, distributors vs routes =====
  const segments = routes
    .filter((rt) => !scoped || rt.repId === repId)
    .map((rt) => {
      const own = all.filter((r) => inRoute(r, rt.repId));
      return { repId: rt.repId, name: rt.name, w: segStat(own.filter((r) => r.segment === "جملة"), inactiveDays), r: segStat(own.filter((r) => r.segment === "قطاعي"), inactiveDays) };
    });
  // بيتحطوا بعد أول اقتراحات المناطق عشان الحد الأقصى ميقطعهمش - placed right after the top area suggestions so the cap keeps them
  const segS: (Suggestion & { sev: number })[] = [];
  const distS: Suggestion[] = [];
  for (const sg of segments) {
    const who = `${sg.name} (${name(sg.repId)})`;
    for (const [key, st] of [["wholesale", sg.w], ["retail", sg.r]] as [SegKey, SegStat][]) {
      const label = SEG_OF[key];
      if (st.growth !== null && st.growth <= T.growthDownPercent) {
        segS.push({
          sev: 3000 + Math.abs(st.growth),
          icon: "📉", tone: "bad",
          text: `${label} ${who} نازل ${Math.abs(st.growth)}% عن الشهر اللي فات`,
          detail: `${fmt(st.month)} باكت مقابل ${fmt(st.lastMonthToDate)} لحد نفس اليوم — ${key === "retail" ? "زوّد زيارات المحلات" : "كلّم عملاء الجملة الكبار"}`,
          link: { rep: sg.repId, area: null, status: null, seg: key },
        });
      }
      if (st.lost >= T.segmentLostMin) {
        segS.push({
          sev: 2000 + st.lost,
          icon: "🚶", tone: "bad",
          text: `${st.lost} عميل ${label} في ${who} وقفوا`,
          detail: `اشتروا آخر 3 شهور ووقفوا أكتر من ${inactiveDays} يوم — من ${st.customers} عميل ${label}`,
          link: { rep: sg.repId, area: null, status: "lost", seg: key },
        });
      }
      if (st.debt >= T.highDebtAmount && st.threeAmount > 0 && st.debt / st.threeAmount >= T.highDebtRatio) {
        segS.push({
          sev: 1000 + Math.round((st.debt / st.threeAmount) * 100),
          icon: "💰", tone: "warn",
          text: `مديونية ${label} ${who} عالية (${fmt(st.debt)} ج.م): ركز على التحصيل`,
          detail: `= ${Math.round((st.debt / st.threeAmount) * 100)}% من مبيعات ${label} آخر 3 شهور`,
          link: { rep: sg.repId, area: null, status: "debt", seg: key },
        });
      }
    }
  }
  let distVsRoutes: Insights["distVsRoutes"] = null;
  if (!scoped) {
    const dist = segStat(all.filter((r) => r.isDistributor), inactiveDays);
    const routeRows = all.filter((r) => routes.some((rt) => inRoute(r, rt.repId)));
    const routesStat = segStat(routeRows, inactiveDays);
    const totalMonth = dist.month + routesStat.month;
    distVsRoutes = { dist, routes: routesStat, share: totalMonth > 0 ? Math.round((dist.month / totalMonth) * 100) : null };
    if (dist.growth !== null && (dist.growth <= T.growthDownPercent || dist.growth >= T.growthUpPercent)) {
      distS.push({
        icon: dist.growth < 0 ? "📉" : "📈", tone: dist.growth < 0 ? "bad" : "good",
        text: `الموزعين ${dist.growth < 0 ? "نازلين" : "طالعين"} ${Math.abs(dist.growth)}% عن الشهر اللي فات`,
        detail: `${fmt(dist.month)} باكت مقابل ${fmt(dist.lastMonthToDate)} — الخطوط ${routesStat.growth === null ? "—" : `${routesStat.growth > 0 ? "+" : ""}${routesStat.growth}%`}`,
        link: { rep: DISTRIBUTORS, area: null, status: null },
      });
    }
    if (distVsRoutes.share !== null) {
      distS.push({
        icon: "🚛", tone: "info",
        text: `الموزعين = ${distVsRoutes.share}% من باكت الشهر (${fmt(dist.month)} من ${fmt(totalMonth)})`,
        detail: `الخطوط الأربعة ${fmt(routesStat.month)} باكت · مديونية الموزعين ${fmt(dist.debt)} ج.م`,
        link: { rep: DISTRIBUTORS, area: null, status: null },
      });
    }
  }

  const topSeg = segS.sort((x, y) => y.sev - x.sev).slice(0, T.maxSegmentSuggestions).map((x) => ({ icon: x.icon, tone: x.tone, text: x.text, detail: x.detail, link: x.link }));
  s.splice(Math.min(T.areaSuggestionsFirst, s.length), 0, ...topSeg, ...distS);

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
    segments,
    distVsRoutes,
  };
}
