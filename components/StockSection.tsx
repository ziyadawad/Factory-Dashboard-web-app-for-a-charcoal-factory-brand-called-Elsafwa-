"use client";

import { Stock, StockItem } from "@/lib/types";
import { AlertTriangle } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";

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

  // For sacks, extract just the wood type name (remove "شكاير " prefix)
  const displayName = item.name.startsWith("شكاير ") ? item.name.slice(7) : item.name;

  return (
    <div
      className={`bg-background border-2 rounded-2xl p-2 h-full min-h-0 flex flex-col gap-2 overflow-hidden ${
        isLowStock ? "border-statusRed" : "border-cardBorder"
      }`}
    >
      {/* Row 1: Image + Name + Number */}
      <div className="flex items-center gap-3 shrink-0">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-28 w-auto object-contain shrink-0 drop-shadow-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-5xl shrink-0">{item.icon}</span>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="text-2xl font-bold text-white leading-tight">{toEnglishDigits(displayName)}</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-3xl font-bold tabular-nums ${isLowStock ? "text-statusRed" : "text-white"}`}>
              {formatNumber(count)}
            </span>
            <span className="text-gray-400 text-sm">{item.unit}</span>
          </div>
        </div>
        {isLowStock && (
          <AlertTriangle className="w-5 h-5 text-statusRed shrink-0" />
        )}
      </div>

      {/* Row 2: Progress bar */}
      <div className="shrink-0">
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
  return (
    <div className={className}>
      <div className="bg-card border border-cardBorder rounded-2xl p-3 h-full flex flex-col overflow-hidden">
        <h2 className="text-lg font-bold text-white mb-1 shrink-0">رصيد المخزن</h2>

        <div
          className="flex-1 min-h-0 grid gap-3"
          style={{
            gridTemplateColumns: `${Math.max(data.products.length, 1)}fr ${Math.max(data.sacks.length, 1)}fr`,
          }}
        >
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-1 shrink-0">
              <div className="w-1 h-7 bg-brandOrange rounded-full"></div>
              <h3 className="text-xl font-bold text-brandOrange">المنتجات المعبأة</h3>
            </div>
            <div
              className="flex-1 min-h-0 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(data.products.length, 1)}, minmax(0, 1fr))` }}
            >
              {data.products.map((product) => (
                <StockCard key={product.id} item={product} />
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-1 shrink-0">
              <div className="w-1 h-7 bg-brandOrange rounded-full"></div>
              <h3 className="text-xl font-bold text-brandOrange">الشكاير</h3>
            </div>
            <div
              className="flex-1 min-h-0 grid gap-2"
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
