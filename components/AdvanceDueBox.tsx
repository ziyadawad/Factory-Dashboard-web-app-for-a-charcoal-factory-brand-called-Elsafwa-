"use client";

import { ExternalLink } from "lucide-react";
import { AdvanceDue } from "@/lib/types";
import { formatNumber } from "@/lib/format";

// صندوق "ميعاد الاستحقاق" لسلفة / قرض: القسط الجاي، الفاضل، المتأخر بالأحمر، وجدول السداد لو متاح
// The "ميعاد الاستحقاق" box of an advance / loan: next installment, what is left, overdue in red, the schedule when available

const n = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(Math.round(value * 100) / 100)}
  </span>
);
// "2026-12-01" -> "1/12/2026"
const d = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}/${date.slice(0, 4)}`;

const STATUS = {
  paid: { label: "✓ اتدفع", cls: "text-statusGreen" },
  pending: { label: "⏳ لسه", cls: "text-gray-300" },
  overdue: { label: "⚠ متأخر", cls: "text-statusRed font-bold" },
} as const;

export default function AdvanceDueBox({ due, compact = false, showAmounts = true }: { due: AdvanceDue; compact?: boolean; showAmounts?: boolean }) {
  return (
    <div className={`rounded-xl border ${due.overdue ? "border-statusRed/60 bg-statusRed/[0.07]" : "border-sky-400/40 bg-sky-400/[0.06]"} px-4 py-3 flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sky-300 font-extrabold">🗓 ميعاد الاستحقاق</span>
        <span className="text-gray-400 text-[0.9em]">{due.label}</span>
        {due.url && (
          <a
            href={due.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ms-auto inline-flex items-center gap-1 text-brandOrange font-bold text-[0.9em] hover:underline underline-offset-2"
          >
            <ExternalLink size={14} />
            افتح في ERPNext
          </a>
        )}
      </div>
      <p className={`font-extrabold ${compact ? "text-[1.05em]" : "text-[1.25em]"} ${due.overdue ? "text-statusRed" : "text-white"}`}>
        {showAmounts || due.kind === "salary_adjustment" ? due.text : due.text.replace(/[\d,.]+ ج\.م/g, "")}
      </p>
      {showAmounts && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.95em] text-gray-300">
          {due.monthly !== null && (
            <span>
              القسط الشهري: <b className="text-white">{n(due.monthly)} ج.م</b>
            </span>
          )}
          {due.left !== null && (
            <span>
              أقساط فاضلة: <b className="text-white">{n(due.left)}</b>
            </span>
          )}
          {due.remaining !== null && (
            <span>
              الباقي كله: <b className="text-white">{n(due.remaining)} ج.م</b>
            </span>
          )}
          {due.overdue && (
            <span className="text-statusRed font-bold">
              ⚠ متأخر {n(due.overdueCount)} قسط ({n(due.overdueAmount)} ج.م)
            </span>
          )}
          {due.periods !== null && (
            <span className="text-gray-400">
              {due.method ?? "السداد"}: {n(due.periods)} قسط{due.startDate && <> من {d(due.startDate)}</>}
            </span>
          )}
        </div>
      )}
      {due.note && <p className="text-[0.85em] text-gray-500">{due.note}</p>}
      {showAmounts && !compact && due.schedule.length > 0 && (
        <table className="w-full border-separate border-spacing-0 text-[0.95em] leading-[1.9]">
          <thead>
            <tr className="text-gray-400">
              <th className="px-2 text-start font-semibold border-b border-cardBorder">#</th>
              <th className="px-2 text-start font-semibold border-b border-cardBorder">التاريخ</th>
              <th className="px-2 text-center font-semibold border-b border-cardBorder">المبلغ</th>
              <th className="px-2 text-start font-semibold border-b border-cardBorder">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {due.schedule.map((row, i) => (
              <tr key={`${row.date}-${i}`} className={row.date === due.dueDate && row.status !== "paid" ? "bg-white/5" : ""}>
                <td className="px-2 border-b border-cardBorder/50 text-gray-500">{n(i + 1)}</td>
                <td className={`px-2 border-b border-cardBorder/50 ${row.status === "overdue" ? "text-statusRed" : "text-gray-200"}`}>
                  <span dir="ltr" className="font-numbers">{d(row.date)}</span>
                </td>
                <td className="px-2 border-b border-cardBorder/50 text-center text-white font-semibold">{n(row.amount)}</td>
                <td className={`px-2 border-b border-cardBorder/50 ${STATUS[row.status].cls}`}>{STATUS[row.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
