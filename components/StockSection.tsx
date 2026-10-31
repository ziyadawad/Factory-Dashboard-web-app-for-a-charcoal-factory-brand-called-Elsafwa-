"use client";

import { ReactNode, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PackagingItem, Stock, StockVariant, WoodType } from "@/lib/types";
import { AlertTriangle, Box, Cylinder, Disc3, Layers, LucideIcon, Package, ShoppingBag, TreePine, Trees } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { useFitFontSize } from "@/lib/useFitFontSize";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// ارتفاع سطر الكلام العريض (bold) - خط Cairo العريض محتاج سطر أطول عشان ميتقصش من فوق أو تحت
// Line height for bold text - bold Cairo needs a taller line so it isn't clipped at the top/bottom
const BOLD_LINE_HEIGHT = 1.75;

// ارتفاع سطر الأرقام - الأرقام بتستخدم font-numbers (نفس خط Cairo بس مقاساته الرأسية مظبوطة على 1.1)
// Line height for quantities - they use font-numbers (same Cairo font, vertical metrics tuned for 1.1)
const NUMBER_LINE_HEIGHT = 1.1;

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

// الرقم ناقص لما يكون أقل من الحد الأدنى بتاعه (config/stock-min.ts) - بالحد 0 بس الرصيد السالب
// A number is low when it is LESS than its minimum (config/stock-min.ts); with 0 only negative stock
function isBelow(quantity: number, minimum: number) {
  return quantity < minimum;
}

