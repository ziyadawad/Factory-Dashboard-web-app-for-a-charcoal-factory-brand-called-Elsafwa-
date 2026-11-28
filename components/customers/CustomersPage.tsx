"use client";

// صفحة "👥 العملاء" (/customers): قاعدة بيانات العملاء متقسمة بالمندوب والمنطقة - قراية بس من ERPNext (الملاحظات عندنا)
// فوق: المؤشرات، وبعدين الفلاتر (المندوب / المنطقة / الحالة / البحث / الترتيب)، وتحت 4 تابات: حسب المندوب، جدول،
// المناطق، جودة البيانات. الضغط على عميل بيفتح لوحة تفاصيله. البيانات بتتجاب بس والصفحة مفتوحة (كاش 5 دقايق على السيرفر)
// The customers page: KPIs, filters, then 4 tabs (by rep, table, areas, data quality). A customer opens his panel.
// Fetched only while this page is open (5-minute server cache)

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowRight, Download, MapPin, RefreshCw, Search, Truck, Users } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { normalizeArabic } from "@/lib/arabic";
import { formatTime12 } from "@/lib/format";
import { buildInsights, isLost, type CustomerStatus, type InsightLink } from "@/lib/customer-insights";
import Header from "../Header";
import type { CustomerNote, CustomerRow, CustomersData, CustomersRep } from "@/lib/customer-types";
import { fetcher, fmtDate, Money, N, NO_REP, recency, RepChip } from "./common";
import CustomerPanel from "./CustomerPanel";
import InsightsPanel from "./InsightsPanel";

const ambient = dashboardConfig.sizes.ambient;
const REFRESH_MS = dashboardConfig.customers.cacheMinutes * 60_000;

