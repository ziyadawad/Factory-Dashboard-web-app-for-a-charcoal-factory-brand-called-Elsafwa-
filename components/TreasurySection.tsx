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
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">رصيد الخزنة</h2>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <p
          dir="ltr"
          className="text-5xl font-bold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent mb-1 tabular-nums"
        >
          {formattedBalance}
        </p>
        <p className="text-gray-400 text-lg mb-3">ج.م</p>

        {data.todayChange !== undefined && (
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              data.todayChange >= 0
                ? "bg-statusGreen/20 text-statusGreen"
                : "bg-statusRed/20 text-statusRed"
            }`}
          >
            {data.todayChange >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            <span className="font-bold tabular-nums">
              <span dir="ltr">
                {data.todayChange >= 0 ? "+" : ""}
                {formatNumber(data.todayChange)}
              </span>{" "}
              ج.م
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 text-center shrink-0">
        <p className="text-gray-400 text-sm">رصيد الخزنة الحالي</p>
      </div>
    </div>
  );
}
