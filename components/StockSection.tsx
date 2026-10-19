"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stock, StockVariant, WoodType } from "@/lib/types";
import { AlertTriangle, Package, Trees } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// أصغر حجم لاسم الكارت لو مش واخد المساحة - smallest card name font size when it doesn't fit
const MIN_NAME_FONT_SIZE = 12;

interface StockSectionProps {
  data: Stock;
  className?: string;
}

// النوع بيبقى منخفض بس لو فيه حد أدنى متحدد - a type is low only when a minimum is set
function isLow(variant: StockVariant) {
  return variant.minimumThreshold > 0 && variant.quantity <= variant.minimumThreshold;
}

function sumQuantities(variants: StockVariant[]) {
  return variants.reduce((sum, variant) => sum + variant.quantity, 0);
}

// أنواع الخشب كأنواع جوه الكارت - wood type as card variants (one quantity, or its sub-types)
function woodVariants(type: WoodType): StockVariant[] {
  if (type.subTypes) {
    return type.subTypes.map((sub) => ({
      label: sub.name,
      quantity: sub.quantity,
      minimumThreshold: sub.minimumThreshold,
    }));
  }
  return [{ label: "الرصيد", quantity: type.quantity ?? 0, minimumThreshold: type.minimumThreshold ?? 0 }];
}

