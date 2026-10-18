"use client";

import { FloorWorkers } from "@/lib/types";
import { useCountUp } from "@/lib/useCountUp";

interface FloorWorkersSectionProps {
  data: FloorWorkers;
}

export default function FloorWorkersSection({ data }: FloorWorkersSectionProps) {
  const { count } = useCountUp(data.present, 700);
  const percentage = ((data.present / data.total) * 100).toFixed(0);

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col">
      <h2 className="text-xl font-bold text-white mb-4">عمال الأرضية</h2>

      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-7xl font-bold text-white mb-2">{count}</p>
        <p className="text-gray-400 text-lg mb-4">عامل حاضر اليوم</p>

        <div className="w-full bg-background rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">نسبة الحضور</span>
            <span className="text-brandOrange font-bold text-sm">{percentage}%</span>
          </div>
          <div className="relative h-3 bg-cardBorder rounded-full overflow-hidden">
            <div
              className="absolute top-0 right-0 h-full bg-gradient-to-r from-brandYellow to-brandOrange rounded-full transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 text-center">
        <p className="text-gray-400 text-sm">
          الإجمالي المسجل: <span className="text-white font-bold">{data.total}</span> عامل
        </p>
      </div>
    </div>
  );
}
