"use client";

import { useEffect, useRef, useState } from "react";
import { Batches, Kiln } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface BatchesSectionProps {
  data: Batches;
  kilns: Kiln[];
}

// ارتفاع سطر "و X طرحة أخرى" - height of the "and X more" line
const MORE_LINE_HEIGHT = 22;

const STATUS_DOT: Record<string, string> = {
  working: "bg-statusGreen",
  maintenance: "bg-statusAmber",
  stopped: "bg-statusRed",
};

// "8:30" -> 510 دقيقة عشان الترتيب يبقى صح - time to minutes so sorting is correct
function timeToMinutes(time: string) {
  const [h, m] = toEnglishDigits(time).split(":").map((part) => parseInt(part, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export default function BatchesSection({ data, kilns }: BatchesSectionProps) {
  const sizes = dashboardConfig.sizes.batches;

  // الأحدث الأول - newest first
  const rows = [...data.list].sort((a, b) => timeToMinutes(b.time) - timeToMinutes(a.time));
  const totalWeight = data.list.reduce((sum, batch) => sum + batch.weight, 0);

  // إجمالي الوزن لكل نوع بنفس ترتيب ظهوره - total weight per wood type, in first-seen order
  const perType = new Map<string, number>();
  data.list.forEach((batch) => perType.set(batch.type, (perType.get(batch.type) ?? 0) + batch.weight));

  const kilnStatus = new Map(kilns.map((kiln) => [kiln.name.trim(), kiln.status]));

  // عدد الصفوف اللي تكفي المساحة من غير ما صف يتقطع - how many whole rows fit
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setListHeight(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setListHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitsAll = rows.length * sizes.rowHeight <= listHeight;
  const visibleCount = fitsAll
    ? rows.length
    : Math.max(0, Math.floor((listHeight - MORE_LINE_HEIGHT) / sizes.rowHeight));
  const hiddenCount = rows.length - visibleCount;

  const gridColumns = "minmax(0,1.1fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,0.8fr)";

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">الطرحات اليوم</h2>

      <div className="grid grid-cols-2 gap-2 shrink-0">
        <div className="bg-background rounded-xl py-1.5 text-center border border-brandOrange/30">
          <p className="leading-tight whitespace-nowrap">
            <span className="font-bold text-brandOrange tabular-nums" style={{ fontSize: `${sizes.totalFontSize}px` }}>
              {formatNumber(totalWeight)}
            </span>
            <span className="text-gray-400 text-xs"> {data.unit}</span>
          </p>
          <p className="text-gray-400 text-xs">إجمالي الوزن</p>
        </div>
        <div className="bg-background rounded-xl py-1.5 text-center border border-cardBorder">
          <p
            className="font-bold text-white tabular-nums leading-tight"
            style={{ fontSize: `${sizes.totalFontSize}px` }}
          >
            {formatNumber(data.list.length)}
          </p>
          <p className="text-gray-400 text-xs">عدد الطرحات</p>
        </div>
      </div>

      {perType.size > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 shrink-0">
          {Array.from(perType.entries()).map(([type, weight]) => (
            <span
              key={type}
              className="bg-brandOrange/15 text-white rounded-md px-2 py-0.5 whitespace-nowrap"
              style={{ fontSize: `${sizes.typeChipFontSize}px` }}
            >
              {toEnglishDigits(type)}:{" "}
              <span className="font-bold tabular-nums">{formatNumber(weight)}</span> {data.unit}
            </span>
          ))}
        </div>
      )}

      <div
        className="grid gap-2 px-2 mt-2 pb-1 border-b border-cardBorder text-gray-400 text-xs shrink-0"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span>الفرن</span>
        <span>النوع</span>
        <span>الوزن</span>
        <span>الوقت</span>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-3">لا يوجد طرحات اليوم</p>
        ) : (
          <>
            {rows.slice(0, visibleCount).map((batch, index) => (
              <div
                key={index}
                className="grid gap-2 px-2 items-center border-b border-cardBorder/60 text-white"
                style={{
                  gridTemplateColumns: gridColumns,
                  height: `${sizes.rowHeight}px`,
                  fontSize: `${sizes.rowFontSize}px`,
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      STATUS_DOT[kilnStatus.get(batch.kiln.trim()) ?? ""] ?? "bg-gray-500"
                    }`}
                  />
                  <span className="truncate font-bold">{toEnglishDigits(batch.kiln)}</span>
                </span>
                <span className="truncate">{toEnglishDigits(batch.type)}</span>
                <span className="truncate tabular-nums">
                  {formatNumber(batch.weight)} <span className="text-gray-400 text-xs">{data.unit}</span>
                </span>
                <span className="truncate tabular-nums text-gray-300 text-right" dir="ltr">
                  {toEnglishDigits(batch.time)}
                </span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <p
                className="text-gray-400 text-xs text-center flex items-center justify-center"
                style={{ height: `${MORE_LINE_HEIGHT}px` }}
              >
                و {formatNumber(hiddenCount)} طرحة أخرى
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
