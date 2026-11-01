"use client";

import { CalendarClock, Receipt, Star, Store } from "lucide-react";
import { DistributorSales, Distributors } from "@/lib/types";
import { formatDayName, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";
import { daysAgoText, monthName, Num, ProductChips, SummaryStrip, useCompactRows } from "./SalesCommon";

type Sizes = Omit<typeof dashboardConfig.sizes.distributorsPage, "compact">;

// مبلغ بالجنيه - an amount in EGP
function Money({ value, className = "", style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`whitespace-nowrap ${className}`} style={style}>
      <Num value={value} /> <span className="text-[0.6em] font-semibold opacity-80">ج.م</span>
    </span>
  );
}

// آخر طلبية: التاريخ + من كام يوم (برتقاني لو قديمة)، وتحتها الباكت والمبلغ - last order, orange when late
function LastOrder({ order, fontSize, lateDays }: { order: DistributorSales["lastOrder"]; fontSize: number; lateDays: number }) {
  if (!order) {
    return (
      <p className="text-gray-500 leading-[1.6]" style={{ fontSize }}>
        آخر طلبية: —
      </p>
    );
  }
  const late = order.daysAgo > lateDays;
  return (
    <div
      className={`rounded-xl border px-3 py-1 leading-[1.6] ${late ? "border-statusAmber/70 bg-statusAmber/10" : "border-cardBorder bg-background/70"}`}
      style={{ fontSize }}
    >
      <p className="flex items-center gap-1.5 whitespace-nowrap">
        <CalendarClock size={fontSize} className={`shrink-0 ${late ? "text-statusAmber" : "text-gray-400"}`} />
        <span className="text-gray-400 font-semibold">آخر طلبية</span>
        <span className="text-gray-200">{formatDayName(order.date)}</span>
      </p>
      <p className="flex items-center gap-2 whitespace-nowrap">
        <span>
          <Num value={order.packets} className="font-bold text-white" /> <span className="text-gray-400">باكت</span>
        </span>
        <span className="text-gray-600">·</span>
        <Money value={order.amount} className="font-bold text-gray-200" />
        <span className={`ms-auto font-bold ${late ? "text-statusAmber" : "text-sky-300"}`}>
          {late && "⚠️ "}
          {daysAgoText(order.daysAgo)}
        </span>
      </p>
    </div>
  );
}

