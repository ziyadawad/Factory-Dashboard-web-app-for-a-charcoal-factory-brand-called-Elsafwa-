"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stock, StockItem } from "@/lib/types";
import { AlertTriangle, Package } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// أصغر حجم لاسم المنتج لو مش واخد المساحة - smallest product name font size when it doesn't fit
const MIN_NAME_FONT_SIZE = 12;

// المسافة بين القسمين وبين الكروت (gap-4 / gap-3) - gaps between sections and between cards
const SECTION_GAP = 16;
const CARD_GAP = 12;

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
  const [imageFailed, setImageFailed] = useState(false);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [nameFontSize, setNameFontSize] = useState(sizes.nameFontSize);

  // لما الشاشة تتغير نرجع الحجم الأصلي ونقيس تاني - on resize, reset and re-measure
  useEffect(() => {
    const el = nameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      setNameFontSize(sizes.nameFontSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sizes.nameFontSize]);

  // لو الاسم أطول من المساحة نصغر الخط شوية - shrink the name font until it fits
  useIsomorphicLayoutEffect(() => {
    const el = nameRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (nameFontSize > MIN_NAME_FONT_SIZE) setNameFontSize(nameFontSize - 1);
  }, [nameFontSize, item.name]);

  return (
    <div
      className={`bg-background border-2 rounded-2xl p-3 h-full min-h-0 flex flex-col justify-between overflow-hidden ${
        isLowStock ? "border-statusRed" : "border-cardBorder"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.image && !imageFailed ? (
            <img
              src={item.image}
              alt={item.name}
              style={{
                width: `${sizes.imageWidth}px`,
                height: `${sizes.imageHeight}px`,
              }}
              className="object-contain shrink-0"
              onError={() => setImageFailed(true)}
            />
          ) : item.image ? (
            // الصورة مش موجودة - أيقونة مكانها بنفس المقاس - image missing: placeholder icon in the same box
            <div
              style={{
                width: `${sizes.imageWidth}px`,
                height: `${sizes.imageHeight}px`,
              }}
              className="flex items-center justify-center shrink-0 text-gray-500"
            >
              <Package className="w-3/5 h-3/5" />
            </div>
          ) : (
            <span className="text-3xl shrink-0">{item.icon}</span>
          )}
          <h3
            ref={nameRef}
            className="font-bold text-white whitespace-nowrap min-w-0"
            style={{ fontSize: `${nameFontSize}px` }}
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
  const productCount = Math.max(data.products.length, 1);
  const sackCount = Math.max(data.sacks.length, 1);
  const cardCount = productCount + sackCount;

  // عرض قسم المنتجات محسوب عشان كل الكروت تبقى بنفس العرض بالظبط - products section width so every card is exactly equal
  const productsColumn = `calc((100% - ${SECTION_GAP + (cardCount - 2) * CARD_GAP}px) * ${productCount} / ${cardCount} + ${(productCount - 1) * CARD_GAP}px)`;

  return (
    <div className={className}>
      <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
        <h2 className="text-xl font-bold text-white mb-2 shrink-0">رصيد المخزن</h2>

        <div
          className="flex-1 min-h-0 grid gap-4"
          style={{
            gridTemplateColumns: `${productsColumn} minmax(0, 1fr)`,
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