function isLow(variant: StockVariant) {
  return isBelow(variant.quantity, variant.minimumThreshold);
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

// أيقونة كل مادة تعبئة حسب الـ icon في الكونفج - packaging icon by its config "icon" value
const PACKAGING_ICONS: Record<string, LucideIcon> = {
  plastic: Layers, // أكياس تعبئة
  roll: Cylinder, // رولات
  bag: ShoppingBag, // أكياس
  tape: Disc3, // بكر لاصق
};

// مادة التعبئة كنوع واحد من غير اسم (الاسم فوق في الكارت) - packaging item as one unnamed type
function packagingVariants(item: PackagingItem): StockVariant[] {
  return [{ label: "", quantity: item.quantity, minimumThreshold: item.minimumThreshold }];
}

// رقم كمية: سطره ثابت (1.1) ومش بيتقص أبداً - بيصغر في العرض بس - a quantity: fixed 1.1 line height, never clipped; only its width is fitted
function QuantityNumber({
  value,
  unit,
  fontSize,
  low,
  numberRef,
  fitColumn = false,
}: {
  value: number;
  unit?: string;
  fontSize: number;
  low: boolean;
  numberRef: RefObject<HTMLDivElement>;
  // جوه عمود: الحجم من الكونفج (variantNumberMaxSize / variantNumberScale) وبيصغر مع عرض العمود
  // Inside a column: size comes from config (variantNumberMaxSize / variantNumberScale) and shrinks with the column width
  fitColumn?: boolean;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const { variantNumberMaxSize, variantNumberScale } = dashboardConfig.sizes.page2;
  const { count } = useCountUp(value, 500);

  return (
    <div
      ref={numberRef}
      className={`font-numbers font-bold tabular-nums whitespace-nowrap shrink-0 ${low ? "text-statusRed" : "text-white"}`}
      style={{ fontSize: fitColumn ? `min(${variantNumberMaxSize}px, ${variantNumberScale}cqi)` : `${fontSize}px`, lineHeight: NUMBER_LINE_HEIGHT }}
    >
      {formatNumber(count)}
      {unit && (
        <span className="font-normal text-gray-400" style={{ fontSize: `${sizes.unitFontSize}px`, lineHeight: 1.6 }}>
          {" "}
          {unit}
        </span>
      )}
    </div>
  );
}

// شريط التقدم: مليان زي ما هو، ولو الرقم ناقص بيقلب أحمر وطوله = الكمية ÷ الحد الأدنى
// الحد الأدنى نفسه عمره ما بيظهر - the minimum itself is never shown
// Progress bar: full as before; when low it turns red and its length = quantity / minimum
function ProgressBar({ variant }: { variant: StockVariant }) {
  const low = isLow(variant);
  const progressPercentage = !low
    ? 100
    : variant.minimumThreshold > 0
      ? Math.max(0, Math.min((variant.quantity / variant.minimumThreshold) * 100, 100))
      : 0;

  return (
    <div>
      <div className="relative h-1.5 bg-cardBorder rounded-full overflow-hidden">
        <div
          className={`absolute top-0 right-0 h-full rounded-full transition-all duration-500 ${
            low ? "bg-statusRed" : "bg-gradient-to-r from-brandYellow to-brandOrange"
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
}

// عمود نوع واحد (عادي، كامل، ناعم، كازوارينا...): اسم / رقم / شريط - one type column: label / number / bar
function VariantColumn({
  variant,
  numberFontSize,
  onOverflow,
}: {
  variant: StockVariant;
  numberFontSize: number;
  onOverflow: (fontSize: number) => void;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const low = isLow(variant);
  const numberRef = useRef<HTMLDivElement>(null);
  const [labelRef, labelFontSize] = useFitFontSize<HTMLSpanElement>(
    sizes.variantLabelFontSize,
    sizes.minVariantLabelFontSize,
    variant.label
  );

  // لو الرقم أعرض من مكانه نبلغ الكارت يصغر الخط (العرض بس) - width-only: report overflow so the card shrinks the shared font
  useIsomorphicLayoutEffect(() => {
    const el = numberRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (numberFontSize > sizes.minNumberFontSize) onOverflow(numberFontSize);
  });

  return (
    <div
      className="min-w-0 overflow-hidden grid gap-1 px-1 first:pr-0 last:pl-0"
      style={{ gridTemplateRows: "auto auto auto", containerType: "inline-size" }}
    >
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span
          ref={labelRef}
          className="text-gray-400 flex-1 min-w-0 whitespace-nowrap"
          style={{ fontSize: `${labelFontSize}px` }}
        >
          {toEnglishDigits(variant.label)}
        </span>
      </div>
      <QuantityNumber value={variant.quantity} fontSize={numberFontSize} low={low} numberRef={numberRef} fitColumn />
      <ProgressBar variant={variant} />
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
  // الإيموجي محتاج سطر أطول عشان ميتقصش - emoji needs a taller line so it isn't clipped
  return (
    <span className="text-3xl shrink-0" style={{ lineHeight: 2 }}>
      {icon}
    </span>
  );
}

// الكارت: صفوف ثابتة (العنوان / الأرقام / الإجمالي) وكل صف واخد ارتفاعه الطبيعي
// The card: explicit rows (header / numbers / total) and every row keeps its natural height
// نوع واحد من غير إجمالي = رقم كبير والوحدة جنبه (مواد التعبئة والخشب العادي)
// One type without a total = one big number with its unit next to it (packaging, single wood types)
function VariantsCard({
  name,
  unit,
  variants,
  image,
  icon,
  accent,
  numberFontSize: maxNumberFontSize,
  showTotal = true,
  showTotalUnit = false,
  totalMinimum = 0,
}: {
  name: string;
  unit: string;
  variants: StockVariant[];
  image?: string;
  icon?: ReactNode;
  accent: string;
  numberFontSize?: number;
  showTotal?: boolean;
  showTotalUnit?: boolean;
  // الحد الأدنى للإجمالي - minimum for the card total
  totalMinimum?: number;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const totalSizes = dashboardConfig.sizes.page2;
  const single = variants.length === 1 && !showTotal;
  const baseNumberFontSize = maxNumberFontSize ?? (single ? sizes.singleNumberFontSize : sizes.numberFontSize);
  const total = sumQuantities(variants);
  // الإجمالي ناقص (بس لو الكارت فيه إجمالي) - the total is low (only on cards that show a total)
  const totalLow = showTotal && isBelow(total, totalMinimum);
  const anyLow = variants.some(isLow) || totalLow;
  const { count: totalCount } = useCountUp(total, 500);
  // رقم الإجمالي بيصغر لو مش واخد مكانه (العرض بس) - the total number shrinks to fit (width only)
  const [totalRef, totalFontSize] = useFitFontSize<HTMLParagraphElement>(
    totalSizes.totalFontSize,
    totalSizes.minTotalFontSize,
    `${total}|${unit}`
  );
  const [nameRef, nameFontSize] = useFitFontSize<HTMLHeadingElement>(sizes.nameFontSize, MIN_NAME_FONT_SIZE, name);

  // نفس حجم الرقم لكل الأنواع (الأصغر فيهم) - every type shares one number size (the smallest fit)
  const variantsRef = useRef<HTMLDivElement>(null);
  const singleNumberRef = useRef<HTMLDivElement>(null);
  const [numberFontSize, setNumberFontSize] = useState(baseNumberFontSize);
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
    setNumberFontSize(baseNumberFontSize);
  }, [quantitiesKey, baseNumberFontSize]);

  // لما الكارت يتغير عرضه نرجع الحجم الأصلي ونقيس تاني - on width change, reset and re-measure
  useEffect(() => {
    const el = variantsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      setNumberFontSize(baseNumberFontSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [baseNumberFontSize]);

  // الرقم الكبير الواحد بيصغر لو أعرض من مكانه (العرض بس) - the single big number shrinks when too wide (width only)
  useIsomorphicLayoutEffect(() => {
    const el = singleNumberRef.current;
    if (!single || !el || el.scrollWidth <= el.clientWidth) return;
    if (numberFontSize > sizes.minNumberFontSize) shrinkNumber(numberFontSize);
  });

  return (
    // ناقص: إطار أحمر ولمعة حمرا خفيفة بتنبض بهدوء - low: red border with a soft, slowly pulsing red glow
    <div
      className={`relative bg-background border-2 rounded-2xl p-2.5 min-w-0 grid gap-1.5 ${anyLow ? "border-statusRed animate-low-stock" : ""}`}
      style={{
        gridTemplateRows: showTotal ? "auto 1fr auto" : "auto 1fr",
        ...(anyLow ? {} : { borderColor: withAlpha(accent, 0.3) }),
      }}
    >
      {/* "⚠ محتاج نزوّد" متعلّقة على الإطار اللي فوق، فمش بتاخد مكان ولا بتغطي الاسم
          The badge hangs on the top border, so it takes no space and never covers the name */}
      {anyLow && (
        <span className="absolute -top-2.5 left-2 z-10 flex items-center gap-1 whitespace-nowrap rounded-full border border-statusRed bg-background px-2 text-[11px] leading-[18px] font-bold text-statusRed">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          محتاج نزوّد
        </span>
      )}

      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <CardIcon image={image} icon={icon} name={name} />
          <h3
            ref={nameRef}
            className="font-bold text-white whitespace-nowrap min-w-0"
            style={{ fontSize: `${nameFontSize}px`, lineHeight: BOLD_LINE_HEIGHT }}
          >
            {toEnglishDigits(name)}
          </h3>
        </div>
      </div>

      <div ref={variantsRef} className="min-w-0 flex items-center">
        {single ? (
          <div className="w-full min-w-0 grid gap-1.5" style={{ gridTemplateRows: "auto auto" }}>
            <QuantityNumber
              value={variants[0].quantity}
              unit={unit}
              fontSize={numberFontSize}
              low={isLow(variants[0])}
              numberRef={singleNumberRef}
            />
            <ProgressBar variant={variants[0]} />
          </div>
        ) : (
          <div
            className="w-full min-w-0 grid divide-x divide-x-reverse divide-cardBorder"
            style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` }}
          >
            {variants.map((variant, index) => (
              <VariantColumn key={index} variant={variant} numberFontSize={numberFontSize} onOverflow={shrinkNumber} />
            ))}
          </div>
        )}
      </div>

      {showTotal && (
        <div className="flex items-center justify-between gap-2 border-t border-cardBorder pt-1 min-w-0">
          <span
            className="font-semibold text-gray-300 shrink-0 whitespace-nowrap"
            style={{ fontSize: `${totalSizes.totalLabelFontSize}px` }}
          >
            الإجمالي
          </span>
          <p ref={totalRef} className="min-w-0 whitespace-nowrap text-left">
            <span
              className="font-numbers font-extrabold tabular-nums"
              style={{ fontSize: `${totalFontSize}px`, lineHeight: NUMBER_LINE_HEIGHT, color: totalLow ? "#EF4444" : accent }}
            >
              {formatNumber(totalCount)}
            </span>
            {showTotalUnit && (
              <span className="text-gray-400" style={{ fontSize: `${totalSizes.totalUnitFontSize}px` }}>
                {" "}
                {unit}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// كروت جنب بعض في صف واحد - cards side by side in one row
function CardsGrid({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <div
      className="flex-1 grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

// قسم كبير بعنوان وكروت جنب بعض - big titled section with cards side by side
// كل قسم ليه لون: خط على اليمين وأيقونة وخلفية خفيفة - each section has an accent: right bar, icon, faint tint
// من غير columns المحتوى بيترص فوق بعض (زي المواد الخام) - without columns, children are stacked (raw materials)
// مفيش overflow-hidden عشان مفيش رقم يتقص - no overflow-hidden, so no number can ever be clipped
function SectionCard({
  title,
  icon: Icon,
  accent,
  extra,
  columns,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  extra?: ReactNode;
  columns?: number;
  children: ReactNode;
}) {
  const sizes = dashboardConfig.sizes.stockPage;

  return (
    <div
      className="relative bg-card border border-cardBorder rounded-2xl p-3 flex flex-col"
      style={{ backgroundImage: `linear-gradient(to left, ${withAlpha(accent, 0.06)}, transparent 60%)` }}
    >
      <div
        className="absolute top-0 bottom-0 right-0 w-1"
        style={{ backgroundColor: accent, borderTopRightRadius: 15, borderBottomRightRadius: 15 }}
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="shrink-0" style={{ color: accent }} size={sizes.sectionTitleFontSize + 2} />
          <h2
            className="font-bold text-white whitespace-nowrap"
            style={{ fontSize: `${sizes.sectionTitleFontSize}px`, lineHeight: BOLD_LINE_HEIGHT }}
          >
            {title}
          </h2>
        </div>
        {extra}
      </div>
      {columns === undefined ? (
        <div className="flex-1 flex flex-col">{children}</div>
      ) : (
        <CardsGrid columns={columns}>{children}</CardsGrid>
      )}
    </div>
  );
}

// مجموعة فرعية جوه قسم (الأخشاب، مواد التعبئة) - sub-group inside a section (wood, packaging)
function SubGroup({
  title,
  accent,
  extra,
  columns,
  grow,
  children,
}: {
  title: string;
  accent: string;
  extra?: ReactNode;
  columns: number;
  grow: number;
  children: ReactNode;
}) {
  const sizes = dashboardConfig.sizes.stockPage;

  return (
    // flex-basis auto: المجموعة عمرها ما تصغر عن محتواها - the group never shrinks below its content
    <div className="flex flex-col" style={{ flex: `${grow} 1 auto` }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3
          className="font-bold whitespace-nowrap"
          style={{ fontSize: `${sizes.subGroupTitleFontSize}px`, color: accent, lineHeight: BOLD_LINE_HEIGHT }}
        >
          {title}
        </h3>
        {extra}
      </div>
      <CardsGrid columns={columns}>{children}</CardsGrid>
    </div>
  );
}

export default function StockSection({ data, className }: StockSectionProps) {
  const sizes = dashboardConfig.sizes.stockPage;
  const totalSizes = dashboardConfig.sizes.page2;
  const colors = dashboardConfig.page2.colors;
  const rows = sizes.rowHeights;
  const top = sizes.topColumns;
  const rawRows = sizes.rawMaterialsRows;
  const { wood, packaging } = data.rawMaterials;
  const woodTotal = wood.types.reduce((sum, type) => sum + sumQuantities(woodVariants(type)), 0);
  const { count: woodTotalCount } = useCountUp(woodTotal, 500);

  return (
    // الصفوف عمرها ما تصغر عن محتواها (min-content) والمساحة الزيادة بتتوزع بالنسب
    // Rows never shrink below their content (min-content); extra space is shared by the ratios
    <div
      className={`grid gap-3 ${className ?? ""}`}
      style={{
        gridTemplateRows: `minmax(min-content,${rows.finished}fr) minmax(min-content,${rows.rawMaterials}fr)`,
        lineHeight: 1.6,
      }}
    >
      {/* فوق: المنتجات المعبأة (يمين) والشكاير (شمال) - top: packaged products (right) + sacks (left) */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `minmax(0,${top.packaged}fr) minmax(0,${top.sacks}fr)` }}
      >
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
              totalMinimum={product.minimumThreshold}
            />
          ))}
        </SectionCard>

        <SectionCard title="الشكاير" icon={ShoppingBag} accent={colors.sacks} columns={data.sacks.length}>
          {data.sacks.map((sack) => (
            <VariantsCard
              key={sack.id}
              name={sack.name}
              unit={sack.unit}
              icon={sack.icon}
              variants={sack.variants}
              accent={colors.sacks}
              totalMinimum={sack.minimumThreshold}
            />
          ))}
        </SectionCard>
      </div>

      {/* تحت: المواد الخام كلها في قسم واحد - bottom: all raw materials in one section */}
      <SectionCard title="المواد الخام" icon={TreePine} accent={colors.rawMaterials}>
        <SubGroup
          title="الأخشاب"
          accent={colors.rawMaterials}
          columns={wood.types.length}
          grow={rawRows.wood}
          extra={
            <p
              className="text-gray-300 font-semibold whitespace-nowrap"
              style={{ fontSize: `${totalSizes.totalLabelFontSize}px` }}
            >
              إجمالي الخشب:{" "}
              <span
                className="font-numbers font-extrabold tabular-nums"
                style={{
                  fontSize: `${totalSizes.sectionTotalFontSize}px`,
                  lineHeight: NUMBER_LINE_HEIGHT,
                  color: colors.rawMaterials,
                }}
              >
                {formatNumber(woodTotalCount)}
              </span>{" "}
              {wood.unit}
            </p>
          }
        >
          {/* الخشب العادي رقم واحد كبير، والبلدي أنواعه جنب بعض وتحتهم الإجمالي - single types: one big number; بلدي: sub-types + total */}
          {wood.types.map((type) => (
            <VariantsCard
              key={type.id}
              name={type.name}
              unit={wood.unit}
              icon={<Trees className="w-8 h-8 text-brandOrange" />}
              variants={woodVariants(type)}
              accent={colors.rawMaterials}
              showTotal={!!type.subTypes}
              showTotalUnit
              totalMinimum={type.subTypes ? type.minimumThreshold : undefined}
              numberFontSize={type.subTypes ? sizes.subTypeNumberFontSize : undefined}
            />
          ))}
        </SubGroup>

        <div className="h-px bg-cardBorder my-2" />

        <SubGroup title="مواد التعبئة" accent={colors.rawMaterials} columns={packaging.length} grow={rawRows.packaging}>
          {packaging.map((item) => {
            const Icon = (item.icon && PACKAGING_ICONS[item.icon]) || Box;
            return (
              <VariantsCard
                key={item.id}
                name={item.name}
                unit={item.unit}
                icon={<Icon className="w-7 h-7" style={{ color: colors.rawMaterials }} />}
                variants={packagingVariants(item)}
                accent={colors.rawMaterials}
                showTotal={false}
              />
            );
          })}
        </SubGroup>
      </SectionCard>
    </div>
  );
}
