"use client";

import { Stock, StockItem } from "@/lib/types";
import { AlertTriangle } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface StockSectionProps {
  data: Stock;
  className?: string;
}

function StockCard({ item }: { item: StockItem }) {
  const { count } = useCountUp(item.quantity, 500);
  const isLowStock = item.quantity <= item.minimumThreshold;
  const progressPercentage =
    item.minimumThreshold > 0
      ? Math.min((item.quantity / (item.minimumThreshold * 2)) * 100, 100)
      : 100;
  const sizes = dashboardConfig.sizes.products;

  return (
    <div
      className={`bg-background border-2 rounded-2xl p-3 h-full min-h-0 flex flex-col justify-between overflow-hidden ${
        isLowStock ? "border-statusRed" : "border-cardBorder"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              style={{
                width: `${sizes.imageWidth}px`,
                height: `${sizes.imageHeight}px`,
              }}
              className="object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-3xl shrink-0">{item.icon}</span>
          )}
          <h3
            className="font-bold text-white truncate"
            style={{ fontSize: `${sizes.nameFontSize}px` }}
          >
            {toEnglishDigits(item.name)}
          </h3>
        </div>
        {isLowStock && (
          <AlertTriangle className="w-5 h-5 text-statusRed shrink-0" />
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={`font-bold tabular-nums ${isLowStock ? "text-statusRed" : "text-white"}`}
          style={{ fontSize: `${sizes.numberFontSize}px` }}
        >
          {formatNumber(count)}
        </span>
        <span
          className="text-gray-400"
          style={{ fontSize: `${sizes.unitFontSize}px` }}
        >
          {item.unit}
        </span>
      </div>

      <div>
        <div className="relative h-2 bg-cardBorder rounded-full overflow-hidden">
          <div
            className={`absolute top-0 right-0 h-full rounded-full transition-all duration-500 ${
              isLowStock ? "bg-statusRed" : "bg-gradient-to-r from-brandYellow to-brandOrange"
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <p className="text-gray-500 text-xs mt-1">
          {isLowStock ? <span className="text-statusRed font-bold">رصيد منخفض · </span> : null}
          الحد الأدنى: {formatNumber(item.minimumThreshold)}
        </p>
      </div>
    </div>
  );
}

export default function StockSection({ data, className }: StockSectionProps) {
  const sizes = dashboardConfig.sizes.products;

  return (
    <div className={className}>
      <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
        <h2 className="text-xl font-bold text-white mb-2 shrink-0">رصيد المخزن</h2>

        <div
          className="flex-1 min-h-0 grid gap-4"
          style={{
            gridTemplateColumns: `${Math.max(data.products.length, 1)}fr ${Math.max(data.sacks.length, 1)}fr`,
          }}
        >
          <div className="flex flex-col min-h-0">
            <h3
              className="font-semibold text-brandOrange mb-2 shrink-0"
              style={{ fontSize: `${sizes.sectionTitleFontSize}px` }}
            >
              المنتجات المعبأة
            </h3>
            <div
              className="flex-1 min-h-0 grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(data.products.length, 1)}, minmax(0, 1fr))` }}
            >
              {data.products.map((product) => (
                <StockCard key={product.id} item={product} />
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <h3
              className="font-semibold text-brandOrange mb-2 shrink-0"
              style={{ fontSize: `${sizes.sectionTitleFontSize}px` }}
            >
              الشكاير
            </h3>
            <div
              className="flex-1 min-h-0 grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(data.sacks.length, 1)}, minmax(0, 1fr))` }}
            >
              {data.sacks.map((sack) => (
                <StockCard key={sack.id} item={sack} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
