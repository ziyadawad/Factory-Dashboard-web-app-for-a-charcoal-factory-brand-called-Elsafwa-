"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Attendance } from "@/lib/types";
import { PieChart, Pie, Cell } from "recharts";
import { Check, X } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface AttendanceSectionProps {
  data: Attendance;
}

// ألوان كل قايمة أسامي - colors of each name list
const LIST_COLORS = {
  present: { label: "text-statusGreen", chip: "bg-statusGreen/15 text-statusGreen" },
  absent: { label: "text-statusRed", chip: "bg-statusRed/15 text-statusRed" },
  pending: { label: "text-gray-400", chip: "bg-gray-500/15 text-gray-300" },
};

// قايمة أسامي: عنوان بأيقونة وتحته الأسامي كبسولات بتنزل سطر جديد (عمرها ما بتتقص)
// A titled list of name chips that wrap onto new lines (never truncated)
function NameList({
  title,
  icon,
  names,
  colors,
  chipFontSize,
}: {
  title: string;
  icon?: ReactNode;
  names: string[];
  colors: { label: string; chip: string };
  chipFontSize: number;
}) {
  const sizes = dashboardConfig.sizes.attendance;
  return (
    <div className="shrink-0">
      <p
        className={`flex items-center gap-1 font-bold mb-1 ${colors.label}`}
        style={{ fontSize: `${sizes.listLabelFontSize}px` }}
      >
        {icon}
        {title}
      </p>
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {names.map((name, index) => (
            <span
              key={index}
              className={`rounded-md whitespace-nowrap ${colors.chip}`}
              style={{
                fontSize: `${chipFontSize}px`,
                padding: `${sizes.chipPaddingY}px ${sizes.chipPaddingX}px`,
              }}
            >
              {toEnglishDigits(name)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-gray-500" style={{ fontSize: `${chipFontSize}px` }}>
          لا يوجد
        </p>
      )}
    </div>
  );
}

export default function AttendanceSection({ data }: AttendanceSectionProps) {
  const { count: presentCount } = useCountUp(data.present, 600);
  const { count: absentCount } = useCountUp(data.absent, 600);
  const sizes = dashboardConfig.sizes.attendance;

  // لو الأسامي مش واخدة مكانها في الكارت خط الكبسولات بيصغر (لحد minChipFontSize)
  // The chip font shrinks (down to minChipFontSize) until everything fits in the card height
  const contentRef = useRef<HTMLDivElement>(null);
  const [chipFontSize, setChipFontSize] = useState(sizes.chipFontSize);
  const namesKey = JSON.stringify([data.notRecorded, data.presentNames, data.absentNames, data.allNames]);
  useIsomorphicLayoutEffect(() => setChipFontSize(sizes.chipFontSize), [sizes.chipFontSize, namesKey]);
  useIsomorphicLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const used = Array.from(el.children).reduce((sum, child) => sum + (child as HTMLElement).offsetHeight, 0);
    if (used > el.clientHeight && chipFontSize > sizes.minChipFontSize) setChipFontSize(chipFontSize - 1);
  });

  // نقيس تاني لما الخط يحمّل أو طول الكارت يتغير - re-measure when web fonts load or the card height changes
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => active && setChipFontSize(sizes.chipFontSize));
    const el = contentRef.current;
    let observer: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      let height = el.clientHeight;
      observer = new ResizeObserver(() => {
        if (el.clientHeight === height) return;
        height = el.clientHeight;
        setChipFontSize(sizes.chipFontSize);
      });
      observer.observe(el);
    }
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [sizes.chipFontSize]);

  // لو الحضور لسه متسجلش الحلقة رمادي فاضية - not recorded yet: an empty gray ring
  const chartData = data.notRecorded
    ? [{ name: "لم يسجل", value: 1, color: "#374151" }]
    : [
        { name: "حاضر", value: data.present, color: "#22C55E" },
        { name: "غائب", value: data.absent, color: "#EF4444" },
      ];

  const presentPercentage =
    data.total > 0 ? ((data.present / data.total) * 100).toFixed(0) : "0";

  // Fixed donut dimensions with 2px margin to prevent clipping
  const donutSize = sizes.donutSize;
  const outerRadius = donutSize / 2 - 2;
  const innerRadius = outerRadius - sizes.donutThickness;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* العنوان وتحته الملاحظة لو الحضور لسه متسجلش - title, with the not-recorded note on its own line */}
      <div className="mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور الإدارة</h2>
        {data.notRecorded && <p className="text-gray-400 text-sm mt-1">لم يتم تسجيل الحضور بعد</p>}
      </div>

      {/* المحتوى متوزع بالتساوي على طول الكارت - content spread evenly over the card height */}
      <div ref={contentRef} className="flex-1 min-h-0 flex flex-col justify-evenly">
        <div
          className="relative overflow-visible flex-shrink-0 self-center"
          style={{ width: `${donutSize}px`, height: `${donutSize}px` }}
        >
          <PieChart width={donutSize} height={donutSize}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p
              className="font-numbers font-bold text-white tabular-nums leading-tight"
              style={{ fontSize: `${sizes.percentFontSize}px` }}
            >
              {presentPercentage}%
            </p>
            <p
              className="text-gray-400 whitespace-nowrap"
              style={{ fontSize: `${sizes.centerLabelFontSize}px` }}
            >
              نسبة الحضور
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0">
          <div className="bg-background rounded-xl text-center" style={{ padding: `${sizes.countPaddingY}px 0` }}>
            <p
              className="font-numbers font-bold text-statusGreen tabular-nums leading-tight"
              style={{ fontSize: `${sizes.countFontSize}px` }}
            >
              {formatNumber(presentCount)}
            </p>
            <p className="text-gray-400" style={{ fontSize: `${sizes.countLabelFontSize}px` }}>
              حاضر
            </p>
          </div>
          <div className="bg-background rounded-xl text-center" style={{ padding: `${sizes.countPaddingY}px 0` }}>
            <p
              className="font-numbers font-bold text-statusRed tabular-nums leading-tight"
              style={{ fontSize: `${sizes.countFontSize}px` }}
            >
              {formatNumber(absentCount)}
            </p>
            <p className="text-gray-400" style={{ fontSize: `${sizes.countLabelFontSize}px` }}>
              غائب
            </p>
          </div>
        </div>

        {/* الأسامي: الحاضرين والغائبين، أو كل الإدارة رمادي لو الحضور لسه متسجلش
            Names: present and absent, or everyone in gray while nothing is recorded */}
        {data.notRecorded ? (
          <NameList title="لم يسجّلوا بعد" names={data.allNames} colors={LIST_COLORS.pending} chipFontSize={chipFontSize} />
        ) : (
          <>
            <NameList
              title="الحاضرين"
              icon={<Check className="w-4 h-4" strokeWidth={3} />}
              names={data.presentNames}
              colors={LIST_COLORS.present}
              chipFontSize={chipFontSize}
            />
            <NameList
              title="الغائبين"
              icon={<X className="w-4 h-4" strokeWidth={3} />}
              names={data.absentNames}
              colors={LIST_COLORS.absent}
              chipFontSize={chipFontSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
