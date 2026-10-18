"use client";

import { FloorWorkers } from "@/lib/types";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface FloorWorkersSectionProps {
  data: FloorWorkers;
}

export default function FloorWorkersSection({ data }: FloorWorkersSectionProps) {
  const { count } = useCountUp(data.present, 700);
  const percentage = data.total > 0 ? ((data.present / data.total) * 100).toFixed(0) : "0";
  const sizes = dashboardConfig.sizes.floorWorkers;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">حضور عمال</h2>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <p
          className="font-bold text-white mb-1 tabular-nums"
          style={{ fontSize: `${sizes.numberFontSize}px` }}
        >
          {formatNumber(count)}
        </p>
        <p className="text-gray-400 text-lg mb-3">عامل حاضر اليوم</p>

        <div className="w-full bg-background rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">نسبة الحضور</span>
            <span className="text-brandOrange font-bold text-sm tabular-nums">{percentage}%</span>
          </div>
          <div className="relative h-3 bg-cardBorder rounded-full overflow-hidden">
            <div
              className="absolute top-0 right-0 h-full bg-gradient-to-r from-brandYellow to-brandOrange rounded-full transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 text-center shrink-0">
        <p className="text-gray-400 text-sm">
          الإجمالي المسجل: <span className="text-white font-bold">{formatNumber(data.total)}</span> عامل
        </p>
      </div>
    </div>
  );
}
