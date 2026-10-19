"use client";

import { ReactNode, useState } from "react";
import { PackagingItem, Stock, StockVariant, WoodType } from "@/lib/types";
import { AlertTriangle, Box, Cylinder, Layers, LucideIcon, Package, ShoppingBag, TreePine, Trees } from "lucide-react";
import { useCountUp } from "@/lib/useCountUp";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// ارتفاع سطر العناوين والأسماء - خط Cairo محتاج سطر أطول عشان ميتقصش من فوق أو تحت
// Line height for titles and labels - Cairo needs a taller line so it isn't clipped at the top/bottom
const BOLD_LINE_HEIGHT = 1.75;

// ارتفاع سطر الأرقام - الأرقام بتستخدم font-numbers (نفس خط Cairo بس مقاساته الرأسية مظبوطة على 1.1)
// Line height for quantities - they use font-numbers (same Cairo font, vertical metrics tuned for 1.1)
const NUMBER_LINE_HEIGHT = 1.1;

// حجم سطر "الحد الأدنى" - "الحد الأدنى" line font size
const MINIMUM_LABEL_FONT_SIZE = 12;

// حجم خط بيكبر ويصغر مع عرض الكارت (cqi = 1% من عرض الكارت) - المتصفح بيحسبه لوحده فمفيش رقم يركب على التاني
// Font size that scales with the card width (cqi = 1% of the card width) - the browser sizes it, so numbers never overlap
function fluid({ min, scale, max }: { min: number; scale: number; max: number }) {
  return `clamp(${min}px, ${scale}cqi, ${max}px)`;
}

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

// أيقونة كل مادة تعبئة حسب الـ icon في الكونفج - packaging icon by its config "icon" value
const PACKAGING_ICONS: Record<string, LucideIcon> = {
  plastic: Layers, // بلاستيك
  roll: Cylinder, // رولات
  bag: ShoppingBag, // أكياس
};

// مادة التعبئة كنوع واحد من غير اسم (الاسم فوق في الكارت) - packaging item as one unnamed type
function packagingVariants(item: PackagingItem): StockVariant[] {
  return [{ label: "", quantity: item.quantity, minimumThreshold: item.minimumThreshold }];
}

// شريط التقدم وتحته "الحد الأدنى" (لو متحدد) - progress bar with "الحد الأدنى" under it (when set)
function ProgressBar({ variant }: { variant: StockVariant }) {
  const low = isLow(variant);
  const showMinimum = variant.minimumThreshold > 0 || dashboardConfig.page2.showZeroMinimum;
  const progressPercentage =
    variant.minimumThreshold > 0
      ? Math.min((variant.quantity / (variant.minimumThreshold * 2)) * 100, 100)
      : 100;

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
      {showMinimum && (
        <p className="text-gray-500 mt-1 whitespace-nowrap" style={{ fontSize: `${MINIMUM_LABEL_FONT_SIZE}px` }}>
          الحد الأدنى: {formatNumber(variant.minimumThreshold)}
        </p>
      )}
    </div>
  );
}

// صف نوع واحد: الاسم يمين والرقم شمال وبينهم خط منقط - one type row: label right, number left, dotted line between
function VariantRow({ variant, numberMax }: { variant: StockVariant; numberMax: number }) {
  const sizes = dashboardConfig.sizes.stockPage;
  const { count } = useCountUp(variant.quantity, 500);
  const low = isLow(variant);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="text-gray-400 whitespace-nowrap shrink-0"
        style={{ fontSize: `${sizes.rowLabelFontSize}px`, lineHeight: BOLD_LINE_HEIGHT }}
      >
        {toEnglishDigits(variant.label)}
      </span>
      <span className="flex-1 min-w-[6px] border-b border-dotted border-gray-700" />
      {low && <span className="text-statusRed font-bold text-xs whitespace-nowrap shrink-0">منخفض</span>}
      <span
        className={`font-numbers font-bold tabular-nums whitespace-nowrap shrink-0 ${low ? "text-statusRed" : "text-white"}`}
        style={{
          fontSize: fluid({ min: sizes.minNumberFontSize, scale: sizes.rowNumberScale, max: numberMax }),
          lineHeight: NUMBER_LINE_HEIGHT,
        }}
      >
        {formatNumber(count)}
      </span>
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
    <span className="shrink-0" style={{ fontSize: "24px", lineHeight: 1.8 }}>
      {icon}
    </span>
  );
}