type View = "reps" | "table" | "areas" | "quality";
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
const SORTS: { id: Sort; label: string }[] = [
  { id: "top", label: "الأكثر شراء" },
  { id: "recent", label: "آخر شراء" },
  { id: "debt", label: "المديونية" },
  { id: "oldest", label: "الأقدم" },
];
const VIEWS: { id: View; label: string }[] = [
  { id: "reps", label: "🚚 حسب المندوب" },
  { id: "table", label: "📋 جدول" },
  { id: "areas", label: "📍 المناطق" },
  { id: "quality", label: "🧹 جودة البيانات" },
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

// كارت مندوب (الخطوة 1): لونه واسمه وعربيته وأرقامه، والمختار بيتنور بلونه
// A rep card (step 1): color, name, van and numbers; the selected one lights up in its color
function RepCard({ title, sub, color, rows, selected, onClick }: {
  title: string; sub: string; color: string; rows: CustomerRow[]; selected: boolean; onClick: () => void;
}) {
  const active = rows.filter((r) => !r.inactive).length;
  const month = rows.reduce((t, r) => t + r.month.packets, 0);
  const debt = rows.reduce((t, r) => t + r.debt, 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-w-0 text-start rounded-2xl border px-3 py-2 transition-colors ${selected ? "" : "border-cardBorder bg-card/90 hover:bg-white/[0.05]"}`}
      style={{
        borderTopWidth: 4,
        borderTopColor: color,
        ...(selected ? { borderColor: color, background: `${color}22`, boxShadow: `0 0 18px ${color}55` } : {}),
      }}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <p className="text-[19px] font-extrabold text-white truncate leading-[1.6]">{title}</p>
        <p className="text-[13px] text-gray-400 truncate">{sub}</p>
      </div>
      <div className="grid grid-cols-4 gap-1 text-[12px] text-gray-400 leading-[1.5]">
        <div>
          <p>عملاء</p>
          <N value={rows.length} className="text-[18px] font-extrabold text-white" />
        </div>
        <div>
          <p>نشطين</p>
          <N value={active} className="text-[18px] font-extrabold text-statusGreen" />
        </div>
        <div>
          <p>باكت الشهر</p>
          <N value={month} className="text-[18px] font-extrabold text-brandYellow" />
        </div>
        <div>
          <p>مديونية</p>
          <N value={debt} className="text-[18px] font-extrabold text-brandOrange" />
        </div>
      </div>
    </button>
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

// عمود مندوب: العملاء متجمعين بالمنطقة - one rep's column, customers grouped by area
function RepColumn({ title, color, rows, notes, inactiveDays, wide, onOpen }: {
  title: string; color: string; rows: CustomerRow[]; notes: Record<string, CustomerNote>; inactiveDays: number; wide: boolean; onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: CustomerRow[] }>();
    for (const row of rows) {
      const key = row.areaKey || "";
      const g = map.get(key) ?? { label: row.area ?? "بدون منطقة", rows: [] };
      g.rows.push(row);
      map.set(key, g);
    }
    return Array.from(map.entries())
      .sort(([ka, a], [kb, b]) => (ka === "" ? 1 : kb === "" ? -1 : b.rows.length - a.rows.length || byText(a.label, b.label)))
      .map(([, g]) => g);
  }, [rows]);
  const month = rows.reduce((s, r) => s + r.month.packets, 0);
  const debt = rows.reduce((s, r) => s + r.debt, 0);
  return (
    <div className="min-h-0 flex flex-col rounded-2xl border border-cardBorder bg-card/90 overflow-hidden" style={{ borderTopWidth: 4, borderTopColor: color }}>
      <div className="shrink-0 px-3 py-2 border-b border-cardBorder">
        <p className="text-[19px] font-extrabold text-white leading-[1.6] truncate">{title}</p>
        <p className="text-[13px] text-gray-400 flex gap-3 flex-wrap">
          <span><N value={rows.length} className="text-gray-200 font-bold" /> عميل</span>
          <span>الشهر <N value={month} className="text-brandYellow font-bold" /> باكت</span>
          <span>مديونية <N value={debt} className="text-brandOrange font-bold" /></span>
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {rows.length === 0 && <p className="text-center text-gray-500 py-8">مفيش عملاء</p>}
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1.5">
            <p className="sticky top-0 z-[1] bg-card/95 backdrop-blur text-[14px] font-bold text-gray-300 px-1 py-0.5 flex items-center gap-1">
              <MapPin size={13} style={{ color }} />
              {g.label}
              <span className="text-gray-500 font-semibold">({g.rows.length})</span>
            </p>
            <div className={wide ? "grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]" : "flex flex-col gap-1.5"}>
              {g.rows.map((row) => (
                <CustomerCard key={row.id} row={row} note={notes[row.id]} inactiveDays={inactiveDays} onOpen={() => onOpen(row.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ByRepView({ rows, reps, repFilter, notes, inactiveDays, onOpen }: {
  rows: CustomerRow[]; reps: CustomersRep[]; repFilter: string; notes: Record<string, CustomerNote>; inactiveDays: number; onOpen: (id: string) => void;
}) {
  const columns = [
    ...reps.map((r) => ({ id: r.id, title: `${r.name} · ${r.van}`, color: r.color })),
    { id: NO_REP, title: "بدون مندوب (مبيعات المصنع)", color: "#6B7280" },
  ]
    .filter((c) => repFilter === "all" || c.id === repFilter)
    .map((c) => ({ ...c, rows: rows.filter((r) => (r.repId ?? NO_REP) === c.id) }))
    .filter((c) => c.id !== NO_REP || c.rows.length > 0 || repFilter === NO_REP);
  return (
    <div className="h-full min-h-0 overflow-x-auto">
      <div
        className="h-full min-h-0 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(270px, 1fr))`, minWidth: columns.length * 280 }}
      >
        {columns.map((c) => (
          <RepColumn key={c.id} title={c.title} color={c.color} rows={c.rows} notes={notes} inactiveDays={inactiveDays} wide={columns.length === 1} onOpen={onOpen} />
        ))}
      </div>
    </div>
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

export default function CustomersPage() {
  const { data, error, isLoading, mutate } = useSWR<CustomersData>("/api/customers", fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [view, setView] = useState<View>("reps");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [area, setArea] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("top");
  const [openId, setOpenId] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState<Record<string, CustomerNote | null>>({});

  const reps = useMemo(() => new Map((data?.reps ?? []).map((r) => [r.id, r])), [data]);
  const notes = useMemo(() => {
    const out: Record<string, CustomerNote> = { ...(data?.notes ?? {}) };
    for (const [id, n] of Object.entries(localNotes)) {
      if (n) out[id] = n;
      else delete out[id];
    }
    return out;
  }, [data, localNotes]);
  const all = useMemo(() => data?.customers ?? [], [data]);
  const byRep = useMemo(() => (repFilter === "all" ? all : all.filter((r) => (r.repId ?? NO_REP) === repFilter)), [all, repFilter]);
  const rowsOf = useCallback((id: string) => all.filter((r) => (r.repId ?? NO_REP) === id), [all]);

  // الخطوة 2: مناطق المندوب المختار (الأكبر الأول) - step 2: the chosen rep's areas (biggest first)
  const areaChips = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const r of byRep) {
      const a = map.get(r.areaKey) ?? { key: r.areaKey, label: r.area ?? "بدون منطقة", count: 0 };
      a.count += 1;
      map.set(r.areaKey, a);
    }
    return Array.from(map.values()).sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : b.count - a.count));
  }, [byRep]);
  // الحالات بعددها (جوه المنطقة المختارة لو فيه) - status counts (within the chosen area, if any)
  const inArea = useMemo(() => (area === null ? byRep : byRep.filter((r) => r.areaKey === area)), [byRep, area]);

  const filtered = useMemo(() => {
    const q = normalizeArabic(query);
    const qDigits = query.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
    const inactiveDays = data?.inactiveDays ?? 14;
    const test = status === "lost" ? (r: CustomerRow) => isLost(r, inactiveDays) : STATUS.find((x) => x.id === status)?.test;
    const rows = inArea.filter((r) => {
      if (test && !test(r)) return false;
      if (q) {
        const inName = normalizeArabic(r.name).includes(q);
        const inMobile = qDigits.length >= 3 && (r.mobile ?? "").replace(/\D/g, "").includes(qDigits);
        if (!inName && !inMobile) return false;
      }
      return true;
    });
    return sortRows(rows, sort);
  }, [inArea, status, query, sort, data]);

  const kpi = useMemo(
    () => ({
      total: byRep.length,
      activeMonth: byRep.filter((r) => r.activeMonth).length,
      isNew: byRep.filter((r) => r.isNew).length,
      inactive: byRep.filter((r) => r.inactive).length,
      debt: byRep.reduce((t, r) => t + r.debt, 0),
    }),
    [byRep]
  );

  const insights = useMemo(
    () => (insightsOpen && data ? buildInsights(byRep, all, repFilter, reps, data.inactiveDays) : null),
    [insightsOpen, data, byRep, all, repFilter, reps]
  );

  const open = openId ? all.find((r) => r.id === openId) : undefined;
  const closePanel = useCallback(() => setOpenId(null), []);
  const closeInsights = useCallback(() => setInsightsOpen(false), []);
  const onNoteSaved = useCallback((id: string, note: CustomerNote | null) => setLocalNotes((was) => ({ ...was, [id]: note })), []);
  const pickRep = useCallback((id: string) => {
    setRepFilter(id);
    setArea(null);
    setStatus(null);
  }, []);
  const pickArea = useCallback((key: string) => {
    setArea(key);
    setView("reps");
  }, []);
  // اقتراح → قايمة العملاء بالفلتر بتاعه - a suggestion → the customers list with its filter
  const applyLink = useCallback((link: InsightLink) => {
    setRepFilter(link.rep);
    setArea(link.area);
    setStatus(link.status);
    setQuery("");
    setView("reps");
    setInsightsOpen(false);
  }, []);
  const selectedRep =
    repFilter === "all" ? null : repFilter === NO_REP ? { name: "بدون مندوب", van: "مبيعات المصنع", color: "#6B7280" } : reps.get(repFilter) ?? null;
  const areaLabel = area === null ? null : area === "" ? "بدون منطقة" : all.find((r) => r.areaKey === area)?.area ?? area;

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

      {/* نفس هيدر الداشبورد (اللوجو والساعة وملء الشاشة و F)، والحبة مكتوب فيها "العملاء" - the dashboard header, pill = "العملاء" */}
      <Header
        isConnected={!error}
        page={{ id: "customers", title: "العملاء" }}
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
        <main className="relative flex-1 min-h-0 flex flex-col gap-3 p-4">
          {/* سطر العنوان: رجوع، العنوان، البحث والترتيب، والأرقام - title row: back, title, search & sort, numbers */}
          <div className="shrink-0 flex flex-wrap items-center gap-3">
            <a
              href="/?page=sales"
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-cardBorder bg-card text-gray-300 hover:text-white hover:bg-cardBorder text-[14px] font-bold"
              title="رجوع لصفحة مبيعات المناديب"
            >
              <ArrowRight size={16} /> رجوع
            </a>
            <h1 className="text-[24px] font-extrabold text-white flex items-center gap-2">
              <Users className="text-brandOrange" size={24} /> العملاء
            </h1>
            <div className="relative">
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
              className="py-1 px-2 rounded-xl border border-cardBorder bg-card text-[14px] text-gray-200 outline-none focus:border-brandOrange"
              aria-label="الترتيب"
            >
              {SORTS.map((x) => (
                <option key={x.id} value={x.id}>
                  ترتيب: {x.label}
                </option>
              ))}
            </select>
            <div className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-gray-400">
              <span>
                <N value={kpi.total} className="text-white font-extrabold text-[17px]" /> عميل
              </span>
              <span>
                🟢 اشتروا الشهر ده <N value={kpi.activeMonth} className="text-statusGreen font-extrabold text-[17px]" />
              </span>
              <span>
                ✨ جداد <N value={kpi.isNew} className="text-sky-300 font-extrabold text-[17px]" />
              </span>
              <span>
                🔴 متوقفين <N value={kpi.inactive} className="text-statusRed font-extrabold text-[17px]" />
              </span>
              <span>
                💰 <Money value={kpi.debt} className="text-brandOrange font-extrabold text-[17px]" />
              </span>
            </div>
          </div>

          {/* الخطوة 1: كروت المناديب - step 1: the rep cards */}
          <div className="shrink-0 grid gap-3" style={{ gridTemplateColumns: `repeat(${data.reps.length + 1}, minmax(0, 1fr))` }}>
            <RepCard title="الكل" sub="كل العملاء" color="#9CA3AF" rows={all} selected={repFilter === "all"} onClick={() => pickRep("all")} />
            {data.reps.map((r) => (
              <RepCard key={r.id} title={r.name} sub={r.van} color={r.color} rows={rowsOf(r.id)} selected={repFilter === r.id} onClick={() => pickRep(r.id)} />
            ))}
          </div>

          {/* الخطوة 2 (بعد اختيار مندوب): الحالة بعددها ومناطقه - step 2 (after picking a rep): statuses with counts and his areas */}
          {selectedRep && (
            <div
              className="shrink-0 flex items-center gap-2 rounded-2xl border bg-card/80 px-3 py-2 min-w-0"
              style={{ borderColor: `${selectedRep.color}88`, borderInlineStartWidth: 4, borderInlineStartColor: selectedRep.color }}
            >
              <span className="shrink-0 flex items-center gap-1 text-[14px] font-bold text-white whitespace-nowrap">
                <Truck size={15} style={{ color: selectedRep.color }} /> {selectedRep.name}
              </span>
              <div className="shrink-0 flex items-center gap-1.5">
                {STATUS.map((x) => (
                  <button key={x.id} type="button" className={chip(status === x.id)} onClick={() => setStatus(status === x.id ? null : x.id)}>
                    {x.label} <span className="font-numbers text-gray-400">{inArea.filter(x.test).length}</span>
                  </button>
                ))}
                {/* "وقفوا قريب" بيظهر بس لما اقتراح يفتحه - "stopped recently" shows only when a suggestion opens it */}
                {status === "lost" && (
                  <button type="button" className={chip(true)} onClick={() => setStatus(null)} title="اشتروا آخر 3 شهور ووقفوا">
                    🚶 وقفوا قريب <span className="font-numbers text-gray-300">{inArea.filter((r) => isLost(r, data.inactiveDays)).length}</span> ✕
                  </button>
                )}
              </div>
              <span className="shrink-0 w-px h-6 bg-cardBorder mx-1" />
              <MapPin size={15} className="shrink-0 text-gray-500" />
              {/* المناطق بتتزحلق بالعرض - areas scroll sideways */}
              <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:thin]">
                <div className="flex items-center gap-1.5 w-max pb-0.5">
                  <button type="button" className={chip(area === null)} onClick={() => setArea(null)}>
                    كل المناطق <span className="font-numbers text-gray-400">{byRep.length}</span>
                  </button>
                  {areaChips.map((a) => (
                    <button key={a.key || "none"} type="button" className={chip(area === a.key)} onClick={() => setArea(area === a.key ? null : a.key)}>
                      {a.label} <span className="font-numbers text-gray-400">{a.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* التابات وزرار التحليل - the tabs and the insights button */}
          <div className="shrink-0 flex flex-wrap items-center gap-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`px-4 py-1.5 rounded-xl text-[16px] font-extrabold border transition-colors ${
                  view === v.id ? "bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white border-transparent" : "bg-card border-cardBorder text-gray-300 hover:bg-white/5"
                }`}
              >
                {v.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setInsightsOpen(true)}
              className="px-4 py-1.5 rounded-xl text-[16px] font-extrabold border border-sky-400/50 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20 transition-colors"
            >
              🧠 تحليل واقتراحات
            </button>
            {/* منطقة متختارة من غير مندوب (من تاب المناطق) - an area picked without a rep (from the areas tab) */}
            {!selectedRep && areaLabel !== null && (
              <button type="button" className={chip(true)} onClick={() => setArea(null)}>
                📍 {areaLabel} ✕
              </button>
            )}
            {!selectedRep && status !== null && (
              <button type="button" className={chip(true)} onClick={() => setStatus(null)}>
                {status === "lost" ? "🚶 وقفوا قريب" : STATUS.find((x) => x.id === status)?.label} ✕
              </button>
            )}
            <p className="ms-auto text-gray-400 text-[14px]">
              ظاهر <N value={filtered.length} className="text-white font-bold" /> من <N value={byRep.length} /> عميل
            </p>
          </div>

          <div className="flex-1 min-h-0">
            {view === "reps" && <ByRepView rows={filtered} reps={data.reps} repFilter={repFilter} notes={notes} inactiveDays={data.inactiveDays} onOpen={setOpenId} />}
            {view === "table" && <TableView rows={filtered} reps={reps} inactiveDays={data.inactiveDays} onOpen={setOpenId} />}
            {view === "areas" && <AreasView rows={filtered} reps={reps} onPick={pickArea} />}
            {view === "quality" && <QualityView rows={filtered} reps={reps} onOpen={setOpenId} />}
          </div>
        </main>
      )}

      {insights && data && (
        <InsightsPanel
          insights={insights}
          scope={selectedRep ? `${selectedRep.name} · ${selectedRep.van}` : "كل المناديب"}
          repId={repFilter}
          reps={reps}
          inactiveDays={data.inactiveDays}
          onPick={applyLink}
          onClose={closeInsights}
        />
      )}
      {open && data && (
        <CustomerPanel
          key={open.id}
          row={open}
          reps={reps}
          inactiveDays={data.inactiveDays}
          tags={data.tags}
          note={notes[open.id] ?? null}
          notesEnabled={data.notesEnabled}
          onNoteSaved={onNoteSaved}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
