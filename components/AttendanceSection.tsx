"use client";

import { Attendance } from "@/lib/types";
import { PieChart, Pie, Cell } from "recharts";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface AttendanceSectionProps {
  data: Attendance;
}

const MAX_VISIBLE_NAMES = 4;

export default function AttendanceSection({ data }: AttendanceSectionProps) {
  const { count: presentCount } = useCountUp(data.present, 600);
  const { count: absentCount } = useCountUp(data.absent, 600);
  const sizes = dashboardConfig.sizes.attendance;

  const chartData = [
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
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">حضور الإدارة</h2>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div
          className="relative overflow-visible flex-shrink-0 mb-2"
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
              className="font-bold text-white tabular-nums"
              style={{ fontSize: `${sizes.percentFontSize}px` }}
            >
              {presentPercentage}%
            </p>
            <p
              className="text-gray-400 whitespace-nowrap"
              style={{ fontSize: `${sizes.labelFontSize}px` }}
            >
              نسبة الحضور
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 shrink-0">
        <div className="bg-background rounded-xl py-2 text-center">
          <p
            className="font-bold text-statusGreen tabular-nums"
            style={{ fontSize: `${sizes.labelFontSize}px` }}
          >
            {formatNumber(presentCount)}
          </p>
          <p className="text-gray-400 text-xs">حاضر</p>
        </div>
        <div className="bg-background rounded-xl py-2 text-center">
          <p
            className="font-bold text-statusRed tabular-nums"
            style={{ fontSize: `${sizes.labelFontSize}px` }}
          >
            {formatNumber(absentCount)}
          </p>
          <p className="text-gray-400 text-xs">غائب</p>
        </div>
      </div>

      {data.absentNames.length > 0 && (
        <div className="bg-background rounded-xl p-2 mt-2 shrink-0">
          <p className="text-gray-400 text-xs mb-1">الغائبون:</p>
          <div className="flex flex-wrap gap-1">
            {data.absentNames.slice(0, MAX_VISIBLE_NAMES).map((name, index) => (
              <span key={index} className="bg-statusRed/15 text-white text-xs rounded-md px-2 py-0.5">
                {toEnglishDigits(name)}
              </span>
            ))}
            {data.absentNames.length > MAX_VISIBLE_NAMES && (
              <span className="text-gray-400 text-xs px-1 py-0.5">
                +{formatNumber(data.absentNames.length - MAX_VISIBLE_NAMES)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
