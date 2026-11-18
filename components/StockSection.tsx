"use client";

import { ReactNode, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PackagingItem, RetailStock, Stock, StockGroup, StockVariant, WoodType } from "@/lib/types";
import type { StockPanelTarget } from "./StockDetailsPanel";
import { AlertTriangle, Box, Cylinder, Disc3, Layers, LucideIcon, Package, ShoppingBag, Store, TreePine, Trees } from "lucide-react";
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
  // الضغط على كارت (أو رقم نوع جواه) يفتح تفاصيله - clicking a card (or a variant number in it) opens its details
  onOpenItem?: (target: StockPanelTarget) => void;
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
  scale = 1,
  cap,
}: {
  value: number;
  unit?: string;
  fontSize: number;
  low: boolean;
  numberRef: RefObject<HTMLDivElement>;
  // جوه عمود: الحجم من الكونفج (variantNumberMaxSize / variantNumberScale) وبيصغر مع عرض العمود
  // Inside a column: size comes from config (variantNumberMaxSize / variantNumberScale) and shrinks with the column width
  fitColumn?: boolean;
  scale?: number; // تعويض تضييق الكارت (packagedNumberBoost / sackNumberBoost) - narrower-card boost
  cap?: number; // أكبر حجم بعد ما الرقم ماخدش مكانه - the size cap after the number overflowed
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const { variantNumberMaxSize, variantNumberScale } = dashboardConfig.sizes.page2;
  const maxSize = Math.min(variantNumberMaxSize, cap ?? variantNumberMaxSize);
  const { count } = useCountUp(value, 500);

  return (
    <div
      ref={numberRef}
      className={`font-numbers font-bold tabular-nums whitespace-nowrap shrink-0 ${low ? "text-statusRed" : "text-white"}`}
      style={{ fontSize: fitColumn ? `min(${maxSize}px, ${Math.round(variantNumberScale * scale * 10) / 10}cqi)` : `${fontSize}px`, lineHeight: NUMBER_LINE_HEIGHT }}
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
  onOpen,
  showRetail = false,
  numberScale = 1,
}: {
  numberScale?: number;
  variant: StockVariant;
  numberFontSize: number;
  onOverflow: (fontSize: number) => void;
  onOpen?: () => void; // الضغط على النوع ده بس - clicking this variant only
  // سطر "قطاعي X" تحت الرقم (مكانه محجوز حتى لو 0 عشان الأعمدة تفضل على نفس الخط)
  // the "قطاعي X" line under the number (its space is kept even at 0 so the columns stay aligned)
  showRetail?: boolean;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const low = isLow(variant);
  const numberRef = useRef<HTMLDivElement>(null);
  const [labelRef, labelFontSize] = useFitFontSize<HTMLSpanElement>(
    sizes.variantLabelFontSize,
    sizes.minVariantLabelFontSize,
    variant.label
  );

  // لو الرقم أعرض من مكانه بيصغر 1px لحد ما يدخل (ولما الرقم يتغير نبدأ من الأول)
  // A number wider than its column steps down 1px until it fits (and starts over when the value changes)
  const [cap, setCap] = useState<number | undefined>(undefined);
  useIsomorphicLayoutEffect(() => setCap(undefined), [variant.quantity]);

  // لو الرقم أعرض من مكانه نبلغ الكارت يصغر الخط (العرض بس) - width-only: report overflow so the card shrinks the shared font
  useIsomorphicLayoutEffect(() => {
    const el = numberRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const current = parseFloat(getComputedStyle(el).fontSize);
    if (current > sizes.minNumberFontSize) setCap(Math.max(sizes.minNumberFontSize, Math.floor(current) - 1));
    if (numberFontSize > sizes.minNumberFontSize) onOverflow(numberFontSize);
  });

  return (
    <div
      className={`min-w-0 overflow-hidden grid gap-1 px-1 first:pr-0 last:pl-0 ${onOpen ? "cursor-pointer rounded-md hover:bg-white/5" : ""}`}
      style={{ gridTemplateRows: showRetail ? "auto auto auto auto" : "auto auto auto", containerType: "inline-size" }}
      onClick={
        onOpen
          ? (e) => {
              e.stopPropagation();
              onOpen();
            }
          : undefined
      }
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
      <QuantityNumber
        value={variant.quantity}
        fontSize={numberFontSize}
        low={low}
        numberRef={numberRef}
        fitColumn
        scale={numberScale}
        cap={cap}
      />
      {showRetail && (
        <span
          className={`text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis ${variant.retail ? "" : "invisible"}`}
          style={{ fontSize: `${sizes.sackRetail.retailFontSize}px`, lineHeight: 1.35, marginTop: -2 }}
        >
          قطاعي <span className="font-numbers tabular-nums text-gray-400">{formatNumber(variant.retail ?? 0)}</span>
        </span>
      )}
      <ProgressBar variant={variant} />
    </div>
  );
}

// صورة المنتج أو أيقونة مكانها - product image, or a placeholder / icon in the same box
function CardIcon({ image, icon, name, emojiSize }: { image?: string; icon?: ReactNode; name: string; emojiSize?: number }) {
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
    <span className="text-3xl shrink-0" style={{ lineHeight: 2, ...(emojiSize ? { fontSize: emojiSize } : {}) }}>
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
  onOpen,
  showRetail = false,
  numberScale = 1,
  tight = false,
}: {
  numberScale?: number; // تعويض أرقام الأنواع عن تضييق الكارت - variant-number boost for a narrower card
  tight?: boolean; // كروت الصف اللي فوق: مسافات أقل (topCardPaddingX / topCardTotalGap) - top-row cards: less spacing
  onOpen?: (variant: string | null) => void; // null = الكارت كله - null = the whole card
  // كروت الشكاير: رصيد القطاعي تحت كل نوع وجنب الإجمالي (الأرقام الكبيرة = الرئيسي بس)
  // sack cards: retail under each variant and next to the total (the big numbers = MAIN only)
  showRetail?: boolean;
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
  const retailTotal = Math.round(variants.reduce((sum, variant) => sum + (variant.retail ?? 0), 0) * 10) / 10;
  const compact = dashboardConfig.sizes.stockPage.sackRetail;
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
  const [nameRef, nameFontSize] = useFitFontSize<HTMLHeadingElement>(
    showRetail ? compact.nameFontSize : sizes.nameFontSize,
    MIN_NAME_FONT_SIZE,
    name
  );

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
      onClick={onOpen ? () => onOpen(null) : undefined}
      className={`relative bg-background border-2 rounded-2xl p-2.5 min-w-0 grid gap-1.5 ${anyLow ? "border-statusRed animate-low-stock" : ""} ${
        onOpen ? "cursor-pointer transition-colors hover:bg-white/[0.03]" : ""
      }`}
      style={{
        gridTemplateRows: showTotal ? "auto 1fr auto" : "auto 1fr",
        ...(anyLow ? {} : { borderColor: withAlpha(accent, 0.3) }),
        // الشكاير مع القطاعي: مسافة فوق أقل ومسافة أقل قبل الإجمالي - sacks with retail: less top padding and row gap
        ...(showRetail ? { paddingTop: compact.paddingTop, rowGap: compact.rowGap } : {}),
        ...(tight ? { paddingLeft: sizes.topCardPaddingX, paddingRight: sizes.topCardPaddingX } : {}),
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
          <CardIcon image={image} icon={icon} name={name} emojiSize={showRetail ? compact.iconFontSize : undefined} />
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
              <VariantColumn
                key={index}
                variant={variant}
                numberFontSize={numberFontSize}
                onOverflow={shrinkNumber}
                onOpen={onOpen ? () => onOpen(variant.label) : undefined}
                showRetail={showRetail && retailTotal !== 0}
                numberScale={numberScale}
              />
            ))}
          </div>
        )}
      </div>

      {showTotal && (
        <div
          className="flex items-center justify-between gap-2 border-t border-cardBorder pt-1 min-w-0"
          style={tight ? { columnGap: sizes.topCardTotalGap } : undefined}
        >
          <span className="flex items-center gap-1.5 shrink-0 min-w-0">
            <span
              className="font-semibold text-gray-300 shrink-0 whitespace-nowrap"
              style={{ fontSize: `${totalSizes.totalLabelFontSize}px` }}
            >
              الإجمالي
            </span>
            {showRetail && retailTotal !== 0 && (
              <span
                className="rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300/80 px-1.5 whitespace-nowrap"
                style={{ fontSize: `${compact.chipFontSize}px`, lineHeight: 1.5 }}
              >
                + قطاعي <span className="font-numbers tabular-nums">{formatNumber(retailTotal)}</span>
              </span>
            )}
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
// widths = عرض كل كارت بالنسبة لبعض (من غيرها كلهم زي بعض) - widths = each card's relative width (default: equal)
function CardsGrid({ columns, widths, children }: { columns: number; widths?: number[]; children: ReactNode }) {
  const template =
    widths && widths.length >= columns
      ? widths.slice(0, columns).map((w) => `minmax(0, ${w}fr)`).join(" ")
      : `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))`;
  return (
    <div className="flex-1 grid gap-2.5" style={{ gridTemplateColumns: template }}>
      {children}
    </div>
  );
}

// مكان إطار القسم لما فيه كارت برّه الإطار: الإطار بيبدأ بعد الكارت بـ 7px، والخط في نص الفاصل بينهم (3px)
// Where the section frame starts when a card sits outside it: 7px right of that card; the divider 3px right of it
function useDetachedFrame(detached?: RefObject<HTMLDivElement>) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ left: number; divider: { x: number; top: number; height: number } } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    const card = detached?.current;
    if (!section || !card) return;
    const measure = () => {
      const s = section.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      // الإحداثيات جوه الصندوق (من جوه الـ border) - coordinates inside the box (inside its 1px border)
      const right = c.right - s.left - 1;
      const next = { left: Math.round(right + 7), divider: { x: Math.round(right + 3), top: Math.round(c.top - s.top - 1), height: Math.round(c.height) } };
      setFrame((old) =>
        old && old.left === next.left && old.divider.x === next.divider.x && old.divider.top === next.divider.top && old.divider.height === next.divider.height
          ? old
          : next
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    observer.observe(card);
    return () => observer.disconnect();
  }, [detached]);
  return { sectionRef, left: frame?.left, divider: frame?.divider };
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
  widths,
  detached,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  extra?: ReactNode;
  columns?: number;
  widths?: number[];
  // كارت على الشمال برّه إطار القسم (مخزن القطاعي): الإطار بيقف قبله وبينهم خط رفيع، والمقاسات والأماكن زي ما هي
  // A card on the left kept outside the section frame (the retail card): the frame stops before it with a thin
  // divider between them; sizes and positions stay exactly the same
  detached?: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const frame = useDetachedFrame(detached);

  return (
    // الصندوق نفسه (المقاس والـ padding) زي ما هو، والإطار المرسوم بقى طبقة ورا المحتوى
    // The box itself (size and padding) is unchanged; the drawn frame is a layer behind the content
    <div ref={frame.sectionRef} className="relative isolate border border-transparent rounded-2xl p-3 flex flex-col">
      <div
        className="absolute -z-10 rounded-2xl bg-card border border-cardBorder pointer-events-none"
        style={{
          top: -1,
          bottom: -1,
          right: -1,
          left: frame.left ?? -1,
          backgroundImage: `linear-gradient(to left, ${withAlpha(accent, 0.06)}, transparent 60%)`,
        }}
      />
      {frame.divider && (
        <div
          className="absolute w-px bg-gray-600/60 pointer-events-none"
          style={{ left: frame.divider.x, top: frame.divider.top, height: frame.divider.height }}
        />
      )}
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
        <CardsGrid columns={columns} widths={widths}>{children}</CardsGrid>
      )}
    </div>
  );
}

