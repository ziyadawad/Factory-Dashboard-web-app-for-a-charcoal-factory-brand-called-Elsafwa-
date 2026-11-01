"use client";

import { ReactNode, useEffect, useState } from "react";
import { DATE_LOCALE, formatNumber } from "@/lib/format";
import { ProductPackets } from "@/lib/types";

// رقم بأرقام إنجليزي وخط الأرقام - a number in Latin digits with the numbers font
export function Num({ value, className = "", style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span dir="ltr" className={`font-numbers tabular-nums whitespace-nowrap ${className}`} style={style}>
      {formatNumber(value)}
    </span>
  );
}

// نسبة "92%" (الرقم والعلامة مع بعض شمال لليمين) - a percentage, number and sign kept together
export function Percent({ value, className = "", style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span dir="ltr" className={`font-numbers tabular-nums whitespace-nowrap ${className}`} style={style}>
      {formatNumber(value)}%
    </span>
  );
}

// "2026-11" -> "نوفمبر" - month name
export function monthName(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return "";
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(DATE_LOCALE, { month: "long", timeZone: "UTC" });
}

// "من 3 أيام" - how long ago, in days
export function daysAgoText(days: number): string {
  if (days <= 0) return "النهارده";
  if (days === 1) return "امبارح";
  if (days === 2) return "من يومين";
  if (days <= 10) return `من ${days} أيام`;
  return `من ${days} يوم`;
}

// كبسولات المنتجات (ربع / نص / كيلو / 2 كيلو / 3 كيلو)، في سطر واحد - product chips, one line
export function ProductChips({ products, fontSize, accent, center = false }: {
  products: ProductPackets[];
  fontSize: number;
  accent: string;
  center?: boolean;
}) {
  return (
    <div className={`flex gap-1.5 ${center ? "flex-wrap justify-center" : ""}`}>
      {products.map((p) => (
        <div
          key={p.label}
          className={`flex items-center justify-center gap-1.5 rounded-lg border border-cardBorder bg-background/70 px-2 leading-[1.75] whitespace-nowrap ${
            center ? "" : "flex-1 min-w-0"
          }`}
          style={{ fontSize }}
        >
          <span className="text-gray-400 font-semibold">{p.label}</span>
          <Num value={p.packets} className={`font-bold ${p.packets > 0 ? accent : "text-gray-600"}`} />
        </div>
      ))}
    </div>
  );
}

// الشريط اللي فوق الصفحة - the strip at the top of a page
export function SummaryStrip({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div
      className="shrink-0 bg-card border border-cardBorder rounded-2xl px-5 flex items-center gap-6 overflow-hidden"
      style={{ height }}
    >
      {children}
    </div>
  );
}

// المقاسات الصغيرة لو صف الكروت أقصر من threshold (clientHeight مش بيتأثر بالـ scale)
// Compact sizes when a card row is shorter than threshold (clientHeight ignores the scale() canvas)
export function useCompactRows<T extends object>(
  normal: T,
  compact: Partial<T>,
  threshold: number,
  rows = 2,
  gap = 16
): { ref: (el: HTMLDivElement | null) => void; sizes: T } {
  // callback ref عشان الشبكة ممكن تظهر بعد أول render (لما البيانات توصل) - the grid may mount after the first render
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [isCompact, setCompact] = useState(false);
  useEffect(() => {
    if (!el) return;
    const measure = () => setCompact((el.clientHeight - gap * (rows - 1)) / rows < threshold);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, threshold, rows, gap]);
  return { ref, sizes: isCompact ? { ...normal, ...compact } : normal };
}
