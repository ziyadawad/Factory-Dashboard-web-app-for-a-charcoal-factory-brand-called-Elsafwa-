"use client";

import { Treasury } from "@/lib/types";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber } from "@/lib/format";

interface TreasurySectionProps {
  data: Treasury;
}

export default function TreasurySection({ data }: TreasurySectionProps) {
  const { count } = useCountUp(data.balance, 800);
  const formattedBalance = formatNumber(count);

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-3 h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-bold text-white mb-1 shrink-0">رصيد الخزنة</h2>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <p
          dir="ltr"
          className="text-4xl font-bold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent mb-0.5 tabular-nums"
        >
          {formattedBalance}
        </p>
        <p className="text-gray-400 text-base mb-2">ج.م</p>

        {data.todayChange !== undefined && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${
              data.todayChange >= 0
                ? "bg-statusGreen/20 text-statusGreen"
                : "bg-statusRed/20 text-statusRed"
            }`}
          >
            {data.todayChange >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span className="font-bold text-sm tabular-nums">
              <span dir="ltr">
                {data.todayChange >= 0 ? "+" : ""}
                {formatNumber(data.todayChange)}
              </span>{" "}
              ج.م
            </span>
          </div>
        )}
      </div>

      <div className="mt-1 text-center shrink-0">
        <p className="text-gray-400 text-xs">رصيد الخزنة الحالي</p>
      </div>
    </div>
  );
}