// سطر مجموعة في كارت القطاعي ("باكتات 120" / "شكاير 32") - one group line on the retail card
function RetailGroupLine({ label, value, accent, available }: { label: string; value: number; accent: string; available: boolean }) {
  const card = dashboardConfig.sizes.stockPage.retailCard;
  const { count } = useCountUp(value, 500);
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0 whitespace-nowrap">
      <span className="shrink-0" style={{ fontSize: `${card.groupLabelFontSize}px`, color: withAlpha(accent, 0.8) }}>
        {label}
      </span>
      <span
        className="font-numbers font-bold tabular-nums"
        style={{ fontSize: `${card.groupNumberFontSize}px`, lineHeight: NUMBER_LINE_HEIGHT, color: available ? accent : "#6B7280" }}
      >
        {available ? formatNumber(count) : "—"}
      </span>
    </div>
  );
}

// كارت "مخزن القطاعي": المخزن بيشيل أي صنف، فمفيش إجمالي واحد - سطرين "باكتات" و"شكاير" وتحتهم أكبر الأصناف
// عدد الأصناف بيتحسب من المكان الفاضي (لحد maxItems) فالكارت عمره ما بيطوّل الصف
// The "مخزن القطاعي" card: the warehouse holds any item, so no single total - "باكتات" and "شكاير" lines, then the
// largest items. The item count follows the free space (up to maxItems), so the card never makes the row taller
function RetailCard({
  retail,
  accent,
  textColor,
  cardRef,
  onOpen,
}: {
  retail: RetailStock | null;
  accent: string; // البرواز والتوهج - border and glow
  textColor: string; // الأرقام والكلام - numbers and labels
  cardRef?: RefObject<HTMLDivElement>;
  onOpen?: () => void;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const card = sizes.retailCard;
  const items = retail?.items ?? [];
  const [nameRef, nameFontSize] = useFitFontSize<HTMLHeadingElement>(sizes.nameFontSize, MIN_NAME_FONT_SIZE, "مخزن القطاعي");

  // كام سطر يدخل في المكان الفاضي - how many rows fit in the free space
  const rowHeight = Math.ceil(card.itemFontSize * 1.5);
  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number>(card.maxItems);
  useIsomorphicLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // pt-1 = 4px فوق السطور - 4px top padding above the rows
    const measure = () => setFit(Math.max(1, Math.floor((el.clientHeight - 4) / rowHeight)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rowHeight]);
  const cap = Math.min(card.maxItems, fit);
  // لو الأصناف أكتر من المكان، آخر سطر بيبقى "+N أصناف" - when there are more items, the last row is "+N أصناف"
  const shown = items.length <= cap ? items : items.slice(0, Math.max(cap - 1, 0));
  const more = items.length - shown.length;

  return (
    <div
      ref={cardRef}
      onClick={onOpen}
      className={`relative bg-background border-2 rounded-2xl p-2.5 min-w-0 grid gap-1.5 ${
        onOpen ? "cursor-pointer transition-colors hover:bg-white/[0.03]" : ""
      }`}
      style={{
        gridTemplateRows: "auto auto minmax(0,1fr)",
        // برواز بنفسجي وتوهج خفيف وخلفية مايلة للبنفسجي - violet border, soft glow, violet-tinted background
        borderColor: withAlpha(accent, 0.85),
        boxShadow: `0 0 14px 1px ${withAlpha(accent, 0.28)}`,
        backgroundImage: `linear-gradient(160deg, ${withAlpha(accent, 0.12)}, ${withAlpha(accent, 0.03)} 70%)`,
        paddingLeft: sizes.topCardPaddingX,
        paddingRight: sizes.topCardPaddingX,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* الإيموجي مخفي بس بيحجز نفس المقاس بالظبط، والأيقونة البنفسجي فوقه - the hidden emoji keeps the exact size; the violet icon sits on it */}
        <span className="relative text-3xl shrink-0" style={{ lineHeight: 2 }}>
          <span className="invisible">🏪</span>
          <Store className="absolute inset-0 m-auto w-[0.9em] h-[0.9em]" style={{ color: textColor }} strokeWidth={2.2} />
        </span>
        <h3
          ref={nameRef}
          className="font-bold text-white whitespace-nowrap min-w-0"
          style={{ fontSize: `${nameFontSize}px`, lineHeight: BOLD_LINE_HEIGHT }}
        >
          مخزن القطاعي
        </h3>
      </div>

      <div className="grid gap-0.5 min-w-0">
        <RetailGroupLine label="باكتات" value={retail?.packets ?? 0} accent={textColor} available={!!retail} />
        <RetailGroupLine label="شكاير" value={retail?.sacks ?? 0} accent={textColor} available={!!retail} />
      </div>

      <div
        ref={listRef}
        className="min-h-0 overflow-hidden border-t border-cardBorder pt-1 flex flex-col"
        style={{ fontSize: `${card.itemFontSize}px`, containerType: "inline-size", containerName: "retail-list" }}
      >
        {/* الكارت ضيق (1366): الوحدة بتستخبى عشان اسم الصنف يبان كامل - narrow card: hide the unit so the name shows in full */}
        <style>{`@container retail-list (max-width: ${card.hideUnitBelow}px) { .retail-unit { display: none; } }`}</style>
        {retail && items.length === 0 ? (
          <span className="text-gray-500 whitespace-nowrap" style={{ lineHeight: `${rowHeight}px` }}>
            مفيش رصيد قطاعي
          </span>
        ) : (
          <>
            {shown.map((item) => (
              <div key={item.itemCode} className="flex items-center justify-between gap-2 min-w-0 shrink-0" style={{ height: rowHeight }}>
                <span className="text-gray-300 truncate min-w-0">{toEnglishDigits(item.name)}</span>
                <span className="shrink-0 whitespace-nowrap">
                  <span
                    className={`font-numbers font-bold tabular-nums ${item.qty < 0 ? "text-statusRed" : ""}`}
                    style={item.qty < 0 ? undefined : { color: textColor }}
                  >
                    {formatNumber(item.qty)}
                  </span>
                  {item.unit && <span className="retail-unit text-gray-500"> {toEnglishDigits(item.unit)}</span>}
                </span>
              </div>
            ))}
            {more > 0 && (
              <span className="text-gray-500 whitespace-nowrap shrink-0" style={{ lineHeight: `${rowHeight}px` }}>
                +{formatNumber(more)} أصناف
              </span>
            )}
          </>
        )}
      </div>
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

// بيانات اللوحة من الكارت: الأنواع وحالة النقص (نفس قواعد الكارت) - panel target from a card: variants and low state
function panelTarget(
  group: StockGroup,
  name: string,
  unit: string,
  variants: StockVariant[],
  named: boolean,
  totalLow: boolean,
  extra: { image?: string; icon?: string } = {}
): Omit<StockPanelTarget, "variant"> {
  const variantLows = Object.fromEntries(variants.map((v) => [v.label, isLow(v)]));
  return {
    group,
    name,
    unit,
    variants: named ? variants.map((v) => v.label) : [],
    // الكارت كله ناقص زي شارة "محتاج نزوّد" - the whole card is low like its badge
    low: { total: totalLow || variants.some(isLow), variants: variantLows },
    ...extra,
  };
}

export default function StockSection({ data, className, onOpenItem }: StockSectionProps) {
  const sizes = dashboardConfig.sizes.stockPage;
  const totalSizes = dashboardConfig.sizes.page2;
  const colors = dashboardConfig.page2.colors;
  const rows = sizes.rowHeights;
  const top = sizes.topColumns;
  const rawRows = sizes.rawMaterialsRows;
  const { wood, packaging } = data.rawMaterials;
  const woodTotal = wood.types.reduce((sum, type) => sum + sumQuantities(woodVariants(type)), 0);
  const { count: woodTotalCount } = useCountUp(woodTotal, 500);
  // كارت مخزن القطاعي بيظهر لو فيه مخزن قطاعي في الكونفج - the retail card shows when retail warehouses are configured
  const hasRetailCard = dashboardConfig.erp.stock.retailWarehouses.length > 0;
  const retailCardRef = useRef<HTMLDivElement>(null);

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
              numberScale={sizes.packagedNumberBoost}
              tight
              onOpen={
                onOpenItem &&
                ((variant) =>
                  onOpenItem({
                    ...panelTarget("packaged", product.name, product.unit, product.variants, true,
                      isBelow(sumQuantities(product.variants), product.minimumThreshold), { image: product.image }),
                    variant,
                  }))
              }
            />
          ))}
        </SectionCard>

        <SectionCard
          title="الشكاير"
          icon={ShoppingBag}
          accent={colors.sacks}
          columns={data.sacks.length + (hasRetailCard ? 1 : 0)}
          widths={sizes.sackColumns}
          detached={hasRetailCard ? retailCardRef : undefined}
        >
          {data.sacks.map((sack, index) => (
            <VariantsCard
              key={sack.id}
              name={sack.name}
              unit={sack.unit}
              icon={sack.icon}
              variants={sack.variants}
              accent={colors.sacks}
              totalMinimum={sack.minimumThreshold}
              showRetail={dashboardConfig.erp.stock.showRetailOnCard}
              numberScale={hasRetailCard ? sizes.sackNumberBoost[index] ?? 1 : 1}
              tight={hasRetailCard}
              onOpen={
                onOpenItem &&
                ((variant) =>
                  onOpenItem({
                    ...panelTarget("sacks", sack.name, sack.unit, sack.variants, true,
                      isBelow(sumQuantities(sack.variants), sack.minimumThreshold)),
                    variant,
                  }))
              }
            />
          ))}
          {hasRetailCard && (
            <RetailCard
              retail={data.retail}
              accent={colors.retail}
              textColor={colors.retailText}
              cardRef={retailCardRef}
              onOpen={
                onOpenItem &&
                (() =>
                  onOpenItem({
                    group: "retail",
                    name: "مخزن القطاعي",
                    unit: "",
                    variant: null,
                    variants: [],
                    low: { total: false, variants: {} },
                  }))
              }
            />
          )}
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
              onOpen={
                onOpenItem &&
                ((variant) =>
                  onOpenItem({
                    ...panelTarget("wood", type.name, wood.unit, woodVariants(type), !!type.subTypes,
                      !!type.subTypes && isBelow(sumQuantities(woodVariants(type)), type.minimumThreshold ?? 0)),
                    // نوع الخشب العادي ملوش أنواع - a single wood type has no variants
                    variant: type.subTypes ? variant : null,
                  }))
              }
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
                onOpen={
                  onOpenItem &&
                  (() =>
                    onOpenItem({
                      ...panelTarget("packaging", item.name, item.unit, packagingVariants(item), false, false, { icon: item.icon }),
                      variant: null,
                    }))
                }
              />
            );
          })}
        </SubGroup>
      </SectionCard>
    </div>
  );
}
