"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ExternalLink, Landmark, X } from "lucide-react";
import { TreasuryDetails, TreasuryMove } from "@/lib/types";
import { formatDayName, formatNumber } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

type Range = "today" | "week" | "half" | "month";
const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "النهارده" },
  { id: "week", label: "آخر 7 أيام" },
  { id: "half", label: "آخر 15 يوم" },
  { id: "month", label: "الشهر ده" },
];

const n = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(value)}
  </span>
);

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-11-07" -> "7/11" ، "2026-11-07 14:45" -> "7/11 14:45"
function shortDate(text: string): string {
  const [date, time] = text.split(" ");
  const [, month, day] = date.split("-").map(Number);
  return `${day}/${month}${time ? ` ${time}` : ""}`;
}

// من قد إيه بالمصري - how long ago, in Egyptian Arabic
function ago(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const count = (value: number, one: string, two: string, few: string, many: string) =>
    value === 1 ? `من ${one}` : value === 2 ? `من ${two}` : value <= 10 ? `من ${value} ${few}` : `من ${value} ${many}`;
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return count(minutes, "دقيقة", "دقيقتين", "دقايق", "دقيقة");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return count(hours, "ساعة", "ساعتين", "ساعات", "ساعة");
  return count(Math.floor(hours / 24), "يوم", "يومين", "أيام", "يوم");
}

const erpLink = (base: string, move: TreasuryMove) =>
  `${base}/app/${move.voucherType.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(move.voucherNo)}`;

const td = "px-2 min-[1600px]:px-2.5 border-b border-cardBorder/60 align-middle";

