"use client";

import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock, Factory, Flame, PowerOff, Scale, Wrench } from "lucide-react";
import KilnIllustration, { type KilnState } from "./KilnIllustration";
import { ProductionData, ProductionExit } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import {
  agoText,
  batchOfExit,
  formatKg,
  formatTons,
  KilnSummary,
  ProductionBatch,
  ProductionSummary,
  summarize,
  Tally,
  typeColor,
  useCompact,
  useMinutesSince,
} from "@/lib/production-stats";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";
import { sameExit } from "@/lib/kiln-alert";
import { useLiveScale } from "@/lib/useLiveScale";
import { progressText } from "@/lib/batches";

// صفحة الإنتاج والأفران: الأفران (يمين)، طرحات النهارده (الكارت الكبير في النص)، آخر وزنة والأرقام (شمال).
// الترولات بتتوزن وهي داخلة الفرن، والطرحة = 2 أو 3 ترولات. ملخص الشهر والإنتاج بالساعة في لوحة "📊 ملخص الشهر"
// The production page: kilns (right), today's batches (the big middle card), the last weighing and KPIs (left).
// Trolleys are weighed entering the kiln; a batch = 2 or 3 trolleys. Month + hourly live in the "📊 ملخص الشهر" panel

export type ProductionTarget = { kind: "kiln" | "type"; name: string };

const STATUS: Record<string, { label: string; text: string; border: string; dot: string; chip: string }> = {
  working: { label: "شغالة", text: "text-statusGreen", border: "border-statusGreen/60", dot: "bg-statusGreen", chip: "bg-statusGreen/15" },
  // صيانة: إطار كهرماني قوي، والشارة أصفر فاقع بكلام غامق - maintenance: a strong amber border, a bright yellow chip with dark text
  maintenance: { label: "صيانة", text: "text-[#1A1300]", border: "border-[#F5A623]", dot: "bg-[#1A1300]", chip: "bg-[#FFC400]" },
  stopped: { label: "متوقفة", text: "text-statusRed", border: "border-statusRed/50", dot: "bg-statusRed", chip: "bg-statusRed/15" },
};

const num = (text: string, className = "") => (
  <span dir="ltr" className={`font-numbers tabular-nums ${className}`}>
    {text}
  </span>
);

// مفتاح ثابت للترول: نفس الترول لما ييجي مباشر وبعدين من ERPNext ليه نفس المفتاح
// A stable key: a trolley seen live and later from ERPNext keeps the same key
const exitKey = (e: ProductionExit) => e.liveId ?? e.id;
// مفتاح الطرحة: batch_id، أو مفتاح أول ترول فيها - a batch key: its batch_id, or its first trolley's key
const batchKey = (b: ProductionBatch) => b.batchId || `auto:${exitKey(b.trolleys[0])}`;
// "طرحة فرن 4 (2 من 3)" - the batch a trolley belongs to
const batchLabel = (b: ProductionBatch) => `طرحة ${toEnglishDigits(b.kiln || "—")} (${toEnglishDigits(progressText(b))})`;

// "12/11" - a short date
export const shortDate = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day}/${month}`;
};

// أطنان مجموعة (والمتوزن بس) - a set's tons (weighed exits only)
const tons = (t: Tally) => formatTons(t.kg);

function Card({
  title,
  icon,
  extra,
  children,
  className = "",
  style,
}: {
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`bg-card border border-cardBorder rounded-2xl p-3 min-[1600px]:p-4 flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`} style={style}>
      <div className="flex items-center gap-2 mb-2 shrink-0">
        {icon}
        <h2 className="text-[16px] min-[1600px]:text-[20px] font-bold text-white whitespace-nowrap">{title}</h2>
        {extra && <div className="ms-auto flex items-center gap-2 min-w-0">{extra}</div>}
      </div>
      {children}
    </section>
  );
}

// خانة رقم في الصف اللي فوق - one KPI box
function Kpi({ label, children, sub, accent = false }: { label: string; children: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-2xl border px-3 flex flex-col items-center justify-center text-center ${
        accent ? "border-brandOrange/60 bg-brandOrange/10" : "border-cardBorder bg-card"
      }`}
    >
      <p className="text-gray-400 font-semibold whitespace-nowrap text-[14px] min-[1600px]:text-[17px]">{label}</p>
      <div className="leading-[1.15] whitespace-nowrap">{children}</div>
      {sub && <p className="text-gray-500 whitespace-nowrap text-[12px] min-[1600px]:text-[14px] truncate max-w-full">{sub}</p>}
    </div>
  );
}

