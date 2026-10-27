"use client";

import { useEffect, useRef, useState } from "react";
import { BatchCounts, BatchExit, Batches } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface BatchesSectionProps {
  data: Batches | null; // null = ERPNext مش بيرد ومفيش نتيجة قديمة - ERPNext down with no last good result
}

// الأنواع بالترتيب ولون كل نوع - wood types in order, with each one's color
const TYPES: { key: keyof BatchCounts; label: string; text: string; border: string; tint: string; dot: string }[] = [
  { key: "orange", label: "برتقال", text: "text-brandOrange", border: "border-brandOrange/40", tint: "bg-brandOrange/10", dot: "bg-brandOrange" },
  { key: "mango", label: "مانجا", text: "text-brandYellow", border: "border-brandYellow/40", tint: "bg-brandYellow/10", dot: "bg-brandYellow" },
  { key: "casuarina", label: "جازورينا", text: "text-statusGreen", border: "border-statusGreen/40", tint: "bg-statusGreen/10", dot: "bg-statusGreen" },
];

function OfflineBadge() {
  return (
    <div className="flex items-center gap-1.5 bg-statusRed/10 px-2.5 py-1 rounded-lg border border-statusRed/50">
      <div className="w-2 h-2 rounded-full bg-statusRed" />
      <span className="text-statusRed text-xs font-semibold">غير متصل</span>
    </div>
  );
}

// 3 مربعات ملونة + الإجمالي، والصفر رمادي - 3 colored tiles + total; zeros are gray
function CountTiles({ counts }: { counts: BatchCounts }) {
  const sizes = dashboardConfig.sizes.batches;
  const total = counts.orange + counts.mango + counts.casuarina;

  const tile = (key: string, label: string, value: number, text: string, border: string, tint: string) => (
    <div
      key={key}
      className={`rounded-xl border flex flex-col items-center justify-center py-1.5 min-w-0 ${
        value === 0 ? "border-cardBorder bg-background" : `${border} ${tint}`
      }`}
    >
      <p
        className={`font-bold tabular-nums leading-tight ${value === 0 ? "text-gray-500" : text}`}
        style={{ fontSize: `${key === "total" ? sizes.totalFontSize : sizes.tileFontSize}px` }}
      >
        {formatNumber(value)}
      </p>
      <p className={`text-xs font-semibold ${value === 0 ? "text-gray-500" : text}`}>{label}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-4 gap-2 shrink-0">
      {TYPES.map((type) => tile(type.key, type.label, counts[type.key], type.text, type.border, type.tint))}
      {tile("total", "الإجمالي", total, "text-white", "border-white/25", "bg-white/5")}
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
        const type = TYPES.find((t) => t.key === exit.type);
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
            <span className={`flex items-center gap-1.5 min-w-0 font-semibold ${type?.text ?? "text-gray-400"}`}>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${type?.dot ?? "bg-gray-500"}`} />
              <span className="truncate">{type?.label ?? (exit.typeLabel || "غير محدد")}</span>
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
          <CountTiles counts={data.out} />
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
