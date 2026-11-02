"use client";

import { CalendarDays, Crown, Truck } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { RepSales, SalesReps } from "@/lib/types";
import { formatDayName, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";
import { monthName, Num, Percent, ProductChips, SummaryStrip, useCompactRows } from "./SalesCommon";

type Sizes = Omit<typeof dashboardConfig.sizes.salesPage, "compact">;

// دايرة نسبة التارجت (نفس شكل دونت الحضور): برتقاني تحت التارجت، أخضر ولامع لو وصل، والنسبة الحقيقية في النص
// Target ring (same style as the attendance donut): orange below target, glowing green at 100%+, the real % in the middle
function TargetRing({ percent, reached, sizes }: { percent: number; reached: boolean; sizes: Sizes }) {
  const size = sizes.donutSize;
  const outerRadius = size / 2 - 2;
  const innerRadius = outerRadius - sizes.donutThickness;
  const filled = Math.min(100, Math.max(0, percent));
  const color = reached ? "#22C55E" : "#FF7A00";
  const chartData = [
    { value: filled, color },
    { value: 100 - filled, color: "#232B40" },
  ].filter((part) => part.value > 0);
  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
        filter: reached ? "drop-shadow(0 0 10px rgba(34,197,94,0.55))" : undefined,
      }}
    >
      <PieChart width={size} height={size}>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={90}
          endAngle={-270}
          paddingAngle={chartData.length > 1 ? 5 : 0}
          dataKey="value"
          stroke="none"
          isAnimationActive={false}
        >
          {chartData.map((part, index) => (
            <Cell key={index} fill={part.color} />
          ))}
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <Percent
          value={percent}
          className={`font-extrabold leading-tight ${reached ? "text-statusGreen" : "text-brandOrange"}`}
          style={{ fontSize: sizes.donutPercentFontSize }}
        />
        <span className="text-gray-400 whitespace-nowrap leading-tight" style={{ fontSize: sizes.donutLabelFontSize }}>
          من التارجت
        </span>
      </div>
    </div>
  );
}

