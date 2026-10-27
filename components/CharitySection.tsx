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
function Money({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span dir="ltr" className="font-numbers tabular-nums">
        {formatNumber(value)}
      </span>{" "}
      <span className="text-[0.55em] font-semibold opacity-80">ج.م</span>
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
function FundCard({ fund }: { fund: CharityFund }) {
  const sizes = dashboardConfig.sizes.charityPage;
  const page3 = dashboardConfig.sizes.page3;
  const negative = fund.balance < 0;

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

      {/* مربع الرصيد: صغير في النص بإطار أخضر متدرج - the balance: compact, centered, soft green gradient border */}
      <div className="shrink-0 rounded-xl p-px bg-gradient-to-b from-emerald-400/50 via-emerald-500/20 to-emerald-500/5">
        <div className="rounded-[11px] bg-card bg-gradient-to-b from-emerald-500/[0.08] to-transparent py-2.5 flex flex-col items-center">
          <p className="text-emerald-200/60 font-semibold leading-tight" style={{ fontSize: page3.balanceLabelFontSize }}>
            الرصيد
          </p>
          {/* أخضر زي "إجمالي أرصدة الصدقات" ولو بالسالب أحمر - emerald like the top total card, red if negative */}
          <p
            className={`whitespace-nowrap font-numbers tabular-nums ${negative ? "text-statusRed" : "text-emerald-400"}`}
            style={{
              fontSize: page3.balanceNumberSize,
              fontWeight: 800,
              lineHeight: 1.1,
              textShadow: negative ? "0 0 18px rgba(239,68,68,0.3)" : "0 0 18px rgba(52,211,153,0.35)",
            }}
          >
            <span dir="ltr">{formatNumber(fund.balance)}</span>{" "}
            <span className="font-semibold text-emerald-200/50" style={{ fontSize: page3.balanceCurrencySize, textShadow: "none" }}>
              ج.م
            </span>
          </p>
        </div>
      </div>

      {/* آخر عمليات صرف/إيداع (من غير الرصيد الافتتاحي) بتاخد باقي الكارت - the last صرف / إيداع fill the rest */}
      <div className="flex-1 min-h-0 flex flex-col gap-1">
        <p className="text-gray-400 font-semibold text-sm shrink-0">آخر العمليات</p>
        {fund.recent.length === 0 ? (
          <div
            className="flex-1 min-h-0 flex items-center justify-center rounded-lg border border-dashed border-cardBorder text-gray-500"
            style={{ fontSize: sizes.recentFontSize }}
          >
            لا توجد عمليات
          </div>
        ) : (
          <div className="min-h-0 flex flex-col gap-1 overflow-hidden">
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
