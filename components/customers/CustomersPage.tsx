"use client";

// صفحة "👥 العملاء" (/customers): قراية بس من ERPNext (الملاحظات عندنا). الرئيسية = 4 خطوط (مندوب بعربيته) + أزرار
// الكل / المناطق / جودة البيانات / التحليل + العملاء المش متظبطين. الضغط على خط بيفتح صفحته (مناطقه وعملاؤه)، وعلى عميل لوحته.
// المكان بيتكتب في الرابط (?route=karim&view=areas) فالريفرش بيرجع لنفس الصفحة. البيانات بتتجاب بس والصفحة مفتوحة
// The customers page: read-only from ERPNext (notes on our side). Landing = 4 routes (a rep with his van) + buttons
// for all / areas / data quality / insights + the unsettled customers. A route opens its page (areas and customers),
// a customer opens his panel. The place is kept in the URL (?route=karim&view=areas) so a refresh stays there

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { ArrowRight, Download, MapPin, Phone, RefreshCw, Search, Truck, Users } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { normalizeArabic } from "@/lib/arabic";
import { formatNumber, formatTime12 } from "@/lib/format";
import {
  buildInsights, DISTRIBUTORS, isLost, isMisfit, SEG_OF, segStat, type CustomerStatus, type InsightLink, type SegKey,
} from "@/lib/customer-insights";
import Header from "../Header";
import type { CustomerNote, CustomerRow, CustomersData, CustomersRep, Segment } from "@/lib/customer-types";
import { fetcher, fmtDate, Money, N, NO_REP, recency, RepChip } from "./common";
import CustomerPanel from "./CustomerPanel";
import RepAvatar from "../RepAvatar";
import InsightsPanel from "./InsightsPanel";

const ambient = dashboardConfig.sizes.ambient;
const REFRESH_MS = dashboardConfig.customers.cacheMinutes * 60_000;

type Status = CustomerStatus;
type Sort = "top" | "recent" | "debt" | "oldest";
type TableKey =
  | "name" | "mobile" | "area" | "type" | "rep" | "last" | "invoices" | "monthPackets" | "monthAmount"
  | "threePackets" | "allPackets" | "allAmount" | "avg" | "debt" | "oldestUnpaid";

const STATUS: { id: Status; label: string; test: (r: CustomerRow) => boolean }[] = [
  { id: "active", label: "🟢 نشط", test: (r) => !r.inactive },
  { id: "new", label: "✨ جديد", test: (r) => r.isNew },
  { id: "inactive", label: "🔴 متوقف", test: (r) => r.inactive },
  { id: "debt", label: "💰 عليه مديونية", test: (r) => r.debt > 0.5 },
];
// فلاتر مش في الشرايح (بتيجي من كارت مؤشر أو اقتراح) - filters not among the chips (from a KPI card or a suggestion)
const EXTRA_LABEL: Partial<Record<Status, string>> = { lost: "🚶 وقفوا قريب", month: "🟢 اشتروا الشهر ده" };
const statusLabel = (s: Status) => EXTRA_LABEL[s] ?? STATUS.find((x) => x.id === s)?.label ?? s;

const SORTS: { id: Sort; label: string }[] = [
  { id: "top", label: "الأكثر شراء" },
  { id: "recent", label: "آخر شراء" },
  { id: "debt", label: "المديونية" },
  { id: "oldest", label: "الأقدم" },
];
const chip = (on: boolean) =>
  `px-3 py-1 rounded-full border text-[14px] font-bold whitespace-nowrap transition-colors ${
    on ? "border-brandOrange bg-brandOrange/20 text-white" : "border-cardBorder bg-background/70 text-gray-300 hover:bg-white/5"
  }`;

const byText = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "ar");

function sortRows(rows: CustomerRow[], sort: Sort): CustomerRow[] {
  const out = rows.slice();
  if (sort === "top") out.sort((a, b) => b.three.packets - a.three.packets || b.all.packets - a.all.packets || byText(a.name, b.name));
  if (sort === "recent") out.sort((a, b) => byText(b.lastDate, a.lastDate) || byText(a.name, b.name));
  if (sort === "debt") out.sort((a, b) => b.debt - a.debt || byText(a.name, b.name));
  if (sort === "oldest") out.sort((a, b) => byText(a.firstDate ?? a.created ?? "9999", b.firstDate ?? b.created ?? "9999") || byText(a.name, b.name));
  return out;
}

