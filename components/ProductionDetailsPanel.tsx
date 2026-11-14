"use client";

import { Fragment } from "react";
import { Flame, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ProductionData } from "@/lib/types";
import { formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";
import { formatKg, formatTons, monthDays, typeColor } from "@/lib/production-stats";
import { useIdleClose } from "@/lib/useIdleClose";
import { monthName } from "./SalesCommon";
import { ProductionTarget } from "./ProductionPage";

// لوحة تفاصيل فرن أو نوع: طرحات الشهر ده يوم بيوم بالأوزان (من نفس بيانات الصفحة، بتتحدث معاها)
// A kiln's or type's details: this month's exits day by day with weights (from the page data, refreshed with it)

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

export default function ProductionDetailsPanel({ data, target, onClose }: { data: ProductionData; target: ProductionTarget; onClose: () => void }) {
  useIdleClose(onClose);
  const { total, days } = monthDays(data, target.kind, target.name);
  const isKiln = target.kind === "kiln";
  const color = isKiln ? "#FF7A00" : typeColor(data, target.name);
  const status = isKiln ? data.kilns.find((k) => k.name === target.name)?.status : undefined;
  const unweighed = total.count - total.weighed;
  // كل أيام الشهر لحد النهارده (اليوم من غير طرحات = صفر) - every day of the month up to today (no exits = zero)
  const byDate = new Map(days.map((d) => [d.date, d.tally]));
  const daily = Array.from({ length: Number(data.today.slice(8)) }, (_, i) => {
    const tally = byDate.get(`${data.today.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
    return { day: i + 1, value: !tally ? 0 : total.weighed > 0 ? Math.round((tally.kg / 1000) * 100) / 100 : tally.count };
  });
  const th = "px-3 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const td = "px-3 border-b border-cardBorder/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1500px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          {isKiln ? <Flame size={32} className="text-brandOrange shrink-0" /> : <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.5] whitespace-nowrap">
            {isKiln ? toEnglishDigits(target.name) : <span style={{ color }}>{target.name}</span>}
            <span className="text-gray-400 font-semibold text-[0.7em]">
              {" "}
              — طرحات شهر {monthName(data.monthStart.slice(0, 7))} {n(data.monthStart.slice(0, 4))}
            </span>
          </h2>
          {status && (
            <span
              className={`rounded-full px-3 font-bold leading-[2] ${
                status === "working" ? "bg-statusGreen/15 text-statusGreen" : status === "maintenance" ? "bg-statusAmber/15 text-statusAmber" : "bg-statusRed/15 text-statusRed"
              }`}
            >
              {status === "working" ? "شغالة" : status === "maintenance" ? "صيانة" : "متوقفة"}
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

        <div className="shrink-0 flex items-stretch gap-3 px-5 py-3 border-b border-cardBorder">
          <Box label="إنتاج الشهر" value={formatTons(total.kg)} unit="طن" color="text-brandOrange" />
          <Box label="عدد الطرحات" value={formatNumber(total.count)} />
          <Box label="متوسط وزن الطرحة" value={total.weighed ? formatTons(total.kg / total.weighed) : "—"} unit={total.weighed ? "طن" : undefined} />
          <Box label="بدون وزن" value={formatNumber(unweighed)} unit="طرحة" color={unweighed ? "text-gray-300" : "text-gray-600"} />
          <Box label="أيام فيها طرحات" value={formatNumber(days.length)} unit="يوم" />
        </div>

        <div className="flex-1 min-h-0 grid gap-4 px-5 py-3" style={{ gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)" }}>
          {/* يوم بيوم - day by day */}
          <div className="min-h-0 overflow-auto rounded-xl border border-cardBorder">
            {days.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xl text-gray-400">لا توجد طرحات في الشهر ده</div>
            ) : (
              <table className="w-full border-separate border-spacing-0 leading-[2]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className={`${th} text-center`}>الساعة</th>
                    <th className={`${th} text-start`}>{isKiln ? "النوع" : "الفرن"}</th>
                    <th className={`${th} text-center`}>الوزن</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <Fragment key={day.date}>
                      <tr>
                        <td colSpan={3} className="px-4 py-0.5 border-b border-cardBorder bg-background/70 font-bold">
                          <span className="text-white">{formatDayName(day.date)}</span>
                          <span className="text-gray-500"> — </span>
                          <span className="text-gray-200">{n(formatNumber(day.tally.count))} طرحة</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-brandOrange">{n(formatTons(day.tally.kg))} طن</span>
                          {day.tally.count > day.tally.weighed && (
                            <span className="text-gray-500 font-normal"> ({day.tally.count - day.tally.weighed} بدون وزن)</span>
                          )}
                        </td>
                      </tr>
                      {day.exits.map((e) => {
                        const c = typeColor(data, e.type);
                        return (
                          <tr key={e.id} className="hover:bg-white/5">
                            <td className={`${td} text-center text-gray-300`}>{n(e.time)}</td>
                            <td className={`${td} font-semibold`}>
                              {isKiln ? (
                                <span className="inline-flex items-center gap-1.5" style={{ color: c }}>
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                                  {e.type || "غير محدد"}
                                </span>
                              ) : (
                                <span className="text-gray-100">{toEnglishDigits(e.kiln || "—")}</span>
                              )}
                            </td>
                            <td className={`${td} text-center`}>
                              {e.kg !== null ? (
                                <span className="text-white font-bold">
                                  {n(formatKg(e.kg))} <span className="text-gray-500 font-normal text-[0.85em]">كجم</span>
                                </span>
                              ) : (
                                <span className="text-gray-500">بدون وزن</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* رسم كل يوم - a bar per day */}
          <div className="min-h-0 rounded-xl bg-background/60 border border-cardBorder p-3 flex flex-col">
            <h4 className="font-bold text-white mb-1 shrink-0">{total.weighed > 0 ? "الأطنان كل يوم" : "عدد الطرحات كل يوم (مفيش أوزان)"}</h4>
            <div dir="ltr" className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#2a3346" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#9CA3AF", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#2a3346" }} interval={0} />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} tickLine={false} axisLine={false} width={44} allowDecimals={total.weighed > 0} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{ background: "#111827", border: "1px solid #2a3346", borderRadius: 10, direction: "rtl" }}
                    labelFormatter={(day) => `يوم ${day}`}
                    formatter={(value) => [total.weighed > 0 ? `${Number(value).toFixed(2)} طن` : `${value} طرحة`, ""]}
                  />
                  <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
