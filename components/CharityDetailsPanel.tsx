"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ExternalLink, HandHeart, Vault, X } from "lucide-react";
import { CharityDetailOp, CharityDetails, CharityDuplicatePair, UnfundedCharity } from "@/lib/types";
import { formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";
import { monthName } from "./SalesCommon";

// لوحة تفاصيل صندوق صدقات (أو كل الصناديق): نفس شكل وسلوك لوحة المحافظ
// A charity fund's (or all funds') details panel: same look and behaviour as the wallets panel

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const n = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(value)}
  </span>
);

// الشهر ده بتوقيت مصر - this month in Cairo time
const cairoMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()).slice(0, 7);

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

const td = "px-2 min-[1600px]:px-2.5 border-b border-cardBorder/60 align-middle";

// فلتر: الكل / إيداع / صرف (الرصيد الافتتاحي في "الكل" بس) - filter: all / deposits / spending (opening only in "all")
export type CharityFilter = "all" | "in" | "out";
const FILTERS: { id: CharityFilter; label: string; on: string }[] = [
  { id: "all", label: "الكل", on: "border-brandOrange bg-brandOrange/15 text-brandOrange" },
  { id: "in", label: "إيداع", on: "border-statusGreen bg-statusGreen/15 text-statusGreen" },
  { id: "out", label: "صرف", on: "border-statusRed bg-statusRed/15 text-statusRed" },
];

// خانة في سطر ملخص الشهر - one box in the month summary row
function SummaryBox({ label, value, color, isCount = false }: { label: string; value: number; color: string; isCount?: boolean }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-background/60 border border-cardBorder px-3 py-1 text-center">
      <p className="text-gray-400 whitespace-nowrap text-[0.9em]">{label}</p>
      <p className={`font-extrabold text-[1.3em] leading-tight whitespace-nowrap ${color}`}>
        {n(value)}
        {!isCount && <span className="text-gray-500 text-[0.6em] font-semibold"> ج.م</span>}
      </p>
    </div>
  );
}

