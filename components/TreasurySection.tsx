"use client";

import { Treasury } from "@/lib/types";
import { TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface TreasurySectionProps {
  data: Treasury;
}

export default function TreasurySection({ data }: TreasurySectionProps) {
  const { count } = useCountUp(data.balance, 800);
  const formattedBalance = formatNumber(count);
  const sizes = dashboardConfig.sizes.treasury;
  // تغيير اليوم = الوارد − المنصرف - today's change = incoming − outgoing
  const todayChange = data.incomingToday - data.outgoingToday;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">رصيد الخزنة</h2>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <p
          dir="ltr"
          className="font-bold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent mb-1 tabular-nums"
          style={{ fontSize: `${sizes.numberFontSize}px` }}
        >
          {formattedBalance}
        </p>
        <p className="text-gray-400 text-lg mb-3">ج.م</p>

        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
            todayChange >= 0
              ? "bg-statusGreen/20 text-statusGreen"
              : "bg-statusRed/20 text-statusRed"
          }`}
        >
          {todayChange >= 0 ? (
            <TrendingUp className="w-5 h-5" />
          ) : (
            <TrendingDown className="w-5 h-5" />
          )}
          <span className="font-bold tabular-nums">
            <span dir="ltr">
              {todayChange >= 0 ? "+" : ""}
              {formatNumber(todayChange)}
            </span>{" "}
            ج.م
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full mt-4">
          <FlowBox
            label="وارد اليوم"
            value={data.incomingToday}
            icon={<ArrowDownLeft className="w-4 h-4 shrink-0" />}
            colorClass="text-statusGreen"
            boxClass="bg-statusGreen/10 border-statusGreen/30"
          />
          <FlowBox
            label="منصرف اليوم"
            value={data.outgoingToday}
            icon={<ArrowUpRight className="w-4 h-4 shrink-0" />}
            colorClass="text-statusRed"
            boxClass="bg-statusRed/10 border-statusRed/30"
          />
        </div>
      </div>

      <div className="mt-2 text-center shrink-0">
        <p className="text-gray-400 text-sm">رصيد الخزنة الحالي</p>
      </div>
    </div>
  );
}

// مربع الوارد أو المنصرف - incoming / outgoing box
function FlowBox({
  label,
  value,
  icon,
  colorClass,
  boxClass,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  boxClass: string;
}) {
  const { count } = useCountUp(value, 800);
  const sizes = dashboardConfig.sizes.treasury;

  return (
    <div className={`border rounded-xl px-2 py-2 text-center min-w-0 ${boxClass}`}>
      <div className={`flex items-center justify-center gap-1 ${colorClass}`}>
        {icon}
        <span className="whitespace-nowrap" style={{ fontSize: `${sizes.flowLabelFontSize}px` }}>
          {label}
        </span>
      </div>
      <p
        dir="ltr"
        className={`font-bold tabular-nums leading-tight mt-1 truncate ${colorClass}`}
        style={{ fontSize: `${sizes.flowNumberFontSize}px` }}
      >
        {formatNumber(count)}
      </p>
      <p className="text-gray-400 text-xs">ج.م</p>
    </div>
  );
}
