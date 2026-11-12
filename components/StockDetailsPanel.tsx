"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  Cylinder,
  Disc3,
  ExternalLink,
  Layers,
  LucideIcon,
  Package,
  ShoppingBag,
  Trees,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StockDetails, StockGroup, StockMove } from "@/lib/types";
import { formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";
import { monthName } from "./SalesCommon";

// لوحة تفاصيل كارت في أرصدة المخازن (الصفحة 2): الرصيد في المخازن / الحركة / ملخص الشهر
// A stock card's details panel (page 2): balance per warehouse / movements / month summary

// الكارت اللي اتداس عليه (من الصفحة نفسها، عشان رقم الكارت وحالة النقص) - the clicked card (number and low state come from the page)
export interface StockPanelTarget {
  group: StockGroup;
  name: string;
  variant: string | null;
  variants: string[]; // أنواع الكارت (فاضية = رقم واحد) - the card's variants (empty = one number)
  unit: string; // وحدة الكارت - the card's unit
  image?: string;
  icon?: string; // أيقونة مواد التعبئة - packaging icon key
  // ناقص (أقل من الحد الأدنى): الإجمالي وكل نوع - low (below the minimum): the total and each variant
  low: { total: boolean; variants: Record<string, boolean> };
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const GROUP_ICONS: Record<StockGroup, LucideIcon> = { packaged: Package, sacks: ShoppingBag, wood: Trees, packaging: Box };
const PACKAGING_ICONS: Record<string, LucideIcon> = { plastic: Layers, roll: Cylinder, bag: ShoppingBag, tape: Disc3 };
const GREEN = "#22C55E";
const RED = "#EF4444";

const n = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(value)}
  </span>
);

// الشهر ده بتوقيت مصر - this month in Cairo time
const cairoMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()).slice(0, 7);