// الأرقام تحت "آخر وزنة" في عمود الشمال: "إنتاج النهارده" بعرض العمود، وتحته 2×2 - the KPIs under "آخر وزنة":
// "إنتاج النهارده" full width, then a 2×2 grid
function KpiStack({ s, sizes }: { s: ProductionSummary; sizes: Sizes }) {
  const { compare } = s;
  const up = compare.pct !== null && compare.pct >= 0;
  const unweighed = s.today.count - s.today.weighed;
  return (
    <div className="flex-1 min-h-0 grid gap-3 min-[1600px]:gap-4" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1.25fr 1fr 1fr" }}>
      <div className="col-span-2 min-h-0 grid">
        <Kpi label="إنتاج النهارده" accent sub={unweighed > 0 ? `${unweighed} ترول بدون وزن` : undefined}>
          <span
            className="font-extrabold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent"
            style={{ fontSize: sizes.kpiTonsFontSize }}
          >
            {num(tons(s.today))}
          </span>
          <span className="text-gray-300 font-bold text-[18px] min-[1600px]:text-[24px]"> طن</span>
        </Kpi>
      </div>
      <Kpi label="عدد الطرحات" sub={<>النهارده · {num(formatNumber(s.today.count))} ترول</>}>
        <span className="font-extrabold text-white" style={{ fontSize: sizes.kpiFontSize }}>
          {num(formatNumber(s.today.batches))}
        </span>
      </Kpi>
      <Kpi label="متوسط وزن الطرحة" sub={s.today.weighedBatches > 0 ? `من ${s.today.weighedBatches} طرحة متوزنة` : "مفيش أوزان النهارده"}>
        {s.today.weighedBatches > 0 ? (
          <>
            <span className="font-extrabold text-white" style={{ fontSize: sizes.kpiFontSize }}>
              {num(formatTons(s.today.batchKg / s.today.weighedBatches))}
            </span>
            <span className="text-gray-400 font-bold text-[15px] min-[1600px]:text-[19px]"> طن</span>
          </>
        ) : (
          <span className="font-extrabold text-gray-600" style={{ fontSize: sizes.kpiFontSize }}>—</span>
        )}
      </Kpi>
      <Kpi
        label="مقارنة بإمبارح"
        sub={<>امبارح: {compare.by === "tons" ? `${formatTons(compare.yesterday)} طن` : `${formatNumber(compare.yesterday)} طرحة`}</>}
      >
        {compare.pct === null ? (
          <span className="font-extrabold text-gray-600" style={{ fontSize: sizes.kpiFontSize }}>—</span>
        ) : (
          <span className={`inline-flex items-center gap-1 font-extrabold ${up ? "text-statusGreen" : "text-statusRed"}`} style={{ fontSize: sizes.kpiFontSize }}>
            {up ? "▲" : "▼"}
            {num(`${Math.abs(Math.round(compare.pct))}%`)}
          </span>
        )}
      </Kpi>
      <Kpi label="إنتاج الشهر" sub={`${formatNumber(s.month.batches)} طرحة · ${formatNumber(s.month.count)} ترول`}>
        <span className="font-extrabold text-white" style={{ fontSize: sizes.kpiFontSize }}>
          {num(tons(s.month))}
        </span>
        <span className="text-gray-400 font-bold text-[15px] min-[1600px]:text-[19px]"> طن</span>
      </Kpi>
    </div>
  );
}

// مقاس بالبكسل من الكونفج (بيصغر بس لو العمود ضيق، من globals.css) - a px size from config (steps down only in a narrow column)
const fs = (px: number) => ({ "--fs": `${px}px` }) as CSSProperties;

