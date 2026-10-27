"use client";

import { ArrowUpRight, CalendarDays, HandHeart, Vault, Wallet, type LucideIcon } from "lucide-react";
import { Charity, CharityFund, CharityOperation } from "@/lib/types";
import { DATE_LOCALE, formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface CharitySectionProps {
  data: Charity | null; // null = ERPNext مش بيرد ومفيش نتيجة قديمة - ERPNext down with no last good result
}

// "2026-10-27" -> "الثلاثاء 27/10" (التاريخ من غير ساعة فبنقراه UTC) - date only, so read it as UTC
function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date || "—";
  const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(DATE_LOCALE, {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${day}/${month}`;
}

// مبلغ بالجنيه - an amount in EGP
// currencyScale = حجم "ج.م" بالنسبة للرقم - "ج.م" size relative to the number
function Money({ value, className = "", currencyScale = 0.55 }: { value: number; className?: string; currencyScale?: number }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span dir="ltr" className="font-numbers tabular-nums">
        {formatNumber(value)}
      </span>{" "}
      <span className="font-semibold opacity-80" style={{ fontSize: `${currencyScale}em` }}>
        ج.م
      </span>
    </span>
  );
}

function OfflineBadge() {
  return (
    <div className="flex items-center gap-1.5 bg-statusRed/10 px-3 py-1.5 rounded-xl border border-statusRed/50 shrink-0">
      <div className="w-2.5 h-2.5 rounded-full bg-statusRed" />
      <span className="text-statusRed text-sm font-semibold">غير متصل</span>
    </div>
  );
}

// مربع في الشريط اللي فوق - a box in the top summary strip
function SummaryBox({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: string }) {
  const sizes = dashboardConfig.sizes.charityPage;
  return (
    <div className="flex-1 min-w-0 bg-card border border-cardBorder rounded-2xl px-5 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${tone}`} style={{ backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)" }}>
        <Icon size={26} />
      </div>
      <p className="text-gray-300 font-semibold text-lg whitespace-nowrap">{label}</p>
      <p className={`ms-auto font-bold leading-none ${value < 0 ? "text-statusRed" : tone}`} style={{ fontSize: sizes.summaryNumberFontSize }}>
        <Money value={value} />
      </p>
    </div>
  );
}

// نوع العملية: صرف أحمر، إيداع أخضر، رصيد افتتاحي أزرق رمادي - type colors: red / green / neutral slate blue
const OPERATION_STYLES: Record<CharityOperation["type"], { label: string; badge: string; text: string }> = {
  out: { label: "صرف", badge: "bg-statusRed/15 text-statusRed", text: "text-statusRed" },
  in: { label: "إيداع", badge: "bg-statusGreen/15 text-statusGreen", text: "text-statusGreen" },
  opening: { label: "رصيد افتتاحي", badge: "bg-sky-400/10 text-sky-300", text: "text-slate-300" },
};

// سطر في "آخر العمليات": التاريخ · النوع · المبلغ · صُرفت لـ - date · type · amount · beneficiary
function OperationRow({ op }: { op: CharityOperation }) {
  const sizes = dashboardConfig.sizes.charityPage;
  const style = OPERATION_STYLES[op.type];
  return (
    <div
      className="shrink-0 grid items-center gap-3 px-3 rounded-lg bg-background/60 border border-cardBorder"
      style={{ height: sizes.recentRowHeight, fontSize: sizes.recentFontSize, gridTemplateColumns: "auto auto auto minmax(0,1fr)" }}
    >
      <span className="text-gray-300 whitespace-nowrap">{formatDay(op.date)}</span>
      <span className={`px-2 rounded-md font-semibold leading-6 whitespace-nowrap ${style.badge}`}>{style.label}</span>
      <Money value={op.amount} className={`font-bold ${style.text}`} />
      <span className="text-gray-400 truncate">{toEnglishDigits(op.beneficiary) || "—"}</span>
    </div>
  );
}

// كارت الصندوق (خزنة) - one fund's "safe" card
// ارتفاع السطر لكلمة "الرصيد" وسطر "الرصيد الافتتاحي" - line height of the label and the opening line
const BALANCE_LINE_HEIGHT = 1.3;

function FundCard({ fund }: { fund: CharityFund }) {
  const sizes = dashboardConfig.sizes.charityPage;
  const big = dashboardConfig.sizes.page3;

  return (
    <div className="bg-card border border-emerald-500/30 rounded-2xl p-4 h-full min-h-0 flex flex-col gap-3 overflow-hidden shadow-[inset_0_1px_0_rgba(16,185,129,0.15)]">
      {/* اسم الصندوق وصرف الشهر - fund name and this month's spending */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
          <Vault size={sizes.fundIconSize} />
        </div>
        <h3 className="font-extrabold text-white truncate" style={{ fontSize: sizes.fundNameFontSize }}>
          {toEnglishDigits(fund.name)}
        </h3>
        <div
          className="ms-auto flex items-center gap-2 bg-background border border-cardBorder rounded-xl px-3 py-1 shrink-0"
          style={{ fontSize: sizes.monthOutFontSize }}
        >
          <CalendarDays size={sizes.monthOutFontSize} className="text-gray-400" />
          <span className="text-gray-400">صرف الشهر</span>
          <Money value={fund.monthOut} className={`font-bold ${fund.monthOut > 0 ? "text-statusRed" : "text-gray-500"}`} />
        </div>
      </div>

      {/* الرصيد بعرض الكارت كله - the balance, full card width */}
      {/* مربع الرصيد بياخد الطول الفاضل وبيطول على قد الرقم لو محتاج - takes the free height, grows to fit the number */}
      <div className="flex-1 shrink-0 py-2 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/30 flex flex-col items-center justify-center">
        <p
          className="text-emerald-300/90 font-semibold"
          style={{ fontSize: big.balanceLabelFontSize, lineHeight: BALANCE_LINE_HEIGHT }}
        >
          الرصيد
        </p>
        <p
          className={`whitespace-nowrap ${fund.balance < 0 ? "text-statusRed" : "text-white"}`}
          style={{ fontSize: big.balanceNumberSize, fontWeight: 800, lineHeight: 1.1 }}
        >
          <Money value={fund.balance} currencyScale={big.balanceCurrencySize / big.balanceNumberSize} />
        </p>
        {fund.opening && (
          <p
            className="text-slate-400 whitespace-nowrap"
            style={{ fontSize: big.openingFontSize, lineHeight: BALANCE_LINE_HEIGHT }}
          >
            الرصيد الافتتاحي: <Money value={fund.opening.amount} className="text-slate-200 font-semibold" />{" "}
            <span className="text-slate-500">({formatDay(fund.opening.date)})</span>
          </p>
        )}
      </div>

      {/* آخر 3 عمليات صرف/إيداع (من غير الرصيد الافتتاحي) - the last 3 صرف / إيداع (no opening balance) */}
      <div className="shrink-0 flex flex-col gap-1">
        <p className="text-gray-400 font-semibold text-sm">آخر العمليات</p>
        {fund.recent.length === 0 ? (
          <div
            className="flex items-center justify-center rounded-lg border border-dashed border-cardBorder text-gray-500"
            style={{ height: sizes.recentRowHeight * 3 + 8, fontSize: sizes.recentFontSize }}
          >
            لا توجد عمليات
          </div>
        ) : (
          <div className="flex flex-col gap-1" style={{ minHeight: sizes.recentRowHeight * 3 + 8 }}>
            {fund.recent.map((op) => (
              <OperationRow key={op.id} op={op} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CharitySection({ data }: CharitySectionProps) {
  const sizes = dashboardConfig.sizes.charityPage;

  if (!data) {
    return (
      <div className="h-full bg-card border border-cardBorder rounded-2xl flex flex-col items-center justify-center gap-4">
        <HandHeart size={56} className="text-emerald-400/60" />
        <OfflineBadge />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* الشريط اللي فوق - the summary strip */}
      <div className="shrink-0 flex gap-4 items-stretch" style={{ height: sizes.summaryHeight }}>
        <SummaryBox label="إجمالي أرصدة الصدقات" value={data.totalBalance} icon={Wallet} tone="text-emerald-400" />
        <SummaryBox label="إجمالي صرف اليوم" value={data.todayOut} icon={ArrowUpRight} tone="text-statusRed" />
        <SummaryBox label="إجمالي صرف الشهر" value={data.monthOut} icon={CalendarDays} tone="text-statusAmber" />
        {data.offline && (
          <div className="flex items-center">
            <OfflineBadge />
          </div>
        )}
      </div>

      {/* 4 صناديق 2×2 - the 4 funds in a 2x2 grid */}
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-4">
        {data.funds.map((fund) => (
          <FundCard key={fund.name} fund={fund} />
        ))}
      </div>
    </div>
  );
}
