"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttendanceGroup } from "@/lib/types";
import { PieChart, Pie, Cell } from "recharts";
import { Check, Palmtree, X } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { DATE_LOCALE, formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface AttendanceSectionProps {
  data: AttendanceGroup;
  updatedAt: string;
}

// ألوان كل قايمة أسامي - colors of each name list
const LIST_COLORS = {
  present: { label: "text-statusGreen", chip: "bg-statusGreen/15 text-statusGreen" },
  absent: { label: "text-statusRed", chip: "bg-statusRed/15 text-statusRed" },
  leave: { label: "text-gray-400", chip: "bg-gray-500/15 text-gray-300" },
};

// "آخر تحديث: hh:mm" بتوقيت مصر - last update time in Egypt time
function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleTimeString(DATE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Cairo",
  });
}

// قايمة أسامي: عنوان بأيقونة وتحته الأسامي كبسولات بتنزل سطر جديد (الاسم الطويل بيتقص بـ …)
// A titled list of name chips that wrap onto new lines (a too-long name ends with …)
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
              className={`rounded-md whitespace-nowrap max-w-full overflow-hidden text-ellipsis ${colors.chip}`}
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

export default function AttendanceSection({ data, updatedAt }: AttendanceSectionProps) {
  const absent = data.total - data.present - data.leave;
  const { count: presentCount } = useCountUp(data.present, 600);
  const { count: absentCount } = useCountUp(absent, 600);
  const sizes = dashboardConfig.sizes.attendance;
  const namesWith = (status: string) => data.people.filter((p) => p.status === status).map((p) => p.name);

  // لو الأسامي مش واخدة مكانها في الكارت خط الكبسولات بيصغر (لحد minChipFontSize)
  // The chip font shrinks (down to minChipFontSize) until everything fits in the card height
  const contentRef = useRef<HTMLDivElement>(null);
  const [chipFontSize, setChipFontSize] = useState(sizes.chipFontSize);
  const namesKey = JSON.stringify(data.people);
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

  // النسبة = حاضر ÷ (الإجمالي − إجازة) - percentage = present / (total − on leave)
  const counted = data.total - data.leave;
  const chartData =
    counted > 0
      ? [
          { name: "حاضر", value: data.present, color: "#22C55E" },
          { name: "غائب", value: absent, color: "#EF4444" },
        ]
      : [{ name: "لا يوجد", value: 1, color: "#374151" }];

  const presentPercentage = counted > 0 ? ((data.present / counted) * 100).toFixed(0) : "0";

  // Fixed donut dimensions with 2px margin to prevent clipping
  const donutSize = sizes.donutSize;
  const outerRadius = donutSize / 2 - 2;
  const innerRadius = outerRadius - sizes.donutThickness;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* العنوان وتحته "آخر تحديث" - title, with the last update time on its own line */}
      <div className="mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور الإدارة</h2>
        <p className="text-gray-400 text-sm mt-1 whitespace-nowrap">آخر تحديث: {formatUpdatedAt(updatedAt)}</p>
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

        {/* الأسامي: الحاضرين والغائبين (والإجازة رمادي لو فيه) - names: present, absent (and on leave in gray) */}
        <NameList
          title="الحاضرين"
          icon={<Check className="w-4 h-4" strokeWidth={3} />}
          names={namesWith("present")}
          colors={LIST_COLORS.present}
          chipFontSize={chipFontSize}
        />
        <NameList
          title="الغائبين"
          icon={<X className="w-4 h-4" strokeWidth={3} />}
          names={namesWith("absent")}
          colors={LIST_COLORS.absent}
          chipFontSize={chipFontSize}
        />
        {data.leave > 0 && (
          <NameList
            title="إجازة"
            icon={<Palmtree className="w-4 h-4" strokeWidth={2.5} />}
            names={namesWith("leave")}
            colors={LIST_COLORS.leave}
            chipFontSize={chipFontSize}
          />
        )}
      </div>
    </div>
  );
}
