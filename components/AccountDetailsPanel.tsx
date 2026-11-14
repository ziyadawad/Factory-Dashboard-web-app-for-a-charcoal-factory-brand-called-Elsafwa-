"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ExternalLink, Landmark, Wallet, X } from "lucide-react";
import { AccountDetails, AccountMove, MoveOut } from "@/lib/types";
import { formatDayName, formatNumber } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";
import { monthName } from "./SalesCommon";

// لوحة تفاصيل حساب مشتركة: كارت الخزنة (الرئيسية) وكروت المحافظ (الخزن والمحافظ)
// Shared account details panel: the treasury card (main page) and the wallet cards (wallets page)
// mode "recent" = آخر 15 يوم / الشهر ده بأزرار مدى (الخزنة)، mode "months" = تابات بالشهور، شهر واحد في الطلب (المحافظ)
// mode "recent" = last 15 days / this month with range buttons (treasury); "months" = month tabs, one month per request (wallets)

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

const erpLink = (base: string, move: AccountMove) =>
  `${base}/app/${move.voucherType.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(move.voucherNo)}`;

const td = "px-2 min-[1600px]:px-2.5 border-b border-cardBorder/60 align-middle";

// فلتر المنصرف - the outgoing filter chips
type Filter = "all" | MoveOut["category"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "employee", label: "سلف وموظفين" },
  { id: "supplier", label: "موردين" },
  { id: "expense", label: "مصروفات" },
];

// لون بادج نوع الصرف - the colour of a payment-type badge
const KIND_STYLE: Record<string, string> = {
  سلفة: "bg-amber-400/20 text-amber-300",
  مرتب: "bg-sky-400/20 text-sky-300",
  يومية: "bg-sky-400/20 text-sky-300",
  إضافي: "bg-sky-400/20 text-sky-300",
  عهدة: "bg-purple-400/20 text-purple-300",
  مورد: "bg-blue-400/20 text-blue-300",
};
const LINK_LABEL: Record<NonNullable<MoveOut["link"]>, string> = {
  loan: "بتتخصم من المرتب (سلفة Loan) ✓",
  adjustment: "مربوطة بتسوية المرتب ✓",
  employee_advance: "مربوطة بـ Employee Advance ✓",
};

// لمين وليه (للمنصرف)، أو الطرف (للوارد) - who and why (outgoing), or the party (incoming)
function PartyCell({ move }: { move: AccountMove }) {
  const out = move.out;
  if (!out) return <span className="block truncate max-w-[16vw]" title={move.party}>{move.party || "—"}</span>;
  // المصروفات من غير اسم: الحسابات مكان الاسم - an expense with no name shows its accounts instead
  const named = out.name || (out.category === "expense" ? "" : move.party);
  const name = named || out.account;
  return (
    <span className="flex flex-col leading-[1.5] py-0.5 max-w-[20vw]">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`shrink-0 rounded-full px-2 text-[0.8em] font-bold ${KIND_STYLE[out.kind] ?? "bg-gray-500/20 text-gray-300"}`}>{out.kind}</span>
        <span className="truncate text-gray-100 font-semibold" title={name}>{name || <span className="text-gray-500">—</span>}</span>
      </span>
      {out.account && named && (
        <span className="truncate text-[0.8em] text-gray-500" title={out.account}>
          {out.account}
        </span>
      )}
      {out.link && <span className="text-[0.8em] text-statusGreen font-semibold">{LINK_LABEL[out.link]}</span>}
      {out.warn && <span className="text-[0.8em] text-brandOrange font-bold">⚠ سلفة مش متسجلة على المرتب</span>}
    </span>
  );
}

