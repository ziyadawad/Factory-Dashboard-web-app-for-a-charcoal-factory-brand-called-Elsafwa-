"use client";

import { ChevronLeft, Factory } from "lucide-react";
import { ProductionData } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { formatKg, formatTons, summarize, typeColor, useCompact } from "@/lib/production-stats";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";
import { shortDate } from "./ProductionPage";

// كارت "إنتاج النهارده" في الرئيسية (مكان الأفران والطرحات)، والضغط عليه بيفتح صفحة الإنتاج
// The main page "إنتاج النهارده" card (where kilns and batches were); a click opens the production page
export default function ProductionCard({ data, onOpen }: { data: ProductionData | null; onOpen: () => void }) {
  const compact = useCompact();
  const sizes = dashboardConfig.sizes.productionCard;
  const tonsSize = compact ? sizes.compactTonsFontSize : sizes.tonsFontSize;
  const numberSize = compact ? sizes.compactNumberFontSize : sizes.numberFontSize;
  const s = data ? summarize(data) : null;
  const last = s?.last ?? null;
  const lastColor = data && last ? typeColor(data, last.type) : "#6B7280";
  const unweighed = s ? s.today.count - s.today.weighed : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full h-full bg-card border border-cardBorder rounded-2xl p-3 min-[1600px]:p-4 flex flex-col overflow-hidden text-start hover:border-brandOrange/60 transition-colors"
    >
      <div className="flex items-center gap-1.5 shrink-0 w-full">
        <Factory className="text-brandOrange shrink-0" size={compact ? 18 : 22} />
        <h2 className="text-[17px] min-[1600px]:text-xl font-bold text-white whitespace-nowrap">إنتاج النهارده</h2>
        {data?.offline && <OfflineBadge />}
        <ChevronLeft className="ms-auto text-gray-500 shrink-0" size={20} />
      </div>

      {!s || !data ? (
        <div className="flex-1 flex items-center justify-center">
          <OfflineBadge />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-2 w-full">
          {/* الأطنان (الرقم الكبير) - tons (the big number) */}
          <div className="text-center">
            <p className="leading-[1.1] whitespace-nowrap">
              <span
                dir="ltr"
                className="font-numbers tabular-nums font-extrabold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent"
                style={{ fontSize: tonsSize }}
              >
                {formatTons(s.today.kg)}
              </span>
            </p>
            <p className="text-gray-300 font-bold text-[15px] min-[1600px]:text-[18px]">طن</p>
            {unweighed > 0 && <p className="text-gray-500 text-[12px] min-[1600px]:text-[14px]">{unweighed} طرحة بدون وزن</p>}
          </div>

          {/* عدد الطرحات والأفران الشغالة - exits and working kilns */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-background/60 border border-cardBorder py-1.5 text-center min-w-0">
              <p dir="ltr" className="font-numbers tabular-nums font-extrabold text-white leading-tight" style={{ fontSize: numberSize }}>
                {formatNumber(s.today.count)}
              </p>
              <p className="text-gray-400 text-[12px] min-[1600px]:text-[14px] whitespace-nowrap">طرحة</p>
            </div>
            <div className="rounded-xl bg-background/60 border border-statusGreen/30 py-1.5 text-center min-w-0">
              <p dir="ltr" className="font-numbers tabular-nums font-extrabold leading-tight whitespace-nowrap" style={{ fontSize: numberSize }}>
                <span className="text-statusGreen">{s.working}</span>
                <span className="text-gray-500 text-[0.6em]">/{s.kilns.length}</span>
              </p>
              <p className="text-gray-400 text-[12px] min-[1600px]:text-[14px] whitespace-nowrap">فرن شغال</p>
            </div>
          </div>

          {/* آخر طرحة - the last exit */}
          <div className="rounded-xl bg-background/60 border border-cardBorder px-2.5 py-1.5 text-[13px] min-[1600px]:text-[16px] min-w-0">
            <p className="text-gray-400 font-semibold">آخر طرحة</p>
            {last ? (
              <>
                <p className="flex items-center gap-2 whitespace-nowrap min-w-0">
                  <span dir="ltr" className="font-numbers text-white font-bold">
                    {last.time}
                  </span>
                  {last.date !== data.today && (
                    <span className="text-gray-500">
                      {last.date === data.yesterday ? "امبارح" : <span dir="ltr" className="font-numbers">{shortDate(last.date)}</span>}
                    </span>
                  )}
                  <span className="rounded-md bg-white/10 text-white px-1.5 font-semibold">{toEnglishDigits(last.kiln || "—")}</span>
                </p>
                <p className="flex items-center gap-1.5 whitespace-nowrap min-w-0 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lastColor }} />
                  <span className="truncate" style={{ color: lastColor }}>
                    {last.type || "غير محدد"}
                  </span>
                  <span className="ms-auto text-white">
                    {last.kg !== null ? (
                      <>
                        <span dir="ltr" className="font-numbers">{formatKg(last.kg)}</span> <span className="text-gray-500 text-[0.85em]">كجم</span>
                      </>
                    ) : (
                      <span className="text-gray-500 text-[0.9em]">بدون وزن</span>
                    )}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-gray-500">لسه مفيش</p>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