// آخر وزنة: بتنور شوية لما طرحة جديدة توصل - the last weighing; glows briefly when a new exit arrives
// فوق: الميزان والعنوان، في النص: الوزن الكبير، تحت: الفرن · النوع · الساعة - top: icon + title, center: weight, bottom: kiln · type · time
function LastExitCard({
  data,
  last,
  batches,
  sizes,
  active,
}: {
  data: ProductionData;
  last: ProductionExit | null;
  batches: ProductionBatch[];
  sizes: LeftSizes;
  active: boolean;
}) {
  const minutes = useMinutesSince(last);
  // الطرحة اللي الترول ده فيها - the batch this trolley belongs to
  const inBatch = last ? batchOfExit(batches, last) : null;
  // الميزان دلوقتي من /api/scale/live (نفس شاشة الأوبريتر، مفيش طلب على الشبكة المحلية) - والصفحة ظاهرة بس
  // The scale right now from /api/scale/live (same as the operator screen, no LAN request) - only while on screen
  const scale = useLiveScale(active);
  const [glow, setGlow] = useState(false);
  const seen = useRef<string | null | undefined>(undefined);
  // نفس الطرحة لما تيجي من الإيجنت وبعدين من ERPNext مش بتنور مرتين - the same exit seen live then from ERPNext glows once
  const lastKey = last ? exitKey(last) : null;
  useEffect(() => {
    const id = lastKey;
    // أول مرة مش بتنور - no glow on the first render
    if (seen.current !== undefined && id && id !== seen.current) {
      setGlow(true);
      const timer = setTimeout(() => setGlow(false), dashboardConfig.production.glowSeconds * 1000);
      seen.current = id;
      return () => clearTimeout(timer);
    }
    seen.current = id;
  }, [lastKey]);

  const color = last ? typeColor(data, last.type) : "#6B7280";
  return (
    <div
      className={`shrink-0 rounded-2xl border bg-card px-4 py-3 flex flex-col min-w-0 overflow-hidden transition-[box-shadow,border-color] duration-700 ${
        glow ? "border-brandOrange shadow-[0_0_28px_6px_rgba(255,122,0,0.55)] animate-new-exit" : "border-cardBorder"
      }`}
      style={{ height: sizes.lastCardHeight }}
    >
      {/* فوق: الميزان والعنوان و"من X دقيقة" - top: icon, title, how long ago */}
      <div className="shrink-0 flex items-center gap-2 whitespace-nowrap min-w-0">
        <Scale className="text-brandOrange shrink-0" size={sizes.lastIconSize} />
        <span className="prod-fs text-gray-300 font-bold" style={fs(sizes.lastTitleFontSize)}>
          آخر وزنة
        </span>
        {glow && <span className="rounded-full bg-brandOrange text-black px-2 text-[14px] font-extrabold">جديدة</span>}
        {/* الميزان دلوقتي (بس لو متصل) - the scale right now (only when connected) */}
        {scale.online && scale.weightKg !== null && (
          <span
            className={`prod-fs shrink-0 rounded-full px-2 font-bold ${scale.stable ? "bg-statusGreen/15 text-statusGreen" : "bg-statusAmber/15 text-statusAmber"}`}
            style={fs(sizes.lastAgoFontSize)}
            title="الميزان دلوقتي"
          >
            الميزان {num(formatKg(scale.weightKg))} · {scale.stable ? "ثابت" : "بيتحرك"}
          </span>
        )}
        {last && (
          <span className="prod-fs ms-auto text-gray-300 font-semibold truncate" style={fs(sizes.lastAgoFontSize)}>
            {agoText(minutes)}
          </span>
        )}
      </div>
      {last ? (
        <>
          {/* الوزن الكبير في النص (وزن الترول)، وتحته الطرحة - the big weight in the center (the trolley), its batch under it */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center whitespace-nowrap">
            {last.kg !== null ? (
              <p className="leading-none">
                <span className="prod-fs font-extrabold text-white" style={fs(sizes.lastWeightFontSize)}>
                  {num(formatKg(last.kg))}
                </span>
                <span className="prod-fs text-gray-400 font-bold" style={fs(sizes.lastChipFontSize)}>
                  {" "}
                  كجم صافي
                </span>
              </p>
            ) : (
              <span className="prod-fs font-extrabold text-gray-500" style={fs(sizes.lastNoWeightFontSize)}>
                بدون وزن
              </span>
            )}
            {inBatch && (
              <p
                className={`prod-fs font-bold truncate max-w-full ${inBatch.batch.complete ? "text-gray-300" : "text-statusAmber"}`}
                style={fs(sizes.lastBatchFontSize)}
              >
                {last.trolley ? <>ترول {num(toEnglishDigits(last.trolley))} · </> : null}ضمن {batchLabel(inBatch.batch)}
              </p>
            )}
          </div>
          {/* الفرن · النوع · الساعة في سطر واحد - kiln · type · time in one row */}
          <div className="shrink-0 flex items-center justify-center gap-3 min-w-0 whitespace-nowrap font-bold">
            <span className="prod-fs rounded-lg bg-white/10 text-white px-2.5 leading-[1.5]" style={fs(sizes.lastChipFontSize)}>
              {last.kiln ? <>دخلت {toEnglishDigits(last.kiln)}</> : "—"}
            </span>
            <span className="prod-fs flex items-center gap-1.5 min-w-0" style={{ ...fs(sizes.lastChipFontSize), color }}>
              <span className="prod-dot rounded-full shrink-0" style={{ "--dot": `${sizes.exitDotSize}px`, backgroundColor: color } as CSSProperties} />
              <span className="truncate">{last.type || "غير محدد"}</span>
            </span>
            <span className="prod-fs text-gray-200 inline-flex items-center gap-1" style={fs(sizes.lastTimeFontSize)}>
              <Clock size={sizes.lastTimeFontSize * 0.85} />
              {num(last.time)}
              {last.date !== data.today && <span className="text-gray-500 font-semibold"> ({num(shortDate(last.date))})</span>}
            </span>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="prod-fs text-gray-500 font-bold" style={fs(sizes.lastChipFontSize)}>
            لسه مفيش طرحات
          </p>
        </div>
      )}
    </div>
  );
}

// كارت فرن: رسمة الفرن بحالته (شغالة نار ودخان / صيانة / متوقفة)، وتحتها أطنان النهارده وعدد الطرحات وساعة آخر طرحة
// A kiln tile: the kiln drawing in its state (working fire + smoke / maintenance / stopped), then today's exits, tons, last exit
function KilnTile({ kiln, today, sizes, onOpen }: { kiln: KilnSummary; today: string; sizes: Sizes; onOpen: () => void }) {
  const state: KilnState = kiln.status === "working" ? "working" : kiln.status === "maintenance" ? "maintenance" : "stopped";
  const st = STATUS[state];
  const active = kiln.today.count > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative min-h-0 min-w-0 rounded-xl border-2 ${st.border} bg-background/60 px-3 py-2 flex flex-col text-start hover:bg-white/5 overflow-hidden`}
    >
      {/* الحالة فوق الرسمة في الركن (عشان الرسمة تاخد الطول كله) - the status over the drawing's corner (so the drawing gets the full height) */}
      <span
        className={`absolute top-2 start-2.5 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 font-bold whitespace-nowrap leading-[1.7] ${st.text} ${st.chip}`}
        style={{ fontSize: sizes.kilnChipFontSize }}
      >
        {state === "stopped" ? <PowerOff size={sizes.kilnChipFontSize} /> : <span className={`w-2 h-2 rounded-full ${st.dot}`} />}
        {st.label}
      </span>
      {state === "maintenance" && (
        <Wrench className="kiln-wrench absolute top-2 end-2.5 z-10 text-[#FFC400]" size={sizes.kilnChipFontSize * 1.6} />
      )}
      {/* الرسمة - the drawing */}
      <div className={`flex-1 min-h-0 flex items-center justify-center pt-3 pb-1 ${state === "stopped" ? "opacity-50" : ""}`}>
        <KilnIllustration state={state} label={toEnglishDigits(kiln.name)} className="w-full h-full" />
      </div>
      {/* أطنان النهارده · الطرحات · ساعة آخر طرحة - today tons · batches · last batch time */}
      <p className="shrink-0 flex items-baseline gap-2 min-[1600px]:gap-3 whitespace-nowrap min-w-0 text-gray-400" style={{ fontSize: sizes.kilnStatFontSize }}>
        <span>
          <span className={`font-extrabold ${active ? "text-white" : "text-gray-600"}`} style={{ fontSize: sizes.kilnTonsFontSize }}>
            {num(tons(kiln.today))}
          </span>{" "}
          طن
        </span>
        <span className={active ? "text-gray-100 font-bold" : ""}>{num(formatNumber(kiln.today.batches))} طرحة</span>
        <span className="ms-auto truncate" title="آخر طرحة دخلت">
          {kiln.last ? (
            <>
              <Clock size={sizes.kilnStatFontSize * 0.85} className="inline align-[-2px]" /> {num(kiln.last.time)}
              {kiln.last.date !== today && <span className="hidden min-[1600px]:inline"> ({num(shortDate(kiln.last.date))})</span>}
            </>
          ) : (
            "—"
          )}
        </span>
      </p>
    </button>
  );
}

/// طرحات النهارده (الكارت الكبير في النص): سطر لكل طرحة، كبير ويتقري من بعيد
// - الراس: الساعة (كبيرة) · "فرن 4" · "غرفة 1" · النوع بنقطة لونه (الكلمة كاملة) · "3 ترول" · المجموع "1,715 كجم" على الشمال
// - تحته مربع لكل ترول "ترول 6 — 610 كجم" في صف واحد. الطرحة الناقصة عليها "2 من 3" كهرماني
// السطور بتملا الكارت (بين batchRowMin و batchRowMax) من غير scroll: لو أكتر، الأحدث وتحتهم "+N طرحة تانية"
// Today's batches (the big middle card): one big row per batch, readable from a distance. Header: time · kiln ·
// room · type (full word) · trolley count · total; under it one box per trolley in a single row. An incomplete batch
// shows an amber "2 من 3". Rows fill the card (batchRowMin..batchRowMax), never scroll: the newest that fit + "+N"
function BatchList({
  data,
  batches,
  sizes,
  alertExit,
}: {
  data: ProductionData;
  batches: ProductionBatch[];
  sizes: LeftSizes;
  alertExit?: ProductionExit | null;
}) {
  const gap = 10;
  // الطرحات الجديدة (بعد أول عرض) بتدخل بحركة ولمعة قصيرة - new batches (after the first render) slide in with a short flash
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const keys = batches.map(batchKey).join("|");
  useEffect(() => {
    const now = batches.map(batchKey);
    if (seen.current === null) {
      seen.current = new Set(now);
      return;
    }
    const added = now.filter((k) => !seen.current!.has(k));
    now.forEach((k) => seen.current!.add(k));
    if (added.length === 0) return;
    setFresh((f) => new Set([...Array.from(f), ...added]));
    const timer = setTimeout(
      () => setFresh((f) => new Set(Array.from(f).filter((k) => !added.includes(k)))),
      dashboardConfig.production.glowSeconds * 1000
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const moreHeight = Math.round(sizes.batchMoreFontSize * 2);
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = batches.length;
  let shown = n;
  let row = sizes.batchRowMin;
  if (height > 0 && n > 0) {
    if (n * sizes.batchRowMin + (n - 1) * gap <= height) {
      row = Math.min(sizes.batchRowMax, Math.floor((height - (n - 1) * gap) / n));
    } else {
      // اللي ياخد مكانه بأقل ارتفاع، وسطر "+N" تحت - as many as fit at the minimum height, plus the "+N" line
      shown = Math.max(0, Math.floor((height - moreHeight) / (sizes.batchRowMin + gap)));
      row = shown > 0 ? Math.min(sizes.batchRowMax, Math.floor((height - moreHeight - shown * gap) / shown)) : sizes.batchRowMin;
    }
  }
  const hidden = n - shown;
  const px = (v: number) => ({ fontSize: v });
  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ gap }}>
      {n === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-cardBorder">
          <p className="text-gray-500 font-semibold" style={px(sizes.batchTypeFontSize)}>
            مفيش طرحات دخلت الأفران النهارده
          </p>
        </div>
      )}
      {height > 0 &&
        batches.slice(0, shown).map((batch, index) => {
          const color = typeColor(data, batch.type);
          const key = batchKey(batch);
          const alerting = !!alertExit && batch.trolleys.some((t) => sameExit(t, alertExit));
          return (
            <div
              key={key}
              className={`shrink-0 flex flex-col justify-evenly px-4 rounded-2xl border-2 min-w-0 ${
                index === 0 ? "border-brandOrange bg-brandOrange/10 shadow-[0_0_18px_2px_rgba(255,122,0,0.28)]" : "border-cardBorder bg-background/60"
              } ${fresh.has(key) ? "animate-exit-in" : ""} ${alerting ? "exit-alert-row" : ""}`}
              style={{ height: row }}
            >
              {/* الراس - the header */}
              <div className="flex items-center gap-3 min-w-0 whitespace-nowrap font-bold leading-none">
                <span className="text-white font-extrabold" style={px(sizes.batchTimeFontSize)}>
                  {num(batch.time)}
                </span>
                <span className="shrink-0 rounded-lg bg-white/10 text-white px-2.5 py-1" style={px(sizes.batchKilnFontSize)}>
                  {toEnglishDigits(batch.kiln || "—")}
                </span>
                {batch.room && (
                  <span className="shrink-0 text-gray-300" style={px(sizes.batchRoomFontSize)}>
                    غرفة {num(toEnglishDigits(batch.room))}
                  </span>
                )}
                <span className="shrink-0 flex items-center gap-2" style={{ ...px(sizes.batchTypeFontSize), color }}>
                  <span className="rounded-full shrink-0" style={{ width: sizes.batchDotSize, height: sizes.batchDotSize, backgroundColor: color }} />
                  {batch.type || "غير محدد"}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 ${batch.complete ? "bg-white/10 text-gray-100" : "bg-statusAmber/20 text-statusAmber"}`}
                  style={px(sizes.batchCountFontSize)}
                  title={batch.complete ? "عدد الترولات" : "الطرحة لسه ناقصة"}
                >
                  {batch.complete ? (
                    <>
                      {num(String(batch.count))} ترول
                    </>
                  ) : (
                    num(progressText(batch))
                  )}
                </span>
                <span className="ms-auto shrink-0 font-extrabold text-white" style={px(sizes.batchTotalFontSize)}>
                  {batch.weighed > 0 ? (
                    <>
                      {num(formatKg(batch.kg))} <span className="text-gray-400 font-bold text-[0.55em]">كجم</span>
                    </>
                  ) : (
                    <span className="text-gray-500 text-[0.6em]">بدون وزن</span>
                  )}
                </span>
              </div>
              {/* ترول ترول في صف واحد - the trolleys, one row */}
              <div className="flex items-stretch gap-2 min-w-0">
                {batch.trolleys.map((t, i) => (
                  <span
                    key={exitKey(t)}
                    className={`flex-1 min-w-0 rounded-xl border px-2 py-1 text-center whitespace-nowrap overflow-hidden text-ellipsis font-bold ${
                      alertExit && sameExit(t, alertExit) ? "border-brandOrange bg-brandOrange/25 text-white" : "border-white/10 bg-white/[0.06] text-gray-200"
                    }`}
                    style={px(sizes.batchTrolleyFontSize)}
                  >
                    ترول {num(toEnglishDigits(t.trolley || String(i + 1)))} — <span className="text-white">{num(t.kg !== null ? formatKg(t.kg) : "—")}</span>{" "}
                    <span className="text-gray-400 font-semibold text-[0.8em]">كجم</span>
                  </span>
                ))}
                {/* أماكن الترولات اللي لسه مجاتش - slots for the trolleys still to come */}
                {batch.size !== null &&
                  Array.from({ length: Math.max(0, batch.size - batch.count) }, (_, i) => (
                    <span
                      key={`slot-${i}`}
                      className="flex-1 min-w-0 rounded-xl border border-dashed border-statusAmber/50 px-2 py-1 text-center whitespace-nowrap text-statusAmber/80 font-bold"
                      style={px(sizes.batchTrolleyFontSize)}
                    >
                      ترول {num(String(batch.count + i + 1))} …
                    </span>
                  ))}
              </div>
            </div>
          );
        })}
      {height > 0 && hidden > 0 && (
        <div className="shrink-0 flex items-center justify-center text-gray-300 font-bold" style={{ ...px(sizes.batchMoreFontSize), height: moreHeight }}>
          {num(`+${formatNumber(hidden)}`)} طرحة تانية
        </div>
      )}
    </div>
  );
}

