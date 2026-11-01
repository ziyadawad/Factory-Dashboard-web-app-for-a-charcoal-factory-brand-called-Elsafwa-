"use client";

import { ArrowDownLeft, ArrowUpRight, Clock, Wallet } from "lucide-react";
import { WalletCard, Wallets } from "@/lib/types";
import { formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";
import { Num, SummaryStrip, useCompactRows } from "./SalesCommon";

type Sizes = Omit<typeof dashboardConfig.sizes.wallets, "compact">;

// الرقم بيصغر بالنسبة لو أطول من 10 حروف عشان مايخرجش برّه الكارت - longer numbers shrink to stay inside the card
const BASE_LENGTH = 10;
const fit = (maxPx: number, scale: number, text: string) =>
  `min(${maxPx}px, ${(scale * BASE_LENGTH) / Math.max(BASE_LENGTH, text.length)}cqi)`;

// رسمة محفظة فيها فلوس (أخضر) - a wallet with banknotes (green money tones)
function CashWalletArt({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect x="10" y="8" width="40" height="22" rx="3" fill="#15803D" transform="rotate(-10 30 19)" />
      <rect x="14" y="12" width="40" height="22" rx="3" fill="#22C55E" transform="rotate(-4 34 23)" />
      <circle cx="34" cy="22" r="5" fill="#BBF7D0" opacity="0.9" transform="rotate(-4 34 23)" />
      <rect x="6" y="24" width="52" height="34" rx="7" fill="#14532D" />
      <rect x="6" y="24" width="52" height="34" rx="7" fill="none" stroke="#4ADE80" strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M40 34h18v14H40a7 7 0 0 1 0-14z" fill="#166534" stroke="#4ADE80" strokeOpacity="0.7" strokeWidth="1.5" />
      <circle cx="42" cy="41" r="3" fill="#FACC15" />
    </svg>
  );
}

// رسمة ماكينة دفع وكارت (من غير لوجو حقيقي) - a payment terminal with a card (no real logo)
function TerminalArt({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect x="22" y="3" width="30" height="20" rx="3" fill="#38BDF8" transform="rotate(12 37 13)" />
      <rect x="23" y="8" width="28" height="4" fill="#0C4A6E" transform="rotate(12 37 13)" />
      <rect x="12" y="14" width="36" height="46" rx="7" fill="#1E293B" stroke="#FBBF24" strokeOpacity="0.8" strokeWidth="1.5" />
      <rect x="17" y="19" width="26" height="14" rx="2.5" fill="#FBBF24" />
      <path d="M21 27l4-4 4 3 5-5" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`${row}-${col}`} x={18 + col * 9} y={38 + row * 6.5} width="6" height="4" rx="1.2" fill={row === 2 && col === 2 ? "#22C55E" : "#475569"} />
        ))
      )}
    </svg>
  );
}

