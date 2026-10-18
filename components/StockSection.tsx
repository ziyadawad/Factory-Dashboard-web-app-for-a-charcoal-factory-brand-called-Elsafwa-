"use client";

import { Stock, StockItem } from "@/lib/types";
import { AlertTriangle } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";

interface StockSectionProps {
  data: Stock;
  className?: string;
}

function StockCard({ item }: { item: StockItem }) {
  const { count } = useCountUp(item.quantity, 500);
  const isLowStock = item.quantity <= item.minimumThreshold;
  const progressPercentage = Math.min((item.quantity / (item.minimumThreshold * 2)) * 100, 100);

  return (
    <div
      className={`bg-background border-2 rounded-2xl p-4 ${
        isLowStock ? "border-statusRed" : "border-cardBorder"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-12 h-12 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-3xl">{item.icon}</span>
          )}
          <div>
            <h3 className="text-lg font-bold text-white">{item.name}</h3>
            <p className="text-gray-400 text-sm">
              {count.toLocaleString()} {item.unit}
            </p>
          </div>
        </div>
        {isLowStock && (
          <div className="flex items-center gap-1 bg-statusRed/20 px-2 py-1 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-statusRed" />
            <span className="text-statusRed text-xs font-bold">رصيد منخفض</span>
          </div>
        )}
      </div>

      <div className="relative h-2 bg-cardBorder rounded-full overflow-hidden">
        <div
          className={`absolute top-0 right-0 h-full rounded-full transition-all duration-500 ${
            isLowStock ? "bg-statusRed" : "bg-gradient-to-r from-brandYellow to-brandOrange"
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <p className="text-gray-500 text-xs mt-2">
        الحد الأدنى: {item.minimumThreshold.toLocaleString()} {item.unit}
      </p>
    </div>
  );
}

export default function StockSection({ data, className }: StockSectionProps) {
  return (
    <div className={className}>
      <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col">
        <h2 className="text-xl font-bold text-white mb-4">رصيد المخزن</h2>

        <div className="flex-1 overflow-auto">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-brandOrange mb-3">المنتجات المعبأة</h3>
            <div className="grid grid-cols-4 gap-3">
              {data.products.map((product) => (
                <StockCard key={product.id} item={product} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-brandOrange mb-3">الشكاير</h3>
            <div className="grid grid-cols-3 gap-3">
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
