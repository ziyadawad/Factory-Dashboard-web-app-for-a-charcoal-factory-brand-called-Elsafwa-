"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PackagingItem, Stock, StockVariant, WoodType } from "@/lib/types";
import { AlertTriangle, Box, Boxes, LucideIcon, Package, ShoppingBag, TreePine, Trees } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// أصغر حجم لاسم الكارت لو مش واخد المساحة - smallest card name font size when it doesn't fit
const MIN_NAME_FONT_SIZE = 12;

// لون "#RRGGBB" بشفافية (0 لـ 1) - "#RRGGBB" color with an opacity (0 to 1)
function withAlpha(hex: string, alpha: number) {
  const value = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${value}`;
}

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

// مادة التعبئة كنوع واحد من غير اسم (الاسم فوق في الكارت) - packaging item as one unnamed type
function packagingVariants(item: PackagingItem): StockVariant[] {
  return [{ label: "", quantity: item.quantity, minimumThreshold: item.minimumThreshold }];
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
  accent,
  showTotal = true,
}: {
  name: string;
  unit: string;
  variants: StockVariant[];
  image?: string;
  icon?: ReactNode;
  accent: string;
  showTotal?: boolean;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const totalSizes = dashboardConfig.sizes.page2;
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
        anyLow ? "border-statusRed" : ""
      }`}
      style={anyLow ? undefined : { borderColor: withAlpha(accent, 0.3) }}
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
        <div className="flex items-baseline justify-between gap-2 border-t border-cardBorder pt-1 shrink-0">
          <span className="font-semibold text-gray-300" style={{ fontSize: `${totalSizes.totalLabelFontSize}px` }}>
            الإجمالي
          </span>
          <p className="whitespace-nowrap leading-none">
            <span
              className="font-extrabold tabular-nums"
              style={{ fontSize: `${totalSizes.totalFontSize}px`, color: accent }}
            >
              {formatNumber(totalCount)}
            </span>
            <span className="text-gray-400" style={{ fontSize: `${totalSizes.totalUnitFontSize}px` }}>
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
// كل قسم ليه لون: خط على اليمين وأيقونة وخلفية خفيفة - each section has an accent: right bar, icon, faint tint
function SectionCard({
  title,
  group,
  icon: Icon,
  accent,
  extra,
  columns,
  children,
}: {
  title: string;
  // اسم المجموعة قبل العنوان (زي "المواد الخام") - optional group label shown before the title
  group?: string;
  icon: LucideIcon;
  accent: string;
  extra?: ReactNode;
  columns: number;
  children: ReactNode;
}) {
  const sizes = dashboardConfig.sizes.stockPage;

  return (
    <div
      className="relative bg-card border border-cardBorder rounded-2xl p-4 min-h-0 flex flex-col overflow-hidden"
      style={{ backgroundImage: `linear-gradient(to left, ${withAlpha(accent, 0.06)}, transparent 60%)` }}
    >
      <div className="absolute top-0 bottom-0 right-0 w-1" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Icon className="shrink-0" style={{ color: accent }} size={sizes.sectionTitleFontSize + 2} />
          {group && (
            <>
              <span
                className="font-semibold whitespace-nowrap"
                style={{ fontSize: `${sizes.sectionGroupFontSize}px`, color: accent }}
              >
                {group}
              </span>
              <span className="text-gray-500" style={{ fontSize: `${sizes.sectionGroupFontSize}px` }}>
                ·
              </span>
            </>
          )}
          <h2
            className="font-bold text-white whitespace-nowrap leading-tight"
            style={{ fontSize: `${sizes.sectionTitleFontSize}px` }}
          >
            {title}
          </h2>
        </div>
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
  const totalSizes = dashboardConfig.sizes.page2;
  const colors = dashboardConfig.page2.colors;
  const rows = sizes.rowHeights;
  const middle = sizes.middleColumns;
  const { wood, packaging } = data.rawMaterials;
  const woodTotal = wood.types.reduce((sum, type) => sum + sumQuantities(woodVariants(type)), 0);
  const { count: woodTotalCount } = useCountUp(woodTotal, 500);

  return (
    <div
      className={`grid gap-4 ${className ?? ""}`}
      style={{
        gridTemplateRows: `minmax(0,${rows.packaged}fr) minmax(0,${rows.middle}fr) minmax(0,${rows.wood}fr)`,
      }}
    >
      {/* الصف الأول: المنتجات المعبأة - row 1: packaged products */}
      <SectionCard title="المنتجات المعبأة" icon={Package} accent={colors.packaged} columns={data.packaged.length}>
        {data.packaged.map((product) => (
          <VariantsCard
            key={product.id}
            name={product.name}
            unit={product.unit}
            image={product.image}
            icon={<Package className="w-8 h-8 text-gray-500" />}
            variants={product.variants}
            accent={colors.packaged}
          />
        ))}
      </SectionCard>

      {/* الصف التاني: الشكاير (يمين) ومواد التعبئة (شمال) - row 2: sacks (right) + packaging (left) */}
      <div
        className="min-h-0 grid gap-4"
        style={{
          gridTemplateColumns: `minmax(0,${middle.sacks}fr) minmax(0,${middle.packaging}fr)`,
          gridTemplateRows: "minmax(0,1fr)",
        }}
      >
        <SectionCard title="الشكاير" icon={ShoppingBag} accent={colors.sacks} columns={data.sacks.length}>
          {data.sacks.map((sack) => (
            <VariantsCard
              key={sack.id}
              name={sack.name}
              unit={sack.unit}
              icon={sack.icon}
              variants={sack.variants}
              accent={colors.sacks}
            />
          ))}
        </SectionCard>

        <SectionCard
          title="مواد التعبئة"
          group="المواد الخام"
          icon={Boxes}
          accent={colors.rawMaterials}
          columns={packaging.length}
        >
          {packaging.map((item) => (
            <VariantsCard
              key={item.id}
              name={item.name}
              unit={item.unit}
              icon={<Box className="w-7 h-7" style={{ color: colors.rawMaterials }} />}
              variants={packagingVariants(item)}
              accent={colors.rawMaterials}
              showTotal={false}
            />
          ))}
        </SectionCard>
      </div>

      {/* الصف التالت: الأخشاب - row 3: wood */}
      <SectionCard
        title="الأخشاب"
        group="المواد الخام"
        icon={TreePine}
        accent={colors.rawMaterials}
        columns={wood.types.length}
        extra={
          <p className="text-gray-300 font-semibold whitespace-nowrap leading-none" style={{ fontSize: `${totalSizes.totalLabelFontSize}px` }}>
            إجمالي الخشب:{" "}
            <span
              className="font-extrabold tabular-nums"
              style={{ fontSize: `${totalSizes.sectionTotalFontSize}px`, color: colors.rawMaterials }}
            >
              {formatNumber(woodTotalCount)}
            </span>{" "}
            {wood.unit}
          </p>
        }
      >
        {wood.types.map((type) => (
          <VariantsCard
            key={type.id}
            name={type.name}
            unit={wood.unit}
            icon={<Trees className="w-8 h-8 text-brandOrange" />}
            variants={woodVariants(type)}
            accent={colors.rawMaterials}
            showTotal={!!type.subTypes}
          />
        ))}
      </SectionCard>
    </div>
  );
}