// سطر وارد/منصرف اليوم - one "today in / out" row
function FlowRow({ label, value, kind, sizes }: { label: string; value: number; kind: "in" | "out"; sizes: Sizes }) {
  const isIn = kind === "in";
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  const text = formatNumber(value);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-1 min-w-0 ${
        isIn ? "border-statusGreen/40 bg-statusGreen/10" : "border-statusRed/40 bg-statusRed/10"
      }`}
    >
      <Icon size={sizes.flowLabelFontSize + 2} className={`shrink-0 ${isIn ? "text-statusGreen" : "text-statusRed"}`} />
      <span className="text-gray-300 font-semibold whitespace-nowrap leading-[1.75]" style={{ fontSize: sizes.flowLabelFontSize }}>
        {label}
      </span>
      <span className="ms-auto whitespace-nowrap" style={{ lineHeight: 1.3 }}>
        <span
          dir="ltr"
          className={`font-numbers tabular-nums font-extrabold ${isIn ? "text-statusGreen" : "text-statusRed"}`}
          style={{ fontSize: fit(sizes.flowMaxSize, sizes.flowScale, text) }}
        >
          {text}
        </span>{" "}
        <span className="text-gray-400 font-semibold" style={{ fontSize: sizes.flowLabelFontSize - 2 }}>
          ج.م
        </span>
      </span>
    </div>
  );
}

// كارت محفظة - one wallet card (container-type على الكارت نفسه عشان cqi = عرضه) - cqi = this card's width
function WalletCardView({ card, sizes }: { card: WalletCard; sizes: Sizes }) {
  const fawry = card.kind === "fawry";
  const n = card.numbers;
  const balanceText = n ? formatNumber(n.balance) : "";
  const negative = !!n && n.balance < 0;

  return (
    <div
      className={`bg-card border rounded-2xl p-4 h-full min-h-0 min-w-0 flex flex-col overflow-hidden ${
        fawry ? "border-amber-400/30" : "border-statusGreen/25"
      }`}
      style={{ containerType: "inline-size", gap: sizes.cardGap }}
    >
      {/* الاسم والرسمة - name and picture */}
      <div className="shrink-0 flex items-center gap-3 min-w-0">
        {fawry ? <TerminalArt size={sizes.iconSize} /> : <CashWalletArt size={sizes.iconSize} />}
        <h3
          className="font-extrabold text-white truncate leading-[1.75]"
          style={{ fontSize: `min(${sizes.nameMaxSize}px, ${sizes.nameScale}cqi)` }}
        >
          {toEnglishDigits(card.name)}
        </h3>
        {card.offline && (
          <div className="ms-auto">
            <OfflineBadge />
          </div>
        )}
      </div>

      {!card.linked ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-statusAmber/50 text-center px-3">
          <p className="text-statusAmber font-bold leading-[1.75]" style={{ fontSize: sizes.flowLabelFontSize + 2 }}>
            مش مربوط بحساب في ERPNext
          </p>
          <p className="text-gray-500" style={{ fontSize: sizes.flowLabelFontSize - 3 }}>
            اكتب رقم الحساب في wallets.accounts في الكونفج
          </p>
        </div>
      ) : !n ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <OfflineBadge />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-evenly" style={{ gap: sizes.cardGap }}>
          {/* الرصيد - balance */}
          <div className="min-w-0">
            <p className="text-gray-400 font-semibold leading-[1.5]" style={{ fontSize: sizes.balanceLabelFontSize }}>
              الرصيد
            </p>
            <p className="whitespace-nowrap" style={{ lineHeight: 1.15 }}>
              <span
                dir="ltr"
                className={`font-numbers tabular-nums font-extrabold ${negative ? "text-statusRed" : "text-white"}`}
                style={{
                  fontSize: fit(sizes.balanceMaxSize, sizes.balanceScale, balanceText),
                  textShadow: negative ? "0 0 18px rgba(239,68,68,0.35)" : "0 0 18px rgba(34,197,94,0.25)",
                }}
              >
                {balanceText}
              </span>{" "}
              <span className="text-gray-400 font-semibold" style={{ fontSize: sizes.balanceLabelFontSize + 2 }}>
                ج.م
              </span>
            </p>
          </div>

          {/* وارد اليوم فوق ومنصرف اليوم تحته - today's in above today's out */}
          <div className="flex flex-col gap-1.5">
            <FlowRow label="وارد اليوم" value={n.incomingToday} kind="in" sizes={sizes} />
            <FlowRow label="منصرف اليوم" value={n.outgoingToday} kind="out" sizes={sizes} />
          </div>

          {/* آخر حركة - last movement */}
          <p
            className="flex items-center gap-1.5 whitespace-nowrap text-gray-400 leading-[1.6] min-w-0 overflow-hidden"
            style={{ fontSize: `min(${sizes.lastMoveMaxSize}px, ${sizes.lastMoveScale}cqi)` }}
          >
            <Clock className="shrink-0" style={{ width: "1em", height: "1em" }} />
            <span className="font-semibold">آخر حركة:</span>
            {n.lastMove ? (
              <>
                <span className="text-gray-200">{formatDayName(n.lastMove.date)}</span>
                <span className="text-gray-600">·</span>
                <span className={`font-bold ${n.lastMove.direction === "in" ? "text-statusGreen" : "text-statusRed"}`}>
                  {n.lastMove.direction === "in" ? "وارد" : "منصرف"} <Num value={n.lastMove.amount} /> ج.م
                </span>
              </>
            ) : (
              <span>—</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default function WalletsSection({ data }: { data: Wallets | null }) {
  const { compact, ...normal } = dashboardConfig.sizes.wallets;
  const { ref, sizes } = useCompactRows<Sizes>(normal, compact, normal.compactBelowCardHeight);

  if (!data) {
    return (
      <div className="h-full bg-card border border-cardBorder rounded-2xl flex flex-col items-center justify-center gap-4">
        <Wallet size={56} className="text-statusGreen/60" />
        <OfflineBadge />
      </div>
    );
  }

  const linked = data.list.filter((card) => card.linked);
  const withNumbers = linked.flatMap((card) => (card.numbers ? [card.numbers] : []));
  const total = withNumbers.reduce((sum, n) => sum + n.balance, 0);
  const totalIn = withNumbers.reduce((sum, n) => sum + n.incomingToday, 0);
  const totalOut = withNumbers.reduce((sum, n) => sum + n.outgoingToday, 0);
  const offline = linked.some((card) => card.offline);

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <SummaryStrip height={sizes.summaryHeight}>
        <div className="p-2 rounded-xl bg-statusGreen/15 text-statusGreen">
          <Wallet size={28} />
        </div>
        <p className="text-gray-300 font-semibold text-xl whitespace-nowrap">إجمالي الخزن والمحافظ</p>
        <p className="whitespace-nowrap" style={{ lineHeight: 1.1 }}>
          <Num
            value={Math.round(total * 100) / 100}
            className={`font-extrabold ${total < 0 ? "text-statusRed" : "text-statusGreen"}`}
            style={{ fontSize: sizes.summaryNumberFontSize }}
          />
          <span className="text-gray-400 text-lg font-semibold"> ج.م</span>
        </p>
        {linked.length < data.list.length && (
          <span className="text-gray-500 text-sm whitespace-nowrap">
            ({formatNumber(linked.length)} من {formatNumber(data.list.length)} حسابات مربوطة)
          </span>
        )}
        <div className="ms-auto flex items-center gap-5 whitespace-nowrap" style={{ fontSize: sizes.summaryFlowFontSize }}>
          <span className="flex items-center gap-1.5">
            <ArrowDownLeft size={sizes.summaryFlowFontSize} className="text-statusGreen" />
            <span className="text-gray-400 text-lg font-semibold">وارد اليوم</span>
            <Num value={Math.round(totalIn * 100) / 100} className="font-bold text-statusGreen" />
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowUpRight size={sizes.summaryFlowFontSize} className="text-statusRed" />
            <span className="text-gray-400 text-lg font-semibold">منصرف اليوم</span>
            <Num value={Math.round(totalOut * 100) / 100} className="font-bold text-statusRed" />
          </span>
          {offline && <OfflineBadge />}
        </div>
      </SummaryStrip>

      {/* 6 كروت 3×2 - six equal cards */}
      <div ref={ref} className="flex-1 min-h-0 grid grid-cols-3 grid-rows-2 gap-4">
        {data.list.map((card) => (
          <WalletCardView key={card.name} card={card} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}