// صف عملية (والضغط عليه يفتح التفاصيل كاملة) - one operation row (click expands the full details)
function OpRow({ op, open, onToggle, showFund, columns }: { op: CharityDetailOp; open: boolean; onToggle: () => void; showFund: boolean; columns: number }) {
  // الرصيد الافتتاحي: سطر رمادي بس - the opening balance: a gray line only
  if (op.type === "opening") {
    return (
      <tr className="text-gray-500">
        <td colSpan={columns} className="px-4 border-b border-cardBorder/60 bg-background/30 leading-[1.9]">
          رصيد افتتاحي{showFund && <> — {toEnglishDigits(op.fund)}</>}: {n(op.amount)} ج.م
          <span className="text-gray-600"> · الرصيد بعدها {n(op.balanceAfter)}</span>
        </td>
      </tr>
    );
  }
  const incoming = op.type === "in";
  const text = [op.beneficiary, op.details].filter(Boolean).join(" — ");
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-white/5 ${open ? "bg-white/5" : ""}`}>
        <td className={`${td} text-center text-gray-300 whitespace-nowrap`}>
          <span dir="ltr" className="font-numbers tabular-nums">{shortDate(op.date)}</span>
          {op.lateDays > 1 && (
            <span className="block mx-auto w-fit rounded-full bg-brandOrange/15 text-brandOrange text-[0.8em] font-bold px-2 leading-[1.7]">
              اتسجلت متأخر {n(op.lateDays)} يوم
            </span>
          )}
        </td>
        {showFund && <td className={`${td} text-gray-100 font-semibold whitespace-nowrap`}>{toEnglishDigits(op.fund)}</td>}
        <td className={`${td} text-center whitespace-nowrap`}>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 font-bold leading-[1.8] ${
              incoming ? "bg-statusGreen/15 text-statusGreen" : "bg-statusRed/15 text-statusRed"
            }`}
          >
            {incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            {incoming ? "إيداع" : "صرف"}
          </span>
        </td>
        <td className={`${td} text-center font-bold whitespace-nowrap ${incoming ? "text-statusGreen" : "text-statusRed"}`}>{n(op.amount)}</td>
        <td className={`${td} text-center text-white font-semibold whitespace-nowrap`}>{n(op.balanceAfter)}</td>
        {/* البيان / لمين بياخد اللي فاضل من العرض، والنص كامل في التفاصيل - takes the leftover width; full text when opened */}
        <td className={`${td} text-gray-200 w-full max-w-0`}>
          <span className="flex items-center gap-2 min-w-0">
            {op.duplicate && (
              <span className="shrink-0 rounded-full bg-statusRed/20 text-statusRed font-bold px-2 text-[0.85em] leading-[1.8]">⚠ متسجلة مرتين</span>
            )}
            {op.source && (
              <span className="shrink-0 rounded-full bg-sky-400/15 text-sky-300 font-semibold px-2 text-[0.85em] leading-[1.8]" title={op.source.type}>
                🔗 من الخزنة <span dir="ltr" className="font-numbers">{op.source.name}</span>
              </span>
            )}
            <span className={`min-w-0 truncate ${op.duplicate?.uncounted ? "line-through decoration-statusRed/70" : ""}`} title={toEnglishDigits(text)}>
              {text ? toEnglishDigits(text) : <span className="text-gray-600">—</span>}
            </span>
          </span>
        </td>
        <td className={`${td} whitespace-nowrap`}>
          <span dir="ltr" className="block font-numbers text-gray-200 text-end">{op.id}</span>
        </td>
        <td className={`${td} text-gray-200 whitespace-nowrap`}>{op.owner || "—"}</td>
      </tr>
      {open && (
        <tr className="bg-white/5">
          <td colSpan={columns} className="px-4 py-3 border-b border-cardBorder/60">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0 flex flex-col gap-1 leading-[1.8]">
                <p className="text-gray-300">
                  <span className="text-gray-500">الخزينة: </span>
                  {toEnglishDigits(op.fund)}
                  <span className="text-gray-500"> · {incoming ? "إيداع" : "صرف"} </span>
                  <b className={incoming ? "text-statusGreen" : "text-statusRed"}>{n(op.amount)} ج.م</b>
                  <span className="text-gray-500"> · رصيد الخزينة بعدها </span>
                  {n(op.balanceAfter)} ج.م
                </p>
                {op.beneficiary && (
                  <p className="text-gray-100 whitespace-pre-wrap break-words">
                    <span className="text-gray-500">{incoming ? "من: " : "اتصرفت لـ: "}</span>
                    {toEnglishDigits(op.beneficiary)}
                  </p>
                )}
                <p className="text-gray-100 whitespace-pre-wrap break-words">
                  <span className="text-gray-500">البيان: </span>
                  {op.details ? toEnglishDigits(op.details) : <span className="text-gray-500">مفيش بيان</span>}
                </p>
                {op.source && (
                  <p className="text-sky-300">
                    🔗 اتسجلت لوحدها من مستند الخزنة{" "}
                    <a href={op.source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-bold underline underline-offset-2">
                      <span dir="ltr" className="font-numbers">{op.source.name}</span>
                    </a>{" "}
                    <span className="text-gray-500">({op.source.type})</span>
                  </p>
                )}
                {op.duplicate && (
                  <p className="text-statusRed font-semibold">
                    ⚠ متسجلة مرتين مع{" "}
                    <a href={op.duplicate.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline underline-offset-2">
                      <span dir="ltr" className="font-numbers">{op.duplicate.id}</span>
                    </a>
                    {op.duplicate.uncounted
                      ? " — دي اليدوية ومش محسوبة في الرصيد، ألغيها من ERPNext"
                      : " — دي اللي محسوبة، ألغي اليدوية من ERPNext"}
                  </p>
                )}
                <p className="text-gray-400">
                  سجّلها: <span className="text-gray-200">{op.owner || "—"}</span>
                  <span className="text-gray-500"> · وقت التسجيل </span>
                  <span dir="ltr" className="font-numbers text-gray-200">{op.creation}</span>
                </p>
              </div>
              <a
                href={op.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 flex items-center gap-2 rounded-xl border border-brandOrange/50 bg-brandOrange/10 text-brandOrange px-4 py-1.5 font-bold hover:bg-brandOrange/20"
              >
                <ExternalLink size={18} />
                افتح في ERPNext
              </a>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export interface CharityPanelTarget {
  fund: string | null; // null = كل الصناديق - all funds
  filter: CharityFilter; // الفلتر في الأول - the initial filter
  todayOnly: boolean; // "إجمالي صرف اليوم": النهارده بس - today only
  issues?: boolean; // من شيب التحذيرات: صندوق التحذيرات مفتوح - opened from a warning chip: the warnings box starts open
}

const link = "inline-flex items-center gap-1 font-bold text-brandOrange hover:underline underline-offset-2";

// صندوق التحذيرات: المتسجلة مرتين + صدقة من غير صندوق - the warnings box: recorded twice + no fund
function IssuesBox({ duplicates, unfunded, startOpen }: { duplicates: CharityDuplicatePair[]; unfunded: UnfundedCharity[] | null; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const noFund = unfunded ?? [];
  if (duplicates.length === 0 && noFund.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-cardBorder px-5 py-2 max-h-[40%] overflow-auto">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-3 font-bold">
        {duplicates.length > 0 && <span className="rounded-full bg-statusRed/15 text-statusRed px-3 leading-[1.9]">⚠ {n(duplicates.length)} صدقات مكررة</span>}
        {noFund.length > 0 && <span className="rounded-full bg-statusAmber/15 text-statusAmber px-3 leading-[1.9]">⚠ {n(noFund.length)} صدقة من غير صندوق</span>}
        <ChevronDown size={20} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5 leading-[1.8]">
          {duplicates.map((p) => (
            <p key={p.manual.id} className="rounded-lg border border-statusRed/40 bg-statusRed/[0.06] px-3 py-1 flex flex-wrap items-center gap-x-3">
              <b className="text-statusRed">⚠ متسجلة مرتين</b>
              <span className="text-gray-200">{toEnglishDigits(p.fund)}</span>
              <span className={p.type === "in" ? "text-statusGreen" : "text-statusRed"}>
                {p.type === "in" ? "إيداع" : "صرف"} {n(p.amount)} ج.م
              </span>
              <span className="text-gray-400">اتحسبت مرة واحدة (التلقائية)</span>
              <a href={p.manual.url} target="_blank" rel="noopener noreferrer" className={link}>
                <ExternalLink size={14} /> اليدوية <span dir="ltr" className="font-numbers">{p.manual.id}</span> {shortDate(p.manual.date)} (ألغيها)
              </a>
              <a href={p.auto.url} target="_blank" rel="noopener noreferrer" className={link}>
                <ExternalLink size={14} /> التلقائية <span dir="ltr" className="font-numbers">{p.auto.id}</span> {shortDate(p.auto.date)}
              </a>
              <a href={p.auto.source.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">
                🔗 <span dir="ltr" className="font-numbers">{p.auto.source.name}</span>
              </a>
            </p>
          ))}
          {noFund.map((u, i) => (
            <p key={`${u.voucherNo}-${i}`} className="rounded-lg border border-statusAmber/40 bg-statusAmber/[0.06] px-3 py-1 flex flex-wrap items-center gap-x-3">
              <b className="text-statusAmber">⚠ صدقة من غير صندوق</b>
              <span className="text-gray-300">{shortDate(u.date)}</span>
              <span className={u.type === "in" ? "text-statusGreen" : "text-statusRed"}>
                {u.type === "in" ? "إيداع" : "صرف"} {n(u.amount)} ج.م
              </span>
              <span className="text-gray-200 min-w-0 break-words">{u.text ? toEnglishDigits(u.text) : "مفيش بيان"}</span>
              {u.reason === "many" && <span className="text-gray-400">(فيه أكتر من صندوق: {u.funds.join(" و ")})</span>}
              <a href={u.url} target="_blank" rel="noopener noreferrer" className={link}>
                <ExternalLink size={14} /> افتح <span dir="ltr" className="font-numbers">{u.voucherNo}</span>
              </a>
            </p>
          ))}
          {noFund.length > 0 && (
            <p className="text-gray-500 text-[0.9em]">
              اكتب اسم الصندوق في بيان المستند (انتاج / تعبئة / خارجية 1 / خارجية 2) أو سجّلها بإيدك في Charity Transaction.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CharityDetailsPanel({ target, onClose }: { target: CharityPanelTarget; onClose: () => void }) {
  const allFunds = target.fund === null;
  const [month, setMonth] = useState(cairoMonth);
  const [filter, setFilter] = useState<CharityFilter>(target.filter);
  const [todayOnly, setTodayOnly] = useState(target.todayOnly);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const url = `/api/charity/details?month=${month}${allFunds ? "" : `&fund=${encodeURIComponent(target.fund ?? "")}`}`;
  const { data, error, isLoading } = useSWR<CharityDetails>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    keepPreviousData: true, // الشهر القديم يفضل باين لحد ما الجديد يوصل - the old month stays until the new one arrives
  });
  useIdleClose(onClose);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // العمليات يوم بيوم (الأحدث الأول)؛ الفلتر بيخفي الجنب التاني، والرصيد من كل العمليات
  // Operations day by day (newest first); the filter hides the other side, the balance uses every operation
  const days = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, CharityDetailOp[]>();
    for (const op of data.ops) byDay.set(op.date, [...(byDay.get(op.date) ?? []), op]);
    const result: { date: string; ops: CharityDetailOp[]; incoming: number; outgoing: number; balance: number }[] = [];
    for (const [date, all] of Array.from(byDay.entries())) {
      if (todayOnly && date !== data.today) continue;
      const ops = filter === "all" ? all : all.filter((o) => o.type === filter);
      if (ops.length === 0) continue;
      result.push({
        date,
        ops,
        incoming: all.filter((o) => o.type === "in").reduce((s, o) => s + o.amount, 0),
        outgoing: all.filter((o) => o.type === "out").reduce((s, o) => s + o.amount, 0),
        balance: all[0].balanceAfter,
      });
    }
    return result;
  }, [data, filter, todayOnly]);

  // تابات الشهور: الشهور اللي فيها عمليات + الشهر ده دايما - month tabs: months with operations + always this month
  const monthTabs = useMemo(() => {
    const list = data?.months ?? [];
    const current = cairoMonth();
    return list.includes(current) ? list : [current, ...list];
  }, [data]);

  const loadingMonth = !data || data.month !== month;
  const last = data?.lastOp;
  const columns = allFunds ? 8 : 7;
  const th = "px-2.5 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const tab = (active: boolean) =>
    `shrink-0 rounded-xl border px-4 py-1.5 font-semibold whitespace-nowrap ${
      active ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/70 text-gray-300 hover:border-gray-500"
    }`;
  const Icon = allFunds ? HandHeart : Vault;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1880px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان والرصيد - title and balance */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          <Icon size={26} className="text-emerald-400 shrink-0" />
          <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.6] whitespace-nowrap">
            {allFunds ? "كل خزاين الصدقات" : toEnglishDigits(target.fund ?? "")}
          </h2>
          {data && (
            <p className="flex items-baseline gap-2 whitespace-nowrap">
              <span
                dir="ltr"
                className={`font-numbers font-extrabold tabular-nums text-[32px] min-[1600px]:text-[38px] leading-tight ${
                  data.balance < 0 ? "text-statusRed" : "text-emerald-400"
                }`}
              >
                {formatNumber(data.balance)}
              </span>
              <span className="text-gray-400">ج.م</span>
            </p>
          )}
          <div className="ms-auto flex items-center gap-3">
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

        {/* آخر عملية وتابات الشهور - the last operation and the month tabs */}
        {data && (
          <div className="shrink-0 flex items-center gap-4 px-5 py-2.5 border-b border-cardBorder">
            <div className="shrink-0 flex items-center gap-x-3 gap-y-1 flex-wrap rounded-xl border border-cardBorder bg-background/60 px-4 py-1.5">
              <span className="text-gray-400">آخر عملية:</span>
              {last ? (
                <>
                  <span className="font-semibold text-white">
                    {formatDayName(last.date)}{" "}
                    {last.creation.slice(0, 10) === last.date && (
                      <span dir="ltr" className="font-numbers tabular-nums">{last.creation.slice(11, 16)}</span>
                    )}
                  </span>
                  <span className="text-gray-200">{last.owner || "—"}</span>
                  <span className="text-gray-400">({ago(now - last.createdAt)})</span>
                </>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
            {/* التابات كتير؟ بتعمل scroll بالعرض جوه السطر ده بس - many tabs scroll sideways inside this row only */}
            <div className="ms-auto min-w-0 flex items-center gap-2 overflow-x-auto pb-0.5">
              {monthTabs.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMonth(m);
                    setOpenId(null);
                    setTodayOnly(false);
                  }}
                  className={tab(month === m && !todayOnly)}
                >
                  {monthName(m)} <span dir="ltr" className="font-numbers">{m.slice(0, 4)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* الفلتر: الكل / إيداع / صرف (+ النهارده بس) - the filter: all / deposits / spending (+ today only) */}
        {data && (
          <div className="shrink-0 flex items-center gap-2 flex-wrap px-5 py-2 border-b border-cardBorder">
            {FILTERS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setFilter(x.id)}
                className={`shrink-0 rounded-xl border px-4 py-1.5 font-semibold whitespace-nowrap ${
                  filter === x.id ? x.on : "border-cardBorder bg-background/70 text-gray-300 hover:border-gray-500"
                }`}
              >
                {x.label}
              </button>
            ))}
            {todayOnly && (
              <button
                type="button"
                onClick={() => setTodayOnly(false)}
                className="shrink-0 flex items-center gap-1.5 rounded-xl border border-brandOrange bg-brandOrange/15 text-brandOrange px-4 py-1.5 font-semibold whitespace-nowrap"
              >
                النهارده بس
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* ملخص الشهر - the month summary */}
        {data && (
          <div className={`shrink-0 flex items-stretch gap-3 px-5 py-2.5 border-b border-cardBorder ${loadingMonth ? "opacity-50" : ""}`}>
            <SummaryBox label="رصيد أول الشهر" value={data.openingBalance} color="text-white" />
            <SummaryBox label="إجمالي الإيداع" value={data.totalIn} color="text-statusGreen" />
            <SummaryBox label="إجمالي الصرف" value={data.totalOut} color="text-statusRed" />
            <SummaryBox
              label={data.month === data.today.slice(0, 7) ? "الرصيد الحالي" : "رصيد آخر الشهر"}
              value={data.closingBalance}
              color="text-emerald-400"
            />
            <SummaryBox label="عدد العمليات" value={data.count} color="text-gray-100" isCount />
          </div>
        )}

        {data && <IssuesBox duplicates={data.duplicates} unfunded={data.unfunded} startOpen={!!target.issues} />}

        {/* العمليات (بتعمل scroll جوه اللوحة) - the operations (scroll inside the panel) */}
        <div className={`flex-1 min-h-0 overflow-auto ${loadingMonth && data ? "opacity-50" : ""}`}>
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error && !isLoading ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل العمليات..."}
            </div>
          ) : error && !isLoading && data.month !== month ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">غير متصل — جرب تاني بعد شوية</div>
          ) : days.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {todayOnly ? "مفيش عمليات النهارده" : filter !== "all" ? "مفيش عمليات من النوع ده في الشهر ده" : "لا توجد عمليات في الشهر ده"}
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-0 leading-[2]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className={`${th} text-center`}>التاريخ</th>
                  {allFunds && <th className={`${th} text-start`}>الخزينة</th>}
                  <th className={`${th} text-center`}>النوع</th>
                  <th className={`${th} text-center`}>المبلغ</th>
                  <th className={`${th} text-center`}>الرصيد بعدها</th>
                  <th className={`${th} text-start`}>البيان / لمين</th>
                  <th className={`${th} text-start`}>رقم المستند</th>
                  <th className={`${th} text-start`}>سجّلها</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <Fragment key={day.date}>
                    <tr>
                      <td colSpan={columns} className="px-4 py-1 border-b border-cardBorder bg-background/70 font-bold">
                        <span className="text-white">{formatDayName(day.date)}</span>
                        <span className="text-gray-500"> — </span>
                        {filter !== "out" && <span className="text-statusGreen">إيداع {n(day.incoming)}</span>}
                        {filter === "all" && <span className="text-gray-500"> · </span>}
                        {filter !== "in" && <span className="text-statusRed">صرف {n(day.outgoing)}</span>}
                        <span className="text-gray-500"> · </span>
                        <span className="text-gray-200">الرصيد آخر اليوم {n(day.balance)}</span>
                      </td>
                    </tr>
                    {day.ops.map((op) => (
                      <OpRow
                        key={op.id}
                        op={op}
                        open={openId === op.id}
                        onToggle={() => setOpenId(openId === op.id ? null : op.id)}
                        showFund={allFunds}
                        columns={columns}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
