"use client";

import { ReactNode, useEffect } from "react";
import { BarChart3, Clock, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ProductionData } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { formatTons, ProductionSummary, summarize, Tally } from "@/lib/production-stats";
import { useIdleClose } from "@/lib/useIdleClose";
import { monthName } from "./SalesCommon";
import { ProductionTarget } from "./ProductionPage";
import { TypeBadge } from "./TypeBadge";

// لوحة "📊 ملخص الشهر" (من زرار في هيدر صفحة الإنتاج): الشهر حسب الفرن وحسب النوع (طرحات، ترولات، أطنان)،
// ورسم إنتاج النهارده بالساعة. نفس بيانات الصفحة (بتتحدث معاها). الضغط على فرن / نوع بيفتح تفاصيله يوم بيوم
// The "📊 ملخص الشهر" panel (from a button in the production page header): the month by kiln and by type (batches,
// trolleys, tons) and today's hourly chart. Same data as the page (refreshed with it). A kiln / type row opens its details

const n = (text: string) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {text}
  </span>
);

function Box({ label, value, unit, color = "text-white" }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-background/60 border border-cardBorder px-3 py-1 text-center">
      <p className="text-gray-400 whitespace-nowrap text-[0.9em]">{label}</p>
      <p className={`font-extrabold text-[1.4em] leading-tight whitespace-nowrap ${color}`}>
        {n(value)}
        {unit && <span className="text-gray-500 text-[0.6em] font-semibold"> {unit}</span>}
      </p>
    </div>
  );
}

// جدول: الاسم · طرحات · ترولات · أطنان - a table: name · batches · trolleys · tons
function MonthTable({ title, rows, onOpen }: { title: string; rows: { key: string; label: ReactNode; t: Tally }[]; onOpen: (key: string) => void }) {
  const th = "px-3 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  return (
    <div className="min-h-0 min-w-0 overflow-auto rounded-xl border border-cardBorder">
      <table className="w-full border-separate border-spacing-0 leading-[2.2]">
        <thead className="sticky top-0 bg-card">
          <tr>
            <th className={`${th} text-start`}>{title}</th>
            <th className={`${th} text-center`}>طرحات</th>
            <th className={`${th} text-center`}>ترولات</th>
            <th className={`${th} text-center`}>أطنان</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={() => onOpen(r.key)} className="cursor-pointer hover:bg-white/5" title="تفاصيل يوم بيوم">
              <td className="px-3 border-b border-cardBorder/60 font-semibold text-gray-100 whitespace-nowrap">{r.label}</td>
              <td className={`px-3 border-b border-cardBorder/60 text-center font-bold ${r.t.batches ? "text-white" : "text-gray-600"}`}>{n(formatNumber(r.t.batches))}</td>
              <td className={`px-3 border-b border-cardBorder/60 text-center ${r.t.count ? "text-gray-200" : "text-gray-600"}`}>{n(formatNumber(r.t.count))}</td>
              <td className={`px-3 border-b border-cardBorder/60 text-center font-bold ${r.t.kg ? "text-brandOrange" : "text-gray-600"}`}>
                {n(formatTons(r.t.kg))} <span className="text-gray-500 font-normal text-[0.85em]">طن</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// رسم النهارده بالساعة - today's hourly chart
function HourlyChart({ s }: { s: ProductionSummary }) {
  const byTons = s.today.weighed > 0;
  const current = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const rows = s.hours.map((h) => ({ ...h, value: byTons ? Math.round(h.tons * 100) / 100 : h.count }));
  return (
    <div dir="ltr" className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#232B40" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 13 }} tickLine={false} axisLine={{ stroke: "#232B40" }} interval={0} />
          <YAxis
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={byTons}
            tickFormatter={(v: number) => (byTons ? v.toFixed(1) : formatNumber(v))}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.hour} fill={r.hour === current ? "#FFC107" : "#FF7A00"} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              fill="#E5E7EB"
              fontSize={12}
              formatter={(v: unknown) => (Number(v) > 0 ? (byTons ? Number(v).toFixed(2) : String(v)) : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ProductionMonthPanel({
  data,
  onClose,
  onOpen,
}: {
  data: ProductionData;
  onClose: () => void;
  onOpen: (target: ProductionTarget) => void;
}) {
  useIdleClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const s = summarize(data);
  const m = s.month;
  const unweighed = m.count - m.weighed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="ملخص الشهر">
      <div
        className="w-full h-full max-w-[1500px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          <BarChart3 size={30} className="text-brandOrange shrink-0" />
          <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.5] whitespace-nowrap">
            ملخص الشهر
            <span className="text-gray-400 font-semibold text-[0.7em]">
              {" "}
              — {monthName(data.monthStart.slice(0, 7))} {n(data.monthStart.slice(0, 4))}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="ms-auto p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
          >
            <X size={26} />
          </button>
        </div>

        <div className="shrink-0 flex items-stretch gap-3 px-5 py-3 border-b border-cardBorder">
          <Box label="إنتاج الشهر (صافي)" value={formatTons(m.kg)} unit="طن" color="text-brandOrange" />
          <Box label="عدد الطرحات" value={formatNumber(m.batches)} />
          <Box label="عدد الترولات" value={formatNumber(m.count)} />
          <Box label="متوسط وزن الطرحة" value={m.weighedBatches ? formatTons(m.batchKg / m.weighedBatches) : "—"} unit={m.weighedBatches ? "طن" : undefined} />
          <Box label="بدون وزن" value={formatNumber(unweighed)} unit="ترول" color={unweighed ? "text-gray-300" : "text-gray-600"} />
        </div>

        <div className="flex-1 min-h-0 grid gap-4 px-5 py-3" style={{ gridTemplateRows: "minmax(0,1fr) minmax(0,0.9fr)" }}>
          <div className="min-h-0 grid grid-cols-2 gap-4">
            <MonthTable
              title="الفرن"
              rows={s.kilns.map((k) => ({ key: k.name, label: toEnglishDigits(k.name), t: k.month }))}
              onOpen={(name) => onOpen({ kind: "kiln", name })}
            />
            <MonthTable
              title="النوع"
              rows={s.types.map((t) => ({
                key: t.label,
                label: <TypeBadge label={t.label} iconSize={20} />,
                t: t.month,
              }))}
              onOpen={(name) => onOpen({ kind: "type", name })}
            />
          </div>
          {/* النهارده بالساعة - today, hour by hour */}
          <div className="min-h-0 rounded-xl bg-background/60 border border-cardBorder p-3 flex flex-col">
            <h3 className="shrink-0 flex items-center gap-2 font-bold text-white mb-1">
              <Clock size={20} className="text-brandOrange" /> الإنتاج بالساعة النهارده
              <span className="text-gray-500 font-normal text-[0.85em]">{s.today.weighed > 0 ? "(طن في الساعة)" : "(عدد الترولات — مفيش أوزان)"}</span>
            </h3>
            <HourlyChart s={s} />
          </div>
        </div>
      </div>
    </div>
  );
}
