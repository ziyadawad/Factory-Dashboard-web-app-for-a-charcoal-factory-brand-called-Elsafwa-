"use client";

import { Fragment, useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronLeft, Truck, X } from "lucide-react";
import { RepDetails, RepSales } from "@/lib/types";
import { formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";
import { monthName, Num, Percent } from "./SalesCommon";

// لو محدش لمس اللوحة دقيقة تقفل لوحدها - closes by itself after 60 s without any touch
const IDLE_CLOSE_MS = 60_000;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// خانة رقم: الصفر "—" باهت، والسالب (مرتجع) أحمر - a number cell: zero is a dimmed "—", negative (returns) in red
function Cell({ value, strong = false, money = false }: { value: number; strong?: boolean; money?: boolean }) {
  if (!value) return <td className="px-2 text-center text-gray-600">—</td>;
  return (
    <td className={`px-2 text-center ${value < 0 ? "text-statusRed" : strong ? "text-brandYellow font-bold" : "text-gray-100"}`}>
      <span dir="ltr" className="font-numbers tabular-nums whitespace-nowrap">
        {money ? formatNumber(Math.round(value)) : formatNumber(value)}
      </span>
    </td>
  );
}

// لوحة تفاصيل المندوب: جدول يوم بيوم، والضغط على اليوم يفتح فواتيره
// The rep details panel: a day-by-day table; clicking a day shows its invoices
export default function RepDetailsPanel({ rep, onClose }: { rep: RepSales; onClose: () => void }) {
  const { data, error } = useSWR<RepDetails>(`/api/sales/rep?rep=${encodeURIComponent(rep.name)}`, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Esc يقفل، وأي لمسة تعيد عداد الدقيقة - Esc closes; any touch restarts the 60 s idle timer
  useEffect(() => {
    let timer = setTimeout(onClose, IDLE_CLOSE_MS);
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(onClose, IDLE_CLOSE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else touch();
    };
    const events = ["pointerdown", "pointermove", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    window.addEventListener("scroll", touch, { passive: true, capture: true });
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, touch));
      window.removeEventListener("scroll", touch, { capture: true });
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const percent = rep.target > 0 ? Math.round((rep.monthPackets / rep.target) * 100) : 0;
  const reached = rep.target > 0 && rep.monthPackets >= rep.target;
  const columns = data?.columns ?? [];
  const th = "px-2 py-2 text-center font-semibold text-gray-400 whitespace-nowrap";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full h-full max-w-[1880px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان - header */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          <h2 className="font-extrabold text-white text-[26px] leading-[1.6] truncate">{toEnglishDigits(rep.name)}</h2>
          <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-brandOrange/40 bg-brandOrange/10 text-brandOrange px-3 font-semibold text-lg leading-[1.75]">
            <Truck size={20} />
            {toEnglishDigits(rep.van)}
          </span>
          <span className="text-gray-400 text-lg whitespace-nowrap">شهر {monthName(data?.month ?? "")}</span>
          <div className="ms-auto flex items-center gap-5 whitespace-nowrap">
            <p className="text-lg text-gray-400">
              الإجمالي{" "}
              <Num value={rep.monthPackets} className={`text-[28px] font-extrabold ${reached ? "text-statusGreen" : "text-white"}`} /> باكت
            </p>
            <p className="text-lg text-gray-400">
              التارجت <Num value={rep.target} className="text-gray-200 font-bold" />{" "}
              <Percent value={percent} className={`text-[26px] font-extrabold ${reached ? "text-statusGreen" : "text-brandOrange"}`} />
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
            >
              <X size={26} />
            </button>
          </div>
        </div>

        {/* الجدول (بيعمل scroll جوه اللوحة) - the table (scrolls inside the panel) */}
        <div className="flex-1 min-h-0 overflow-auto">
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل التفاصيل..."}
            </div>
          ) : data.days.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">لسه مفيش بيع الشهر ده</div>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-[16px] leading-[2.1]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className={`${th} text-start ps-5 border-b border-cardBorder`}>التاريخ</th>
                  {columns.map((label) => (
                    <th key={label} className={`${th} border-b border-cardBorder`}>
                      {label}
                    </th>
                  ))}
                  <th className={`${th} border-b border-cardBorder text-gray-200`}>إجمالي الباكت</th>
                  <th className={`${th} border-b border-cardBorder`}>إجمالي المبلغ (ج.م)</th>
                  <th className={`${th} border-b border-cardBorder`}>عدد العملاء</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => {
                  const open = openDay === day.date;
                  return (
                    <Fragment key={day.date}>
                      <tr
                        onClick={() => setOpenDay(open ? null : day.date)}
                        className={`cursor-pointer ${open ? "bg-brandOrange/10" : "hover:bg-white/5"}`}
                      >
                        <td className="ps-3 pe-2 border-b border-cardBorder/60 whitespace-nowrap text-gray-200 font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            {open ? <ChevronDown size={18} className="text-brandOrange" /> : <ChevronLeft size={18} className="text-gray-500" />}
                            {formatDayName(day.date)}
                          </span>
                        </td>
                        {day.columns.map((value, i) => (
                          <Cell key={i} value={value} />
                        ))}
                        <Cell value={day.packets} strong />
                        <Cell value={day.amount} money />
                        <Cell value={day.customers} />
                      </tr>
                      {open &&
                        day.invoices.map((invoice) => (
                          <tr key={invoice.id} className="bg-background/60 text-[15px] leading-[1.9]">
                            <td className="ps-10 pe-2 border-b border-cardBorder/40 text-gray-300 max-w-[260px] truncate" title={invoice.id}>
                              {toEnglishDigits(invoice.customer)}
                            </td>
                            {invoice.columns.map((value, i) => (
                              <Cell key={i} value={value} />
                            ))}
                            <Cell value={invoice.packets} strong />
                            <Cell value={invoice.amount} money />
                            <td className="px-2 text-center text-statusRed text-sm">{invoice.isReturn ? "مرتجع" : ""}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
              {/* إجمالي الشهر (لازم يساوي الكارت) - month totals (must equal the card) */}
              <tfoot className="sticky bottom-0 z-10 bg-card">
                <tr className="font-bold">
                  <td className="ps-5 pe-2 border-t-2 border-brandOrange/50 text-white whitespace-nowrap">إجمالي الشهر</td>
                  {data.total.columns.map((value, i) => (
                    <td key={i} className="px-2 text-center border-t-2 border-brandOrange/50">
                      {value ? <Num value={value} className="text-white" /> : <span className="text-gray-600">—</span>}
                    </td>
                  ))}
                  <td className="px-2 text-center border-t-2 border-brandOrange/50">
                    <Num value={data.total.packets} className="text-brandYellow text-[18px] font-extrabold" />
                  </td>
                  <td className="px-2 text-center border-t-2 border-brandOrange/50">
                    <Num value={Math.round(data.total.amount)} className="text-white" />
                  </td>
                  <td className="px-2 text-center border-t-2 border-brandOrange/50">
                    <Num value={data.total.customers} className="text-gray-300" />
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