// كارت "🔥 ترول جديد" الكبير وقت التنبيه (بيشتغل لكل ترول): وزن الترول كبير، وتحته تقدم الطرحة بتاعته
// "طرحة فرن 3 — ترول 2 من 3" بالشرايح والمجموع، و"✓ الطرحة كملت" لما تكمل (المقاسات ثابتة من production.alertCard)
// The big alert card (fires per trolley): the trolley's weight, then its batch progress "طرحة فرن 3 — ترول 2 من 3"
// with chips and the total, or "✓ الطرحة كملت" once complete (fixed sizes from production.alertCard)
function NewExitCard({
  data,
  exit,
  batches,
  pending,
  onDismiss,
}: {
  data: ProductionData;
  exit: ProductionExit;
  batches: ProductionBatch[];
  pending: number;
  onDismiss: () => void;
}) {
  const c = dashboardConfig.production.alertCard;
  const color = typeColor(data, exit.type);
  const inBatch = batchOfExit(batches, exit);
  const batch = inBatch?.batch ?? null;
  const field = (label: string, value: ReactNode, style?: CSSProperties) => (
    <div className="min-w-0 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 flex flex-col items-center gap-1">
      <span className="text-gray-400 font-semibold whitespace-nowrap" style={{ fontSize: c.labelFontSize }}>
        {label}
      </span>
      <span className="font-extrabold text-white truncate max-w-full leading-tight" style={{ fontSize: c.chipFontSize, ...style }}>
        {value}
      </span>
    </div>
  );
  return (
    <div
      key={exit.liveId ?? exit.id}
      role="alert"
      onClick={onDismiss}
      title="اضغط للإغلاق"
      className="exit-alert-card pointer-events-auto cursor-pointer rounded-3xl border-2 border-brandOrange bg-card/95 px-8 py-6 flex flex-col items-center gap-4"
      style={{ width: c.width, maxWidth: "100%" }}
    >
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span className="font-extrabold text-brandOrange leading-none" style={{ fontSize: c.titleFontSize }}>
          🔥 طرحة دخلت الفرن
        </span>
        <span className="text-gray-300 font-bold inline-flex items-center gap-1.5" style={{ fontSize: c.labelFontSize * 1.4 }}>
          <Clock size={c.labelFontSize * 1.3} />
          {num(exit.time)}
        </span>
      </div>
      <p className="leading-none whitespace-nowrap">
        {exit.kg !== null ? (
          <>
            <span className="font-extrabold text-white" style={{ fontSize: c.weightFontSize }}>
              {num(formatKg(exit.kg))}
            </span>
            <span className="text-gray-400 font-bold" style={{ fontSize: c.unitFontSize }}>
              {" "}
              كجم صافي
            </span>
          </>
        ) : (
          <span className="font-extrabold text-gray-500" style={{ fontSize: c.unitFontSize * 1.6 }}>
            بدون وزن
          </span>
        )}
      </p>
      <div className="grid grid-cols-4 gap-3 w-full">
        {field("الفرن", toEnglishDigits(exit.kiln || "—"))}
        {field("الغرفة", toEnglishDigits(exit.room || "—"))}
        {field("النوع", exit.type || "غير محدد", { color })}
        {field("الترول", toEnglishDigits(exit.trolley || "—"))}
      </div>
      {/* تقدم الطرحة - the batch progress */}
      {batch && inBatch && (
        <div
          className={`w-full rounded-2xl border-2 px-4 py-3 flex flex-col items-center gap-2 ${
            batch.complete ? "border-statusGreen/60 bg-statusGreen/10" : "border-statusAmber/60 bg-statusAmber/10"
          }`}
        >
          <p className={`font-extrabold whitespace-nowrap ${batch.complete ? "text-statusGreen" : "text-statusAmber"}`} style={{ fontSize: c.batchFontSize }}>
            {batch.complete && batch.size !== null ? (
              <>✓ الطرحة كملت — {num(formatKg(batch.kg))} كجم</>
            ) : (
              <>
                طرحة {toEnglishDigits(batch.kiln || "—")} — ترول {num(String(inBatch.index))}
                {batch.size !== null && <> من {num(String(batch.size))}</>}
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2" style={{ fontSize: c.batchFontSize * 0.8 }}>
            {batch.trolleys.map((t, i) => (
              <span
                key={t.liveId ?? t.id}
                className={`rounded-lg px-2.5 font-bold whitespace-nowrap ${sameExit(t, exit) ? "bg-brandOrange text-black" : "bg-white/10 text-gray-100"}`}
              >
                ترول {num(toEnglishDigits(t.trolley || String(i + 1)))}: {num(t.kg !== null ? formatKg(t.kg) : "—")}
              </span>
            ))}
            {!(batch.complete && batch.size !== null) && batch.count > 1 && (
              <span className="text-gray-200 font-extrabold whitespace-nowrap">
                ← المجموع {num(formatKg(batch.kg))} كجم
              </span>
            )}
          </div>
        </div>
      )}
      {pending > 0 && (
        <span className="text-gray-300 font-bold" style={{ fontSize: c.labelFontSize }}>
          {num(`+${formatNumber(pending)}`)} ترول دخل كمان
        </span>
      )}
    </div>
  );
}

type Sizes = typeof dashboardConfig.sizes.productionPage.compact;
type LeftSizes = typeof dashboardConfig.sizes.production.compact;

export default function ProductionPage({
  data,
  lan = false,
  onOpen,
  alertExit = null,
  alertPending = 0,
  onDismissAlert,
  active = true,
}: {
  data: ProductionData | null;
  active?: boolean; // الصفحة دي اللي على الشاشة (الميزان بيتسأل بس ساعتها) - this page is on screen (scale polled only then)
  lan?: boolean; // الإيجنت على الشبكة بيرد (الطرحات على طول) - the LAN agent answers (live exits)
  onOpen: (target: ProductionTarget) => void;
  alertExit?: ProductionExit | null; // ترول جديد وقت التنبيه - the new trolley during the alert
  alertPending?: number;
  onDismissAlert?: () => void;
}) {
  const compact = useCompact();
  const page = dashboardConfig.sizes.productionPage;
  const sizes: Sizes = compact ? page.compact : page;
  const left: LeftSizes = compact ? dashboardConfig.sizes.production.compact : dashboardConfig.sizes.production;

  if (!data) {
    return (
      <div className="h-full bg-card border border-cardBorder rounded-2xl flex items-center justify-center">
        <OfflineBadge />
      </div>
    );
  }

  const s = summarize(data);
  const gap = compact ? 12 : 16;

  return (
    <div
      className="grid h-full"
      style={{
        gap,
        // يمين: الأفران، النص: طرحات النهارده (الكارت الكبير بالطول كله)، شمال: آخر وزنة وتحتها الأرقام
        // ملخص الشهر والإنتاج بالساعة في لوحة "📊 ملخص الشهر" (زرار في الهيدر)
        // Right: the kilns, middle: today's batches (the big full-height card), left: the last weighing with the KPIs
        // under it. The month summary and the hourly chart live in the "📊 ملخص الشهر" panel (a header button)
        gridTemplateColumns: "minmax(0,1.18fr) minmax(0,1.42fr) minmax(0,0.8fr)",
        gridTemplateRows: "minmax(0,1fr)",
      }}
    >
      <Card
        title="الأفران"
        icon={<Flame className="text-brandOrange" size={compact ? 18 : 22} />}
        style={{ gridColumn: 1, gridRow: 1 }}
        extra={
          <>
            {data.offline && <OfflineBadge />}
            <span className="text-gray-400 text-[13px] min-[1600px]:text-[16px] whitespace-nowrap">
              شغالة <b className="text-statusGreen">{num(String(s.working))}</b> / {num(String(s.kilns.length))}
            </span>
          </>
        }
      >
        {/* 6 أفران: عمودين × 3 صفوف - 6 kilns: 2 columns × 3 rows */}
        <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-3 gap-2 min-[1600px]:gap-3">
          {s.kilns.slice(0, 6).map((k) => (
            <KilnTile key={k.name} kiln={k} today={data.today} sizes={sizes} onOpen={() => onOpen({ kind: "kiln", name: k.name })} />
          ))}
        </div>
      </Card>

      <Card
        title="طرحات النهارده"
        icon={<Factory className="text-brandOrange" size={compact ? 20 : 26} />}
        style={{ gridColumn: 2, gridRow: 1 }}
        extra={
          <>
            {lan && (
              <span className="rounded-full bg-statusGreen/15 text-statusGreen px-2 font-bold whitespace-nowrap text-[12px] min-[1600px]:text-[14px] leading-[1.7]" title="الطرحات بتوصل على طول من الإيجنت">
                📡 مباشر
              </span>
            )}
            <span className="text-gray-300 font-bold whitespace-nowrap text-[15px] min-[1600px]:text-[19px]">
              {num(formatNumber(s.today.batches))} طرحة · {num(formatNumber(s.today.count))} ترول
            </span>
          </>
        }
      >
        <BatchList data={data} batches={s.todayBatches} sizes={left} alertExit={alertExit} />
      </Card>

      {/* شمال: "آخر وزنة" صغيرة فوق، والأرقام تحتها - left: the small "آخر وزنة" on top, the KPIs under it */}
      <div className="prod-left min-h-0 min-w-0 flex flex-col" style={{ gridColumn: 3, gridRow: 1, gap }}>
        <LastExitCard data={data} last={s.last} batches={s.batches} sizes={left} active={active} />
        <KpiStack s={s} sizes={sizes} />
      </div>

      {/* التنبيه: الكارت الكبير فوق الأفران والنص (القايمة الشمال باينة وسطرها منور) - the alert card over the kilns and middle */}
      {alertExit && (
        <div className="relative z-20 min-w-0 min-h-0 flex items-center justify-center pointer-events-none" style={{ gridColumn: "1 / span 2", gridRow: 1 }}>
          <NewExitCard data={data} exit={alertExit} batches={s.batches} pending={alertPending} onDismiss={() => onDismissAlert?.()} />
        </div>
      )}
    </div>
  );
}