// صف حركة (والضغط عليه يفتح البيان كامل) - one movement row (click expands the full remarks)
function MoveRow({
  move,
  erpUrl,
  open,
  onToggle,
  showPostingDate,
  columns,
}: {
  move: AccountMove;
  erpUrl: string;
  open: boolean;
  onToggle: () => void;
  showPostingDate: boolean;
  columns: number;
}) {
  const incoming = move.debit > 0;
  const amount = incoming ? move.debit : move.credit;
  const remarks = move.remarks.split("\n")[0];
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-white/5 ${open ? "bg-white/5" : ""}`}>
        {showPostingDate && (
          <td className={`${td} text-center text-gray-300 whitespace-nowrap`}>
            <span dir="ltr" className="font-numbers tabular-nums">{shortDate(move.postingDate)}</span>
          </td>
        )}
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
          <PartyCell move={move} />
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
          <td colSpan={columns} className="px-4 py-3 border-b border-cardBorder/60">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {move.out ? (
                  <p className="text-gray-300">
                    <span className="text-gray-500">اتصرف لـ: </span>
                    {move.out.name || (move.out.category === "expense" ? move.out.account : move.party) || "—"}
                    <span className="text-gray-500"> — {move.out.kind}</span>
                    {move.out.account && <span className="text-gray-500"> ({move.out.account})</span>}
                  </p>
                ) : (
                  move.party && (
                    <p className="text-gray-300">
                      <span className="text-gray-500">الطرف: </span>
                      {move.party}
                    </p>
                  )
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

export interface AccountDetailsPanelProps {
  accountNumber: string; // رقم الحساب في دليل الحسابات (1110، 1112...) - Chart of Accounts number
  title: string; // اسم الكارت - the card's name
  mode: "recent" | "months";
  onClose: () => void;
}

export default function AccountDetailsPanel({ accountNumber, title, mode, onClose }: AccountDetailsPanelProps) {
  const months = mode === "months";
  const [month, setMonth] = useState(cairoMonth);
  const url = `/api/account/details?account=${encodeURIComponent(accountNumber)}${months ? `&month=${month}` : ""}`;
  const { data, error, isLoading } = useSWR<AccountDetails>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    keepPreviousData: true, // الشهر القديم يفضل باين لحد ما الجديد يوصل - the old month stays until the new one arrives
  });
  const [range, setRange] = useState<Range>("half");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAdvances, setShowAdvances] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useIdleClose(onClose);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // الأيام من آخر يوم لورا لحد أول يوم، وحركات كل يوم (في الشهور الأيام الفاضية مش بتظهر)
  // Days from the last day back to the first, with their moves (month mode skips empty days)
  const days = useMemo(() => {
    if (!data) return [];
    const start = months
      ? data.from
      : range === "today"
        ? data.today
        : range === "week"
          ? addDays(data.today, -6)
          : range === "half"
            ? addDays(data.today, -14)
            : data.monthStart;
    const byDay = new Map<string, AccountMove[]>();
    for (const move of data.moves) byDay.set(move.postingDate, [...(byDay.get(move.postingDate) ?? []), move]);
    const result: { date: string; moves: AccountMove[]; incoming: number; outgoing: number; balance: number }[] = [];
    for (let date = data.to; date >= start; date = addDays(date, -1)) {
      const all = byDay.get(date) ?? [];
      // الفلتر بيخفي الحركات بس، ومجاميع اليوم والرصيد من كل الحركات - the filter hides rows; day totals use every move
      const moves = filter === "all" ? all : all.filter((m) => m.out?.category === filter);
      if ((months || filter !== "all") && moves.length === 0) continue;
      result.push({
        date,
        moves,
        incoming: all.reduce((sum, m) => sum + m.debit, 0),
        outgoing: all.reduce((sum, m) => sum + m.credit, 0),
        balance: all[0]?.balanceAfter ?? 0,
      });
    }
    return result;
  }, [data, range, months, filter]);

  // تابات الشهور: الشهور اللي فيها حركات + الشهر ده دايما - month tabs: months with movements + always this month
  const monthTabs = useMemo(() => {
    const list = data?.months.map((m) => m.month) ?? [];
    const current = cairoMonth();
    return list.includes(current) ? list : [current, ...list];
  }, [data]);

  const loadingMonth = months && (!data || data.month !== month);
  const last = data?.lastEntry;
  const noEntryToday = !!data && (!last || last.creation.slice(0, 10) !== data.today);
  const columns = months ? 8 : 9;
  const th = "px-2.5 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const pill = "flex items-center gap-2 rounded-xl px-4 font-bold leading-[2] whitespace-nowrap";
  const Icon = months ? Wallet : Landmark;
  const tab = (active: boolean) =>
    `shrink-0 rounded-xl border px-4 py-1.5 font-semibold whitespace-nowrap ${
      active ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/70 text-gray-300 hover:border-gray-500"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1880px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان والرصيد - title and balance */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          <Icon size={26} className={`${months ? "text-statusGreen" : "text-brandOrange"} shrink-0`} />
          <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.6] whitespace-nowrap">{title}</h2>
          {months && (
            <span dir="ltr" className="font-numbers tabular-nums rounded-lg bg-background/70 border border-cardBorder text-gray-300 px-2.5 leading-[1.8]">
              {accountNumber}
            </span>
          )}
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
            {data && !months && (
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

        {/* آخر تسجيل وأزرار المدى (أو تابات الشهور) - the last entry and the range buttons (or month tabs) */}
        {data && (
          <div className="shrink-0 flex items-center gap-4 px-5 py-2.5 border-b border-cardBorder">
            <div
              className={`shrink-0 flex items-center gap-x-3 gap-y-1 flex-wrap rounded-xl border px-4 py-1.5 ${
                noEntryToday ? "border-brandOrange/60 bg-brandOrange/10" : "border-cardBorder bg-background/60"
              }`}
            >
              {noEntryToday && (
                <span className="flex items-center gap-1.5 text-brandOrange font-bold">
                  <AlertTriangle size={18} />
                  {months ? "مفيش حركة النهارده" : "مفيش تسجيل على الخزنة النهارده"}
                </span>
              )}
              <span className="text-gray-400">{months ? "آخر حركة:" : "آخر تسجيل على الخزنة:"}</span>
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
            {!months && (
              <div className="ms-auto flex items-center gap-2">
                {RANGES.map((r) => (
                  <button key={r.id} type="button" onClick={() => setRange(r.id)} className={tab(range === r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            {months && (
              // التابات كتير؟ بتعمل scroll بالعرض جوه السطر ده بس - many tabs scroll sideways inside this row only
              <div className="ms-auto min-w-0 flex items-center gap-2 overflow-x-auto pb-0.5">
                {monthTabs.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMonth(m);
                      setOpenId(null);
                    }}
                    className={tab(month === m)}
                  >
                    {monthName(m)} <span dir="ltr" className="font-numbers">{m.slice(0, 4)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* فلتر المنصرف وسلف الشهر - the outgoing filter and this month's advances */}
        {data && (
          <div className="shrink-0 flex flex-col gap-2 px-5 py-2 border-b border-cardBorder">
            <div className="flex items-center gap-2 flex-wrap">
              {FILTERS.map((x) => (
                <button key={x.id} type="button" onClick={() => setFilter(x.id)} className={tab(filter === x.id)}>
                  {x.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowAdvances(!showAdvances)}
                disabled={data.advances.people.length === 0}
                className="ms-auto flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-1.5 font-bold text-amber-300 whitespace-nowrap hover:bg-amber-400/20 disabled:opacity-60 disabled:cursor-default"
              >
                إجمالي سلف الشهر: {n(data.advances.total)} ج.م
                <span className="text-gray-300 font-semibold">(لـ {n(data.advances.people.length)} موظف)</span>
                {data.advances.people.length > 0 && <span className="text-[0.8em]">{showAdvances ? "▲" : "▼"}</span>}
              </button>
            </div>
            {showAdvances && data.advances.people.length > 0 && (
              <div className="max-h-[22vh] overflow-auto rounded-xl border border-amber-400/30 bg-background/60 px-3 py-1.5 grid grid-cols-2 min-[1400px]:grid-cols-3 gap-x-6">
                {data.advances.people.map((p) => (
                  <p key={p.employee} className="flex items-center justify-between gap-3 border-b border-cardBorder/50 leading-[2]">
                    <span className="text-gray-100 truncate">{p.name}</span>
                    <span className="whitespace-nowrap">
                      <b className="text-amber-300">{n(p.amount)}</b>
                      <span className="text-gray-500 text-[0.85em]"> ج.م{p.count > 1 && <> ({n(p.count)} مرات)</>}</span>
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ملخص الشهر - the month summary */}
        {months && data && (
          <div className={`shrink-0 flex items-stretch gap-3 px-5 py-2.5 border-b border-cardBorder ${loadingMonth ? "opacity-50" : ""}`}>
            <SummaryBox label="رصيد أول الشهر" value={data.openingBalance} color="text-white" />
            <SummaryBox label="إجمالي الوارد" value={data.totalIn} color="text-statusGreen" />
            <SummaryBox label="إجمالي المنصرف" value={data.totalOut} color="text-statusRed" />
            <SummaryBox
              label={data.to === data.today ? "الرصيد الحالي" : "رصيد آخر الشهر"}
              value={data.closingBalance}
              color="text-brandOrange"
            />
            <SummaryBox label="عدد الحركات" value={data.moves.length} color="text-gray-100" isCount />
          </div>
        )}

        {/* الحركات (بتعمل scroll جوه اللوحة) - the movements (scroll inside the panel) */}
        <div className={`flex-1 min-h-0 overflow-auto ${loadingMonth && data ? "opacity-50" : ""}`}>
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error && !isLoading ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل الحركات..."}
            </div>
          ) : months && error && !isLoading && data.month !== month ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">غير متصل — جرب تاني بعد شوية</div>
          ) : days.length === 0 && (months || filter !== "all") ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {filter !== "all" ? "مفيش حركات من النوع ده في المدة دي" : "لا توجد حركات في الشهر ده"}
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-0 leading-[2]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  {!months && <th className={`${th} text-center`}>تاريخ الحركة</th>}
                  <th className={`${th} text-center`}>{months ? "الوقت" : "وقت التسجيل"}</th>
                  <th className={`${th} text-center`}>النوع</th>
                  <th className={`${th} text-center`}>المبلغ</th>
                  <th className={`${th} text-center`}>الرصيد بعدها</th>
                  <th className={`${th} text-start`}>لمين / ليه</th>
                  <th className={`${th} text-start`}>البيان</th>
                  <th className={`${th} text-start`}>رقم المستند</th>
                  <th className={`${th} text-start`}>سجّلها</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) =>
                  day.moves.length === 0 ? (
                    <tr key={day.date}>
                      <td colSpan={columns} className="px-4 border-b border-cardBorder/60 text-gray-500 bg-background/30 leading-[1.9]">
                        {formatDayName(day.date)} — لا توجد حركات
                      </td>
                    </tr>
                  ) : (
                    <Fragment key={day.date}>
                      <tr>
                        <td colSpan={columns} className="px-4 py-1 border-b border-cardBorder bg-background/70 font-bold">
                          <span className="text-white">{formatDayName(day.date)}</span>
                          <span className="text-gray-500"> — </span>
                          <span className="text-statusGreen">وارد {n(day.incoming)}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-statusRed">منصرف {n(day.outgoing)}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-gray-200">الرصيد آخر اليوم {n(day.balance)}</span>
                        </td>
                      </tr>
                      {day.moves.map((move) => (
                        <MoveRow
                          key={move.id}
                          move={move}
                          erpUrl={data.erpUrl}
                          open={openId === move.id}
                          onToggle={() => setOpenId(openId === move.id ? null : move.id)}
                          showPostingDate={!months}
                          columns={columns}
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
