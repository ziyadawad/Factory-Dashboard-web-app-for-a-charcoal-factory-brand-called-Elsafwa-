"use client";

// لوحة تفاصيل مورد (نفس ستايل اللوحات التانية): تابات الشهور + "الكل"، ملخص (الموّرد، المدفوع، الرصيد دلوقتي، أقدم فاتورة
// مش مدفوعة)، إجمالي كل نوع خشب (الشهر ده ومن الأول) لموردين الخشب، التوريدات بأصنافها، الدفعات (من أنهي خزنة)،
// وكشف حساب (مدين / دائن / الرصيد) بلينكات ERPNext. البيانات بتتجاب بس واللوحة مفتوحة (كاش 60 ثانية على السيرفر)
// A supplier's details panel (same style as the others): month tabs + "الكل", a summary, per-wood-type totals (this month
// and all time) for wood suppliers, supplies with items, payments (from which wallet) and a running statement with
// ERPNext links. Fetched only while the panel is open (60 s server cache)

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import useSWR from "swr";
import { dashboardConfig } from "@/config/dashboard.config";
import { formatDayName, formatNumber, formatTime12 } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";
import { SupplierDetails, SupplyDoc } from "@/lib/types";
import { monthName } from "./SalesCommon";
import { balanceLabel } from "./SuppliersPage";

const cats = dashboardConfig.suppliers.categories;

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("login required");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