// الكارت (container عشان الأرقام تكبر وتصغر مع عرضه) - the card (a size container, so numbers scale with its width)
// - كذا نوع (أو صف إجمالي): صف لكل نوع، وتحتهم الإجمالي - several types (or a total row): one row per type, then the total
// - نوع واحد من غير إجمالي: رقم كبير والوحدة جنبه وشريط - one type without a total: big number + unit + bar
function VariantsCard({
  name,
  unit,
  variants,
  image,
  icon,
  accent,
  rowNumberMax,
  showTotal = true,
}: {
  name: string;
  unit: string;
  variants: StockVariant[];
  image?: string;
  icon?: ReactNode;
  accent: string;
  rowNumberMax?: number;
  showTotal?: boolean;
}) {
  const sizes = dashboardConfig.sizes.stockPage;
  const totalSizes = dashboardConfig.sizes.page2;
  const single = variants.length === 1 && !showTotal;
  const anyLow = variants.some(isLow);
  const total = sumQuantities(variants);
  const { count: totalCount } = useCountUp(total, 500);
  const { count: singleCount } = useCountUp(variants[0]?.quantity ?? 0, 500);

  return (
    <div
      className={`bg-background border-2 rounded-2xl p-2.5 min-w-0 grid gap-1.5 ${anyLow ? "border-statusRed" : ""}`}
      style={{
        containerType: "inline-size",
        gridTemplateRows: showTotal ? "auto 1fr auto" : "auto 1fr",
        ...(anyLow ? {} : { borderColor: withAlpha(accent, 0.3) }),
      }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <CardIcon image={image} icon={icon} name={name} />
          <h3
            className="font-bold text-white whitespace-nowrap min-w-0"
            style={{ fontSize: fluid(sizes.nameFont), lineHeight: BOLD_LINE_HEIGHT }}
          >
            {toEnglishDigits(name)}
          </h3>
        </div>
        {anyLow && <AlertTriangle className="w-5 h-5 text-statusRed shrink-0" />}
      </div>

      {single ? (
        <div className="min-w-0 grid gap-1.5 content-center">
          <div
            className={`font-numbers font-bold tabular-nums whitespace-nowrap ${
              isLow(variants[0]) ? "text-statusRed" : "text-white"
            }`}
            style={{
              fontSize: fluid({ min: sizes.minNumberFontSize, scale: sizes.singleNumberScale, max: sizes.singleNumberFontSize }),
              lineHeight: NUMBER_LINE_HEIGHT,
            }}
          >
            {formatNumber(singleCount)}
            <span className="font-normal text-gray-400" style={{ fontSize: `${sizes.unitFontSize}px`, lineHeight: 1.6 }}>
              {" "}
              {unit}
            </span>
          </div>
          <ProgressBar variant={variants[0]} />
        </div>
      ) : (
        <div className="min-w-0 grid gap-1.5 content-center">
          {variants.map((variant, index) => (
            <VariantRow key={index} variant={variant} numberMax={rowNumberMax ?? sizes.rowNumberFontSize} />
          ))}
        </div>
      )}

      {showTotal && (
        <div className="flex items-center justify-between gap-2 border-t border-cardBorder pt-1.5 min-w-0">
          <span
            className="font-semibold text-gray-300 shrink-0 whitespace-nowrap"
            style={{ fontSize: `${totalSizes.totalLabelFontSize}px` }}
          >
            الإجمالي
          </span>
          <span
            className="font-numbers font-extrabold tabular-nums whitespace-nowrap shrink-0"
            style={{
              fontSize: fluid({ min: totalSizes.minTotalFontSize, scale: totalSizes.totalScale, max: totalSizes.totalFontSize }),
              lineHeight: NUMBER_LINE_HEIGHT,
              color: accent,
            }}
          >
            {formatNumber(totalCount)}
          </span>
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
          {/* الخشب العادي رقم واحد كبير، والبلدي صف لكل نوع وتحتهم الإجمالي - single types: one big number; بلدي: one row per sub-type + total */}
          {wood.types.map((type) => (
            <VariantsCard
              key={type.id}
              name={type.name}
              unit={wood.unit}
              icon={<Trees className="w-8 h-8 text-brandOrange" />}
              variants={woodVariants(type)}
              accent={colors.rawMaterials}
              showTotal={!!type.subTypes}
              rowNumberMax={type.subTypes ? sizes.subTypeNumberFontSize : undefined}
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
