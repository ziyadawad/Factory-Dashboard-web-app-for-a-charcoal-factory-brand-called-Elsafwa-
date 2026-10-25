"use client";

import { BatchCounts, Batches } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface BatchesSectionProps {
  data: Batches;
}

// الأنواع بالترتيب ولون كل نوع - wood types in order, with each one's color
const TYPES: { key: keyof BatchCounts; label: string; text: string; border: string }[] = [
  { key: "orange", label: "برتقال", text: "text-brandOrange", border: "border-brandOrange/30" },
  { key: "mango", label: "مانجا", text: "text-brandYellow", border: "border-brandYellow/30" },
  { key: "casuarina", label: "جازورينا", text: "text-statusGreen", border: "border-statusGreen/30" },
];

function BatchBox({ title, counts }: { title: string; counts: BatchCounts }) {
  const sizes = dashboardConfig.sizes.batches;
  const total = counts.orange + counts.mango + counts.casuarina;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background/40 border border-cardBorder rounded-xl p-2">
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <h3 className="text-white font-bold text-sm">{title}</h3>
        <p className="text-gray-400 text-xs whitespace-nowrap">
          الإجمالي{" "}
          <span
            className={`font-bold tabular-nums ${total === 0 ? "text-gray-500" : "text-white"}`}
            style={{ fontSize: `${sizes.totalFontSize}px` }}
          >
            {formatNumber(total)}
          </span>
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
        {TYPES.map((type) => {
          const value = counts[type.key];
          return (
            <div
              key={type.key}
              className={`bg-background rounded-xl text-center border flex flex-col items-center justify-center min-h-0 ${
                value === 0 ? "border-cardBorder" : type.border
              }`}
            >
              <p
                className={`font-bold tabular-nums leading-none ${value === 0 ? "text-gray-500" : type.text}`}
                style={{ fontSize: `${sizes.tileFontSize}px` }}
              >
                {formatNumber(value)}
              </p>
              <p className={`text-xs mt-1 ${value === 0 ? "text-gray-500" : type.text}`}>{type.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BatchesSection({ data }: BatchesSectionProps) {
  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">الطرحات اليوم</h2>
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        <BatchBox title="خروج طرحات" counts={data.out} />
        <BatchBox title="طرحات على الأرض" counts={data.ground} />
      </div>
    </div>
  );
}