// كارت مندوب - one rep's card
function RepCard({ rep, offline, sizes }: { rep: RepSales; offline: boolean; sizes: Sizes }) {
  const percent = rep.target > 0 ? Math.round((rep.monthPackets / rep.target) * 100) : 0;
  const reached = rep.target > 0 && rep.monthPackets >= rep.target;
  const remaining = Math.max(0, rep.target - rep.monthPackets);
  const empty = rep.lastDay === null && rep.monthPackets === 0;
  const pill = "shrink-0 flex items-center gap-1.5 rounded-full border px-3 font-semibold leading-[1.75]";

  return (
    <div
      className={`bg-card border rounded-2xl p-4 h-full min-h-0 flex flex-col overflow-hidden ${
        reached ? "border-statusGreen/60 shadow-[0_0_22px_rgba(34,197,94,0.25)]" : "border-cardBorder"
      }`}
      style={{ gap: sizes.cardGap }}
    >
      {/* الاسم والعربية والترتيب - name, van and rank */}
      <div className="shrink-0 flex items-center gap-3 min-w-0">
        <h3 className="font-extrabold text-white truncate leading-[1.75]" style={{ fontSize: sizes.nameFontSize }}>
          {toEnglishDigits(rep.name)}
        </h3>
        <span className={`${pill} border-brandOrange/40 bg-brandOrange/10 text-brandOrange`} style={{ fontSize: sizes.vanFontSize }}>
          <Truck size={sizes.vanFontSize + 2} />
          {toEnglishDigits(rep.van)}
        </span>
        {rep.isTop && (
          <span className={`${pill} font-bold border-brandYellow/60 bg-brandYellow/15 text-brandYellow`} style={{ fontSize: sizes.vanFontSize }}>
            <Crown size={sizes.vanFontSize + 2} />
            الأول
          </span>
        )}
        <div className="ms-auto flex items-center gap-2 shrink-0">
          {reached && (
            <span
              className={`${pill} font-bold border-statusGreen/70 bg-statusGreen/20 text-statusGreen shadow-[0_0_14px_rgba(34,197,94,0.55)] animate-pulse-dot`}
              style={{ fontSize: sizes.vanFontSize + 1 }}
            >
              ✅ وصل للتارجت
            </span>
          )}
          {offline && <OfflineBadge />}
        </div>
      </div>

      {empty ? (
        // لسه مفيش بيع الشهر ده (أول الشهر) - no sales yet this month
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cardBorder">
          <p className="text-gray-300 font-bold leading-[1.75]" style={{ fontSize: sizes.lastDayNumberFontSize + 4 }}>
            لسه مفيش بيع الشهر ده
          </p>
          <p className="text-gray-500" style={{ fontSize: sizes.infoFontSize }}>
            الشهر اللي فات: <Num value={rep.lastMonthPackets} className="text-gray-300 font-bold" /> باكت
          </p>
        </div>
      ) : (
        <>
          {/* مبيعات الشهر ودايرة التارجت وآخر يوم بيع - month packets, target ring and the last selling day */}
          <div className="flex-1 min-h-0 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-gray-400 font-semibold leading-[1.5]" style={{ fontSize: sizes.labelFontSize }}>
                مبيعات الشهر
              </p>
              <p className="whitespace-nowrap" style={{ lineHeight: 1.1 }}>
                <Num
                  value={rep.monthPackets}
                  className={`font-extrabold ${reached ? "text-statusGreen" : "text-white"}`}
                  style={{ fontSize: sizes.monthNumberFontSize }}
                />{" "}
                <span className="text-gray-400 font-semibold" style={{ fontSize: sizes.labelFontSize + 2 }}>
                  باكت
                </span>
              </p>
            </div>
            <TargetRing percent={percent} reached={reached} sizes={sizes} />
            <div className="shrink-0 rounded-xl border border-cardBorder bg-background/70 px-3 py-1" style={{ fontSize: sizes.infoFontSize }}>
              <p className="flex items-center gap-1.5 text-gray-400 font-semibold whitespace-nowrap leading-[1.6]">
                <CalendarDays size={sizes.infoFontSize} />
                آخر يوم بيع
                <span className="text-gray-200">{rep.lastDay ? formatDayName(rep.lastDay.date) : "—"}</span>
              </p>
              <p className="whitespace-nowrap" style={{ lineHeight: 1.2 }}>
                <Num value={rep.lastDay?.packets ?? 0} className="font-bold text-brandYellow" style={{ fontSize: sizes.lastDayNumberFontSize }} />{" "}
                <span className="text-gray-400">باكت</span>
              </p>
            </div>
          </div>

          {/* التارجت - target progress */}
          <div className="shrink-0 flex flex-col gap-1">
            <div className="flex items-center gap-2 whitespace-nowrap leading-[1.5]" style={{ fontSize: sizes.infoFontSize }}>
              <span className="text-gray-400">
                التارجت <Num value={rep.target} className="text-gray-200 font-bold" /> باكت
              </span>
              <span className={`ms-auto font-semibold ${reached ? "text-statusGreen" : "text-gray-300"}`}>
                {reached ? (
                  <>
                    زيادة <Num value={rep.monthPackets - rep.target} /> باكت
                  </>
                ) : (
                  <>
                    باقي <Num value={remaining} className="text-brandOrange font-bold" /> باكت
                  </>
                )}
              </span>
              <Percent
                value={percent}
                className={`font-extrabold ${reached ? "text-statusGreen" : "text-brandOrange"}`}
                style={{ fontSize: sizes.percentFontSize, lineHeight: 1.1 }}
              />
            </div>
            <div className="w-full rounded-full bg-background border border-cardBorder overflow-hidden" style={{ height: sizes.progressHeight }}>
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${
                  reached ? "bg-statusGreen shadow-[0_0_12px_rgba(34,197,94,0.8)]" : "bg-gradient-to-l from-brandYellow to-brandOrange"
                }`}
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </div>
          </div>

          {/* المنتجات: صف العادي بالباكت وتحته صف الكراتين بعددها - per product: regular row (packets), then cartons (count) */}
          <div className="shrink-0 flex flex-col gap-1.5">
            <ProductChips products={rep.products} fontSize={sizes.chipFontSize} accent="text-brandYellow" />
            <ProductChips products={rep.cartons ?? []} fontSize={sizes.chipFontSize} accent="text-brandYellow" />
          </div>
        </>
      )}
    </div>
  );
}

export default function SalesRepsSection({ data }: { data: SalesReps | null }) {
  const { compact, ...normal } = dashboardConfig.sizes.salesPage;
  const { ref, sizes } = useCompactRows<Sizes>(normal, compact, normal.compactBelowCardHeight);

  if (!data) {
    return (
      <div className="h-full bg-card border border-cardBorder rounded-2xl flex flex-col items-center justify-center gap-4">
        <Truck size={56} className="text-brandOrange/60" />
        <OfflineBadge />
      </div>
    );
  }

  const percent = data.totalTarget > 0 ? Math.round((data.totalPackets / data.totalTarget) * 100) : 0;

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <SummaryStrip height={sizes.summaryHeight}>
        <div className="p-2 rounded-xl bg-brandOrange/15 text-brandOrange">
          <Truck size={26} />
        </div>
        <p className="text-gray-300 font-semibold text-lg whitespace-nowrap">إجمالي مبيعات المناديب — شهر {monthName(data.month)}</p>
        <p className="whitespace-nowrap" style={{ lineHeight: 1.1 }}>
          <Num value={data.totalPackets} className="font-extrabold text-white" style={{ fontSize: sizes.summaryNumberFontSize }} />
          <span className="text-gray-400 text-lg font-semibold"> من </span>
          <Num value={data.totalTarget} className="font-bold text-gray-300" style={{ fontSize: sizes.summaryNumberFontSize * 0.75 }} />
          <span className="text-gray-400 text-lg font-semibold"> باكت</span>
        </p>
        <div className="flex-1 min-w-[120px] h-3 rounded-full bg-background border border-cardBorder overflow-hidden">
          <div
            className={`h-full rounded-full ${percent >= 100 ? "bg-statusGreen" : "bg-gradient-to-l from-brandYellow to-brandOrange"}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <Percent
          value={percent}
          className={`font-extrabold ${percent >= 100 ? "text-statusGreen" : "text-brandOrange"}`}
          style={{ fontSize: sizes.summaryNumberFontSize * 0.8 }}
        />
        {data.offline && <OfflineBadge />}
      </SummaryStrip>

      {/* 4 كروت 2×2 - 4 equal cards */}
      <div ref={ref} className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-4">
        {data.reps.map((rep) => (
          <RepCard key={rep.name} rep={rep} offline={data.offline} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}