// صف حركة (والضغط عليه يفتح البيان كامل) - one movement row (click expands the full remarks)
function MoveRow({ move, erpUrl, open, onToggle }: { move: TreasuryMove; erpUrl: string; open: boolean; onToggle: () => void }) {
  const incoming = move.debit > 0;
  const amount = incoming ? move.debit : move.credit;
  const remarks = move.remarks.split("\n")[0];
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-white/5 ${open ? "bg-white/5" : ""}`}>
        <td className={`${td} text-center text-gray-300 whitespace-nowrap`}>
          <span dir="ltr" className="font-numbers tabular-nums">{shortDate(move.postingDate)}</span>
        </td>
        <td className={`${td} text-center text-gray-300 whitespace-nowrap`}>
          <span dir="ltr" className="font-numbers tabular-nums">{shortDate(move.creation)}</span>
          {move.lateDays > 1 && (
            <span className="block mx-auto w-fit rounded-full bg-brandOrange/15 text-brandOrange text-[0.8em] font-bold px-2 leading-[1.7]">
              اتسجلت متأخر {n(move.lateDays)} يوم
            </span>
          )}
        </td>
        <td className={`${td} text-center whitespace-nowrap`}>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 font-bold leading-[1.8] ${
              incoming ? "bg-statusGreen/15 text-statusGreen" : "bg-statusRed/15 text-statusRed"
            }`}
          >
            {incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            {incoming ? "وارد" : "منصرف"}
          </span>
        </td>
        <td className={`${td} text-center font-bold whitespace-nowrap ${incoming ? "text-statusGreen" : "text-statusRed"}`}>{n(amount)}</td>
        <td className={`${td} text-center text-white font-semibold whitespace-nowrap`}>{n(move.balanceAfter)}</td>
        <td className={`${td} text-gray-200`}>
          <span className="block truncate max-w-[14vw]" title={move.party}>{move.party || "—"}</span>
        </td>
        {/* البيان بياخد اللي فاضل من العرض بس (max-w-0) - remarks only take the leftover width */}
        <td className={`${td} text-gray-300 w-full max-w-0`}>
          <span className="block truncate">{remarks || <span className="text-gray-600">—</span>}</span>
        </td>
        <td className={`${td} whitespace-nowrap leading-tight py-1`}>
          <span className="block text-gray-500 text-[0.8em]">{move.voucherType}</span>
          <span dir="ltr" className="block font-numbers text-gray-200 text-end">{move.voucherNo}</span>
        </td>
        <td className={`${td} text-gray-200 whitespace-nowrap`}>{move.owner}</td>
      </tr>
      {open && (
        <tr className="bg-white/5">
          <td colSpan={9} className="px-4 py-3 border-b border-cardBorder/60">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {move.party && (
                  <p className="text-gray-300">
                    <span className="text-gray-500">الطرف: </span>
                    {move.party}
                  </p>
                )}
                <p className="text-gray-100 whitespace-pre-wrap break-words leading-[1.8]">
                  {move.remarks || <span className="text-gray-500">مفيش بيان</span>}
                </p>
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

// لوحة تفاصيل الخزنة - the treasury details panel
export default function TreasuryDetailsPanel({ onClose }: { onClose: () => void }) {
  const { data, error } = useSWR<TreasuryDetails>("/api/treasury/details", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  const [range, setRange] = useState<Range>("half");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useIdleClose(onClose);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // الأيام من النهارده لورا لحد أول يوم في المدى، وحركات كل يوم - days from today back to the range start, with their moves
  const days = useMemo(() => {
    if (!data) return [];
    const start =
      range === "today" ? data.today : range === "week" ? addDays(data.today, -6) : range === "half" ? addDays(data.today, -14) : data.monthStart;
    const byDay = new Map<string, TreasuryMove[]>();
    for (const move of data.moves) byDay.set(move.postingDate, [...(byDay.get(move.postingDate) ?? []), move]);
    const result: { date: string; moves: TreasuryMove[]; incoming: number; outgoing: number }[] = [];
    for (let date = data.today; date >= start; date = addDays(date, -1)) {
      const moves = byDay.get(date) ?? [];
      result.push({
        date,
        moves,
        incoming: moves.reduce((sum, m) => sum + m.debit, 0),
        outgoing: moves.reduce((sum, m) => sum + m.credit, 0),
      });
    }
    return result;
  }, [data, range]);

  const last = data?.lastEntry;
  const noEntryToday = !!data && (!last || last.creation.slice(0, 10) !== data.today);
  const th = "px-2.5 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const pill = "flex items-center gap-2 rounded-xl px-4 font-bold leading-[2] whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1880px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان والرصيد - title and balance */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          <Landmark size={26} className="text-brandOrange shrink-0" />
          <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.6] whitespace-nowrap">رصيد الخزنة</h2>
          {data && (
            <p className="flex items-baseline gap-2 whitespace-nowrap">
              <span
                dir="ltr"
                className="font-numbers font-extrabold tabular-nums text-[32px] min-[1600px]:text-[38px] leading-tight bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent"
              >
                {formatNumber(data.balance)}
              </span>
              <span className="text-gray-400">ج.م</span>
            </p>
          )}
          <div className="ms-auto flex items-center gap-3">
            {data && (
              <>
                <span className={`${pill} bg-statusGreen/15 text-statusGreen`}>وارد اليوم {n(data.incomingToday)}</span>
                <span className={`${pill} bg-statusRed/15 text-statusRed`}>منصرف اليوم {n(data.outgoingToday)}</span>
                <span className={`${pill} bg-gray-500/20 text-gray-200`}>حركات النهارده {n(data.movesToday)}</span>
              </>
            )}
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

        {/* آخر تسجيل وأزرار المدى - the last entry and the range buttons */}
        {data && (
          <div className="shrink-0 flex items-center gap-4 px-5 py-2.5 border-b border-cardBorder">
            <div
              className={`flex items-center gap-x-3 gap-y-1 flex-wrap rounded-xl border px-4 py-1.5 ${
                noEntryToday ? "border-brandOrange/60 bg-brandOrange/10" : "border-cardBorder bg-background/60"
              }`}
            >
              {noEntryToday && (
                <span className="flex items-center gap-1.5 text-brandOrange font-bold">
                  <AlertTriangle size={18} />
                  مفيش تسجيل على الخزنة النهارده
                </span>
              )}
              <span className="text-gray-400">آخر تسجيل على الخزنة:</span>
              {last ? (
                <>
                  <span className={`font-semibold ${noEntryToday ? "text-brandOrange" : "text-white"}`}>
                    {formatDayName(last.creation.slice(0, 10))}{" "}
                    <span dir="ltr" className="font-numbers tabular-nums">{last.creation.slice(11, 16)}</span>
                  </span>
                  <span className="text-gray-200">{last.owner}</span>
                  <span className={noEntryToday ? "text-brandOrange" : "text-gray-400"}>({ago(now - last.createdAt)})</span>
                </>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
            <div className="ms-auto flex items-center gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={`rounded-xl border px-4 py-1.5 font-semibold whitespace-nowrap ${
                    range === r.id
                      ? "border-brandOrange bg-brandOrange/15 text-brandOrange"
                      : "border-cardBorder bg-background/70 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* الحركات (بتعمل scroll جوه اللوحة) - the movements (scroll inside the panel) */}
        <div className="flex-1 min-h-0 overflow-auto">
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل الحركات..."}
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-0 leading-[2]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className={`${th} text-center`}>تاريخ الحركة</th>
                  <th className={`${th} text-center`}>وقت التسجيل</th>
                  <th className={`${th} text-center`}>النوع</th>
                  <th className={`${th} text-center`}>المبلغ</th>
                  <th className={`${th} text-center`}>الرصيد بعدها</th>
                  <th className={`${th} text-start`}>الطرف</th>
                  <th className={`${th} text-start`}>البيان</th>
                  <th className={`${th} text-start`}>رقم المستند</th>
                  <th className={`${th} text-start`}>سجّلها</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) =>
                  day.moves.length === 0 ? (
                    <tr key={day.date}>
                      <td colSpan={9} className="px-4 border-b border-cardBorder/60 text-gray-500 bg-background/30 leading-[1.9]">
                        {formatDayName(day.date)} — لا توجد حركات
                      </td>
                    </tr>
                  ) : (
                    <Fragment key={day.date}>
                      <tr>
                        <td colSpan={9} className="px-4 py-1 border-b border-cardBorder bg-background/70 font-bold">
                          <span className="text-white">{formatDayName(day.date)}</span>
                          <span className="text-gray-500"> — </span>
                          <span className="text-statusGreen">وارد {n(day.incoming)}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-statusRed">منصرف {n(day.outgoing)}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-gray-200">الرصيد آخر اليوم {n(day.moves[0].balanceAfter)}</span>
                        </td>
                      </tr>
                      {day.moves.map((move) => (
                        <MoveRow
                          key={move.id}
                          move={move}
                          erpUrl={data.erpUrl}
                          open={openId === move.id}
                          onToggle={() => setOpenId(openId === move.id ? null : move.id)}
                        />
                      ))}
                    </Fragment>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