const n = (text: string) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {text}
  </span>
);
const money = (v: number) => formatNumber(Math.round(v * 100) / 100);
const docUrl = (base: string, doctype: string, name: string) => `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;
const voucherLabel = (t: string) => (t === "Purchase Invoice" ? "فاتورة" : t === "Payment Entry" ? "سند صرف" : t === "Journal Entry" ? "قيد يومية" : t);

function Box({ label, value, unit, sub, className = "text-white" }: { label: string; value: string; unit?: string; sub?: string; className?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-background/60 border border-cardBorder px-3 py-1.5 text-center">
      <p className="text-gray-400 whitespace-nowrap text-[0.9em]">{label}</p>
      <p className={`font-extrabold text-[1.35em] leading-tight whitespace-nowrap ${className}`}>
        {n(value)}
        {unit && <span className="text-gray-500 text-[0.6em] font-semibold"> {unit}</span>}
      </p>
      {sub && <p className="text-gray-500 text-[0.8em] truncate">{sub}</p>}
    </div>
  );
}

// كميات بالوحدة من أصناف فواتير - quantities per unit from invoice items
function qtyOf(docs: SupplyDoc[]): string {
  const map = new Map<string, number>();
  for (const d of docs) for (const i of d.items) map.set(i.unit || "وحدة", (map.get(i.unit || "وحدة") ?? 0) + i.qty);
  const list = Array.from(map).filter(([, q]) => Math.abs(q) > 0.0001);
  return list.length ? list.map(([u, q]) => `${formatNumber(Math.round(q * 100) / 100)} ${u}`).join(" + ") : "—";
}

// إجمالي كل نوع خشب - totals per wood type
function woodTotals(docs: SupplyDoc[]) {
  const map = new Map<string, { qty: number; unit: string; amount: number }>();
  for (const d of docs)
    for (const i of d.items) {
      if (!i.woodType) continue;
      const cur = map.get(i.woodType) ?? { qty: 0, unit: i.unit, amount: 0 };
      cur.qty += i.qty;
      cur.amount += i.amount;
      map.set(i.woodType, cur);
    }
  return Array.from(map, ([type, v]) => ({ type, ...v })).sort((a, b) => b.amount - a.amount);
}

export default function SupplierDetailsPanel({ name, onClose }: { name: string; onClose: () => void }) {
  useIdleClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { data, error } = useSWR<SupplierDetails>(`/api/suppliers/details?name=${encodeURIComponent(name)}`, fetcher, {
    refreshInterval: dashboardConfig.suppliers.cacheSeconds * 1000,
    revalidateOnFocus: false,
  });
  // تابات الشهور ("الكل" + الشهور اللي فيها حركة، الأحدث الأول) - month tabs ("الكل" + months with activity, newest first)
  const months = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>([...data.statement.map((l) => l.date.slice(0, 7)), ...data.supplies.map((d) => d.date.slice(0, 7))]);
    return Array.from(set).sort().reverse().slice(0, 12);
  }, [data]);
  const [month, setMonth] = useState<string>("all");
  const inMonth = (date: string) => month === "all" || date.startsWith(month);

  const cat = data?.category ? cats[data.category] : null;
  const color = cat?.color ?? "#9CA3AF";
  const b = balanceLabel(data?.balance ?? 0);

  const supplies = (data?.supplies ?? []).filter((d) => inMonth(d.date));
  const payments = (data?.payments ?? []).filter((p) => inMonth(p.date));
  // كشف الحساب: لشهر معين = رصيد أول المدة + حركة الشهر - the statement: for a month = opening balance + that month
  const statement = (data?.statement ?? []).filter((l) => inMonth(l.date));
  const opening = month === "all" ? 0 : (() => {
    const before = (data?.statement ?? []).filter((l) => l.date < `${month}-01`);
    return before.length ? before[before.length - 1].balance : 0;
  })();
  const suppliedAmount = supplies.reduce((s, d) => s + d.total, 0);
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  const thisMonth = data?.today.slice(0, 7) ?? "";
  const woodMonth = woodTotals((data?.supplies ?? []).filter((d) => d.date.startsWith(thisMonth)));
  const woodAll = woodTotals(data?.supplies ?? []);

  const th = "px-3 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder sticky top-0 bg-card z-10";
  const td = "px-3 py-1.5 border-b border-cardBorder/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div
        className="w-full h-full max-w-[1600px] bg-card border rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[16px]"
        style={{ borderColor: `${color}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* الهيدر - header */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-cardBorder" style={{ background: `linear-gradient(180deg, ${color}26, transparent)` }}>
          <h2 className="font-extrabold text-white text-[24px] min-[1600px]:text-[26px] leading-[1.5]">{name}</h2>
          {cat && (
            <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold" style={{ color, background: `${color}22`, border: `1px solid ${color}55` }}>
              {cat.icon} {data?.category === "wood" ? "خشب" : "بلاستيك"}
            </span>
          )}
          {data?.group && <span className="text-gray-400 text-[14px]">{data.group}</span>}
          {data?.erpUrl && (
            <a href={docUrl(data.erpUrl, "Supplier", name)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[14px] text-sky-300 hover:underline">
              <ExternalLink size={14} /> افتح في ERPNext
            </a>
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

        {!data ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-[18px]">{error ? `مش قادرين نجيب بيانات المورد (${error.message})` : "جاري التحميل…"}</div>
        ) : (
          <>
            {/* تابات الشهور - month tabs */}
            <div className="shrink-0 flex items-center gap-2 overflow-x-auto px-5 py-2 border-b border-cardBorder">
              {["all", ...months].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonth(m)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[14px] font-bold border ${month === m ? "text-black" : "text-gray-300 border-cardBorder bg-background/60"}`}
                  style={month === m ? { background: color, borderColor: color } : undefined}
                >
                  {m === "all" ? "الكل" : `${monthName(m)} ${m.slice(0, 4)}`}
                </button>
              ))}
            </div>

            {/* الملخص - the summary */}
            <div className="shrink-0 flex items-stretch gap-3 px-5 py-3 border-b border-cardBorder">
              <Box label={month === "all" ? "إجمالي التوريد" : "توريد الشهر"} value={money(suppliedAmount)} unit="ج.م" sub={qtyOf(supplies)} />
              <Box label={month === "all" ? "إجمالي المدفوع" : "مدفوع الشهر"} value={money(paidAmount)} unit="ج.م" sub={`${formatNumber(payments.length)} دفعة`} />
              <Box label={`الرصيد دلوقتي — ${b.label}`} value={money(Math.abs(data.balance))} unit="ج.م" className={b.className} />
              <Box
                label="أقدم فاتورة مش مدفوعة"
                value={data.oldestUnpaid ? `${formatNumber(data.oldestUnpaid.days)}` : "—"}
                unit={data.oldestUnpaid ? "يوم" : undefined}
                sub={data.oldestUnpaid ? `${formatDayName(data.oldestUnpaid.date)} · باقي ${money(data.oldestUnpaid.outstanding)} ج.م` : "كله مدفوع"}
                className={data.oldestUnpaid && data.oldestUnpaid.days > 30 ? "text-statusRed" : "text-white"}
              />
            </div>

            {/* أنواع الخشب: الشهر ده ومن الأول - wood types: this month and all time */}
            {data.category === "wood" && woodAll.length > 0 && (
              <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 py-2 border-b border-cardBorder text-[14px]">
                <span className="font-bold text-gray-300">🪵 أنواع الخشب:</span>
                {woodAll.map((w) => {
                  const m = woodMonth.find((x) => x.type === w.type);
                  return (
                    <span key={w.type} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                      <b>{w.type}</b> — الشهر ده {n(m ? `${formatNumber(Math.round(m.qty * 100) / 100)} ${m.unit}` : "0")} · من الأول{" "}
                      {n(`${formatNumber(Math.round(w.qty * 100) / 100)} ${w.unit}`)} ({n(money(w.amount))} ج.م)
                    </span>
                  );
                })}
              </div>
            )}

            {/* كشف الحساب (يمين) + التوريدات والدفعات (شمال) - statement (right) + supplies and payments (left) */}
            <div className="flex-1 min-h-0 grid gap-4 px-5 py-3" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)" }}>
              <div className="min-h-0 flex flex-col rounded-xl border border-cardBorder overflow-hidden">
                <h3 className="shrink-0 px-3 py-2 font-bold text-white border-b border-cardBorder">كشف حساب</h3>
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full border-separate border-spacing-0 leading-[1.6]">
                    <thead>
                      <tr>
                        <th className={`${th} text-start`}>التاريخ</th>
                        <th className={`${th} text-start`}>البيان</th>
                        <th className={`${th} text-center`}>مدين</th>
                        <th className={`${th} text-center`}>دائن</th>
                        <th className={`${th} text-center`}>الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {month !== "all" && (
                        <tr className="bg-white/[0.03]">
                          <td className={td} colSpan={4}>
                            <span className="font-bold text-gray-300">رصيد أول المدة</span>
                          </td>
                          <td className={`${td} text-center font-bold`}>{n(money(opening))}</td>
                        </tr>
                      )}
                      {statement.length === 0 && (
                        <tr>
                          <td className={`${td} text-center text-gray-500`} colSpan={5}>
                            مفيش حركة
                          </td>
                        </tr>
                      )}
                      {statement.map((l) => (
                        <tr key={`${l.voucher}|${l.date}`} className="hover:bg-white/5">
                          <td className={`${td} whitespace-nowrap text-gray-300`}>{formatDayName(l.date)}</td>
                          <td className={td}>
                            <a href={docUrl(data.erpUrl, l.voucherType, l.voucher)} target="_blank" rel="noopener" className="text-gray-100 hover:underline" title={l.voucher}>
                              {l.description}
                            </a>
                            <span className="ms-1 text-[12px] text-gray-500">{voucherLabel(l.voucherType)}</span>
                          </td>
                          <td className={`${td} text-center text-statusGreen`}>{l.debit ? n(money(l.debit)) : ""}</td>
                          <td className={`${td} text-center text-statusRed`}>{l.credit ? n(money(l.credit)) : ""}</td>
                          <td className={`${td} text-center font-bold ${l.balance > 0.5 ? "text-statusRed" : l.balance < -0.5 ? "text-statusGreen" : "text-gray-400"}`}>
                            {n(money(l.balance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="min-h-0 grid gap-4" style={{ gridTemplateRows: "minmax(0,1.3fr) minmax(0,1fr)" }}>
                {/* التوريدات - supplies */}
                <div className="min-h-0 flex flex-col rounded-xl border border-cardBorder overflow-hidden">
                  <h3 className="shrink-0 px-3 py-2 font-bold text-white border-b border-cardBorder">
                    التوريدات <span className="text-gray-500 font-normal">({n(formatNumber(supplies.length))})</span>
                  </h3>
                  <div className="flex-1 min-h-0 overflow-auto divide-y divide-cardBorder/60">
                    {supplies.length === 0 && <p className="p-4 text-center text-gray-500">مفيش توريد</p>}
                    {supplies.map((d) => (
                      <div key={d.doc} className="px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-100">{formatDayName(d.date)}</span>
                          <a href={docUrl(data.erpUrl, d.doctype, d.doc)} target="_blank" rel="noopener" className="text-[13px] text-sky-300 hover:underline">
                            {n(d.doc)}
                          </a>
                          {d.isReturn && <span className="rounded-full bg-statusAmber/15 px-2 text-[12px] font-bold text-statusAmber">مرتجع</span>}
                          {d.outstanding > 0.5 && <span className="rounded-full bg-statusRed/15 px-2 text-[12px] font-bold text-statusRed">باقي {n(money(d.outstanding))}</span>}
                          <span className="ms-auto font-extrabold text-white">{n(money(d.total))} <span className="text-gray-500 text-[0.8em]">ج.م</span></span>
                        </div>
                        {d.items.map((i, k) => (
                          <p key={k} className="text-[14px] text-gray-300">
                            {i.woodType ? <b className="text-amber-200">{i.woodType}</b> : i.itemName} — {n(`${formatNumber(i.qty)} ${i.unit}`)} × {n(money(i.rate))} = {n(money(i.amount))}
                          </p>
                        ))}
                        {(d.billNo || d.remarks) && <p className="text-[13px] text-gray-500">{[d.billNo && `فاتورة المورد ${d.billNo}`, d.remarks].filter(Boolean).join(" · ")}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                {/* الدفعات - payments */}
                <div className="min-h-0 flex flex-col rounded-xl border border-cardBorder overflow-hidden">
                  <h3 className="shrink-0 px-3 py-2 font-bold text-white border-b border-cardBorder">
                    الدفعات <span className="text-gray-500 font-normal">({n(formatNumber(payments.length))})</span>
                  </h3>
                  <div className="flex-1 min-h-0 overflow-auto divide-y divide-cardBorder/60">
                    {payments.length === 0 && <p className="p-4 text-center text-gray-500">مفيش دفعات</p>}
                    {payments.map((p) => (
                      <div key={p.voucher} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-100">{formatDayName(p.date)}</span>
                        <span className="text-[13px] text-gray-500">{n(formatTime12(p.createdAt))}</span>
                        <span className="text-[14px] text-gray-300">من {p.from || "—"}</span>
                        {p.reference && <span className="text-[13px] text-gray-500">مرجع {n(p.reference)}</span>}
                        <a href={docUrl(data.erpUrl, p.voucherType, p.voucher)} target="_blank" rel="noopener" className="text-[13px] text-sky-300 hover:underline">
                          {n(p.voucher)}
                        </a>
                        <span className="ms-auto font-extrabold text-statusGreen">{n(money(p.amount))} <span className="text-gray-500 text-[0.8em]">ج.م</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