// كارت موزع (featured = الكارت الكبير) - one distributor's card (featured = the big one)
function DistributorCard({ d, offline, sizes }: { d: DistributorSales; offline: boolean; sizes: Sizes }) {
  const big = d.featured;
  const empty = d.invoiceCount === 0 && d.monthPackets === 0 && d.monthAmount === 0;
  const info = big ? sizes.infoFontSize + 3 : sizes.infoFontSize;

  return (
    <div
      className={`bg-card border rounded-2xl p-4 h-full min-h-0 flex flex-col overflow-hidden ${
        big
          ? "border-brandYellow/50 shadow-[0_0_24px_rgba(255,193,7,0.18)] bg-gradient-to-b from-brandYellow/[0.06] to-transparent"
          : "border-cardBorder"
      }`}
      style={{ gap: big ? sizes.cardGap * 1.5 : sizes.cardGap }}
    >
      <div className="shrink-0 flex items-center gap-3 min-w-0">
        <div className={`shrink-0 p-1.5 rounded-xl ${big ? "bg-brandYellow/15 text-brandYellow" : "bg-sky-400/10 text-sky-300"}`}>
          <Store size={big ? 30 : 22} />
        </div>
        <h3
          className="font-extrabold text-white truncate leading-[1.75]"
          style={{ fontSize: big ? sizes.featuredNameFontSize : sizes.nameFontSize }}
        >
          {toEnglishDigits(d.name)}
        </h3>
        {big && (
          <span className="shrink-0 flex items-center gap-1 rounded-full border border-brandYellow/60 bg-brandYellow/15 px-3 text-brandYellow font-bold leading-[1.75]">
            <Star size={16} />
            أكبر موزع
          </span>
        )}
        {offline && (
          <div className="ms-auto">
            <OfflineBadge />
          </div>
        )}
      </div>

      {!d.linked ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-statusAmber/50 text-center px-3">
          <p className="text-statusAmber font-bold leading-[1.75]" style={{ fontSize: sizes.infoFontSize + 3 }}>
            مش مربوط بعميل في ERPNext
          </p>
          <p className="text-gray-500" style={{ fontSize: sizes.labelFontSize }}>
            اكتب الـ Customer ID في sales.distributors في الكونفج
          </p>
        </div>
      ) : empty ? (
        // لسه مفيش سحب الشهر ده - nothing taken yet this month
        <div className="flex-1 min-h-0 flex flex-col justify-center" style={{ gap: sizes.cardGap }}>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-cardBorder py-2">
            <p className="text-gray-300 font-bold leading-[1.75]" style={{ fontSize: big ? sizes.featuredNameFontSize * 0.8 : sizes.nameFontSize * 0.85 }}>
              لسه مفيش سحب الشهر ده
            </p>
            <p className="text-gray-500" style={{ fontSize: info }}>
              الشهر اللي فات: <Num value={d.lastMonthPackets} className="text-gray-300 font-bold" /> باكت
            </p>
          </div>
          <LastOrder order={d.lastOrder} fontSize={info} lateDays={sizes.lateDays} />
        </div>
      ) : (
        <>
          {/* سحب الشهر: الكبير الرقم في النص والمبلغ تحته، الصغير المبلغ جنب الرقم
              this month: featured = centered with the amount below; small = amount next to the number */}
          {big ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center">
              <p className="text-gray-400 font-semibold leading-[1.5]" style={{ fontSize: sizes.labelFontSize + 4 }}>
                سحب الشهر
              </p>
              <p className="whitespace-nowrap" style={{ lineHeight: 1.1 }}>
                <Num
                  value={d.monthPackets}
                  className="font-extrabold text-brandYellow"
                  style={{ fontSize: sizes.featuredPacketsFontSize, textShadow: "0 0 22px rgba(255,193,7,0.35)" }}
                />{" "}
                <span className="text-gray-400 font-semibold" style={{ fontSize: 24 }}>
                  باكت
                </span>
              </p>
              <Money value={d.monthAmount} className="font-bold text-statusGreen leading-[1.5]" style={{ fontSize: sizes.featuredAmountFontSize }} />
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col justify-center">
              <p className="text-gray-400 font-semibold leading-[1.5]" style={{ fontSize: sizes.labelFontSize }}>
                سحب الشهر
              </p>
              <div className="flex items-baseline gap-3 whitespace-nowrap" style={{ lineHeight: 1.1 }}>
                <span>
                  <Num value={d.monthPackets} className="font-extrabold text-white" style={{ fontSize: sizes.packetsFontSize }} />{" "}
                  <span className="text-gray-400 font-semibold" style={{ fontSize: sizes.labelFontSize + 2 }}>
                    باكت
                  </span>
                </span>
                <Money value={d.monthAmount} className="ms-auto font-bold text-statusGreen" style={{ fontSize: sizes.amountFontSize }} />
              </div>
            </div>
          )}

          <div className="shrink-0">
            <ProductChips
              products={d.products}
              fontSize={big ? sizes.featuredChipFontSize : sizes.chipFontSize}
              accent={big ? "text-brandYellow" : "text-sky-300"}
              center={big}
            />
          </div>

          <div className={`shrink-0 flex ${big ? "flex-col" : "items-stretch"}`} style={{ gap: sizes.cardGap }}>
            <div className="shrink-0 rounded-xl border border-cardBorder bg-background/70 px-3 py-1 flex flex-col justify-center" style={{ fontSize: info }}>
              <p className="flex items-center gap-1.5 text-gray-400 font-semibold whitespace-nowrap leading-[1.6]">
                <Receipt size={info} />
                عدد الطلبيات
              </p>
              <Num value={d.invoiceCount} className="font-extrabold text-white" style={{ fontSize: big ? 32 : info + 8, lineHeight: 1.2 }} />
            </div>
            <div className="flex-1 min-w-0">
              <LastOrder order={d.lastOrder} fontSize={info} lateDays={sizes.lateDays} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DistributorsSection({ data }: { data: Distributors | null }) {
  const { compact, ...normal } = dashboardConfig.sizes.distributorsPage;
  const { ref, sizes } = useCompactRows<Sizes>(normal, compact, normal.compactBelowCardHeight);

  if (!data) {
    return (
      <div className="h-full bg-card border border-cardBorder rounded-2xl flex flex-col items-center justify-center gap-4">
        <Store size={56} className="text-sky-400/60" />
        <OfflineBadge />
      </div>
    );
  }

  const featured = data.list.find((d) => d.featured);
  const others = data.list.filter((d) => d !== featured);
  const totalAmount = data.list.reduce((sum, d) => sum + d.monthAmount, 0);

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <SummaryStrip height={sizes.summaryHeight}>
        <div className="p-2 rounded-xl bg-sky-400/10 text-sky-300">
          <Store size={26} />
        </div>
        <p className="text-gray-300 font-semibold text-lg whitespace-nowrap">إجمالي سحب الموزعين — شهر {monthName(data.month)}</p>
        <p className="whitespace-nowrap" style={{ lineHeight: 1.1 }}>
          <Num value={data.totalPackets} className="font-extrabold text-white" style={{ fontSize: sizes.summaryNumberFontSize }} />
          <span className="text-gray-400 text-lg font-semibold"> باكت</span>
        </p>
        <Money value={totalAmount} className="font-bold text-statusGreen" style={{ fontSize: sizes.summaryNumberFontSize * 0.75 }} />
        {data.offline && (
          <div className="ms-auto">
            <OfflineBadge />
          </div>
        )}
      </SummaryStrip>

      {/* الكبير على اليمين بطول الصفحة، والباقي 2×2 جنبه - featured on the right full height, the rest 2×2 */}
      <div
        ref={ref}
        className="flex-1 min-h-0 grid gap-4"
        style={{
          gridTemplateColumns: `${featured ? `minmax(0,${sizes.featuredWidth}fr) ` : ""}minmax(0,1fr) minmax(0,1fr)`,
          gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)",
        }}
      >
        {featured && (
          <div className="row-span-2 min-h-0">
            <DistributorCard d={featured} offline={data.offline} sizes={sizes} />
          </div>
        )}
        {others.map((d) => (
          <div key={d.name} className="min-h-0">
            <DistributorCard d={d} offline={data.offline} sizes={sizes} />
          </div>
        ))}
      </div>
    </div>
  );
}
