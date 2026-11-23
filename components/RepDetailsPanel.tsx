"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useIdleClose } from "@/lib/useIdleClose";
import useSWR from "swr";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Truck, X } from "lucide-react";
import { RepDay, RepDebt, RepDetails, RepInvoice, RepSales, RepYear } from "@/lib/types";
import ActivityDetailsPanel from "./ActivityDetailsPanel";
import { formatDayName, formatNumber, formatTime12, toEnglishDigits } from "@/lib/format";
import { daysAgoText, monthName, Num, Percent } from "./SalesCommon";

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

// "1,234 ج.م" - an amount in EGP
function Money({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className="whitespace-nowrap">
      <Num value={Math.round(value)} className={className} /> <span className="text-gray-500 text-[0.85em]">ج.م</span>
    </span>
  );
}

const formatDate = (date: string) => {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};

// خانة فلوس في جدول المديونية: الصفر "—" باهت - a money cell in the debt table: zero is a dimmed "—"
function DebtCell({ value, className }: { value: number; className: string }) {
  if (Math.round(value) === 0) return <span className="text-gray-600">—</span>;
  return <Money value={value} className={className} />;
}

// تاب المديونية: الشهر ده / قبل الشهر ده / الإجمالي فوق، وجدول العملاء (الأكبر الأول)، والضغط على العميل يفتح فواتيره المفتوحة
// التقسيمة بتاريخ الفاتورة من نفس الفواتير المفتوحة (الحساب نفسه زي ما هو): قبل الشهر = إجمالي العميل - الشهر ده، فالمجموع = رقم الكارت
// The debt tab: this month / before this month / total on top, then customers (biggest first); clicking a customer
// shows their unpaid invoices. Split by invoice date over the same open invoices (calculation unchanged):
// before = customer total - this month, so the sum always equals the card number
function DebtTab({ debt, month, emptyText }: { debt: RepDebt; month: string; emptyText?: string }) {
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const th = "px-3 py-2 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const monthStart = `${month}-01`;
  const rows = debt.list
    .map((customer) => {
      const thisMonth = Math.round(customer.invoices.filter((i) => i.date >= monthStart).reduce((sum, i) => sum + i.outstanding, 0) * 100) / 100;
      return { customer, thisMonth, before: Math.round((customer.amount - thisMonth) * 100) / 100 };
    })
    .sort((a, b) => b.customer.amount - a.customer.amount);
  const totalThisMonth = rows.reduce((sum, r) => sum + r.thisMonth, 0);
  const totalBefore = debt.amount - totalThisMonth;
  const sinceText = `من 1/${Number(month.slice(5))} لحد النهارده`;
  const box = "rounded-xl border border-cardBorder bg-background/70 px-4 py-1.5";
  const boxLabel = "text-gray-400 font-semibold text-[15px] leading-[1.7]";
  const foot = "px-3 text-center border-t-2 border-cardBorder font-extrabold";
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* الشهر ده / قبل الشهر ده / الإجمالي / عدد العملاء - this month / before / total / customers */}
      <div className="shrink-0 flex flex-wrap items-stretch gap-3 px-5 py-3 border-b border-cardBorder">
        <div className={box}>
          <p className={boxLabel}>
            مديونية الشهر ده <span className="text-gray-500">· {sinceText}</span>
          </p>
          <p className="leading-[1.3]">
            <Num value={Math.round(totalThisMonth)} className={`text-[30px] font-extrabold ${totalThisMonth > 0 ? "text-brandOrange" : "text-gray-500"}`} />{" "}
            <span className="text-gray-400 text-lg">ج.م</span>
          </p>
        </div>
        <div className={box}>
          <p className={boxLabel}>مديونية قبل الشهر ده</p>
          <p className="leading-[1.3]">
            <Num value={Math.round(totalBefore)} className={`text-[30px] font-extrabold ${Math.round(totalBefore) > 0 ? "text-statusRed" : "text-gray-500"}`} />{" "}
            <span className="text-gray-400 text-lg">ج.م</span>
          </p>
        </div>
        <div className={box}>
          <p className={boxLabel}>إجمالي المديونية</p>
          <p className="leading-[1.3]">
            <Num value={Math.round(debt.amount)} className={`text-[30px] font-extrabold ${debt.amount > 0 ? "text-brandOrange" : "text-statusGreen"}`} />{" "}
            <span className="text-gray-400 text-lg">ج.م</span>
          </p>
        </div>
        <div className={box}>
          <p className={boxLabel}>عدد العملاء</p>
          <p className="leading-[1.3]">
            <Num value={debt.customers} className="text-[30px] font-extrabold text-white" /> <span className="text-gray-400 text-lg">عميل</span>
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {debt.list.length === 0 ? (
          <div className={`h-full flex items-center justify-center text-xl ${emptyText ? "text-gray-400" : "text-statusGreen"}`}>{emptyText ?? "مفيش مديونية برّه ✅"}</div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[16px] leading-[2.1]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className={`${th} text-start ps-5`}>اسم العميل</th>
                <th className={th}>مديونية الشهر ده</th>
                <th className={th}>مديونية قبل الشهر</th>
                <th className={th}>الإجمالي</th>
                <th className={th}>عدد الفواتير المفتوحة</th>
                <th className={th}>أقدم فاتورة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ customer, thisMonth, before }) => {
                const open = openCustomer === customer.customer;
                const late = customer.oldest !== null && customer.oldest.daysAgo > debt.warningDays;
                return (
                  <Fragment key={customer.customer}>
                    <tr
                      onClick={() => setOpenCustomer(open ? null : customer.customer)}
                      className={`cursor-pointer ${open ? "bg-brandOrange/10" : "hover:bg-white/5"}`}
                    >
                      <td className="ps-3 pe-2 border-b border-cardBorder/60 text-gray-200 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {open ? <ChevronDown size={18} className="text-brandOrange" /> : <ChevronLeft size={18} className="text-gray-500" />}
                          {toEnglishDigits(customer.customer)}
                        </span>
                      </td>
                      <td className="px-3 text-center border-b border-cardBorder/60">
                        <DebtCell value={thisMonth} className={`font-bold ${thisMonth < 0 ? "text-statusGreen" : "text-brandOrange"}`} />
                      </td>
                      <td className="px-3 text-center border-b border-cardBorder/60">
                        <DebtCell value={before} className={`font-bold ${before > 0 ? "text-statusRed" : "text-statusGreen"}`} />
                      </td>
                      <td className="px-3 text-center border-b border-cardBorder/60">
                        <DebtCell
                          value={customer.amount}
                          className={`font-extrabold ${customer.amount <= 0 ? "text-statusGreen" : "text-white"}`}
                        />
                      </td>
                      <td className="px-3 text-center border-b border-cardBorder/60">
                        {customer.openInvoices ? <Num value={customer.openInvoices} className="text-gray-100" /> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className={`px-3 text-center border-b border-cardBorder/60 whitespace-nowrap ${late ? "text-statusRed font-semibold" : "text-gray-300"}`}>
                        {customer.oldest ? (
                          <>
                            <span dir="ltr" className="font-numbers">{formatDate(customer.oldest.date)}</span>
                            <span className={late ? "" : "text-gray-500"}> · {daysAgoText(customer.oldest.daysAgo)}</span>
                          </>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} className="bg-background/60 border-b border-cardBorder/60 px-5 py-2">
                          {customer.unlinkedApplied > 0 && (
                            <p className="text-sky-400 text-[15px] leading-[1.9]">
                              اتخصم <Money value={customer.unlinkedApplied} className="font-bold" /> دفعات ومرتجعات وقيود مش متربطة بفواتير في ERPNext (من أقدم فاتورة للأحدث)
                            </p>
                          )}
                          <table className="w-full border-separate border-spacing-0 text-[15px] leading-[1.9]">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="px-3 text-start font-semibold">رقم الفاتورة</th>
                                <th className="px-3 font-semibold">التاريخ</th>
                                <th className="px-3 font-semibold">الإجمالي</th>
                                <th className="px-3 font-semibold">المدفوع</th>
                                <th className="px-3 font-semibold">الباقي</th>
                                <th className="px-3" />
                              </tr>
                            </thead>
                            <tbody>
                              {customer.invoices.map((invoice) => {
                                const old = invoice.outstanding > 0 && invoice.daysAgo > debt.warningDays;
                                return (
                                  <tr key={invoice.id} className="border-t border-cardBorder/40">
                                    <td className="px-3 text-gray-300 whitespace-nowrap">
                                      <span dir="ltr" className="font-numbers">{invoice.id}</span>
                                      {invoice.isReturn && <span className="ms-2 text-statusRed text-sm">مرتجع</span>}
                                    </td>
                                    <td className={`px-3 text-center whitespace-nowrap ${old ? "text-statusRed" : "text-gray-300"}`}>
                                      <span dir="ltr" className="font-numbers">{formatDate(invoice.date)}</span>
                                      <span className="text-gray-500"> · {daysAgoText(invoice.daysAgo)}</span>
                                    </td>
                                    <td className="px-3 text-center">
                                      <Money value={invoice.total} className="text-gray-100" />
                                    </td>
                                    <td className="px-3 text-center whitespace-nowrap">
                                      <Money value={invoice.paid} className="text-gray-300" />
                                      {invoice.unlinked > 0 && (
                                        <span className="text-sky-400 text-sm">
                                          {" "}
                                          (منها <Num value={Math.round(invoice.unlinked)} /> مش متربط)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 text-center">
                                      <Money
                                        value={invoice.outstanding}
                                        className={`font-bold ${invoice.outstanding < 0 ? "text-statusGreen" : old ? "text-statusRed" : "text-brandOrange"}`}
                                      />
                                    </td>
                                    <td className="px-3 text-center">
                                      <a
                                        href={invoice.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 whitespace-nowrap text-sm"
                                      >
                                        افتح في ERPNext
                                        <ExternalLink size={14} />
                                      </a>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-card">
              <tr className="text-[17px]">
                <td className="ps-5 pe-2 border-t-2 border-cardBorder text-white font-extrabold">الإجمالي</td>
                <td className={foot}>
                  <DebtCell value={totalThisMonth} className="text-brandOrange" />
                </td>
                <td className={foot}>
                  <DebtCell value={totalBefore} className={Math.round(totalBefore) > 0 ? "text-statusRed" : "text-statusGreen"} />
                </td>
                <td className={foot}>
                  <DebtCell value={debt.amount} className="text-white" />
                </td>
                <td className={foot}>
                  <Num value={rows.reduce((sum, r) => sum + r.customer.openInvoices, 0)} className="text-gray-100" />
                </td>
                <td className="border-t-2 border-cardBorder" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

// لوحة تفاصيل المندوب: جدول يوم بيوم، والضغط على اليوم يفتح فواتيره
// The rep details panel: a day-by-day table; clicking a day shows its invoices
export default function RepDetailsPanel({ rep, onClose }: { rep: RepSales; onClose: () => void }) {
  // الشهر المختار: "" = الشهر الحالي (الافتراضي)، "YYYY-MM" = شهر قديم، "year:YYYY" = ملخص السنة
  // The selected view: "" = the current month (default), "YYYY-MM" = a past month, "year:YYYY" = the year summary
  const [view, setView] = useState("");
  const base = `/api/sales/rep?rep=${encodeURIComponent(rep.name)}`;
  const swrOptions = { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false };
  // الشهر الحالي دايماً (المديونية لحد النهارده + قايمة الشهور) - always the current month (today's debt + the months list)
  const current = useSWR<RepDetails>(base, fetcher, swrOptions);
  const yearView = view.startsWith("year:");
  // بيتجاب بس الشهر / السنة المختارة - only the selected month / year is fetched
  const selected = useSWR<RepDetails | RepYear>(
    view === "" ? null : yearView ? `${base}&year=${view.slice(5)}` : `${base}&month=${view}`,
    fetcher,
    swrOptions
  );
  const data = view === "" ? current.data : yearView ? undefined : (selected.data as RepDetails | undefined);
  const year = yearView ? (selected.data as RepYear | undefined) : undefined;
  const error = view === "" ? current.error : selected.error;
  const currentMonth = current.data?.currentMonth ?? data?.currentMonth ?? year?.currentMonth ?? "";
  const months = current.data?.months ?? data?.months ?? year?.months ?? [];
  const shownMonth = view === "" ? currentMonth : yearView ? "" : view;
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [tab, setTab] = useState<"days" | "debt">("days");
  const pick = useCallback((next: string) => {
    setView(next);
    setOpenDay(null);
    setTab("days");
  }, []);
  const pickMonth = useCallback((month: string) => pick(month === currentMonth ? "" : month), [pick, currentMonth]);

  // ===== البحث عن عميل - the customer search =====
  // query = المكتوب، term = نفس المكتوب بعد 200ms، picked = عميل اتختار من الاقتراحات (مطابقة بالظبط)
  // query = typed text, term = the same after 200 ms, picked = a customer chosen from the suggestions (exact match)
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [allMonths, setAllMonths] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const needle = normalizeAr(term);
  const filtering = picked !== null || needle !== "";
  const matches = useCallback((name: string) => (picked !== null ? name === picked : normalizeAr(name).includes(needle)), [picked, needle]);
  const clearSearch = useCallback(() => {
    setQuery("");
    setTerm("");
    setPicked(null);
    setSuggestOpen(false);
  }, []);
  const choose = useCallback((name: string) => {
    setQuery(name);
    setTerm(name);
    setPicked(name);
    setSuggestOpen(false);
  }, []);
  // "كل الشهور" (أو البحث وانت في ملخص السنة): بيدور في السنة كلها، وبيتجاب بس لما يكون فيه بحث
  // "كل الشهور" (or searching from the year summary): searches the whole year, fetched only while searching
  const wholeYear = allMonths || yearView;
  const searchYear = (yearView ? view.slice(5) : (shownMonth || currentMonth).slice(0, 4)) || "";
  const yearDays = useSWR<RepDetails>(filtering && wholeYear && searchYear ? `${base}&year=${searchYear}&days=1` : null, fetcher, swrOptions);
  const source = wholeYear ? yearDays.data : data;
  const sourceError = wholeYear ? yearDays.error : error;
  // الفاتورة المفتوحة (نفس لوحة تفاصيل "اللي بيحصل دلوقتي") - the open invoice (same panel as the activity feed)
  const [invoice, setInvoice] = useState<RepInvoice | null>(null);
  const invoiceOpen = useRef(false);
  invoiceOpen.current = invoice !== null;
  const openInvoice = useCallback((inv: RepInvoice) => setInvoice(inv), []);
  const closeInvoice = useCallback(() => setInvoice(null), []);

  // Esc يقفل، وأي لمسة تعيد عداد الدقيقة - Esc closes; any touch restarts the 60 s idle timer
  // لو فاتورة مفتوحة: Esc / الدقيقة بيقفلوا الفاتورة بس - with an invoice open, Esc / idle close only the invoice
  useIdleClose(() => {
    if (invoiceOpen.current) {
      setInvoice(null);
      return false;
    }
    onClose();
  }, IDLE_CLOSE_MS);

  // ◀ ▶ و ← → : الشهر اللي قبله / بعده من الشهور اللي فيها بيع (اليمين = الأقدم، زي اتجاه القراية)
  // ◀ ▶ and ← →: the previous / next month with sales (right = older, following the RTL reading direction)
  const monthIndex = shownMonth ? months.indexOf(shownMonth) : -1;
  const older = monthIndex >= 0 && monthIndex < months.length - 1 ? months[monthIndex + 1] : null;
  const newer = monthIndex > 0 ? months[monthIndex - 1] : null;
  const step = useRef({ older, newer, pickMonth });
  step.current = { older, newer, pickMonth };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (invoiceOpen.current || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const { older: o, newer: n, pickMonth: go } = step.current;
      if (e.key === "ArrowRight" && o) go(o);
      else if (e.key === "ArrowLeft" && n) go(n);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ctrl+F أو "/" بيروحوا للبحث؛ Esc بيمسح البحث الأول، وبعدين بيقفل اللوحة (قبل useIdleClose: capture)
  // Ctrl+F or "/" focus the search; Esc clears the search first, then closes the panel (runs before useIdleClose: capture)
  const searchActive = useRef(false);
  searchActive.current = query !== "" || picked !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (invoiceOpen.current) return;
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const ctrlF = (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyF" || e.key.toLowerCase() === "f");
      const slash = !inField && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "/" || e.code === "Slash");
      if (ctrlF || slash) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && searchActive.current) {
        e.preventDefault();
        e.stopPropagation();
        clearSearch();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [clearSearch]);

  // أرقام العنوان: الشهر الحالي من الكارت بالظبط، وأي شهر تاني من تفاصيله، والسنة = مجموع الشهور
  // Header numbers: the current month exactly as the card, other months from their details, the year = sum of months
  const isCurrent = view === "";
  const headPackets = isCurrent ? rep.monthPackets : year ? year.total.packets : data?.total.packets ?? 0;
  const headTarget = isCurrent ? rep.target : year ? year.total.target : data?.target ?? rep.target;
  const percent = headTarget > 0 ? Math.round((headPackets / headTarget) * 100) : 0;
  const reached = headTarget > 0 && headPackets >= headTarget;
  const columns = data?.columns ?? [];
  const years = Array.from(new Set(months.map((m) => m.slice(0, 4))));
  const debt = current.data?.debt ?? data?.debt ?? null;

  // البحث: الأيام والإجماليات والمديونية بتاعة العميل بس (من نفس الأرقام، من غير أي حساب جديد)
  // The search: the customer's own days, totals and debt (from the same numbers, no new calculation)
  const width = (source?.columns ?? data?.columns ?? []).length;
  const filtered = filtering && source ? filterDays(source.days, matches, width) : null;
  const shownDebt = debt && filtering ? debtFor(debt, matches) : debt;
  const suggestions = (() => {
    if (!needle || picked !== null) return [];
    const names = tab === "debt" ? (debt?.list ?? []).map((c) => c.customer) : (source?.days ?? []).flatMap((d) => d.invoices.map((i) => i.customer));
    const hits = Array.from(new Set(names)).filter((n) => normalizeAr(n).includes(needle));
    return hits.sort((a, b) => Number(!normalizeAr(a).startsWith(needle)) - Number(!normalizeAr(b).startsWith(needle)) || a.localeCompare(b, "ar")).slice(0, 8);
  })();
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setSuggestOpen(true);
      setHighlight((h) => (h + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (e.key === "Enter" && suggestOpen && suggestions[highlight]) {
      e.preventDefault();
      choose(suggestions[highlight]);
    }
  };
  const filterLabel = picked ?? query.trim();

  const arrow = "p-1 rounded-lg border border-cardBorder bg-background/70 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:text-gray-300";
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
        <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-b border-cardBorder">
          <h2 className="font-extrabold text-white text-[26px] leading-[1.6] truncate">{toEnglishDigits(rep.name)}</h2>
          <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-brandOrange/40 bg-brandOrange/10 text-brandOrange px-3 font-semibold text-lg leading-[1.75]">
            <Truck size={20} />
            {toEnglishDigits(rep.van)}
          </span>
          {/* اختيار الشهر - the month picker */}
          <div className="shrink-0 flex items-center gap-1.5 whitespace-nowrap">
            <button type="button" className={arrow} disabled={!older} onClick={() => older && pickMonth(older)} aria-label="الشهر اللي قبله" title="الشهر اللي قبله (→)">
              <ChevronRight size={22} />
            </button>
            <select
              value={view === "" ? currentMonth : view}
              onChange={(e) => (e.target.value.startsWith("year:") ? pick(e.target.value) : pickMonth(e.target.value))}
              className="rounded-lg border border-cardBorder bg-background text-gray-200 text-lg leading-[1.6] px-2 cursor-pointer"
            >
              {(months.length ? months : [currentMonth]).filter(Boolean).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {m === currentMonth ? " (الحالي)" : ""}
                </option>
              ))}
              {years.map((y) => (
                <option key={y} value={`year:${y}`}>
                  السنة {y}
                </option>
              ))}
              {/* لو الشهر المختار مش في القايمة لسه - keep the selected value valid before the list loads */}
              {view && !yearView && !months.includes(view) && <option value={view}>{monthLabel(view)}</option>}
            </select>
            <button type="button" className={arrow} disabled={!newer} onClick={() => newer && pickMonth(newer)} aria-label="الشهر اللي بعده" title="الشهر اللي بعده (←)">
              <ChevronLeft size={22} />
            </button>
          </div>
          {/* البحث عن عميل + "كل الشهور" - the customer search + "all months" */}
          <div className="flex items-center gap-2 min-w-[170px] flex-1 max-w-[340px]">
            <div className="relative flex-1 min-w-0">
              <input
                ref={searchRef}
                type="search"
                value={query}
                dir="rtl"
                placeholder="🔍 ابحث عن عميل…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                  setSuggestOpen(true);
                  setHighlight(0);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setSuggestOpen(false)}
                onKeyDown={onSearchKey}
                className="w-full rounded-lg border border-cardBorder bg-background text-gray-100 placeholder:text-gray-500 text-lg leading-[1.6] ps-2 pe-8 outline-none focus:border-brandOrange/70 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearSearch}
                  aria-label="امسح البحث"
                  className="absolute inset-y-0 end-1.5 my-auto h-fit p-0.5 rounded text-gray-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              )}
              {suggestOpen && suggestions.length > 0 && (
                <ul className="absolute z-30 top-full mt-1 inset-x-0 rounded-lg border border-cardBorder bg-card shadow-2xl py-1 max-h-[50vh] overflow-auto">
                  {suggestions.map((name, i) => (
                    <li key={name}>
                      <button
                        type="button"
                        // mousedown عشان الاختيار يحصل قبل ما الخانة تفقد التركيز - mousedown so the pick lands before the input blurs
                        onMouseDown={(e) => {
                          e.preventDefault();
                          choose(name);
                        }}
                        onMouseEnter={() => setHighlight(i)}
                        className={`w-full text-start px-3 text-[16px] leading-[2] truncate ${i === highlight ? "bg-brandOrange/15 text-white" : "text-gray-300"}`}
                      >
                        {toEnglishDigits(name)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAllMonths((v) => !v)}
              aria-pressed={allMonths}
              title="دوّر على العميل في السنة كلها"
              className={`shrink-0 rounded-lg border px-2 text-[15px] font-semibold leading-[1.9] whitespace-nowrap ${
                allMonths ? "border-brandOrange/70 bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/70 text-gray-400 hover:text-gray-200"
              }`}
            >
              كل الشهور
            </button>
          </div>
          <div className="ms-auto flex items-center gap-5 whitespace-nowrap">
            {filtering ? (
              <>
                {/* أرقام العميل بدل أرقام المندوب - the customer's numbers instead of the rep's */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 text-sky-300 ps-3 pe-1.5 text-lg leading-[1.75] max-w-[260px]">
                  <span className="truncate">عميل: {toEnglishDigits(filterLabel)}</span>
                  <button type="button" onClick={clearSearch} aria-label="امسح العميل" className="p-0.5 rounded-full hover:bg-white/10 hover:text-white">
                    <X size={16} />
                  </button>
                </span>
                <p className="text-lg text-gray-400">
                  الإجمالي <Num value={filtered?.total.packets ?? 0} className="text-[28px] font-extrabold text-white" /> باكت
                </p>
                <p className="text-lg text-gray-400">
                  <Money value={filtered?.total.amount ?? 0} className="text-[24px] font-extrabold text-gray-100" />
                </p>
              </>
            ) : (
              <>
                <p className="text-lg text-gray-400">
                  الإجمالي{" "}
                  <Num value={headPackets} className={`text-[28px] font-extrabold ${reached ? "text-statusGreen" : "text-white"}`} /> باكت
                </p>
                <p className="text-lg text-gray-400">
                  التارجت <Num value={headTarget} className="text-gray-200 font-bold" />{" "}
                  <Percent value={percent} className={`text-[26px] font-extrabold ${reached ? "text-statusGreen" : "text-brandOrange"}`} />
                </p>
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

        {/* التابات: المبيعات اليومية / المديونية - tabs: daily sales / debt */}
        <div className="shrink-0 flex items-center gap-2 px-5 pt-2 border-b border-cardBorder">
          {(
            [
              ["days", yearView ? `ملخص السنة ${view.slice(5)}` : "المبيعات اليومية"],
              ["debt", "المديونية"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 text-lg font-bold leading-[2.1] rounded-t-xl border-b-2 -mb-px ${
                tab === key ? "border-brandOrange text-brandOrange bg-brandOrange/10" : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {label}
              {key === "debt" && rep.debt && rep.debt.amount > 0 && (
                <span className={`ms-2 text-base ${rep.debt.overdue ? "text-statusRed" : "text-gray-300"}`}>
                  <Num value={Math.round(rep.debt.amount)} />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* الجدول (بيعمل scroll جوه اللوحة) - the table (scrolls inside the panel) */}
        <div className={`flex-1 min-h-0 ${tab === "debt" ? "overflow-hidden" : "overflow-auto"}`}>
          {tab === "debt" ? (
            // المديونية دايماً لحد النهارده مهما كان الشهر المختار - debt is always as of today, whatever month is picked
            shownDebt ? (
              <div className="h-full min-h-0 flex flex-col">
                <p className="shrink-0 px-5 pt-2 text-[15px] text-sky-400">المديونية الحالية — مش مرتبطة بالشهر</p>
                <div className="flex-1 min-h-0">
                  <DebtTab
                    debt={shownDebt}
                    month={currentMonth}
                    emptyText={filtering ? `مفيش مديونية على "${toEnglishDigits(filterLabel)}"` : undefined}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xl text-gray-400">
                {current.data || current.error ? "المديونية مش متاحة دلوقتي — جرب تاني بعد شوية" : "جاري تحميل التفاصيل..."}
              </div>
            )
          ) : filtering ? (
            // البحث: أيام العميل بس مفتوحة، وفواتيره بس - the search: only the customer's days, expanded, with only their invoices
            !filtered ? (
              <div className="h-full flex items-center justify-center text-xl text-gray-400">
                {sourceError ? "غير متصل — جرب تاني بعد شوية" : wholeYear ? "جاري البحث في السنة كلها..." : "جاري تحميل التفاصيل..."}
              </div>
            ) : (
              <CustomerSales
                f={filtered}
                columns={source?.columns ?? []}
                wholeYear={wholeYear}
                showCustomer={picked === null}
                debt={shownDebt ? shownDebt.amount : null}
                period={wholeYear ? `سنة ${searchYear}` : monthLabel(source?.month ?? "")}
                name={filterLabel}
                onOpenInvoice={openInvoice}
              />
            )
          ) : yearView ? (
            year ? (
              <YearTable year={year} onOpenMonth={pickMonth} />
            ) : (
              <div className="h-full flex items-center justify-center text-xl text-gray-400">
                {error ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل ملخص السنة..."}
              </div>
            )
          ) : !data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل التفاصيل..."}
            </div>
          ) : data.days.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {isCurrent ? "لسه مفيش بيع الشهر ده" : `مفيش بيع في ${monthLabel(data.month)}`}
            </div>
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
                  <th className={`${th} border-b border-cardBorder`}>اتسجلت</th>
                  <th className={`${th} border-b border-cardBorder text-start`}>سجّلها</th>
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
                        <td colSpan={2} className="px-2 border-b border-cardBorder/60 text-[13px] leading-[1.5] text-gray-400 max-w-0">
                          <DayEntered invoices={day.invoices} date={day.date} />
                        </td>
                      </tr>
                      {open && <DayCustomers invoices={day.invoices} onOpenInvoice={openInvoice} />}
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
                  <td colSpan={2} className="border-t-2 border-brandOrange/50" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        {invoice && (
          <ActivityDetailsPanel
            event={{
              id: `sale:${invoice.id}`,
              kind: invoice.isReturn ? "return" : "sale",
              at: `${invoice.creation}:00`,
              title: `${invoice.isReturn ? "مرتجع مبيعات" : "فاتورة مبيعات"} — ${toEnglishDigits(invoice.customer)}`,
              details: `${toEnglishDigits(rep.name)} · ${toEnglishDigits(rep.van)}`,
              amount: invoice.amount,
              extra: null,
              badge: null,
              doctype: "Sales Invoice",
              docname: invoice.id,
            }}
            icon={invoice.isReturn ? "↩️" : "🧾"}
            color={invoice.isReturn ? "#F59E0B" : "#2F80ED"}
            onClose={closeInvoice}
          />
        )}
      </div>
    </div>
  );
}

// "2026-11" -> "نوفمبر 2026"
const monthLabel = (month: string) => (month ? `${monthName(month)} ${month.slice(0, 4)}` : "");

// ملخص السنة: صف لكل شهر + إجمالي السنة؛ الضغط على الشهر يفتحه
// The year summary: a row per month + the year total; clicking a month opens it
function YearTable({ year, onOpenMonth }: { year: RepYear; onOpenMonth: (month: string) => void }) {
  const th = "px-2 py-2 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const foot = "px-2 text-center border-t-2 border-brandOrange/50";
  const pct = (packets: number, target: number) => (target > 0 ? Math.round((packets / target) * 100) : 0);
  if (year.list.length === 0) return <div className="h-full flex items-center justify-center text-xl text-gray-400">مفيش بيع في سنة {year.year}</div>;
  const totalPct = pct(year.total.packets, year.total.target);
  return (
    <table className="w-full border-separate border-spacing-0 text-[16px] leading-[2.1]">
      <thead className="sticky top-0 z-10 bg-card">
        <tr>
          <th className={`${th} text-start ps-5`}>الشهر</th>
          {year.columns.map((label) => (
            <th key={label} className={th}>
              {label}
            </th>
          ))}
          <th className={`${th} text-gray-200`}>إجمالي الباكت</th>
          <th className={th}>إجمالي المبلغ (ج.م)</th>
          <th className={th}>عدد العملاء</th>
          <th className={th}>التارجت</th>
        </tr>
      </thead>
      <tbody>
        {year.list.map((row) => {
          const p = pct(row.packets, row.target);
          return (
            <tr key={row.month} onClick={() => onOpenMonth(row.month)} className="cursor-pointer hover:bg-white/5">
              <td className="ps-3 pe-2 border-b border-cardBorder/60 whitespace-nowrap text-gray-200 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <ChevronLeft size={18} className="text-gray-500" />
                  {monthLabel(row.month)}
                  {row.month === year.currentMonth && <span className="text-gray-500 font-normal text-[13px]">(الحالي)</span>}
                </span>
              </td>
              {row.columns.map((value, i) => (
                <Cell key={i} value={value} />
              ))}
              <Cell value={row.packets} strong />
              <Cell value={row.amount} money />
              <Cell value={row.customers} />
              <td className="px-2 text-center whitespace-nowrap">
                <Num value={row.target} className="text-gray-400" />{" "}
                <Percent value={p} className={`font-bold ${row.target > 0 && row.packets >= row.target ? "text-statusGreen" : "text-brandOrange"}`} />
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot className="sticky bottom-0 z-10 bg-card">
        <tr className="font-bold">
          <td className="ps-5 pe-2 border-t-2 border-brandOrange/50 text-white whitespace-nowrap">إجمالي السنة</td>
          {year.total.columns.map((value, i) => (
            <td key={i} className={foot}>
              {value ? <Num value={value} className="text-white" /> : <span className="text-gray-600">—</span>}
            </td>
          ))}
          <td className={foot}>
            <Num value={year.total.packets} className="text-brandYellow text-[18px] font-extrabold" />
          </td>
          <td className={foot}>
            <Num value={Math.round(year.total.amount)} className="text-white" />
          </td>
          <td className={foot}>
            <Num value={year.total.customers} className="text-gray-300" />
          </td>
          <td className={`${foot} whitespace-nowrap`}>
            <Num value={year.total.target} className="text-gray-400" />{" "}
            <Percent value={totalPct} className={totalPct >= 100 ? "text-statusGreen" : "text-brandOrange"} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

// "2026-11-15 09:42" -> "15/11 09:42"
function enteredAt(creation: string): string {
  const [date, time = ""] = creation.split(" ");
  const [, m, d] = date.split("-").map(Number);
  return d && m ? `${d}/${m} ${formatTime12(time)}` : creation;
}

// اتسجلت (والتأخير) - entered at (and the late badge)
function EnteredCell({ invoice }: { invoice: RepInvoice }) {
  return (
    <td className="px-2 text-center whitespace-nowrap text-gray-300 text-[14px]">
      <span dir="ltr" className="font-numbers tabular-nums">{enteredAt(invoice.creation)}</span>
      {/* الشاشات الأصغر من 1600: الشارة تحت الوقت عشان الجدول ميعديش عرض اللوحة - below 1600 px the badge sits under the time */}
      {invoice.lateDays > 1 && (
        <span className="block w-fit mx-auto leading-[1.6] min-[1600px]:inline min-[1600px]:ms-1.5 rounded-full bg-brandOrange/15 text-brandOrange font-bold px-1.5 text-[12px]">
          متأخر {formatNumber(invoice.lateDays)} يوم
        </span>
      )}
    </td>
  );
}

// سجّلها (الاسم بيتقص وكامل في التلميح) - entered by (truncated, full in the tooltip)
function OwnerCell({ names }: { names: string[] }) {
  const text = names.join("، ") || "—";
  return (
    <td className="px-2 text-gray-300 text-[14px] max-w-[11vw]">
      <span className="block truncate" title={text}>
        {text}
      </span>
    </td>
  );
}

const distinct = (list: string[]) => Array.from(new Set(list.filter(Boolean)));

// سطر صغير في صف اليوم: مدى أوقات التسجيل واللي سجّلوا - the day row's line: range of entry times and who entered
function DayEntered({ invoices, date }: { invoices: RepInvoice[]; date: string }) {
  const times = invoices.map((i) => i.creation).filter(Boolean).sort();
  if (times.length === 0) return null;
  const show = (c: string) => (c.slice(0, 10) === date ? formatTime12(c.slice(11, 16)) : enteredAt(c));
  const first = show(times[0]);
  const last = show(times[times.length - 1]);
  const who = distinct(invoices.map((i) => i.owner)).join("، ");
  const text = `اتسجلت: ${first === last ? first : `من ${first} لـ ${last}`} · سجّلها: ${who || "—"}`;
  return (
    // بيلف على سطرين لو العرض مش كفاية (من غير ما يوسّع الجدول) - wraps instead of widening the table
    <span className="block whitespace-normal break-words" title={text}>
      اتسجلت: {first !== last && "من "}
      <span dir="ltr" className="font-numbers text-gray-300 whitespace-nowrap">{first}</span>
      {first !== last && (
        <>
          {" "}
          لـ <span dir="ltr" className="font-numbers text-gray-300 whitespace-nowrap">{last}</span>
        </>
      )}
      {" · "}سجّلها: <span className="text-gray-300">{who || "—"}</span>
    </span>
  );
}

// عملاء اليوم: صف لكل عميل (إجمالي العميل)، ولو ليه أكتر من فاتورة صف فرعي لكل فاتورة؛ الضغط على الفاتورة يفتح تفاصيلها
// The day's customers: one row per customer (its total); with more than one invoice a sub-row per invoice; clicking opens it
function DayCustomers({ invoices, onOpenInvoice }: { invoices: RepInvoice[]; onOpenInvoice: (invoice: RepInvoice) => void }) {
  const groups = new Map<string, RepInvoice[]>();
  for (const inv of invoices) groups.set(inv.customer, [...(groups.get(inv.customer) ?? []), inv]);
  const row = "bg-background/60 text-[15px] leading-[1.9]";
  const nameTd = "pe-2 border-b border-cardBorder/40 max-w-[260px] truncate";
  return (
    <>
      {Array.from(groups.entries()).map(([customer, list]) => {
        if (list.length === 1) {
          const inv = list[0];
          return (
            <tr key={inv.id} onClick={() => onOpenInvoice(inv)} className={`${row} cursor-pointer hover:bg-white/5`}>
              <td className={`ps-10 ${nameTd} text-gray-300`} title={`${toEnglishDigits(customer)} — ${inv.id}`}>
                {toEnglishDigits(customer)}
              </td>
              {inv.columns.map((value, i) => (
                <Cell key={i} value={value} />
              ))}
              <Cell value={inv.packets} strong />
              <Cell value={inv.amount} money />
              <td className="px-2 text-center text-statusRed text-sm">{inv.isReturn ? "مرتجع" : ""}</td>
              <EnteredCell invoice={inv} />
              <OwnerCell names={[inv.owner]} />
            </tr>
          );
        }
        const sum = (pick: (i: RepInvoice) => number) => list.reduce((s, i) => s + pick(i), 0);
        const width = list[0].columns.length;
        return (
          <Fragment key={customer}>
            <tr className={row}>
              <td className={`ps-10 ${nameTd} text-gray-200 font-semibold`} title={toEnglishDigits(customer)}>
                {toEnglishDigits(customer)} <span className="text-gray-500 font-normal text-[13px]">({formatNumber(list.length)} فواتير)</span>
              </td>
              {Array.from({ length: width }, (_, i) => (
                <Cell key={i} value={Math.round(sum((inv) => inv.columns[i]) * 100) / 100} />
              ))}
              <Cell value={Math.round(sum((inv) => inv.packets) * 100) / 100} strong />
              <Cell value={sum((inv) => inv.amount)} money />
              <td className="px-2" />
              <td className="px-2" />
              <OwnerCell names={distinct(list.map((i) => i.owner))} />
            </tr>
            {list.map((inv) => (
              <tr key={inv.id} onClick={() => onOpenInvoice(inv)} className="bg-background/40 text-[14px] leading-[1.8] cursor-pointer hover:bg-white/5 text-gray-400">
                <td className={`ps-14 ${nameTd}`} title={inv.id}>
                  ↳ <span dir="ltr" className="font-numbers">{inv.id}</span>
                </td>
                <td colSpan={width + 2} className="border-b border-cardBorder/40" />
                <td className="px-2 text-center text-statusRed text-sm border-b border-cardBorder/40">{inv.isReturn ? "مرتجع" : ""}</td>
                <EnteredCell invoice={inv} />
                <OwnerCell names={[inv.owner]} />
              </tr>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

// ===== البحث عن عميل - the customer search =====

// توحيد الكتابة العربي: أ/إ/آ = ا، ة = ه، ى = ي، من غير تشكيل ولا مسافات - Arabic-normalized text for matching
function normalizeAr(text: string): string {
  return toEnglishDigits(text)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "");
}

type CustomerFilter = {
  days: RepDay[]; // الأيام اللي فيها فواتير العميل بس، وفيها فواتيره بس - only the customer's days, with only their invoices
  total: { columns: number[]; packets: number; amount: number; customers: number };
  invoices: number;
  lastBuy: string | null; // آخر فاتورة بيع (مش مرتجع) - the latest sale (not a return)
};

// نفس أرقام الفواتير، متجمعة تاني لفواتير العميل بس - the same invoice numbers, re-summed over the customer's invoices only
function filterDays(days: RepDay[], match: (name: string) => boolean, width: number): CustomerFilter {
  const list: RepDay[] = [];
  for (const day of days) {
    const invoices = day.invoices.filter((inv) => match(inv.customer));
    if (invoices.length === 0) continue;
    const columns = new Array<number>(width).fill(0);
    for (const inv of invoices) inv.columns.forEach((v, i) => (columns[i] += v));
    list.push({
      date: day.date,
      columns,
      packets: invoices.reduce((s, i) => s + i.packets, 0),
      amount: Math.round(invoices.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      customers: new Set(invoices.filter((i) => !i.isReturn).map((i) => i.customer)).size,
      invoices,
    });
  }
  const columns = new Array<number>(width).fill(0);
  for (const day of list) day.columns.forEach((v, i) => (columns[i] += v));
  const sales = list.filter((d) => d.invoices.some((i) => !i.isReturn)).map((d) => d.date);
  return {
    days: list,
    total: {
      columns,
      packets: list.reduce((s, d) => s + d.packets, 0),
      amount: Math.round(list.reduce((s, d) => s + d.amount, 0) * 100) / 100,
      customers: list.reduce((s, d) => s + d.customers, 0),
    },
    invoices: list.reduce((s, d) => s + d.invoices.length, 0),
    lastBuy: sales.length ? sales.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

// مديونية العملاء اللي بيطابقوا البحث بس - the debt of the matching customers only
function debtFor(debt: RepDebt, match: (name: string) => boolean): RepDebt {
  const list = debt.list.filter((c) => match(c.customer));
  return { ...debt, list, amount: Math.round(list.reduce((s, c) => s + c.amount, 0) * 100) / 100, customers: list.length };
}

// أيام العميل (مفتوحة) وفواتيره، مقسمة بالشهر في "كل الشهور"، وفوقهم ملخص صغير
// The customer's days (expanded) and invoices, grouped by month in "كل الشهور", under a small summary
function CustomerSales({
  f,
  columns,
  wholeYear,
  showCustomer,
  debt,
  period,
  name,
  onOpenInvoice,
}: {
  f: CustomerFilter;
  columns: string[];
  wholeYear: boolean;
  showCustomer: boolean;
  debt: number | null;
  period: string;
  name: string;
  onOpenInvoice: (invoice: RepInvoice) => void;
}) {
  const th = "px-2 py-2 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const foot = "px-2 text-center border-t-2 border-brandOrange/50";
  const span = columns.length + 6;
  const box = "rounded-xl border border-cardBorder bg-background/70 px-4 py-1";
  const label = "text-gray-400 font-semibold text-[14px] leading-[1.7]";
  const value = "text-[24px] font-extrabold leading-[1.35]";
  const months = new Map<string, RepDay[]>();
  for (const day of f.days) months.set(day.date.slice(0, 7), [...(months.get(day.date.slice(0, 7)) ?? []), day]);

  return (
    <>
      {/* الملخص - the summary */}
      <div className="flex flex-wrap items-stretch gap-3 px-5 py-3 border-b border-cardBorder">
        <div className={box}>
          <p className={label}>عدد الفواتير</p>
          <Num value={f.invoices} className={`${value} text-white`} />
        </div>
        <div className={box}>
          <p className={label}>إجمالي الباكت</p>
          <Num value={f.total.packets} className={`${value} text-brandYellow`} />
        </div>
        <div className={box}>
          <p className={label}>إجمالي المبلغ</p>
          <Money value={f.total.amount} className={`${value} text-white`} />
        </div>
        <div className={box}>
          <p className={label}>آخر شراء</p>
          <p className={`${value} text-gray-100`}>{f.lastBuy ? <span dir="ltr" className="font-numbers">{formatDate(f.lastBuy)}</span> : "—"}</p>
        </div>
        <div className={box}>
          <p className={label}>المديونية الحالية</p>
          {debt === null ? (
            <p className={`${value} text-gray-500`}>—</p>
          ) : (
            <Money value={debt} className={`${value} ${Math.round(debt) > 0 ? "text-brandOrange" : "text-statusGreen"}`} />
          )}
        </div>
      </div>

      {f.days.length === 0 ? (
        <div className="py-16 text-center text-xl text-gray-400">
          مفيش فواتير لـ &quot;{toEnglishDigits(name)}&quot; في {period}
        </div>
      ) : (
        <table className="w-full border-separate border-spacing-0 text-[16px] leading-[2.1]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className={`${th} text-start ps-5`}>التاريخ / الفاتورة</th>
              {columns.map((c) => (
                <th key={c} className={th}>
                  {c}
                </th>
              ))}
              <th className={`${th} text-gray-200`}>إجمالي الباكت</th>
              <th className={th}>إجمالي المبلغ (ج.م)</th>
              <th className={th}>عدد العملاء</th>
              <th className={th}>اتسجلت</th>
              <th className={`${th} text-start`}>سجّلها</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(months.entries()).map(([month, days]) => (
              <Fragment key={month}>
                {wholeYear && (
                  <tr>
                    <td colSpan={span} className="ps-5 bg-brandOrange/10 border-b border-brandOrange/30 text-brandOrange font-extrabold text-[17px]">
                      {monthLabel(month)}
                      <span className="ms-3 text-gray-400 font-semibold text-[15px]">
                        <Num value={days.reduce((s, d) => s + d.packets, 0)} className="text-gray-200" /> باكت ·{" "}
                        <Money value={days.reduce((s, d) => s + d.amount, 0)} className="text-gray-200" />
                      </span>
                    </td>
                  </tr>
                )}
                {days.map((day) => (
                  <Fragment key={day.date}>
                    <tr className="bg-brandOrange/5">
                      <td className="ps-3 pe-2 border-b border-cardBorder/60 whitespace-nowrap text-gray-200 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronDown size={18} className="text-brandOrange" />
                          {formatDayName(day.date)}
                        </span>
                      </td>
                      {day.columns.map((v, i) => (
                        <Cell key={i} value={v} />
                      ))}
                      <Cell value={day.packets} strong />
                      <Cell value={day.amount} money />
                      <Cell value={day.customers} />
                      <td colSpan={2} className="px-2 border-b border-cardBorder/60 text-[13px] leading-[1.5] text-gray-400 max-w-0">
                        <DayEntered invoices={day.invoices} date={day.date} />
                      </td>
                    </tr>
                    {day.invoices.map((inv) => (
                      <tr key={inv.id} onClick={() => onOpenInvoice(inv)} className="bg-background/60 text-[15px] leading-[1.9] cursor-pointer hover:bg-white/5">
                        <td className="ps-10 pe-2 border-b border-cardBorder/40 max-w-[300px] truncate text-gray-300" title={`${toEnglishDigits(inv.customer)} — ${inv.id}`}>
                          <span dir="ltr" className="font-numbers">{inv.id}</span>
                          {showCustomer && <span className="ms-2 text-gray-400">{toEnglishDigits(inv.customer)}</span>}
                        </td>
                        {inv.columns.map((v, i) => (
                          <Cell key={i} value={v} />
                        ))}
                        <Cell value={inv.packets} strong />
                        <Cell value={inv.amount} money />
                        <td className="px-2 text-center text-statusRed text-sm">{inv.isReturn ? "مرتجع" : ""}</td>
                        <EnteredCell invoice={inv} />
                        <OwnerCell names={[inv.owner]} />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
          {/* إجمالي العميل - the customer's totals */}
          <tfoot className="sticky bottom-0 z-10 bg-card">
            <tr className="font-bold">
              <td className="ps-5 pe-2 border-t-2 border-brandOrange/50 text-white whitespace-nowrap">{wholeYear ? "إجمالي السنة" : "إجمالي الشهر"}</td>
              {f.total.columns.map((v, i) => (
                <td key={i} className={foot}>
                  {v ? <Num value={v} className="text-white" /> : <span className="text-gray-600">—</span>}
                </td>
              ))}
              <td className={foot}>
                <Num value={f.total.packets} className="text-brandYellow text-[18px] font-extrabold" />
              </td>
              <td className={foot}>
                <Num value={Math.round(f.total.amount)} className="text-white" />
              </td>
              <td className={foot}>
                <Num value={f.total.customers} className="text-gray-300" />
              </td>
              <td colSpan={2} className="border-t-2 border-brandOrange/50" />
            </tr>
          </tfoot>
        </table>
      )}
    </>
  );
}
