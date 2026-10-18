"use client";

import { Treasury } from "@/lib/types";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";

interface TreasurySectionProps {
  data: Treasury;
}

export default function TreasurySection({ data }: TreasurySectionProps) {
  const { count } = useCountUp(data.balance, 800);
  const formattedBalance = count.toLocaleString("ar-EG");

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col">
      <h2 className="text-xl font-bold text-white mb-4">رصيد الخزنة</h2>

      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-5xl font-bold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent mb-2">
          {formattedBalance}
        </p>
        <p className="text-gray-400 text-lg mb-4">ج.م</p>

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
            <span className="font-bold">
              {data.todayChange >= 0 ? "+" : ""}
              {data.todayChange.toLocaleString("ar-EG")} ج.م
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 text-center">
        <p className="text-gray-400 text-sm">رصيد الخزنة الحالي</p>
      </div>
    </div>
  );
}