// كارت مؤشر (زي الأول): أرقام المندوب المختار بشريحة باسمه، والضغط بيفلتر - a KPI card (as before): the chosen rep's
// numbers with a chip of his name; clicking filters the list
function Kpi({ label, value, sub, note, color = "text-white", money = false, rep, selected, onClick }: {
  label: string; value: number; sub?: string; note?: string; color?: string; money?: boolean;
  rep: { name: string; color: string } | null; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex-1 min-w-[170px] text-start rounded-2xl border px-4 py-2.5 transition-colors ${
        selected ? "border-brandOrange/70 bg-brandOrange/10 shadow-[0_0_16px_rgba(255,122,0,0.25)]" : "border-cardBorder bg-card/90 hover:bg-white/[0.05]"
      }`}
    >
      <p className="text-gray-400 font-semibold text-[15px] leading-[1.7] whitespace-nowrap">{label}</p>
      <p className="leading-[1.25] whitespace-nowrap">
        {money ? <Money value={value} className={`text-[30px] font-extrabold ${color}`} /> : <N value={value} className={`text-[30px] font-extrabold ${color}`} />}
        {sub && <span className="text-gray-500 text-[14px] ms-2">{sub}</span>}
      </p>
      {note && <p className="text-[12px] text-gray-500 whitespace-nowrap leading-[1.6]">{note}</p>}
      {/* شريحة المندوب في الركن فوق (الاسم الأول بس) عشان العنوان والرقم ميتغطوش - the rep chip in the top corner (first name
          only) so the label and number are never covered; the full name on hover */}
      {rep && (
        <span
          className="absolute top-2 end-2 rounded-full px-2 text-[11px] font-bold text-gray-100 leading-[1.7] whitespace-nowrap"
          style={{ background: `${rep.color}33`, border: `1px solid ${rep.color}99` }}
          title={rep.name}
        >
          {rep.name.split(" ")[0]}
        </span>
      )}
    </button>
  );
}

// جملة / قطاعي: لون ثابت لكل نوع - wholesale / retail: a fixed color each
const SEG_COLOR: Record<Segment, string> = { جملة: "#F59E0B", قطاعي: "#38BDF8" };
function SegChip({ segment }: { segment: Segment }) {
  const c = SEG_COLOR[segment];
  return (
    <span className="shrink-0 rounded-full px-1.5 text-[11px] font-bold leading-[1.7]" style={{ color: c, background: `${c}1f`, border: `1px solid ${c}66` }}>
      {segment}
    </span>
  );
}

// كارت عميل صغير (تاب حسب المندوب) - a compact customer card (the by-rep tab)
function CustomerCard({ row, note, inactiveDays, onOpen }: { row: CustomerRow; note?: CustomerNote; inactiveDays: number; onOpen: () => void }) {
  const r = recency(row.daysSince, inactiveDays);
  return (
    <button type="button" onClick={onOpen} className="w-full text-start rounded-xl border border-cardBorder bg-background/60 px-3 py-2 hover:bg-white/[0.06] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <p className="flex-1 min-w-0 truncate text-[16px] font-extrabold text-white leading-[1.6]">{row.name}</p>
        {row.isNew && <span className="shrink-0 text-[11px] font-bold text-sky-300 border border-sky-400/40 bg-sky-400/10 rounded-full px-1.5">جديد</span>}
        <SegChip segment={row.segment} />
        <span className={`shrink-0 text-[12px] font-bold border rounded-full px-2 leading-[1.7] ${r.cls}`}>{r.text}</span>
      </div>
      <div className="flex items-center gap-3 text-[13px] text-gray-400 leading-[1.7] min-w-0">
        <span className="truncate min-w-0">
          <MapPin size={12} className="inline me-0.5" />
          {row.area ?? "—"}
        </span>
        <span className="ms-auto shrink-0">
          الشهر <N value={row.month.packets} className={row.month.packets > 0 ? "text-brandYellow font-bold" : "text-gray-600"} /> باكت
        </span>
        {row.debt > 0.5 && (
          <span className="shrink-0 text-brandOrange font-bold">
            💰 <N value={row.debt} />
          </span>
        )}
      </div>
      {note && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {note.tags.map((t) => (
            <span key={t} className="text-[11px] text-gray-300 bg-white/[0.06] border border-white/10 rounded-full px-1.5">
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function TableView({ rows, reps, inactiveDays, onOpen }: { rows: CustomerRow[]; reps: Map<string, CustomersRep>; inactiveDays: number; onOpen: (id: string) => void }) {
  const [key, setKey] = useState<TableKey | null>(null);
  const [desc, setDesc] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pick: Record<TableKey, (r: CustomerRow) => string | number> = {
    name: (r) => r.name,
    mobile: (r) => r.mobile ?? "",
    area: (r) => r.area ?? "",
    type: (r) => r.type ?? "",
    rep: (r) => (r.repId ? reps.get(r.repId)?.name ?? "" : ""),
    last: (r) => r.lastDate ?? "",
    invoices: (r) => r.all.invoices,
    monthPackets: (r) => r.month.packets,
    monthAmount: (r) => r.month.amount,
    threePackets: (r) => r.three.packets,
    allPackets: (r) => r.all.packets,
    allAmount: (r) => r.all.amount,
    avg: (r) => r.avgOrder,
    debt: (r) => r.debt,
    oldestUnpaid: (r) => (r.oldestUnpaid ? -r.oldestUnpaid.days : 1),
  };
  const sorted = useMemo(() => {
    if (!key) return rows;
    const f = pick[key];
    return rows.slice().sort((a, b) => {
      const x = f(a);
      const y = f(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar");
      return desc ? -c : c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, desc]);
  const head = (k: TableKey, label: string) => (
    <th
      onClick={() => (key === k ? setDesc(!desc) : (setKey(k), setDesc(true)))}
      className="px-2 py-2 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder cursor-pointer hover:text-white select-none"
    >
      {label} {key === k ? (desc ? "▼" : "▲") : ""}
    </th>
  );
  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/customers/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: sorted.map((r) => r.id) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `العملاء ${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      alert("التصدير فشل — جرّب تاني");
    } finally {
      setExporting(false);
    }
  };
  const td = "px-2 border-b border-cardBorder/60 text-center whitespace-nowrap";
  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl border border-cardBorder bg-card/90 overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-cardBorder">
        <p className="text-gray-300 font-semibold">
          <N value={sorted.length} className="text-white font-bold" /> عميل — اضغط على عنوان العمود عشان ترتب
        </p>
        <button
          type="button"
          onClick={exportExcel}
          disabled={exporting}
          className="ms-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white font-bold disabled:opacity-60"
        >
          <Download size={16} /> {exporting ? "جاري التصدير..." : "تصدير Excel"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[14px] leading-[2.2]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              {head("name", "العميل")}
              {head("mobile", "الموبايل")}
              {head("area", "المنطقة")}
              {head("type", "النوع")}
              {head("rep", "المندوب")}
              {head("last", "آخر شرا")}
              {head("invoices", "فواتير")}
              {head("monthPackets", "باكت الشهر")}
              {head("monthAmount", "مبلغ الشهر")}
              {head("threePackets", "باكت 3 شهور")}
              {head("allPackets", "باكت الإجمالي")}
              {head("allAmount", "مبلغ الإجمالي")}
              {head("avg", "متوسط الفاتورة")}
              {head("debt", "المديونية")}
              {head("oldestUnpaid", "أقدم مفتوحة")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const rc = recency(r.daysSince, inactiveDays);
              return (
                <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-white/5">
                  <td className="ps-3 pe-2 border-b border-cardBorder/60 text-white font-semibold max-w-[260px] truncate">{r.name}</td>
                  <td className={`${td} font-numbers text-gray-300`} dir="ltr">{r.mobile ?? "—"}</td>
                  <td className={`${td} text-gray-300`}>{r.area ?? "—"}</td>
                  <td className={`${td} text-gray-400`}>{r.type ?? "—"}</td>
                  <td className={td}><RepChip rep={r.repId ? reps.get(r.repId) : undefined} small /></td>
                  <td className={td}>
                    <span className="font-numbers text-gray-300">{fmtDate(r.lastDate)}</span>{" "}
                    <span className={`text-[12px] font-bold border rounded-full px-1.5 ${rc.cls}`}>{rc.text}</span>
                  </td>
                  <td className={td}><N value={r.all.invoices} className="text-gray-200" /></td>
                  <td className={td}><N value={r.month.packets} className={r.month.packets ? "text-brandYellow font-bold" : "text-gray-600"} /></td>
                  <td className={td}><N value={r.month.amount} className="text-gray-200" /></td>
                  <td className={td}><N value={r.three.packets} className="text-gray-200" /></td>
                  <td className={td}><N value={r.all.packets} className="text-gray-200" /></td>
                  <td className={td}><N value={r.all.amount} className="text-gray-200" /></td>
                  <td className={td}><N value={r.avgOrder} className="text-gray-300" /></td>
                  <td className={td}><N value={r.debt} className={r.debt > 0.5 ? "text-brandOrange font-bold" : "text-gray-600"} /></td>
                  <td className={td}>
                    {r.oldestUnpaid ? (
                      <span className={r.oldestUnpaid.days > dashboardConfig.sales.debtWarningDays ? "text-statusRed" : "text-gray-300"}>
                        <span className="font-numbers">{fmtDate(r.oldestUnpaid.date)}</span> ({r.oldestUnpaid.days} يوم)
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AreasView({ rows, reps, onPick }: { rows: CustomerRow[]; reps: Map<string, CustomersRep>; onPick: (key: string) => void }) {
  const areas = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; active: number; month: number; debt: number; reps: Map<string, number> }>();
    for (const r of rows) {
      const a = map.get(r.areaKey) ?? { key: r.areaKey, label: r.area ?? "بدون منطقة", count: 0, active: 0, month: 0, debt: 0, reps: new Map() };
      a.count += 1;
      if (!r.inactive) a.active += 1;
      a.month += r.month.packets;
      a.debt += r.debt;
      const rep = r.repId ?? NO_REP;
      a.reps.set(rep, (a.reps.get(rep) ?? 0) + 1);
      map.set(r.areaKey, a);
    }
    return Array.from(map.values()).sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : b.count - a.count));
  }, [rows]);
  const th = "px-3 py-2 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const td = "px-3 border-b border-cardBorder/60 text-center whitespace-nowrap";
  return (
    <div className="h-full min-h-0 rounded-2xl border border-cardBorder bg-card/90 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-[15px] leading-[2.4]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className={`${th} text-start ps-5`}>المنطقة</th>
            <th className={th}>العملاء</th>
            <th className={th}>النشطين</th>
            <th className={th}>باكت الشهر</th>
            <th className={th}>المديونية</th>
            <th className={`${th} text-start`}>المندوب اللي بيغطيها</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.key || "none"} onClick={() => onPick(a.key)} className="cursor-pointer hover:bg-white/5" title="اعرض عملاء المنطقة دي">
              <td className="ps-5 pe-2 border-b border-cardBorder/60 text-white font-bold">📍 {a.label}</td>
              <td className={td}><N value={a.count} className="text-gray-100 font-bold" /></td>
              <td className={td}><N value={a.active} className="text-statusGreen" /></td>
              <td className={td}><N value={a.month} className={a.month ? "text-brandYellow font-bold" : "text-gray-600"} /></td>
              <td className={td}><N value={a.debt} className={a.debt > 0.5 ? "text-brandOrange font-bold" : "text-gray-600"} /></td>
              <td className="px-3 border-b border-cardBorder/60">
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(a.reps.entries())
                    .sort((x, y) => y[1] - x[1])
                    .map(([id, n]) => (
                      <span key={id} className="inline-flex items-center gap-1">
                        <RepChip rep={reps.get(id)} small /> <N value={n} className="text-gray-400 text-[12px]" />
                      </span>
                    ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QualityView({ rows, reps, onOpen }: { rows: CustomerRow[]; reps: Map<string, CustomersRep>; onOpen: (id: string) => void }) {
  const lists = [
    { title: "📵 من غير موبايل", rows: rows.filter((r) => !r.mobile) },
    { title: "🏠 من غير عنوان", rows: rows.filter((r) => !r.address) },
    { title: "📍 من غير منطقة", rows: rows.filter((r) => !r.areaKey) },
    { title: "🔀 بيتخدم من أكتر من مندوب", rows: rows.filter((r) => r.reps.length > 1), multi: true },
  ];
  return (
    <div className="h-full min-h-0 grid grid-cols-4 gap-3 overflow-x-auto" style={{ minWidth: 1100 }}>
      {lists.map((l) => (
        <div key={l.title} className="min-h-0 flex flex-col rounded-2xl border border-cardBorder bg-card/90 overflow-hidden">
          <p className="shrink-0 px-3 py-2 border-b border-cardBorder text-[17px] font-extrabold text-white">
            {l.title} <span className="text-gray-400 text-[15px]">(<N value={l.rows.length} />)</span>
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
            {l.rows.length === 0 && <p className="text-center text-statusGreen py-8">كله تمام ✅</p>}
            {l.rows.map((r) => (
              <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="text-start rounded-lg px-2 py-1 hover:bg-white/5 border border-transparent hover:border-cardBorder">
                <p className="text-[15px] font-semibold text-gray-100 truncate">{r.name}</p>
                <div className="flex flex-wrap items-center gap-1 text-[12px] text-gray-500">
                  {l.multi ? r.reps.map((id) => <RepChip key={id} rep={reps.get(id)} small />) : <RepChip rep={r.repId ? reps.get(r.repId) : undefined} small />}
                  {r.area && <span>· {r.area}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== التنقل جوه الصفحة (والرابط بيتحدث عشان الريفرش يرجع لنفس المكان) =====
// Navigation inside the page (the URL is updated so a refresh returns to the same place):
//   (لا حاجة) = الخطوط · ?route=karim = صفحة خط · ?route=karim&view=areas|insights · ?view=all|areas|quality|insights|misfits
//   &area=<key> &status=<status> &customer=<id>
type GlobalView = "all" | "areas" | "quality" | "insights" | "misfits" | "distributors";
type RouteView = "areas" | "insights";
// seg = جملة / قطاعي جوه صفحة الخط (null = الكل) - wholesale / retail inside a route page (null = both)
type Nav = { route: string | null; view: GlobalView | RouteView | null; area: string | null; status: Status | null; customer: string | null; seg: SegKey | null };
const EMPTY_NAV: Nav = { route: null, view: null, area: null, status: null, customer: null, seg: null };
const GLOBAL_VIEWS = new Set(["all", "areas", "quality", "insights", "misfits", "distributors"]);
const ROUTE_VIEWS = new Set(["areas", "insights"]);
const STATUSES = new Set(["active", "inactive", "new", "debt", "lost", "month"]);

function readNav(): Nav {
  const p = new URLSearchParams(window.location.search);
  const route = p.get("route");
  const view = p.get("view");
  const status = p.get("status");
  return {
    route,
    view: view && (route ? ROUTE_VIEWS : GLOBAL_VIEWS).has(view) ? (view as Nav["view"]) : null,
    area: p.get("area"),
    status: status && STATUSES.has(status) ? (status as Status) : null,
    customer: p.get("customer"),
    seg: p.get("seg") === "wholesale" || p.get("seg") === "retail" ? (p.get("seg") as SegKey) : null,
  };
}

function navUrl(nav: Nav): string {
  const p = new URLSearchParams();
  if (nav.route) p.set("route", nav.route);
  if (nav.seg) p.set("seg", nav.seg);
  if (nav.view) p.set("view", nav.view);
  if (nav.area !== null) p.set("area", nav.area);
  if (nav.status) p.set("status", nav.status);
  if (nav.customer) p.set("customer", nav.customer);
  const q = p.toString();
  return `${window.location.pathname}${q ? `?${q}` : ""}`;
}


function statusTest(status: Status | null, inactiveDays: number): ((r: CustomerRow) => boolean) | null {
  if (!status) return null;
  if (status === "lost") return (r) => isLost(r, inactiveDays);
  if (status === "month") return (r) => r.activeMonth;
  return STATUS.find((x) => x.id === status)?.test ?? null;
}

function useFiltered(rows: CustomerRow[], area: string | null, status: Status | null, query: string, sort: Sort, inactiveDays: number) {
  return useMemo(() => {
    const q = normalizeArabic(query);
    const qDigits = query.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
    const test = statusTest(status, inactiveDays);
    const out = rows.filter((r) => {
      if (area !== null && r.areaKey !== area) return false;
      if (test && !test(r)) return false;
      if (q) {
        const inName = normalizeArabic(r.name).includes(q);
        const inMobile = qDigits.length >= 3 && (r.mobile ?? "").replace(/\D/g, "").includes(qDigits);
        if (!inName && !inMobile) return false;
      }
      return true;
    });
    return sortRows(out, sort);
  }, [rows, area, status, query, sort, inactiveDays]);
}

function kpisOf(rows: CustomerRow[]) {
  return {
    total: rows.length,
    activeMonth: rows.filter((r) => r.activeMonth).length,
    isNew: rows.filter((r) => r.isNew).length,
    inactive: rows.filter((r) => r.inactive).length,
    debt: rows.reduce((t, r) => t + r.debt, 0),
    debtors: rows.filter((r) => r.debt > 0.5).length,
  };
}

// صف كروت المؤشرات (الضغط بيفلتر، والضغط تاني بيلغي) - the KPI cards row (a click filters, again clears)
// split = سطر صغير "مناديب X · موزعين Y" تحت كل رقم - a small "reps X · distributors Y" line under each number
function KpiRow({ rows, inactiveDays, status, onStatus, split = false }: {
  rows: CustomerRow[]; inactiveDays: number; status: Status | null; onStatus: (s: Status | null) => void; split?: boolean;
}) {
  const k = kpisOf(rows);
  const toggle = (s: Status) => onStatus(status === s ? null : s);
  const parts = split ? { reps: kpisOf(rows.filter((r) => !r.isDistributor)), dist: kpisOf(rows.filter((r) => r.isDistributor)) } : null;
  const note = (pick: (x: ReturnType<typeof kpisOf>) => number) =>
    parts ? `مناديب ${formatNumber(Math.round(pick(parts.reps)))} · موزعين ${formatNumber(Math.round(pick(parts.dist)))}` : undefined;
  return (
    <div className="shrink-0 flex flex-wrap gap-3">
      <Kpi label="👥 إجمالي العملاء" value={k.total} note={note((x) => x.total)} rep={null} selected={false} onClick={() => onStatus(null)} />
      <Kpi label="🟢 اشتروا الشهر ده" value={k.activeMonth} note={note((x) => x.activeMonth)} color="text-statusGreen" rep={null} selected={status === "month"} onClick={() => toggle("month")} />
      <Kpi label="✨ جداد الشهر ده" value={k.isNew} note={note((x) => x.isNew)} color="text-sky-300" rep={null} selected={status === "new"} onClick={() => toggle("new")} />
      <Kpi label={`🔴 متوقفين (أكتر من ${inactiveDays} يوم)`} value={k.inactive} note={note((x) => x.inactive)} color="text-statusRed" rep={null} selected={status === "inactive"} onClick={() => toggle("inactive")} />
      <Kpi label="💰 إجمالي المديونية" value={k.debt} sub={`عند ${k.debtors} عميل`} note={note((x) => x.debt)} color="text-brandOrange" money rep={null} selected={status === "debt"} onClick={() => toggle("debt")} />
    </div>
  );
}

// ===== جملة / قطاعي في صفحة الخط - wholesale / retail on a route page =====
// شريط المقارنة: نصيب الجملة من العملاء والباكت والمبلغ - the comparison bar: wholesale's share of customers, packets, amount
function CompareBar({ rows }: { rows: CustomerRow[] }) {
  const w = rows.filter((r) => r.segment === "جملة");
  const r = rows.filter((x) => x.segment === "قطاعي");
  const sum = (list: CustomerRow[], pick: (x: CustomerRow) => number) => list.reduce((t, x) => t + pick(x), 0);
  const bars = [
    { label: "العملاء", w: w.length, r: r.length, money: false },
    { label: "باكت الشهر", w: sum(w, (x) => x.month.packets), r: sum(r, (x) => x.month.packets), money: false },
    { label: "مبلغ الشهر", w: sum(w, (x) => x.month.amount), r: sum(r, (x) => x.month.amount), money: true },
  ];
  return (
    <div className="shrink-0 grid gap-3 grid-cols-3 rounded-2xl border border-cardBorder bg-card/80 px-4 py-2">
      {bars.map((b) => {
        const total = b.w + b.r;
        const wp = total > 0 ? Math.round((b.w / total) * 100) : 0;
        return (
          <div key={b.label} className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] leading-[1.7]">
              <span className="font-bold" style={{ color: SEG_COLOR["جملة"] }}>🏪 {wp}%</span>
              <span className="flex-1 text-center text-gray-400 font-semibold truncate">{b.label}</span>
              <span className="font-bold" style={{ color: SEG_COLOR["قطاعي"] }}>{total > 0 ? 100 - wp : 0}% 🛒</span>
            </div>
            {/* الجملة من اليمين والقطاعي من الشمال، بينهم فاصل - wholesale from the right, retail from the left, a gap between */}
            <div className="flex h-3 gap-[2px] rounded-full overflow-hidden bg-background" title={`جملة ${formatNumber(Math.round(b.w))} · قطاعي ${formatNumber(Math.round(b.r))}`}>
              {total > 0 && wp > 0 && <div className="h-full rounded-s-full" style={{ width: `${wp}%`, background: SEG_COLOR["جملة"] }} />}
              {total > 0 && wp < 100 && <div className="h-full flex-1 rounded-e-full" style={{ background: SEG_COLOR["قطاعي"] }} />}
            </div>
            <div className="flex justify-between text-[12px] text-gray-500 leading-[1.6]">
              <span><N value={b.w} className="text-gray-300" /></span>
              <span><N value={b.r} className="text-gray-300" /></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// كارت تاب (جملة / قطاعي / الكل) بأرقامه - a tab card (wholesale / retail / all) with its numbers
function SegCard({ title, color, rows, selected, onClick, inactiveDays }: {
  title: string; color: string; rows: CustomerRow[]; selected: boolean; onClick: () => void; inactiveDays: number;
}) {
  const st = segStat(rows, inactiveDays);
  const inv3 = rows.reduce((t, r) => t + r.three.invoices, 0);
  const avg = inv3 > 0 ? st.threeAmount / inv3 : 0;
  const areas = new Set(rows.filter((r) => r.areaKey).map((r) => r.areaKey)).size;
  const cell = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <p className="text-[12px] text-gray-400 truncate">{label}</p>
      <div className="leading-[1.3]">{value}</div>
    </div>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="min-w-0 text-start rounded-2xl border-2 px-4 py-2.5 transition-colors"
      style={
        selected
          ? { borderColor: color, background: `${color}22`, boxShadow: `0 0 20px ${color}44` }
          : { borderColor: `${color}44`, background: "rgba(20,26,42,0.9)" }
      }
    >
      <p className="text-[20px] font-extrabold leading-[1.5]" style={{ color }}>
        {title} <span className="text-[14px] text-gray-400 font-bold">({formatNumber(st.customers)} عميل)</span>
      </p>
      <div className="grid grid-cols-6 max-[1599px]:grid-cols-3 gap-x-3 gap-y-1">
        {cell("نشطين", <N value={st.active} className="text-[18px] font-extrabold text-statusGreen" />)}
        {cell("باكت الشهر", <N value={st.month} className="text-[18px] font-extrabold text-brandYellow" />)}
        {cell("مبلغ الشهر", <N value={st.amount} className="text-[18px] font-extrabold text-white" />)}
        {cell("متوسط الفاتورة", <N value={avg} className="text-[18px] font-extrabold text-gray-200" />)}
        {cell("المديونية", <N value={st.debt} className="text-[18px] font-extrabold text-brandOrange" />)}
        {cell("مناطق", <N value={areas} className="text-[18px] font-extrabold text-gray-200" />)}
      </div>
    </button>
  );
}

// ===== الموزعين - distributors =====
const DIST_COLOR = dashboardConfig.customers.distributorColor;

function DistributorsCard({ rows, onOpen }: { rows: CustomerRow[]; onOpen: () => void }) {
  const month = rows.reduce((t, r) => t + r.month.packets, 0);
  const amount = rows.reduce((t, r) => t + r.month.amount, 0);
  const debt = rows.reduce((t, r) => t + r.debt, 0);
  const lastDays = rows.reduce<number | null>((m, r) => (r.daysSince === null ? m : m === null ? r.daysSince : Math.min(m, r.daysSince)), null);
  const last = recency(lastDays, dashboardConfig.customers.inactiveDays);
  const top = rows.slice().sort((a, b) => b.month.packets - a.month.packets || b.three.packets - a.three.packets).slice(0, 3);
  const stat = (label: string, value: React.ReactNode) => (
    <div className="rounded-xl border border-white/[0.07] bg-background/50 px-2.5 py-1.5 min-w-0">
      <p className="text-[13px] text-gray-400 font-semibold truncate">{label}</p>
      <div className="leading-[1.3]">{value}</div>
    </div>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-h-0 h-full text-start rounded-3xl border-2 p-4 flex flex-col justify-between gap-3 overflow-hidden transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: `${DIST_COLOR}99`,
        background: `radial-gradient(circle at 50% -10%, ${DIST_COLOR}40, transparent 55%), #141A2A`,
        boxShadow: `0 0 34px ${DIST_COLOR}33, inset 0 0 0 1px ${DIST_COLOR}22`,
      }}
    >
      <div className="shrink-0 flex items-center justify-between gap-2">
        <span className="rounded-full px-3 py-0.5 text-[15px] font-extrabold text-white" style={{ background: `${DIST_COLOR}55`, border: `1px solid ${DIST_COLOR}` }}>
          مبيعات المصنع
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${last.cls}`}>آخر طلب {last.text}</span>
      </div>
      <div className="shrink-0 flex flex-col items-center gap-2">
        <span
          className="flex items-center justify-center rounded-full text-[56px]"
          style={{ width: 104, height: 104, background: `${DIST_COLOR}33`, boxShadow: `0 0 0 6px ${DIST_COLOR}` }}
          aria-hidden
        >
          🚛
        </span>
        <p className="text-[30px] font-extrabold text-white leading-[1.4] text-center">الموزعين</p>
      </div>
      <div className="shrink-0 grid grid-cols-2 gap-2">
        {stat("🚛 الموزعين", <N value={rows.length} className="text-[24px] font-extrabold text-white" />)}
        {stat("📦 باكت الشهر", <N value={month} className="text-[24px] font-extrabold text-brandYellow" />)}
        {stat("💵 مبلغ الشهر", <N value={amount} className="text-[24px] font-extrabold text-white" />)}
        {stat("💰 المديونية", <N value={debt} className="text-[24px] font-extrabold text-brandOrange" />)}
      </div>
      <div className="shrink-0 rounded-xl border border-white/[0.07] bg-background/50 px-3 py-2 overflow-hidden">
        <p className="text-[13px] text-gray-400 font-semibold">🏆 الأكبر الشهر ده:</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {top.map((d) => (
            <span key={d.id} className="rounded-full px-2.5 py-0.5 text-[14px] font-bold text-gray-100" style={{ background: `${DIST_COLOR}26`, border: `1px solid ${DIST_COLOR}66` }}>
              {d.name} <span className="font-numbers text-gray-400">{formatNumber(d.month.packets)}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="shrink-0 text-center text-[14px] font-bold opacity-80 group-hover:opacity-100" style={{ color: DIST_COLOR }}>
        افتح الموزعين ←
      </p>
    </button>
  );
}

// صفحة الموزعين: كارت كبير لكل موزع، الأكبر الأول - the distributors page: a big card each, biggest first
function DistributorsView({ rows, products, inactiveDays, onOpen }: { rows: CustomerRow[]; products: string[]; inactiveDays: number; onOpen: (id: string) => void }) {
  const sorted = rows.slice().sort((a, b) => b.three.packets - a.three.packets || b.all.packets - a.all.packets);
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      {sorted.length === 0 && <p className="text-center text-gray-500 py-10">مفيش موزعين — ضيفهم في customers.distributors</p>}
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(420px,1fr))]">
        {sorted.map((d) => {
          const rc = recency(d.daysSince, inactiveDays);
          return (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(d.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(d.id)}
              className="cursor-pointer rounded-3xl border-2 p-4 flex flex-col gap-3 hover:brightness-110 transition"
              style={{ borderColor: `${DIST_COLOR}77`, background: `radial-gradient(circle at 90% 0%, ${DIST_COLOR}2e, transparent 50%), #141A2A`, boxShadow: `0 0 24px ${DIST_COLOR}22` }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="shrink-0 flex items-center justify-center rounded-2xl text-[30px]" style={{ width: 56, height: 56, background: `${DIST_COLOR}33` }} aria-hidden>
                  🚛
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[26px] font-extrabold text-white leading-[1.4] truncate">{d.name}</p>
                  <p className="flex flex-wrap items-center gap-3 text-[14px] text-gray-400">
                    {d.mobile ? (
                      <a href={`tel:${d.mobile.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-gray-200 hover:underline">
                        <Phone size={13} /> <span dir="ltr" className="font-numbers">{d.mobile}</span>
                      </a>
                    ) : (
                      <span className="text-statusRed">📵 مفيش موبايل</span>
                    )}
                    <span>
                      <MapPin size={13} className="inline me-0.5" />
                      {d.area ?? "—"}
                    </span>
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${rc.cls}`}>آخر طلب {rc.text}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "باكت الشهر", node: <N value={d.month.packets} className="text-[24px] font-extrabold text-brandYellow" /> },
                  { label: "مبلغ الشهر", node: <N value={d.month.amount} className="text-[24px] font-extrabold text-white" /> },
                  { label: "طلبات الشهر / الكل", node: <span className="text-[24px] font-extrabold text-gray-100"><N value={d.month.invoices} /> <span className="text-[15px] text-gray-500">/ <N value={d.all.invoices} /></span></span> },
                  { label: "المديونية", node: <N value={d.debt} className={`text-[24px] font-extrabold ${d.debt > 0.5 ? "text-brandOrange" : "text-statusGreen"}`} /> },
                ].map((x) => (
                  <div key={x.label} className="rounded-xl border border-white/[0.07] bg-background/50 px-2.5 py-1.5 min-w-0">
                    <p className="text-[12px] text-gray-400 whitespace-nowrap">{x.label}</p>
                    <div className="leading-[1.3]">{x.node}</div>
                  </div>
                ))}
              </div>
              {/* باكت الشهر لكل منتج - this month's packets per product */}
              <div className="flex flex-wrap gap-1.5">
                {products.map((label, i) => (
                  <span key={label} className="flex-1 min-w-[70px] text-center rounded-lg border border-cardBorder bg-background/70 px-2 text-[14px] leading-[1.8]">
                    <span className="text-gray-400 font-semibold">{label}</span>{" "}
                    <N value={d.monthProducts[i] ?? 0} className={(d.monthProducts[i] ?? 0) > 0 ? "text-brandYellow font-bold" : "text-gray-600"} />
                  </span>
                ))}
              </div>
              <p className="text-[12px] text-gray-500">
                آخر 3 شهور <N value={d.three.packets} className="text-gray-300 font-bold" /> باكت · من الأول <N value={d.all.packets} className="text-gray-300 font-bold" /> باكت · آخر طلب {fmtDate(d.lastDate)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BackButton({ onClick, label = "رجوع" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-xl border border-cardBorder bg-card text-gray-300 hover:text-white hover:bg-cardBorder text-[14px] font-bold"
    >
      <ArrowRight size={16} /> {label}
    </button>
  );
}

function SearchSort({ query, setQuery, sort, setSort }: { query: string; setQuery: (q: string) => void; sort: Sort; setSort: (s: Sort) => void }) {
  return (
    <>
      <div className="relative shrink-0">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث بالاسم أو الموبايل"
          className="w-[210px] ps-8 pe-2 py-1 rounded-xl border border-cardBorder bg-card text-[14px] text-white placeholder:text-gray-500 outline-none focus:border-brandOrange"
        />
      </div>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as Sort)}
        className="shrink-0 py-1 px-2 rounded-xl border border-cardBorder bg-card text-[14px] text-gray-200 outline-none focus:border-brandOrange"
        aria-label="الترتيب"
      >
        {SORTS.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
    </>
  );
}

// شرايح المناطق بعددها (بتتزحلق بالعرض) - area chips with counts (scroll sideways)
function AreaChips({ rows, area, onArea, children }: { rows: CustomerRow[]; area: string | null; onArea: (a: string | null) => void; children?: React.ReactNode }) {
  const chips = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const r of rows) {
      const a = map.get(r.areaKey) ?? { key: r.areaKey, label: r.area ?? "بدون منطقة", count: 0 };
      a.count += 1;
      map.set(r.areaKey, a);
    }
    return Array.from(map.values()).sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : b.count - a.count));
  }, [rows]);
  return (
    <div className="shrink-0 flex items-center gap-2 rounded-2xl border border-cardBorder bg-card/80 px-3 py-2 min-w-0">
      <MapPin size={15} className="shrink-0 text-gray-500" />
      <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <div className="flex items-center gap-1.5 w-max pb-0.5">
          <button type="button" className={chip(area === null)} onClick={() => onArea(null)}>
            كل المناطق <span className="font-numbers text-gray-400">{rows.length}</span>
          </button>
          {chips.map((a) => (
            <button key={a.key || "none"} type="button" className={chip(area === a.key)} onClick={() => onArea(area === a.key ? null : a.key)}>
              {a.label} <span className="font-numbers text-gray-400">{a.count}</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

// العملاء متجمعين بالمنطقة، 3–4 كروت في الصف - customers grouped by area, 3–4 cards per row
function AreaGroups({ rows, notes, inactiveDays, color, onOpen }: {
  rows: CustomerRow[]; notes: Record<string, CustomerNote>; inactiveDays: number; color: string; onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: CustomerRow[] }>();
    for (const row of rows) {
      const g = map.get(row.areaKey) ?? { label: row.area ?? "بدون منطقة", rows: [] };
      g.rows.push(row);
      map.set(row.areaKey, g);
    }
    return Array.from(map.entries())
      .sort(([ka, a], [kb, b]) => (ka === "" ? 1 : kb === "" ? -1 : b.rows.length - a.rows.length || byText(a.label, b.label)))
      .map(([, g]) => g);
  }, [rows]);
  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-2xl border border-cardBorder bg-card/90 p-3 flex flex-col gap-3" style={{ borderTopWidth: 4, borderTopColor: color }}>
      {rows.length === 0 && <p className="text-center text-gray-500 py-10">مفيش عملاء</p>}
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-1.5">
          <p className="sticky top-0 z-[1] bg-card/95 backdrop-blur text-[15px] font-bold text-gray-300 px-1 py-0.5 flex items-center gap-1">
            <MapPin size={14} style={{ color }} />
            {g.label}
            <span className="text-gray-500 font-semibold">({g.rows.length})</span>
          </p>
          <div className="grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(330px,1fr))]">
            {g.rows.map((row) => (
              <CustomerCard key={row.id} row={row} note={notes[row.id]} inactiveDays={inactiveDays} onOpen={() => onOpen(row.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// كارت خط كبير بلون المندوب ونور حواليه - a big route card in the rep's color with a glow
function RouteCard({ name, rep, rows, onOpen }: { name: string; rep: CustomersRep; rows: CustomerRow[]; onOpen: () => void }) {
  const k = kpisOf(rows);
  const month = rows.reduce((t, r) => t + r.month.packets, 0);
  const areas = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      if (!r.areaKey) continue;
      const a = map.get(r.areaKey) ?? { label: r.area ?? r.areaKey, count: 0 };
      a.count += 1;
      map.set(r.areaKey, a);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rows]);
  const stat = (label: string, value: React.ReactNode) => (
    <div className="rounded-xl border border-white/[0.07] bg-background/50 px-2.5 py-1.5 min-w-0">
      <p className="text-[13px] text-gray-400 font-semibold truncate">{label}</p>
      <div className="leading-[1.3]">{value}</div>
    </div>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-h-0 h-full text-start rounded-3xl border-2 p-4 flex flex-col justify-between gap-3 overflow-hidden transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: `${rep.color}99`,
        background: `radial-gradient(circle at 50% -10%, ${rep.color}40, transparent 55%), #141A2A`,
        boxShadow: `0 0 34px ${rep.color}33, inset 0 0 0 1px ${rep.color}22`,
      }}
    >
      <div className="shrink-0 flex items-center justify-between gap-2">
        <span className="rounded-full px-3 py-0.5 text-[15px] font-extrabold text-white" style={{ background: `${rep.color}55`, border: `1px solid ${rep.color}` }}>
          {name}
        </span>
        <span className="flex items-center gap-1 rounded-full border border-brandOrange/40 bg-brandOrange/10 px-2.5 py-0.5 text-[14px] font-bold text-brandOrange">
          <Truck size={15} /> {rep.van}
        </span>
      </div>
      <div className="shrink-0 flex flex-col items-center gap-2">
        <RepAvatar id={rep.id} name={rep.name} color={rep.color} size={104} />
        <p className="text-[30px] font-extrabold text-white leading-[1.4] text-center">{rep.name}</p>
      </div>
      <div className="shrink-0 grid grid-cols-2 gap-2">
        {stat("👥 العملاء", <N value={k.total} className="text-[24px] font-extrabold text-white" />)}
        {stat("🟢 اشتروا الشهر ده", <N value={k.activeMonth} className="text-[24px] font-extrabold text-statusGreen" />)}
        {stat("🔴 متوقفين", <N value={k.inactive} className="text-[24px] font-extrabold text-statusRed" />)}
        {stat("✨ جداد الشهر ده", <N value={k.isNew} className="text-[24px] font-extrabold text-sky-300" />)}
        {stat("📦 باكت الشهر", <N value={month} className="text-[24px] font-extrabold text-brandYellow" />)}
        {stat("💰 المديونية", <N value={k.debt} className="text-[24px] font-extrabold text-brandOrange" />)}
      </div>
      <div className="shrink-0 rounded-xl border border-white/[0.07] bg-background/50 px-3 py-2 overflow-hidden">
        <p className="text-[13px] text-gray-400 font-semibold">
          📍 <N value={areas.length} className="text-white font-bold" /> منطقة — أكبر 3:
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {areas.slice(0, 3).map((a) => (
            <span key={a.label} className="rounded-full px-2.5 py-0.5 text-[14px] font-bold text-gray-100" style={{ background: `${rep.color}26`, border: `1px solid ${rep.color}66` }}>
              {a.label} <span className="font-numbers text-gray-400">{a.count}</span>
            </span>
          ))}
          {areas.length === 0 && <span className="text-gray-500 text-[14px]">—</span>}
        </div>
      </div>
      <p className="shrink-0 text-center text-[14px] font-bold opacity-80 group-hover:opacity-100" style={{ color: rep.color }}>
        افتح الخط ←
      </p>
    </button>
  );
}

// زرار مربع في شبكة 2×2 (صفحة الخطوط) - a square button in the 2×2 grid (the routes page)
function SquareButton({ icon, label, sub, onClick, tone = "default" }: { icon: string; label: string; sub?: string; onClick: () => void; tone?: "default" | "sky" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-1 transition-colors ${
        tone === "sky" ? "border-sky-400/50 bg-sky-400/10 hover:bg-sky-400/20" : "border-cardBorder bg-card/90 hover:bg-white/[0.06]"
      }`}
    >
      <span className="text-[34px] leading-none">{icon}</span>
      <span className="text-[16px] font-extrabold text-white">{label}</span>
      {sub && <span className="text-[12px] text-gray-400">{sub}</span>}
    </button>
  );
}

// "⚠ عملاء مش متظبطين": من اشترى منهم وآخر شرا من كل مندوب، واقتراح الخط - the "not settled" customers: who they bought from,
// the last purchase per rep, and the suggested route (the rep with most purchases)
function MisfitsView({ rows, reps, routes, onOpen }: { rows: CustomerRow[]; reps: Map<string, CustomersRep>; routes: Map<string, string>; onOpen: (id: string) => void }) {
  const sorted = useMemo(
    () => rows.slice().sort((a, b) => b.reps.length - a.reps.length || b.three.packets - a.three.packets || b.all.packets - a.all.packets || byText(a.name, b.name)),
    [rows]
  );
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).then(() => setCopied(id)).catch(() => {});
  };
  const th = "px-2 py-2 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const td = "px-2 border-b border-cardBorder/60 text-center";
  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl border border-statusAmber/40 bg-card/90 overflow-hidden">
      <p className="shrink-0 px-4 py-2 border-b border-cardBorder text-[14px] text-gray-400">
        العملاء دول مش ظاهرين جوه الخطوط لحد ما يبقى ليهم مندوب واحد. لتثبيت عميل على خط: انسخ السطر وحطه في{" "}
        <span dir="ltr" className="font-numbers text-gray-200">customers.repOverrides</span> في الكونفج.
      </p>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[14px] leading-[2.1]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className={`${th} text-start ps-4`}>العميل</th>
              <th className={th}>المنطقة</th>
              <th className={th}>السبب</th>
              <th className={`${th} text-start`}>اشترى من (فواتير آخر 90 يوم / من الأول · آخر شرا)</th>
              <th className={th}>آخر شرا</th>
              <th className={th}>باكت 3 شهور</th>
              <th className={th}>الاقتراح</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const best = r.repHistory[0];
              const line = best ? `"${r.id}": "${best.id}",` : "";
              return (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="ps-4 pe-2 border-b border-cardBorder/60">
                    <button type="button" onClick={() => onOpen(r.id)} className="text-white font-semibold hover:underline text-start">
                      {r.name}
                    </button>
                  </td>
                  <td className={`${td} text-gray-300 whitespace-nowrap`}>{r.area ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {r.repId === null ? (
                      <span className="text-gray-300">🏭 بدون مندوب</span>
                    ) : (
                      <span className="text-statusAmber font-bold">🔀 {r.reps.length} مناديب</span>
                    )}
                  </td>
                  <td className="px-2 border-b border-cardBorder/60">
                    {r.repHistory.length === 0 ? (
                      <span className="text-gray-500">مبيعات المصنع على طول</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {r.repHistory.map((h) => (
                          <span key={h.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                            <RepChip rep={reps.get(h.id)} small />
                            <span className="text-[12px] text-gray-400">
                              <span className="font-numbers text-gray-200">{h.invoices90}</span>/<span className="font-numbers">{h.invoicesAll}</span> · {fmtDate(h.last)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={`${td} font-numbers text-gray-300 whitespace-nowrap`}>{fmtDate(r.lastDate)}</td>
                  <td className={td}>
                    <N value={r.three.packets} className={r.three.packets ? "text-brandYellow font-bold" : "text-gray-600"} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {best ? (
                      <button
                        type="button"
                        onClick={() => copy(line, r.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-cardBorder px-2 py-0.5 text-[13px] text-gray-200 hover:bg-white/5"
                        title={`انسخ: ${line}`}
                      >
                        ضمه لـ {routes.get(best.id) ?? ""} {reps.get(best.id)?.name ?? best.id} {copied === r.id ? "✓ اتنسخ" : "📋"}
                      </button>
                    ) : (
                      <span className="text-gray-500 text-[13px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const GLOBAL_TITLES: Record<GlobalView, string> = {
  all: "📋 كل العملاء",
  areas: "📍 المناطق",
  quality: "🧹 جودة البيانات",
  insights: "🧠 تحليل واقتراحات",
  misfits: "⚠ عملاء مش متظبطين",
  distributors: "🚛 الموزعين",
};

export default function CustomersPage() {
  const { data, error, isLoading, mutate } = useSWR<CustomersData>("/api/customers", fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [nav, setNav] = useState<Nav>(EMPTY_NAV);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("top");
  const [localNotes, setLocalNotes] = useState<Record<string, CustomerNote | null>>({});

  // الرابط ← المكان، وزرار الرجوع في المتصفح - the URL → the place, and the browser back button
  useEffect(() => {
    setNav(readNav());
    const onPop = () => setNav(readNav());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navRef = useRef(nav);
  navRef.current = nav;
  const go = useCallback((next: Partial<Nav>, opts: { replace?: boolean } = {}) => {
    const target: Nav = { ...EMPTY_NAV, ...next };
    if (opts.replace) window.history.replaceState(null, "", navUrl(target));
    else window.history.pushState(null, "", navUrl(target));
    // البحث بيتمسح لما تروح صفحة تانية بس (مش مع شرايح المنطقة) - search clears only when moving to another page
    if (target.route !== navRef.current.route || target.view !== navRef.current.view) setQuery("");
    setNav(target);
  }, []);
  const openCustomer = useCallback((id: string) => {
    const target = { ...readNav(), customer: id };
    window.history.pushState({ customer: true }, "", navUrl(target));
    setNav(target);
  }, []);
  const closeCustomer = useCallback(() => {
    if ((window.history.state as { customer?: boolean } | null)?.customer) window.history.back();
    else {
      const target = { ...readNav(), customer: null };
      window.history.replaceState(null, "", navUrl(target));
      setNav(target);
    }
  }, []);

  const reps = useMemo(() => new Map((data?.reps ?? []).map((r) => [r.id, r])), [data]);
  const routeNames = useMemo(() => new Map((data?.routes ?? []).map((r) => [r.repId, r.name])), [data]);
  const notes = useMemo(() => {
    const out: Record<string, CustomerNote> = { ...(data?.notes ?? {}) };
    for (const [id, n] of Object.entries(localNotes)) {
      if (n) out[id] = n;
      else delete out[id];
    }
    return out;
  }, [data, localNotes]);
  const all = useMemo(() => data?.customers ?? [], [data]);
  const inactiveDays = data?.inactiveDays ?? 14;
  const misfits = useMemo(() => all.filter(isMisfit), [all]);
  const distributors = useMemo(() => all.filter((r) => r.isDistributor), [all]);
  const byRoute = useMemo(() => {
    const map = new Map<string, CustomerRow[]>();
    for (const r of all) {
      if (r.isDistributor || isMisfit(r) || !r.repId) continue;
      const arr = map.get(r.repId) ?? [];
      arr.push(r);
      map.set(r.repId, arr);
    }
    return map;
  }, [all]);

  const routeRep = nav.route ? reps.get(nav.route) ?? null : null;
  const routeRows = useMemo(() => (nav.route ? byRoute.get(nav.route) ?? [] : []), [byRoute, nav.route]);
  // التاب المختار (جملة / قطاعي / الكل) - the chosen tab (wholesale / retail / all)
  const segRows = useMemo(() => (nav.seg ? routeRows.filter((r) => r.segment === SEG_OF[nav.seg!]) : routeRows), [routeRows, nav.seg]);
  const routeFiltered = useFiltered(segRows, nav.area, nav.status, query, sort, inactiveDays);
  const globalBase = nav.view === "misfits" ? misfits : all;
  const globalFiltered = useFiltered(globalBase, nav.area, nav.status, query, sort, inactiveDays);

  const insights = useMemo(() => {
    if (!data || nav.view !== "insights") return null;
    const routes = data.routes;
    return nav.route ? buildInsights(routeRows, all, nav.route, reps, inactiveDays, routes) : buildInsights(all, all, "all", reps, inactiveDays, routes);
  }, [data, nav.view, nav.route, routeRows, all, reps, inactiveDays]);

  // اقتراح ← المكان المناسب (خط، أو كل العملاء، أو المش متظبطين) - a suggestion → the right place
  const applyLink = useCallback(
    (link: InsightLink) => {
      if (link.rep === "all") go({ view: "all", area: link.area, status: link.status });
      else if (link.rep === NO_REP) go({ view: "misfits", area: link.area, status: link.status });
      else if (link.rep === DISTRIBUTORS) go({ view: "distributors" });
      else go({ route: link.rep, area: link.area, status: link.status, seg: link.seg ?? null });
    },
    [go]
  );
  const onNoteSaved = useCallback((id: string, note: CustomerNote | null) => setLocalNotes((was) => ({ ...was, [id]: note })), []);
  const open = nav.customer ? all.find((r) => r.id === nav.customer) : undefined;
  const areaLabel = nav.area === null ? null : nav.area === "" ? "بدون منطقة" : all.find((r) => r.areaKey === nav.area)?.area ?? nav.area;
  const pillTitle = routeRep ? `العملاء · ${routeNames.get(routeRep.id) ?? routeRep.name}` : "العملاء";

  const filterChips = (
    <>
      {nav.area !== null && (
        <button type="button" className={`shrink-0 ${chip(true)}`} onClick={() => go({ ...nav, area: null, customer: null }, { replace: true })}>
          📍 {areaLabel} ✕
        </button>
      )}
      {nav.status !== null && (
        <button type="button" className={`shrink-0 ${chip(true)}`} onClick={() => go({ ...nav, status: null, customer: null }, { replace: true })}>
          {statusLabel(nav.status)} ✕
        </button>
      )}
    </>
  );

  let body: React.ReactNode = null;
  if (data && !nav.route && !nav.view) {
    // ===== الخطوط (الصفحة الرئيسية) - the routes landing =====
    const noRep = misfits.filter((r) => r.repId === null).length;
    body = (
      <>
        <div className="shrink-0 flex items-center gap-3">
          <a
            href="/?page=sales"
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-xl border border-cardBorder bg-card text-gray-300 hover:text-white hover:bg-cardBorder text-[14px] font-bold"
            title="رجوع لصفحة مبيعات المناديب"
          >
            <ArrowRight size={16} /> رجوع
          </a>
          <h1 className="text-[24px] font-extrabold text-white flex items-center gap-2">
            <Users className="text-brandOrange" size={24} /> العملاء
          </h1>
          <p className="text-gray-500 text-[14px]">اختار خط عشان تشوف عملاؤه</p>
        </div>
        {/* المؤشرات = إجمالي كل العملاء، والضغط بيفتح كل العملاء بالفلتر - KPIs = totals; a click opens all customers filtered */}
        <KpiRow rows={all} inactiveDays={inactiveDays} status={null} onStatus={(s) => go({ view: "all", status: s })} split />
        <div className="flex-1 min-h-0 flex gap-4">
          {/* الخطوط الأربعة + الموزعين: 5 في صف (3 في الصف على الشاشات الأصغر) - the 4 routes + distributors: 5 in a row (3 per row smaller) */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            <div className="h-full min-h-[560px] grid gap-4 grid-cols-5 max-[1599px]:grid-cols-3 max-[1599px]:h-auto">
              {data.routes.map((route) => {
                const rep = reps.get(route.repId);
                if (!rep) return null;
                return <RouteCard key={route.repId} name={route.name} rep={rep} rows={byRoute.get(route.repId) ?? []} onOpen={() => go({ route: route.repId })} />;
              })}
              <DistributorsCard rows={distributors} onOpen={() => go({ view: "distributors" })} />
            </div>
          </div>
          {/* على الشمال: 4 أزرار مربعة، وتحتهم العملاء المش متظبطين - on the left: 4 square buttons, then the unsettled customers */}
          <div className="shrink-0 w-[300px] max-[1599px]:w-[250px] flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <SquareButton icon="📋" label="الكل" sub={`${formatNumber(all.length)} عميل`} onClick={() => go({ view: "all" })} />
              <SquareButton icon="📍" label="المناطق" onClick={() => go({ view: "areas" })} />
              <SquareButton icon="🧹" label="جودة البيانات" onClick={() => go({ view: "quality" })} />
              <SquareButton icon="🧠" label="تحليل واقتراحات" tone="sky" onClick={() => go({ view: "insights" })} />
            </div>
            <button
              type="button"
              onClick={() => go({ view: "misfits" })}
              className="rounded-2xl border-2 border-statusAmber/60 bg-statusAmber/10 hover:bg-statusAmber/20 p-4 text-start transition-colors"
            >
              <p className="text-[17px] font-extrabold text-statusAmber">⚠ عملاء مش متظبطين</p>
              <p className="leading-[1.3] mt-1">
                <N value={misfits.length} className="text-[38px] font-extrabold text-white" /> <span className="text-gray-400">عميل</span>
              </p>
              <p className="text-[13px] text-gray-300 mt-1">
                🏭 بدون مندوب <N value={noRep} className="font-bold text-white" /> · 🔀 أكتر من مندوب <N value={misfits.length - noRep} className="font-bold text-white" />
              </p>
              <p className="text-[12px] text-gray-500 mt-1">مش ظاهرين جوه الخطوط · اضغط تشوفهم ←</p>
            </button>
          </div>
        </div>
      </>
    );
  } else if (data && nav.route) {
    // ===== صفحة خط - a route page =====
    if (!routeRep) {
      body = (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 text-lg">
          <p>الخط ده مش موجود</p>
          <BackButton onClick={() => go({})} />
        </div>
      );
    } else {
      const routeName = routeNames.get(routeRep.id) ?? "";
      const toggleView = (v: RouteView) => go({ route: routeRep.id, view: nav.view === v ? null : v });
      body = (
        <>
          <div className="shrink-0 flex flex-wrap items-center gap-3">
            <BackButton onClick={() => (nav.view ? go({ route: routeRep.id }) : go({}))} label={nav.view ? "رجوع للخط" : "رجوع للخطوط"} />
            <RepAvatar id={routeRep.id} name={routeRep.name} color={routeRep.color} size={56} />
            <div className="min-w-0">
              <h1 className="text-[26px] font-extrabold text-white leading-[1.3]">{routeRep.name}</h1>
              <p className="flex items-center gap-2 text-[14px]">
                <span className="rounded-full px-2.5 font-extrabold text-white" style={{ background: `${routeRep.color}55`, border: `1px solid ${routeRep.color}` }}>
                  {routeName}
                </span>
                <span className="flex items-center gap-1 text-brandOrange font-bold">
                  <Truck size={14} /> {routeRep.van}
                </span>
              </p>
            </div>
            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleView("areas")}
                aria-pressed={nav.view === "areas"}
                className={`px-3 py-1.5 rounded-xl text-[15px] font-extrabold border transition-colors ${
                  nav.view === "areas" ? "bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white border-transparent" : "bg-card border-cardBorder text-gray-300 hover:bg-white/5"
                }`}
              >
                📍 مناطق الخط
              </button>
              <button
                type="button"
                onClick={() => toggleView("insights")}
                aria-pressed={nav.view === "insights"}
                className={`px-3 py-1.5 rounded-xl text-[15px] font-extrabold border transition-colors ${
                  nav.view === "insights" ? "bg-sky-500/40 text-white border-sky-300" : "border-sky-400/50 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20"
                }`}
              >
                🧠 تحليل الخط
              </button>
            </div>
          </div>
          {/* جملة / قطاعي: شريط المقارنة وتلات تابات كبيرة - wholesale / retail: the comparison bar and 3 big tabs */}
          {!nav.view && <CompareBar rows={routeRows} />}
          {!nav.view && (
            <div className="shrink-0 grid gap-3 grid-cols-3">
              <SegCard title="🏪 جملة" color={SEG_COLOR["جملة"]} rows={routeRows.filter((r) => r.segment === "جملة")} selected={nav.seg === "wholesale"} inactiveDays={inactiveDays}
                onClick={() => go({ route: routeRep.id, seg: "wholesale" }, { replace: true })} />
              <SegCard title="🛒 قطاعي" color={SEG_COLOR["قطاعي"]} rows={routeRows.filter((r) => r.segment === "قطاعي")} selected={nav.seg === "retail"} inactiveDays={inactiveDays}
                onClick={() => go({ route: routeRep.id, seg: "retail" }, { replace: true })} />
              <SegCard title="الكل" color={routeRep.color} rows={routeRows} selected={nav.seg === null} inactiveDays={inactiveDays}
                onClick={() => go({ route: routeRep.id }, { replace: true })} />
            </div>
          )}
          <KpiRow rows={segRows} inactiveDays={inactiveDays} status={nav.status} onStatus={(s) => go({ route: routeRep.id, seg: nav.seg, area: nav.area, status: s }, { replace: true })} />
          {nav.view === "areas" ? (
            <div className="flex-1 min-h-0">
              <AreasView rows={routeRows} reps={reps} onPick={(key) => go({ route: routeRep.id, area: key })} />
            </div>
          ) : nav.view === "insights" && insights ? (
            <div className="flex-1 min-h-0">
              <InsightsPanel inline insights={insights} scope={`${routeName} · ${routeRep.name}`} repId={routeRep.id} reps={reps} inactiveDays={inactiveDays} onPick={applyLink} onClose={() => go({ route: routeRep.id })} />
            </div>
          ) : (
            <>
              {/* مناطق التاب المختار، والبحث والترتيب في نفس السطر - the chosen tab's areas, with search and sort on the same row */}
              <AreaChips rows={segRows} area={nav.area} onArea={(a) => go({ route: routeRep.id, seg: nav.seg, area: a, status: nav.status }, { replace: true })}>
                <SearchSort query={query} setQuery={setQuery} sort={sort} setSort={setSort} />
                {nav.status !== null && (
                  <button type="button" className={`shrink-0 ${chip(true)}`} onClick={() => go({ route: routeRep.id, seg: nav.seg, area: nav.area }, { replace: true })}>
                    {statusLabel(nav.status)} ✕
                  </button>
                )}
                <p className="shrink-0 text-gray-400 text-[13px] whitespace-nowrap">
                  ظاهر <N value={routeFiltered.length} className="text-white font-bold" /> من <N value={segRows.length} />
                </p>
              </AreaChips>
              <div className="flex-1 min-h-[300px]">
                <AreaGroups rows={routeFiltered} notes={notes} inactiveDays={inactiveDays} color={routeRep.color} onOpen={openCustomer} />
              </div>
            </>
          )}
        </>
      );
    }
  } else if (data && nav.view) {
    // ===== صفحات كل العملاء: الكل / المناطق / جودة البيانات / التحليل / المش متظبطين - the all-customers pages =====
    const view = nav.view as GlobalView;
    const listed = view === "all" || view === "misfits";
    const distTotal = view === "distributors" ? kpisOf(distributors) : null;
    body = (
      <>
        <div className="shrink-0 flex flex-wrap items-center gap-3">
          <BackButton onClick={() => go({})} label="رجوع للخطوط" />
          <h1 className="text-[24px] font-extrabold text-white">{GLOBAL_TITLES[view]}</h1>
          {listed && <SearchSort query={query} setQuery={setQuery} sort={sort} setSort={setSort} />}
          {listed && filterChips}
          {distTotal && (
            <p className="ms-auto text-gray-400 text-[14px] whitespace-nowrap">
              <N value={distTotal.total} className="text-white font-bold" /> موزع · باكت الشهر{" "}
              <N value={distributors.reduce((t, r) => t + r.month.packets, 0)} className="text-brandYellow font-bold" /> · مديونية{" "}
              <N value={distTotal.debt} className="text-brandOrange font-bold" />
            </p>
          )}
          {listed && (
            <p className="ms-auto text-gray-400 text-[13px] whitespace-nowrap">
              ظاهر <N value={globalFiltered.length} className="text-white font-bold" /> من <N value={globalBase.length} /> عميل
            </p>
          )}
        </div>
        {view === "all" && <KpiRow rows={all} inactiveDays={inactiveDays} status={nav.status} onStatus={(s) => go({ view: "all", area: nav.area, status: s }, { replace: true })} split />}
        <div className="flex-1 min-h-0">
          {view === "all" && <TableView rows={globalFiltered} reps={reps} inactiveDays={inactiveDays} onOpen={openCustomer} />}
          {view === "distributors" && <DistributorsView rows={distributors} products={data.products} inactiveDays={inactiveDays} onOpen={openCustomer} />}
          {view === "misfits" && <MisfitsView rows={globalFiltered} reps={reps} routes={routeNames} onOpen={openCustomer} />}
          {view === "areas" && <AreasView rows={all} reps={reps} onPick={(key) => go({ view: "all", area: key })} />}
          {view === "quality" && <QualityView rows={all} reps={reps} onOpen={openCustomer} />}
          {view === "insights" && insights && (
            <InsightsPanel inline insights={insights} scope="كل المناديب" repId="all" reps={reps} inactiveDays={inactiveDays} onPick={applyLink} onClose={() => go({})} />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="relative h-screen flex flex-col overflow-hidden bg-background">
      {/* نفس خلفية وإضاءة الداشبورد - the dashboard's background and ambient light */}
      {ambient.enabled && (
        <div className="ambient-light" aria-hidden style={{ opacity: ambient.opacity }}>
          <span className="ambient-blob ambient-blob-1" />
          <span className="ambient-blob ambient-blob-2" />
          <span className="ambient-blob ambient-blob-3" />
        </div>
      )}

      {/* نفس هيدر الداشبورد (اللوجو والساعة وملء الشاشة و F) - the dashboard header */}
      <Header
        isConnected={!error}
        page={{ id: "customers", title: pillTitle }}
        actions={
          <div className="flex items-center gap-2">
            {data && <span className="text-gray-400 text-[13px] whitespace-nowrap">آخر تحديث {formatTime12(data.updatedAt)}</span>}
            <button
              type="button"
              onClick={() => mutate()}
              className="p-2 bg-background border border-cardBorder rounded-xl hover:bg-cardBorder transition-colors"
              title="تحديث"
              aria-label="تحديث"
            >
              <RefreshCw className={`w-5 h-5 text-gray-300 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {!data ? (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 text-xl">
          {error ? (
            <>
              <p>⚠️ ERPNext مش بيرد دلوقتي</p>
              <button type="button" onClick={() => mutate()} className={chip(false)}>
                جرّب تاني
              </button>
            </>
          ) : (
            <p>جاري تحميل العملاء...</p>
          )}
        </div>
      ) : (
        <main className="relative flex-1 min-h-0 flex flex-col gap-3 p-4 overflow-y-auto">{body}</main>
      )}

      {open && data && (
        <CustomerPanel
          key={open.id}
          row={open}
          reps={reps}
          inactiveDays={inactiveDays}
          tags={data.tags}
          note={notes[open.id] ?? null}
          notesEnabled={data.notesEnabled}
          onNoteSaved={onNoteSaved}
          onClose={closeCustomer}
        />
      )}
    </div>
  );
}