// نوع واحد جوه الكارت (عادي، كامل، ناعم، خشن...) - one type inside a card
function VariantCell({
  variant,
  unit,
  numberFontSize,
  onOverflow,
}: {
  variant: StockVariant;
  unit: string;
  numberFontSize: number;
  onOverflow: (fontSize: number) => void;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const { count } = useCountUp(variant.quantity, 500);
  const low = isLow(variant);
  const progressPercentage =
    variant.minimumThreshold > 0
      ? Math.min((variant.quantity / (variant.minimumThreshold * 2)) * 100, 100)
      : 100;
  const numberRef = useRef<HTMLDivElement>(null);

  // لو الرقم أعرض من مكانه نبلغ الكارت يصغر الخط - report overflow so the card shrinks the shared font
  useIsomorphicLayoutEffect(() => {
    const el = numberRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (numberFontSize > sizes.minNumberFontSize) onOverflow(numberFontSize);
  });

  return (
    <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-between gap-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-gray-400 truncate" style={{ fontSize: `${sizes.variantLabelFontSize}px` }}>
          {toEnglishDigits(variant.label)}
        </span>
        {low && <span className="text-statusRed font-bold text-xs shrink-0">منخفض</span>}
      </div>

      <div>
        <div
          ref={numberRef}
          className={`font-bold tabular-nums leading-none whitespace-nowrap overflow-hidden ${
            low ? "text-statusRed" : "text-white"
          }`}
          style={{ fontSize: `${numberFontSize}px` }}
        >
          {formatNumber(count)}
        </div>
        <span className="text-gray-400" style={{ fontSize: `${sizes.unitFontSize}px` }}>
          {unit}
        </span>
      </div>

      <div>
        <div className="relative h-1.5 bg-cardBorder rounded-full overflow-hidden">
          <div
            className={`absolute top-0 right-0 h-full rounded-full transition-all duration-500 ${
              low ? "bg-statusRed" : "bg-gradient-to-r from-brandYellow to-brandOrange"
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <p className="text-gray-500 text-xs mt-1 whitespace-nowrap overflow-hidden">
          الحد الأدنى: {formatNumber(variant.minimumThreshold)}
        </p>
      </div>
    </div>
  );
}

// صورة المنتج أو أيقونة مكانها - product image, or a placeholder / icon in the same box
function CardIcon({ image, icon, name }: { image?: string; icon?: ReactNode; name: string }) {
  const sizes = dashboardConfig.sizes.stockPage;
  const [imageFailed, setImageFailed] = useState(false);
  const box = { width: `${sizes.imageWidth}px`, height: `${sizes.imageHeight}px` };

  if (image && !imageFailed) {
    return (
      <img
        src={image}
        alt={name}
        style={box}
        className="object-contain shrink-0"
        onError={() => setImageFailed(true)}
      />
    );
  }
  if (image) {
    return (
      <div style={box} className="flex items-center justify-center shrink-0 text-gray-500">
        <Package className="w-3/5 h-3/5" />
      </div>
    );
  }
  return <span className="text-3xl shrink-0 leading-none">{icon}</span>;
}

// كارت فيه أنواع جنب بعض وتحتهم الإجمالي - card with its types side by side and a total row
function VariantsCard({
  name,
  unit,
  variants,
  image,
  icon,
  showTotal = true,
}: {
  name: string;
  unit: string;
  variants: StockVariant[];
  image?: string;
  icon?: ReactNode;
  showTotal?: boolean;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const anyLow = variants.some(isLow);
  const total = sumQuantities(variants);
  const { count: totalCount } = useCountUp(total, 500);

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
  }, [nameFontSize, name]);

  // نفس حجم الرقم لكل الأنواع (الأصغر فيهم) - every type shares one number size (the smallest fit)
  const variantsRef = useRef<HTMLDivElement>(null);
  const [numberFontSize, setNumberFontSize] = useState(sizes.numberFontSize);
  const shrinkNumber = useCallback(
    (fontSize: number) =>
      setNumberFontSize((current) => Math.min(current, Math.max(fontSize - 1, sizes.minNumberFontSize))),
    [sizes.minNumberFontSize]
  );

  // لما الكمية تتغير نرجع الحجم الأصلي ونقيس تاني - on quantity change, reset and re-measure
  const quantitiesKey = variants.map((variant) => variant.quantity).join("|");
  const prevQuantitiesKey = useRef(quantitiesKey);
  useIsomorphicLayoutEffect(() => {
    if (prevQuantitiesKey.current === quantitiesKey) return;
    prevQuantitiesKey.current = quantitiesKey;
    setNumberFontSize(sizes.numberFontSize);
  }, [quantitiesKey, sizes.numberFontSize]);

  // لما الكارت يتغير مقاسه نرجع الحجم الأصلي ونقيس تاني - on resize, reset and re-measure
  useEffect(() => {
    const el = variantsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      setNumberFontSize(sizes.numberFontSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sizes.numberFontSize]);

  return (
    <div
      className={`bg-background border-2 rounded-2xl p-3 h-full min-h-0 min-w-0 flex flex-col gap-2 overflow-hidden ${
        anyLow ? "border-statusRed" : "border-cardBorder"
      }`}
    >
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <CardIcon image={image} icon={icon} name={name} />
          <h3
            ref={nameRef}
            className="font-bold text-white whitespace-nowrap min-w-0"
            style={{ fontSize: `${nameFontSize}px` }}
          >
            {toEnglishDigits(name)}
          </h3>
        </div>
        {anyLow && <AlertTriangle className="w-5 h-5 text-statusRed shrink-0" />}
      </div>

      <div ref={variantsRef} className="flex-1 min-h-0 flex gap-2">
        {variants.map((variant, index) => (
          <div key={index} className="contents">
            {index > 0 && <div className="w-px bg-cardBorder shrink-0" />}
            <VariantCell
              variant={variant}
              unit={unit}
              numberFontSize={numberFontSize}
              onOverflow={shrinkNumber}
            />
          </div>
        ))}
      </div>

      {showTotal && (
        <div className="flex items-baseline justify-between gap-2 border-t border-cardBorder pt-1.5 shrink-0">
          <span className="text-gray-400 text-sm">الإجمالي</span>
          <p className="whitespace-nowrap">
            <span className="font-bold text-brandOrange tabular-nums" style={{ fontSize: `${sizes.totalFontSize}px` }}>
              {formatNumber(totalCount)}
            </span>
            <span className="text-gray-400" style={{ fontSize: `${sizes.unitFontSize}px` }}>
              {" "}
              {unit}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// قسم كبير بعنوان وكروت جنب بعض - big titled section with cards side by side
function SectionCard({
  title,
  extra,
  columns,
  children,
}: {
  title: string;
  extra?: ReactNode;
  columns: number;
  children: ReactNode;
}) {
  const sizes = dashboardConfig.sizes.stockPage;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h2 className="font-bold text-white whitespace-nowrap" style={{ fontSize: `${sizes.sectionTitleFontSize}px` }}>
          {title}
        </h2>
        {extra}
      </div>
      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </div>
  );
}

export default function StockSection({ data, className }: StockSectionProps) {
  const sizes = dashboardConfig.sizes.stockPage;
  const rows = sizes.rowHeights;
  const woodTotal = data.wood.types.reduce((sum, type) => sum + sumQuantities(woodVariants(type)), 0);
  const { count: woodTotalCount } = useCountUp(woodTotal, 500);

  return (
    <div
      className={`grid gap-4 ${className ?? ""}`}
      style={{
        gridTemplateRows: `minmax(0,${rows.packaged}fr) minmax(0,${rows.wood}fr) minmax(0,${rows.sacks}fr)`,
      }}
    >
      <SectionCard title="المنتجات المعبأة" columns={data.packaged.length}>
        {data.packaged.map((product) => (
          <VariantsCard
            key={product.id}
            name={product.name}
            unit={product.unit}
            image={product.image}
            icon={<Package className="w-8 h-8 text-gray-500" />}
            variants={product.variants}
          />
        ))}
      </SectionCard>

      <SectionCard
        title="أرصدة الخشب"
        columns={data.wood.types.length}
        extra={
          <p className="text-gray-400 text-sm whitespace-nowrap">
            إجمالي الخشب:{" "}
            <span className="font-bold text-brandOrange tabular-nums" style={{ fontSize: `${sizes.sectionTotalFontSize}px` }}>
              {formatNumber(woodTotalCount)}
            </span>{" "}
            {data.wood.unit}
          </p>
        }
      >
        {data.wood.types.map((type) => (
          <VariantsCard
            key={type.id}
            name={type.name}
            unit={data.wood.unit}
            icon={<Trees className="w-8 h-8 text-brandOrange" />}
            variants={woodVariants(type)}
            showTotal={!!type.subTypes}
          />
        ))}
      </SectionCard>

      <SectionCard title="الشكاير" columns={data.sacks.length}>
        {data.sacks.map((sack) => (
          <VariantsCard key={sack.id} name={sack.name} unit={sack.unit} icon={sack.icon} variants={sack.variants} />
        ))}
      </SectionCard>
    </div>
  );
}