// "2026-11-07" -> "7/11"
const shortDate = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day}/${month}`;
};

const erpLink = (base: string, move: StockMove) =>
  `${base}/app/${move.voucherType.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(move.voucherNo)}`;

// اسم المخزن من غير " - AC" - warehouse name without the company suffix
const shortWarehouse = (name: string) => name.replace(/\s*-\s*AC$/, "");

type Tab = "warehouses" | "moves" | "summary";
const TABS: { id: Tab; label: string }[] = [
  { id: "warehouses", label: "الرصيد في المخازن" },
  { id: "moves", label: "الحركة" },
  { id: "summary", label: "ملخص الشهر" },
];

const td = "px-2 min-[1600px]:px-2.5 border-b border-cardBorder/60 align-middle";

// صف حركة (والضغط عليه يفتح التفاصيل) - one movement row (click opens its details)
function MoveRow({ move, erpUrl, unit, open, onToggle }: { move: StockMove; erpUrl: string; unit: string; open: boolean; onToggle: () => void }) {
  const incoming = move.qty > 0;
  const muted = !move.inScope;
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-white/5 ${open ? "bg-white/5" : ""} ${muted ? "opacity-60" : ""}`}>
        <td className={`${td} text-center text-gray-300 whitespace-nowrap`}>
          <span dir="ltr" className="font-numbers tabular-nums">
            {shortDate(move.postingDate)} {move.postingTime}
          </span>
          {move.lateDays > 1 && (
            <span className="block mx-auto w-fit rounded-full bg-brandOrange/15 text-brandOrange text-[0.8em] font-bold px-2 leading-[1.7]">
              اتسجلت متأخر {n(move.lateDays)} يوم
            </span>
          )}
        </td>
        <td className={`${td} text-center whitespace-nowrap leading-tight py-1`}>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 font-bold leading-[1.8] ${
              incoming ? "bg-statusGreen/15 text-statusGreen" : "bg-statusRed/15 text-statusRed"
            }`}
          >
            {incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            {incoming ? "وارد" : "منصرف"}
          </span>
          <span className="block text-gray-500 text-[0.8em]">{move.category}</span>
        </td>
        <td className={`${td} text-center font-bold whitespace-nowrap ${incoming ? "text-statusGreen" : "text-statusRed"}`}>
          {n(Math.abs(move.qty))}
        </td>
        <td className={`${td} text-center text-white font-semibold whitespace-nowrap`}>
          {move.balanceAfter === null ? (
            <span className="text-gray-500 text-[0.85em] font-normal" title="المخزن ده مش داخل في رصيد الكارت">
              برّه الرصيد
            </span>
          ) : (
            n(move.balanceAfter)
          )}
        </td>
        <td className={`${td} text-gray-200 whitespace-nowrap`}>{shortWarehouse(move.warehouse)}</td>
        <td className={`${td} whitespace-nowrap leading-tight py-1`}>
          <span className="block text-gray-500 text-[0.8em]">
            {move.voucherType}
            {move.voucherLabel && move.voucherType === "Stock Entry" ? ` · ${move.voucherLabel}` : ""}
          </span>
          <span dir="ltr" className="block font-numbers text-gray-200 text-end">{move.voucherNo}</span>
        </td>
        {/* الطرف بياخد اللي فاضل من العرض بس - the party takes only the leftover width */}
        <td className={`${td} text-gray-200 w-full max-w-0`}>
          <span className="block truncate">
            {move.party || (move.van ? `العربية: ${move.van}` : <span className="text-gray-600">—</span>)}
            {move.party && move.van && <span className="text-gray-500"> · {move.van}</span>}
          </span>
        </td>
        <td className={`${td} text-gray-200 whitespace-nowrap`}>{move.owner}</td>
      </tr>
      {open && (
        <tr className="bg-white/5">
          <td colSpan={8} className="px-4 py-3 border-b border-cardBorder/60">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-8 gap-y-1 text-gray-200">
                <p><span className="text-gray-500">الصنف: </span>{toEnglishDigits(move.itemCode)}</p>
                <p><span className="text-gray-500">المخزن: </span>{move.warehouse}{!move.inScope && <span className="text-gray-500"> (برّه رصيد الكارت)</span>}</p>
                <p><span className="text-gray-500">الكمية: </span>{n(move.qty)} {unit}</p>
                <p><span className="text-gray-500">الرصيد بعدها: </span>{move.balanceAfter === null ? "—" : n(move.balanceAfter)}</p>
                <p><span className="text-gray-500">تاريخ الحركة: </span>{formatDayName(move.postingDate)} <span dir="ltr" className="font-numbers">{move.postingTime}</span></p>
                <p><span className="text-gray-500">وقت التسجيل: </span><span dir="ltr" className="font-numbers">{move.creation}</span> — {move.owner}</p>
                <p><span className="text-gray-500">المستند: </span>{move.voucherType} <span dir="ltr" className="font-numbers">{move.voucherNo}</span>{move.voucherLabel && ` (${move.voucherLabel})`}</p>
                <p><span className="text-gray-500">النوع: </span>{move.category}</p>
                {move.party && <p><span className="text-gray-500">العميل / المورد: </span>{move.party}</p>}
                {move.van && <p><span className="text-gray-500">العربية: </span>{move.van}</p>}
                {move.remarks && <p className="col-span-2 whitespace-pre-wrap break-words"><span className="text-gray-500">البيان: </span>{move.remarks}</p>}
              </div>
              {erpUrl && (
                <a
                  href={erpLink(erpUrl, move)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 flex items-center gap-2 rounded-xl border border-brandOrange/50 bg-brandOrange/10 text-brandOrange px-4 py-1.5 font-bold hover:bg-brandOrange/20"
                >
                  <ExternalLink size={18} />
                  افتح في ERPNext
                </a>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// خانة في سطر الملخص - one summary box
function SummaryBox({ label, value, unit, color }: { label: string; value: number; unit?: string; color: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-background/60 border border-cardBorder px-3 py-1 text-center">
      <p className="text-gray-400 whitespace-nowrap text-[0.9em]">{label}</p>
      <p className={`font-extrabold text-[1.3em] leading-tight whitespace-nowrap ${color}`}>
        {n(value)}
        {unit && <span className="text-gray-500 text-[0.6em] font-semibold"> {unit}</span>}
      </p>
    </div>
  );
}

// قايمة أسامي وكميات بشريط - a name / quantity list with bars
function RankList({ title, rows, total, unit, color }: { title: string; rows: { name: string; qty: number }[]; total?: number; unit: string; color: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.qty)));
  return (
    <div className="rounded-xl bg-background/60 border border-cardBorder p-3 min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="font-bold text-white">{title}</h4>
        {total !== undefined && (
          <span className="font-bold whitespace-nowrap" style={{ color }}>
            {n(total)} <span className="text-gray-500 text-[0.85em] font-normal">{unit}</span>
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-500">لا يوجد</p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row.name} className="grid items-center gap-3" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto" }}>
              <span className="truncate text-gray-200">{toEnglishDigits(row.name)}</span>
              <div className="h-2 rounded-full bg-cardBorder overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(Math.abs(row.qty) / max) * 100}%`, backgroundColor: color }} />
              </div>
              <span className="font-bold text-white whitespace-nowrap">{n(row.qty)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StockDetailsPanel({ target, onClose }: { target: StockPanelTarget; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("warehouses");
  const [variant, setVariant] = useState<string | null>(target.variant);
  const [month, setMonth] = useState(cairoMonth);
  const [openId, setOpenId] = useState<string | null>(null);
  useIdleClose(onClose);

  const params = new URLSearchParams({ group: target.group, name: target.name, month });
  if (variant) params.set("variant", variant);
  const { data, error, isLoading } = useSWR<StockDetails>(`/api/stock/details?${params}`, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    keepPreviousData: true, // القديم يفضل باين لحد ما الجديد يوصل - the old data stays until the new one arrives
  });
  const loadingNew = !!data && (data.month !== month || data.variant !== variant);

  // الحركات متجمعة بالأيام (الأحدث الأول) - movements grouped by day, newest first
  const days = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, StockMove[]>();
    for (const move of data.moves) byDay.set(move.postingDate, [...(byDay.get(move.postingDate) ?? []), move]);
    const totals = new Map(data.daily.map((d) => [d.date, d]));
    return Array.from(byDay, ([date, moves]) => ({ date, moves, in: totals.get(date)?.in ?? 0, out: totals.get(date)?.out ?? 0 }));
  }, [data]);

  // تابات الشهور: الشهور اللي فيها حركات + الشهر ده دايما - month tabs: months with movements + always this month
  const monthTabs = useMemo(() => {
    const list = data?.months.map((m) => m.month) ?? [];
    const current = cairoMonth();
    return list.includes(current) ? list : [current, ...list];
  }, [data]);

  const unit = target.unit || data?.unit || "";
  const low = variant ? target.low.variants[variant] ?? false : target.low.total;
  const Icon = (target.icon && PACKAGING_ICONS[target.icon]) || GROUP_ICONS[target.group];
  const counted = data?.warehouses.filter((w) => !w.excluded) ?? [];
  const excluded = data?.warehouses.filter((w) => w.excluded) ?? [];
  const maxQty = Math.max(1, ...(data?.warehouses.map((w) => Math.abs(w.qty)) ?? [1]));
  const th = "px-2.5 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const chip = (active: boolean) =>
    `shrink-0 rounded-xl border px-4 py-1.5 font-semibold whitespace-nowrap ${
      active ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/70 text-gray-300 hover:border-gray-500"
    }`;
  const isCurrentMonth = data ? data.to === data.today : true;

  const warehouseRow = (w: { warehouse: string; qty: number; excluded: boolean }) => (
    <div key={w.warehouse} className={`grid items-center gap-4 py-1.5 ${w.excluded ? "text-gray-500" : ""}`} style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,2fr) auto" }}>
      <span className={`truncate font-semibold ${w.excluded ? "text-gray-500" : "text-gray-100"}`}>{shortWarehouse(w.warehouse)}</span>
      <div className="h-3 rounded-full bg-cardBorder overflow-hidden">
        <div
          className={`h-full rounded-full ${w.excluded ? "bg-gray-500" : w.qty < 0 ? "bg-statusRed" : "bg-gradient-to-r from-brandYellow to-brandOrange"}`}
          style={{ width: `${(Math.abs(w.qty) / maxQty) * 100}%` }}
        />
      </div>
      <span className={`font-extrabold whitespace-nowrap text-[1.1em] ${w.excluded ? "text-gray-500" : w.qty < 0 ? "text-statusRed" : "text-white"}`}>
        {n(w.qty)} <span className="text-gray-500 text-[0.75em] font-normal">{unit}</span>
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1880px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان: الصورة، الاسم، الأكواد، الرصيد - header: image, name, item codes, balance */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          {target.image ? (
            <img src={target.image} alt={target.name} className="w-12 h-12 object-contain shrink-0" />
          ) : (
            <Icon size={34} className="text-brandOrange shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.5] whitespace-nowrap">
              {toEnglishDigits(target.name)}
              {variant && <span className="text-brandOrange"> — {toEnglishDigits(variant)}</span>}
            </h2>
            {data && (
              <p className="flex flex-wrap gap-1.5 text-[0.85em] leading-[1.6]">
                {data.itemCodes.map((code) => (
                  <span key={code} className="rounded-md bg-background/70 border border-cardBorder text-gray-300 px-2">
                    {toEnglishDigits(code)}
                  </span>
                ))}
              </p>
            )}
          </div>
          {data && (
            <p className={`flex items-baseline gap-2 whitespace-nowrap ${loadingNew ? "opacity-50" : ""}`}>
              <span
                dir="ltr"
                className={`font-numbers font-extrabold tabular-nums text-[32px] min-[1600px]:text-[38px] leading-tight ${
                  low ? "text-statusRed" : "bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent"
                }`}
              >
                {formatNumber(data.balance)}
              </span>
              <span className="text-gray-400">{unit}</span>
            </p>
          )}
          {low && (
            <span className="flex items-center gap-1.5 rounded-full border border-statusRed bg-statusRed/10 px-3 font-bold text-statusRed leading-[2] whitespace-nowrap">
              <AlertTriangle size={18} />
              محتاج نزوّد (أقل من الحد الأدنى)
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="ms-auto p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
          >
            <X size={26} />
          </button>
        </div>

        {/* التابات، الأنواع، الشهور - tabs, variants, months */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 border-b border-cardBorder">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={chip(tab === t.id)}>
              {t.label}
            </button>
          ))}
          {target.variants.length > 1 && (
            <div className="flex items-center gap-1.5 ms-3 ps-3 border-s border-cardBorder">
              {[null, ...target.variants].map((v) => (
                <button
                  key={v ?? "all"}
                  type="button"
                  onClick={() => {
                    setVariant(v);
                    setOpenId(null);
                  }}
                  className={`${chip(variant === v)} !px-3 !py-1`}
                >
                  {v === null ? "الكل" : toEnglishDigits(v)}
                </button>
              ))}
            </div>
          )}
          {tab !== "warehouses" && (
            // الشهور الكتير بتعمل scroll بالعرض جوه السطر ده بس - many months scroll sideways inside this row only
            <div className="ms-auto min-w-0 flex items-center gap-2 overflow-x-auto pb-0.5">
              {monthTabs.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMonth(m);
                    setOpenId(null);
                  }}
                  className={`${chip(month === m)} !px-3 !py-1`}
                >
                  {monthName(m)} <span dir="ltr" className="font-numbers">{m.slice(0, 4)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* المحتوى (بيعمل scroll جوه اللوحة) - the content (scrolls inside the panel) */}
        <div className={`flex-1 min-h-0 overflow-auto ${loadingNew ? "opacity-50" : ""}`}>
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error && !isLoading ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل التفاصيل..."}
            </div>
          ) : tab === "warehouses" ? (
            <div className="px-6 py-4 flex flex-col gap-4">
              <div>
                <h3 className="font-bold text-gray-300 mb-1">المخازن اللي داخلة في الرصيد</h3>
                {counted.length === 0 ? <p className="text-gray-500">لا يوجد</p> : counted.map(warehouseRow)}
              </div>
              {excluded.length > 0 && (
                <div className="pt-3 border-t border-cardBorder">
                  <h3 className="font-bold text-gray-500 mb-1">مش داخلة في رصيد الكارت (العربيات)</h3>
                  {excluded.map(warehouseRow)}
                </div>
              )}
            </div>
          ) : tab === "moves" ? (
            days.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xl text-gray-400">لا توجد حركات في الشهر ده</div>
            ) : (
              <table className="w-full border-separate border-spacing-0 leading-[2]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className={`${th} text-center`}>التاريخ والوقت</th>
                    <th className={`${th} text-center`}>النوع</th>
                    <th className={`${th} text-center`}>الكمية</th>
                    <th className={`${th} text-center`}>الرصيد بعدها</th>
                    <th className={`${th} text-start`}>المخزن</th>
                    <th className={`${th} text-start`}>المستند</th>
                    <th className={`${th} text-start`}>العميل / المورد / العربية</th>
                    <th className={`${th} text-start`}>سجّلها</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <Fragment key={day.date}>
                      <tr>
                        <td colSpan={8} className="px-4 py-1 border-b border-cardBorder bg-background/70 font-bold">
                          <span className="text-white">{formatDayName(day.date)}</span>
                          <span className="text-gray-500"> — </span>
                          <span className="text-statusGreen">وارد {n(day.in)}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-statusRed">منصرف {n(day.out)}</span>
                        </td>
                      </tr>
                      {day.moves.map((move) => (
                        <MoveRow
                          key={move.id}
                          move={move}
                          erpUrl={data.erpUrl}
                          unit={unit}
                          open={openId === move.id}
                          onToggle={() => setOpenId(openId === move.id ? null : move.id)}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <div className="px-5 py-3 flex flex-col gap-3">
              <div className="flex items-stretch gap-3">
                <SummaryBox label="رصيد أول الشهر" value={data.openingBalance} unit={unit} color="text-white" />
                <SummaryBox label="إجمالي الوارد" value={data.totalIn} unit={unit} color="text-statusGreen" />
                <SummaryBox label="إجمالي المنصرف" value={data.totalOut} unit={unit} color="text-statusRed" />
                <SummaryBox label={isCurrentMonth ? "الرصيد الحالي" : "رصيد آخر الشهر"} value={data.closingBalance} unit={unit} color="text-brandOrange" />
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <div className="flex flex-col gap-3 min-w-0">
                  {/* الوارد والمنصرف حسب النوع - in / out by type */}
                  <div className="rounded-xl bg-background/60 border border-cardBorder p-3">
                    <h4 className="font-bold text-white mb-1">حسب نوع الحركة</h4>
                    <table className="w-full leading-[1.9]">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-start font-semibold">النوع</th>
                          <th className="text-center font-semibold">وارد</th>
                          <th className="text-center font-semibold">منصرف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byCategory.map((c) => (
                          <tr key={c.category} className={c.in || c.out ? "" : "text-gray-600"}>
                            <td className="font-semibold">{c.category}</td>
                            <td className={`text-center font-bold ${c.in ? "text-statusGreen" : ""}`}>{n(c.in)}</td>
                            <td className={`text-center font-bold ${c.out ? "text-statusRed" : ""}`}>{n(c.out)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* رسم الوارد والمنصرف كل يوم - daily in vs out chart */}
                  <div className="rounded-xl bg-background/60 border border-cardBorder p-3">
                    <h4 className="font-bold text-white mb-1">
                      الوارد والمنصرف كل يوم
                      <span className="text-statusGreen font-semibold text-[0.85em]"> ■ وارد</span>
                      <span className="text-statusRed font-semibold text-[0.85em]"> ■ منصرف</span>
                    </h4>
                    <div dir="ltr" className="h-[200px] min-[1600px]:h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.daily.map((d) => ({ ...d, day: Number(d.date.slice(8)) }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke="#2a3346" vertical={false} />
                          <XAxis dataKey="day" tick={{ fill: "#9CA3AF", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#2a3346" }} interval={0} />
                          <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatNumber(v)} />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                            contentStyle={{ background: "#111827", border: "1px solid #2a3346", borderRadius: 10, direction: "rtl" }}
                            labelFormatter={(day) => `يوم ${day}`}
                            formatter={(value, key) => [formatNumber(Number(value)), key === "in" ? "وارد" : "منصرف"]}
                          />
                          <Bar dataKey="in" fill={GREEN} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                          <Bar dataKey="out" fill={RED} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-3 min-w-0">
                  {data.sales && (
                    <>
                      <RankList title="المبيعات الشهر ده — بالمندوب / العربية" rows={data.sales.byRep} total={data.sales.total} unit={unit} color={GREEN} />
                      <RankList title="بالعميل (أعلى 10)" rows={data.sales.byCustomer} unit={unit} color="#FF7A00" />
                    </>
                  )}
                  {data.raw && (
                    <>
                      <div className="flex items-stretch gap-3">
                        <SummaryBox label="استهلاك الشهر (للإنتاج)" value={data.raw.consumption} unit={unit} color="text-statusRed" />
                        <SummaryBox label="وارد الشهر (شراء)" value={data.raw.purchasesTotal} unit={unit} color="text-statusGreen" />
                      </div>
                      <RankList title="وارد الشهر بالمورد" rows={data.raw.bySupplier} unit={unit} color={GREEN} />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
