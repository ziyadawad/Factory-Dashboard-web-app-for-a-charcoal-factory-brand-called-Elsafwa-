"use client";

import { ReactNode } from "react";
import { AttendanceGroup } from "@/lib/types";
import { PieChart, Pie, Cell } from "recharts";
import { Check, Palmtree, X } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { DATE_LOCALE, formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

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
export function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleTimeString(DATE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Cairo",
  });
}

// قايمة أسامي: عنوان بأيقونة وتحته الأسامي كبسولات (الاسم الطويل بيتقص بـ …)
// A titled list of name chips (long names end with …)
function NameList({
  title,
  icon,
  names,
  colors,
}: {
  title: string;
  icon?: ReactNode;
  names: string[];
  colors: { label: string; chip: string };
}) {
  const sizes = dashboardConfig.sizes.attendance;
  return (
    <div>
      <p
        className={`flex items-center gap-1 font-bold mb-1 ${colors.label}`}
        style={{ fontSize: `${sizes.listLabelFontSize}px` }}
      >
        {icon}
        {title}
      </p>
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {names.map((name, index) => (
            <span
              key={index}
              className={`rounded-md whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${colors.chip}`}
              style={{
                fontSize: `${sizes.chipFontSize}px`,
                padding: `${sizes.chipPaddingY}px ${sizes.chipPaddingX}px`,
              }}
            >
              {toEnglishDigits(name)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-gray-500" style={{ fontSize: `${sizes.chipFontSize}px` }}>
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

  const chartData =
    data.total - data.leave > 0
      ? [
          { name: "حاضر", value: data.present, color: "#22C55E" },
          { name: "غائب", value: absent, color: "#EF4444" },
        ]
      : [{ name: "لا يوجد", value: 1, color: "#374151" }];

  // النسبة = حاضر ÷ (الإجمالي − إجازة) - percentage = present / (total − on leave)
  const counted = data.total - data.leave;
  const presentPercentage = counted > 0 ? ((data.present / counted) * 100).toFixed(0) : "0";

  // Fixed donut dimensions with 2px margin to prevent clipping
  const donutSize = sizes.donutSize;
  const outerRadius = donutSize / 2 - 2;
  const innerRadius = outerRadius - sizes.donutThickness;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="mb-2 shrink-0 flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور الإدارة</h2>
        <p className="text-gray-400 text-sm whitespace-nowrap">آخر تحديث: {formatUpdatedAt(updatedAt)}</p>
      </div>

      {/* المحتوى متوزع على طول الكارت، والأسامي بس بتعمل scroll لو كتير
          Content spread over the card height; only the names scroll when there are many */}
      <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-3">
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

        <div className="min-h-0 overflow-y-auto thin-scroll flex flex-col gap-3">
          <NameList
            title="الحاضرين"
            icon={<Check className="w-4 h-4" strokeWidth={3} />}
            names={namesWith("present")}
            colors={LIST_COLORS.present}
          />
          <NameList
            title="الغائبين"
            icon={<X className="w-4 h-4" strokeWidth={3} />}
            names={namesWith("absent")}
            colors={LIST_COLORS.absent}
          />
          {data.leave > 0 && (
            <NameList
              title="إجازة"
              icon={<Palmtree className="w-4 h-4" strokeWidth={2.5} />}
              names={namesWith("leave")}
              colors={LIST_COLORS.leave}
            />
          )}
        </div>
      </div>
    </div>
  );
}
