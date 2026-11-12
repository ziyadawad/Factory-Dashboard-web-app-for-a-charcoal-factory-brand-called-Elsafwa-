"use client";

import { useEffect, useRef, useState } from "react";
import { BatchExit, BatchTypeCount, Batches } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";

interface BatchesSectionProps {
  data: Batches | null; // null = ERPNext مش بيرد ومفيش نتيجة قديمة - ERPNext down with no last good result
}

// لون النوع بشفافية (hex + alpha) - the type color with transparency (hex + alpha)
const withAlpha = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;

// مربع ملون لكل نوع (بترتيب الأنواع من ERPNext) + الإجمالي، والصفر رمادي
// A colored tile per type (in the ERPNext type order) + the total; zeros are gray
function CountTiles({ types }: { types: BatchTypeCount[] }) {
  const sizes = dashboardConfig.sizes.batches;
  const total = types.reduce((sum, t) => sum + t.count, 0);
  // كل ما الأنواع تزيد الرقم بيصغر شوية عشان الصف يفضل واخد مكانه - more types: a bit smaller numbers so the row fits
  const scale = types.length > 3 ? 3 / types.length + 0.15 : 1;

  const tile = (key: string, label: string, value: number, color: string | null) => (
    <div
      key={key}
      className={`rounded-xl border flex flex-col items-center justify-center py-1.5 min-w-0 ${
        value === 0 ? "border-cardBorder bg-background" : color ? "" : "border-white/25 bg-white/5"
      }`}
      style={value !== 0 && color ? { borderColor: withAlpha(color, 0.4), backgroundColor: withAlpha(color, 0.1) } : undefined}
    >
      <p
        className={`font-bold tabular-nums leading-tight ${value === 0 ? "text-gray-500" : color ? "" : "text-white"}`}
        style={{
          fontSize: `${Math.round((key === "total" ? sizes.totalFontSize : sizes.tileFontSize) * scale)}px`,
          color: value !== 0 && color ? color : undefined,
        }}
      >
        {formatNumber(value)}
      </p>
      <p
        className={`${types.length > 3 ? "text-[10px]" : "text-xs"} font-semibold max-w-full truncate ${value === 0 ? "text-gray-500" : color ? "" : "text-white"}`}
        style={{ color: value !== 0 && color ? color : undefined }}
      >
        {label}
      </p>
    </div>
  );

  return (
    <div className="grid gap-1.5 shrink-0" style={{ gridTemplateColumns: `repeat(${types.length + 1}, minmax(0,1fr))` }}>
      {types.map((type) => tile(`type-${type.label}`, type.label, type.count, type.color))}
      {tile("total", "الإجمالي", total, null)}
    </div>
  );
}

// قايمة طرحات النهارده: بتعرض اللي ياخد مكانه، والباقي "و X طرحة أخرى"
// Today's exits: as many rows as fit, the rest summed up as "و X طرحة أخرى"
function ExitList({ exits }: { exits: BatchExit[] }) {
  const { exitRowHeight, exitFontSize } = dashboardConfig.sizes.batches;
  const gap = 4;
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setFit(Math.max(0, Math.floor((el.clientHeight + gap) / (exitRowHeight + gap))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [exitRowHeight]);

  // لو مش كلهم واخدين مكانهم، آخر سطر بيبقى "و X طرحة أخرى" - if they don't all fit, the last row is the "more" line
  const shown = exits.length <= fit ? exits.length : Math.max(0, fit - 1);
  const hidden = exits.length - shown;

  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ gap }}>
      {exits.length === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-cardBorder">
          <p className="text-gray-500 text-sm">لم تخرج طرحات اليوم</p>
        </div>
      )}
      {exits.slice(0, shown).map((exit) => {
        return (
          <div
            key={exit.id}
            className="shrink-0 flex items-center gap-2 px-2 rounded-lg bg-background/60 border border-cardBorder"
            style={{ height: exitRowHeight, fontSize: exitFontSize }}
          >
            <span className="text-gray-300 font-semibold tabular-nums w-12 shrink-0" dir="ltr">
              {exit.time}
            </span>
            <span className="px-2 rounded-md bg-white/10 text-white font-semibold whitespace-nowrap shrink-0 leading-6">
              {toEnglishDigits(exit.kiln || "—")}
            </span>
            <span
              className={`flex items-center gap-1.5 min-w-0 font-semibold ${exit.color ? "" : "text-gray-400"}`}
              style={{ color: exit.color ?? undefined }}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${exit.color ? "" : "bg-gray-500"}`}
                style={{ backgroundColor: exit.color ?? undefined }}
              />
              <span className="truncate">{exit.typeLabel || "غير محدد"}</span>
            </span>
          </div>
        );
      })}
      {hidden > 0 && (
        <div
          className="shrink-0 flex items-center justify-center text-gray-400 font-semibold"
          style={{ height: exitRowHeight, fontSize: exitFontSize }}
        >
          و {formatNumber(hidden)} طرحة أخرى
        </div>
      )}
    </div>
  );
}

export default function BatchesSection({ data }: BatchesSectionProps) {
  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white">الطرحات اليوم</h2>
        {data?.offline && <OfflineBadge />}
      </div>

      {data ? (
        <section className="flex-1 min-h-0 flex flex-col gap-2">
          <h3 className="text-gray-300 font-bold text-sm shrink-0">خروج طرحات</h3>
          {/* types ممكن تكون ناقصة في نسخة قديمة محفوظة في المتصفح - may be missing in an old browser copy */}
          <CountTiles types={data.types ?? []} />
          <ExitList exits={data.exits} />
        </section>
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <OfflineBadge />
        </div>
      )}
    </div>
  );
}
