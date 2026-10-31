"use client";

import { Treasury } from "@/lib/types";
import { TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// حجم بالـ cqi على قد عدد الحروف: الرقم الأطول بيصغر عشان عمره ما يعدّي العرض
// cqi size adjusted for the text length: a longer number gets smaller so it never gets wider than its box
function fitCqi(scale: number, baseLength: number, text: string) {
  return (scale * baseLength) / Math.max(baseLength, text.length);
}

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
    // container على الكارت نفسه (بعرضه كله) عشان cqi = عرض الكارت - the card itself is the container, so cqi = card width
    <div
      className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden"
      style={{ containerType: "inline-size" }}
    >
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">رصيد الخزنة</h2>

      {/* المحتوى متوزع بالتساوي على طول الكارت - content spread evenly over the card height */}
      <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-evenly">
        <div className="flex flex-col items-center">
          <p
            dir="ltr"
            className="font-numbers font-extrabold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent tabular-nums whitespace-nowrap leading-tight"
            style={{
              fontSize: `min(${sizes.balanceMaxSize}px, ${fitCqi(sizes.balanceScale, sizes.balanceBaseLength, formattedBalance)}cqi)`,
            }}
          >
            {formattedBalance}
          </p>
          <p className="text-gray-400 leading-normal" style={{ fontSize: `${sizes.currencyFontSize}px` }}>
            ج.م
          </p>
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl whitespace-nowrap ${
            todayChange >= 0
              ? "bg-statusGreen/20 text-statusGreen"
              : "bg-statusRed/20 text-statusRed"
          }`}
          style={{
            fontSize: `min(${sizes.changeMaxSize}px, ${sizes.changeScale}cqi)`,
            padding: `${sizes.changePaddingY}px ${sizes.changePaddingX}px`,
          }}
        >
          {todayChange >= 0 ? (
            <TrendingUp className="shrink-0" style={{ width: "1em", height: "1em" }} />
          ) : (
            <TrendingDown className="shrink-0" style={{ width: "1em", height: "1em" }} />
          )}
          <span className="font-bold tabular-nums whitespace-nowrap">
            <span dir="ltr" className="font-numbers">
              {todayChange >= 0 ? "+" : ""}
              {formatNumber(todayChange)}
            </span>{" "}
            ج.م
          </span>
        </div>

        {/* وارد اليوم فوق ومنصرف اليوم تحته، كل واحد بعرض الكارت - incoming on top, outgoing under it, full width */}
        <div className="grid grid-cols-1 gap-2 w-full">
          <FlowBox
            label="وارد اليوم"
            value={data.incomingToday}
            icon={ArrowDownLeft}
            colorClass="text-statusGreen"
            boxClass="bg-statusGreen/10 border-statusGreen/30"
          />
          <FlowBox
            label="منصرف اليوم"
            value={data.outgoingToday}
            icon={ArrowUpRight}
            colorClass="text-statusRed"
            boxClass="bg-statusRed/10 border-statusRed/30"
          />
        </div>
      </div>

      <div className="mt-2 text-center shrink-0">
        <p className="text-gray-400" style={{ fontSize: `${sizes.footerFontSize}px` }}>
          رصيد الخزنة الحالي
        </p>
      </div>
    </div>
  );
}

// مربع الوارد أو المنصرف - incoming / outgoing box
function FlowBox({
  label,
  value,
  icon: Icon,
  colorClass,
  boxClass,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  colorClass: string;
  boxClass: string;
}) {
  const { count } = useCountUp(value, 800);
  const sizes = dashboardConfig.sizes.treasury;

  return (
    <div
      className={`border rounded-xl text-center min-w-0 ${boxClass}`}
      style={{ padding: `${sizes.flowPadding}px` }}
    >
      {/* السهم على قد الكلمة - the arrow follows the label size */}
      <div
        className={`flex items-center justify-center gap-1 whitespace-nowrap ${colorClass}`}
        style={{ fontSize: `min(${sizes.flowLabelMaxSize}px, ${sizes.flowLabelScale}cqi)` }}
      >
        <Icon className="shrink-0" style={{ width: "1.1em", height: "1.1em" }} />
        <span>{label}</span>
      </div>
      <p
        dir="ltr"
        className={`font-numbers font-bold tabular-nums leading-tight mt-1 whitespace-nowrap ${colorClass}`}
        style={{ fontSize: `min(${sizes.flowMaxSize}px, ${fitCqi(sizes.flowScale, sizes.flowBaseLength, formatNumber(count))}cqi)` }}
      >
        {formatNumber(count)}
      </p>
      <p className="text-gray-400" style={{ fontSize: `min(${sizes.flowCurrencyMaxSize}px, ${sizes.flowCurrencyScale}cqi)` }}>
        ج.م
      </p>
    </div>
  );
}
