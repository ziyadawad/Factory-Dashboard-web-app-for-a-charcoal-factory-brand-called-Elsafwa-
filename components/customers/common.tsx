"use client";

// حاجات مشتركة بين صفحة العملاء ولوحة العميل - shared bits of the customers page and the customer panel
import { formatNumber } from "@/lib/format";
import type { CustomerRow, CustomersRep } from "@/lib/customer-types";

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("login required");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const NO_REP = "__none__";

// "2026-11-24" -> "24/11/2026"
export const fmtDate = (date: string | null | undefined) => {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
};

export function N({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span dir="ltr" className={`font-numbers tabular-nums whitespace-nowrap ${className}`}>
      {formatNumber(Math.round(value))}
    </span>
  );
}

export function Money({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className="whitespace-nowrap">
      <N value={value} className={className} /> <span className="text-gray-500 text-[0.8em]">ج.م</span>
    </span>
  );
}

// لون آخر شرا: أخضر أقل من 7 أيام، كهرماني 7–14، أحمر أكتر - recency color: green < 7, amber 7–14, red > 14
export function recency(days: number | null, inactiveDays: number) {
  if (days === null) return { text: "لسه مشتراش", cls: "text-gray-400 border-gray-600/50 bg-gray-500/10" };
  const text = days === 0 ? "النهارده" : days === 1 ? "امبارح" : `من ${days} يوم`;
  if (days < 7) return { text, cls: "text-statusGreen border-statusGreen/40 bg-statusGreen/10" };
  if (days <= inactiveDays) return { text, cls: "text-statusAmber border-statusAmber/40 bg-statusAmber/10" };
  return { text, cls: "text-statusRed border-statusRed/40 bg-statusRed/10" };
}

export function RepChip({ rep, small = false }: { rep: CustomersRep | undefined; small?: boolean }) {
  if (!rep) return <span className={`text-gray-500 ${small ? "text-[12px]" : "text-[13px]"}`}>بدون مندوب</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap ${small ? "px-1.5 text-[12px]" : "px-2 py-0.5 text-[13px]"}`}
      style={{ color: "#E5E7EB", background: `${rep.color}26`, border: `1px solid ${rep.color}88` }}
    >
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: rep.color }} />
      {rep.name}
    </span>
  );
}

// موبايل مصري → رقم واتساب دولي (01xxxxxxxxx → 201xxxxxxxxx) - an Egyptian mobile → an international WhatsApp number
export function waNumber(mobile: string): string | null {
  let digits = mobile.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^01\d{9}$/.test(digits)) return `2${digits}`;
  if (/^1\d{9}$/.test(digits)) return `20${digits}`;
  if (/^201\d{9}$/.test(digits)) return digits;
  return digits.length >= 10 ? digits : null;
}

export const mapUrl = (row: Pick<CustomerRow, "gps">) => (row.gps ? `https://maps.google.com/?q=${row.gps.lat},${row.gps.lng}` : null);
