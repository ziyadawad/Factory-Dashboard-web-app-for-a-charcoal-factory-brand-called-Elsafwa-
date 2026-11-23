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
import TrolleyIllustration from "./TrolleyIllustration";
import ScaleScene from "./ScaleScene";
import { GREEN_CHIP, TypeBadge } from "./TypeBadge";
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

// الأرقام تحت "آخر وزنة" في عمود الشمال: "إنتاج النهارده" كبير، وتحته صف واحد من 3 كروت صغيرة
// (عدد الطرحات، متوسط وزن الطرحة، إنتاج الشهر) - the KPIs under "آخر وزنة": a big "إنتاج النهارده", then one row of 3
function KpiStack({ s, sizes }: { s: ProductionSummary; sizes: Sizes }) {
  const unweighed = s.today.count - s.today.weighed;
  const small = (label: string, value: ReactNode, sub: ReactNode) => (
    <div className="min-w-0 rounded-2xl border border-cardBorder bg-card px-2 py-2 flex flex-col items-center justify-center text-center gap-0.5">
      <p className="text-gray-400 font-semibold leading-tight text-[13px] min-[1600px]:text-[16px]">{label}</p>
      <div className="leading-[1.1] whitespace-nowrap">{value}</div>
      <p className="text-gray-500 leading-tight truncate max-w-full text-[11px] min-[1600px]:text-[13px]">{sub}</p>
    </div>
  );
  const big = (text: string) => (
    <span className="font-extrabold text-white" style={{ fontSize: sizes.kpiFontSize }}>
      {num(text)}
    </span>
  );
  const unit = <span className="text-gray-400 font-bold text-[13px] min-[1600px]:text-[17px]"> طن</span>;
  return (
    <>
      <div className="flex-1 min-h-0 grid">
        <Kpi label="إنتاج النهارده" accent sub={unweighed > 0 ? `${unweighed} ترول بدون وزن` : undefined}>
          <span
            className="font-extrabold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent"
            style={{ fontSize: sizes.kpiTonsFontSize }}
          >
            {num(tons(s.today))}
          </span>
          <span className="text-gray-300 font-bold text-[22px] min-[1600px]:text-[30px]"> طن</span>
        </Kpi>
      </div>
      <div className="shrink-0 grid grid-cols-3 gap-2 min-[1600px]:gap-3" style={{ height: sizes.kpiSmallHeight }}>
        {small("عدد الطرحات", big(formatNumber(s.today.batches)), `${formatNumber(s.today.count)} ترول`)}
        {small(
          "متوسط الطرحة",
          s.today.weighedBatches > 0 ? (
            <>
              {big(formatTons(s.today.batchKg / s.today.weighedBatches))}
              {unit}
            </>
          ) : (
            <span className="font-extrabold text-gray-600" style={{ fontSize: sizes.kpiFontSize }}>—</span>
          ),
          "النهارده"
        )}
        {small(
          "إنتاج الشهر",
          <>
            {big(tons(s.month))}
            {unit}
          </>,
          `${formatNumber(s.month.batches)} طرحة`
        )}
      </div>
    </>
  );
}

// مقاس بالبكسل من الكونفج (بيصغر بس لو العمود ضيق، من globals.css) - a px size from config (steps down only in a narrow column)
const fs = (px: number) => ({ "--fs": `${px}px` }) as CSSProperties;
// خط بيصغر مع عرض الكارت (كلاس cq-fs + cq-box على الكارت): base = العرض اللي المقاس ده معمول عليه
// A font that shrinks with its card (cq-fs class + cq-box on the card): base = the width this size is made for
const cqf = (px: number, base: number) => ({ "--px": `${px}px`, "--cq": `${((px * 100) / base).toFixed(3)}cqi` }) as CSSProperties;

// "الطرحة التالتة": ترتيب الطرحة في يومها بالوقت (production.batchOrdinals) - a batch's order in its day, by time
function batchOrdinal(batch: ProductionBatch, batches: ProductionBatch[]): string {
  const sameDay = batches.filter((b) => b.date === batch.date); // الأحدث الأول - newest first
  const i = sameDay.length - 1 - sameDay.indexOf(batch);
  const words = dashboardConfig.production.batchOrdinals;
  return `الطرحة ${words[i] ?? String(i + 1)}`;
}

// آخر وزنة (ترول): مشهد الميزان الحي فوق (ScaleScene: الترول بينزل على البسكول والشاشة بتعد للوزن، والكارت بينبض 5 مرات
// مع كل وزنة جديدة ومرة أول ما الصفحة تفتح)، وتحته: الوزن كبير، وسطرين شرايح: [ترول 24] [فرن 4] [غرفة 1] ثم النوع بأيقونته و"الطرحة التالتة —
// ترول 3 من 3"، وبعدين الساعة و"من 1 ساعة و34 دقيقة". بتنور شوية لما ترول جديد يوصل
// The last weighing (a trolley): the big weight, two lines of chips (trolley, kiln, room / type with its icon and the
// batch), then the time and how long ago. Glows briefly when a new trolley arrives
function LastExitCard({
  data,
  last,
  batches,
  sizes,
}: {
  data: ProductionData;
  last: ProductionExit | null;
  batches: ProductionBatch[];
  sizes: LeftSizes;
}) {
  const minutes = useMinutesSince(last);
  const inBatch = last ? batchOfExit(batches, last) : null;
  const [glow, setGlow] = useState(false);
  const seen = useRef<string | null | undefined>(undefined);
  // نفس الترول لما ييجي من الإيجنت وبعدين من ERPNext مش بينور مرتين - the same trolley seen live then from ERPNext glows once
  const lastKey = last ? exitKey(last) : null;
  useEffect(() => {
    const id = lastKey;
    if (seen.current !== undefined && id && id !== seen.current) {
      setGlow(true);
      const timer = setTimeout(() => setGlow(false), dashboardConfig.production.glowSeconds * 1000);
      seen.current = id;
      return () => clearTimeout(timer);
    }
    seen.current = id;
  }, [lastKey]);

  const chip = "prod-fs shrink-0 px-2.5 py-0.5 leading-[1.4]";
  return (
    // key = الترول: وزنة جديدة = الكارت بيتبني من الأول فالحركة والنبض بيتعادوا - a new trolley remounts it, replaying the animation
    <div
      key={lastKey ?? "none"}
      className={`scale-card-pulse flex-[2.6] min-h-0 rounded-2xl border bg-card px-4 py-3 flex flex-col min-w-0 overflow-hidden select-none caret-transparent ${
        glow ? "border-brandOrange" : "border-cardBorder"
      }`}
    >
      <div className="shrink-0 flex items-center gap-2 whitespace-nowrap min-w-0">
        <Scale className="text-brandOrange shrink-0" size={sizes.lastIconSize} />
        <span className="prod-fs text-white font-extrabold" style={fs(sizes.lastTitleFontSize)}>
          آخر وزنة
        </span>
        {glow && <span className="rounded-full bg-brandOrange text-black px-2 text-[14px] font-extrabold">جديدة</span>}
      </div>
      {/* مشهد الميزان - the scale scene */}
      <ScaleScene
        playKey={lastKey}
        weightKg={last?.kg ?? null}
        trolley={toEnglishDigits(last?.trolley ?? "")}
        className="flex-1 min-h-0 w-full my-1"
      />
      {last ? (
        <div className="shrink-0 flex flex-col items-center text-center gap-2">
          {/* الوزن الكبير - the big weight */}
          {last.kg !== null ? (
            <p className="leading-none whitespace-nowrap">
              <span className="prod-fs font-extrabold text-white" style={fs(sizes.lastWeightFontSize)}>
                {num(formatKg(last.kg))}
              </span>
              <span className="prod-fs text-gray-400 font-bold" style={fs(sizes.lastWeightFontSize * 0.4)}>
                {" "}
                كجم
              </span>
            </p>
          ) : (
            <span className="prod-fs font-extrabold text-gray-500" style={fs(sizes.lastNoWeightFontSize)}>
              بدون وزن
            </span>
          )}
          {/* سطر 1: الترول · الفرن · الغرفة - line 1: trolley · kiln · room */}
          <div className="flex items-center justify-center gap-2 flex-wrap max-w-full">
            {last.trolley && (
              <span className={`${chip} rounded-lg border border-white/15 bg-white/10 text-white font-bold`} style={fs(sizes.lastLineFontSize)}>
                ترول {num(toEnglishDigits(last.trolley))}
              </span>
            )}
            {last.kiln && (
              <span className={`${chip} ${GREEN_CHIP}`} style={fs(sizes.lastLineFontSize)}>
                {toEnglishDigits(last.kiln)}
              </span>
            )}
            {last.room && (
              <span className={`${chip} ${GREEN_CHIP}`} style={fs(sizes.lastLineFontSize)}>
                غرفة {num(toEnglishDigits(last.room))}
              </span>
            )}
          </div>
          {/* سطر 2: النوع بأيقونته · الطرحة - line 2: the type with its icon · the batch */}
          <div className="flex items-center justify-center gap-x-3 gap-y-1 flex-wrap max-w-full">
            <TypeBadge label={last.type} iconSize={Math.round(sizes.lastLineFontSize * 1.1)} className="prod-fs font-extrabold" style={fs(sizes.lastLineFontSize)} />
            {inBatch && (
              <span
                className={`prod-fs font-extrabold whitespace-nowrap ${inBatch.batch.complete ? "text-brandOrange" : "text-statusAmber"}`}
                style={fs(sizes.lastLineFontSize)}
              >
                {batchOrdinal(inBatch.batch, batches)} — ترول {num(String(inBatch.index))}
                {inBatch.batch.size !== null && <> من {num(String(inBatch.batch.size))}</>}
              </span>
            )}
          </div>
          {/* الساعة ومن قد ايه - the time and how long ago */}
          <p className="prod-fs font-bold whitespace-nowrap text-gray-300 inline-flex items-center gap-1.5" style={fs(sizes.lastLineFontSize * 0.9)}>
            <Clock size={sizes.lastLineFontSize * 0.8} />
            {num(last.time)}
            {last.date !== data.today && <span className="text-gray-500"> ({num(shortDate(last.date))})</span>}
            <span className="text-gray-400 font-semibold"> — {agoText(minutes)}</span>
          </p>
        </div>
      ) : (
        <div className="shrink-0 flex items-center justify-center">
          <p className="prod-fs text-gray-500 font-bold" style={fs(sizes.lastLineFontSize)}>
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
      className={`kiln-tile relative min-h-0 min-w-0 rounded-xl border-2 ${st.border} bg-background/60 px-3 py-2 flex flex-col text-start hover:bg-white/5 overflow-hidden`}
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
      {/* الخط بيصغر مع عرض الكارت، والساعة عمرها ما تتقص (التاريخ جنبها بيظهر بس لو فيه مكان)
          Fonts shrink with the tile width; the time is never cut (the date next to it shows only when it fits) */}
      <p
        className="cq-fs shrink-0 flex items-baseline gap-2 min-[1600px]:gap-3 whitespace-nowrap min-w-0 text-gray-400"
        style={cqf(sizes.kilnStatFontSize, sizes.kilnRowWidth)}
      >
        <span className="shrink-0">
          <span className={`cq-fs font-extrabold ${active ? "text-white" : "text-gray-600"}`} style={cqf(sizes.kilnTonsFontSize, sizes.kilnRowWidth)}>
            {num(tons(kiln.today))}
          </span>{" "}
          طن
        </span>
        <span className={`shrink-0 ${active ? "text-gray-100 font-bold" : ""}`}>{num(formatNumber(kiln.today.batches))} طرحة</span>
        <span className="ms-auto shrink-0" title="آخر طرحة دخلت">
          {kiln.last ? (
            <>
              <Clock size={sizes.kilnStatFontSize * 0.85} className="inline align-[-2px]" /> {num(kiln.last.time)}
              {kiln.last.date !== today && <span className="kiln-date"> ({num(shortDate(kiln.last.date))})</span>}
            </>
          ) : (
            "—"
          )}
        </span>
      </p>
    </button>
  );
}

// طرحات النهارده (الكارت الكبير في النص): كارت لكل طرحة بيملا الارتفاع — طرحة واحدة = المساحة كلها، اتنين = النص لكل
// واحدة، وهكذا (كل واحدة batchRowMin على الأقل، والزيادة "+N طرحة تانية"). في الكارت:
// - سطر العنوان: "الطرحة الأولى" · الساعة · "فرن 4" · "غرفة 1" · النوع بنقطة لونه (الكلمة كاملة) · المجموع "1,715 كجم"
// - رسمة لكل ترول (TrolleyIllustration) جنب بعض، وتحت كل واحدة "ترول 6" و"610 كجم". الترول اللي لسه مجاش = إطار
//   متقطع "مستني". الرسومات بتكبر وتصغر مع ارتفاع الكارت، والكلام تحتها بيكبر معاه بين trolleyLabelMin و Max
// Today's batches (the big middle card): one card per batch filling the height (1 = all of it, 2 = half each, ...;
// each at least batchRowMin, the rest "+N"). Title line: ordinal · time · kiln · room · type · total; then one
// trolley drawing per trolley with its number and weight (a missing one = a dashed "مستني"). Drawings scale with the
// card height and the labels grow with it between trolleyLabelMin and trolleyLabelMax
function BatchList({
  batches,
  allBatches,
  sizes,
  alertExit,
}: {
  batches: ProductionBatch[];
  allBatches: ProductionBatch[];
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

  // كام كارت ياخد مكانه، وكل واحد بيملا نصيبه من الارتفاع - how many fit; each fills its share of the height
  const n = batches.length;
  let shown = n;
  let row = 0;
  if (height > 0 && n > 0) {
    if (n * sizes.batchRowMin + (n - 1) * gap <= height) {
      row = Math.floor((height - (n - 1) * gap) / n);
    } else {
      shown = Math.max(1, Math.floor((height - moreHeight + gap) / (sizes.batchRowMin + gap)));
      row = Math.floor((height - moreHeight - shown * gap) / shown);
    }
  }
  const hidden = n - shown;
  // كلام الترول بيكبر مع ارتفاع الكارت - the trolley labels grow with the card height
  const label = Math.round(Math.min(sizes.trolleyLabelMax, Math.max(sizes.trolleyLabelMin, row * 0.06)));
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
          const key = batchKey(batch);
          const alerting = !!alertExit && batch.trolleys.some((t) => sameExit(t, alertExit));
          const missing = batch.size !== null ? Math.max(0, batch.size - batch.count) : 0;
          return (
            <div
              key={key}
              className={`cq-box shrink-0 flex flex-col gap-1.5 px-4 py-2.5 rounded-2xl border-2 min-w-0 overflow-hidden ${
                index === 0 ? "border-brandOrange bg-brandOrange/10 shadow-[0_0_18px_2px_rgba(255,122,0,0.28)]" : "border-cardBorder bg-background/60"
              } ${fresh.has(key) ? "animate-exit-in" : ""} ${alerting ? "exit-alert-row" : ""}`}
              style={{ height: row }}
            >
              {/* سطر العنوان - the title line */}
              {/* الشرايح على اليمين (بتصغر مع عرض الكارت، ولو مش واخدة بتنزل سطر تاني)، والمجموع في مكانه لوحده على الشمال
                  (عمره ما يتقص) - chips on the right (shrink with the card, wrap when needed); the total in its own area on the
                  left (never cut) */}
              <div className="shrink-0 flex items-center gap-3 min-w-0 font-bold leading-none">
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-[1600px]:gap-x-3">
                  <span
                    className={`cq-fs whitespace-nowrap font-extrabold ${batch.complete ? "text-brandOrange" : "text-statusAmber"}`}
                    style={cqf(sizes.batchTitleFontSize, sizes.batchTitleRowWidth)}
                  >
                    {batchOrdinal(batch, allBatches)}
                    {!batch.complete && <span className="font-bold"> ({num(progressText(batch))})</span>}
                  </span>
                  <span className="cq-fs whitespace-nowrap text-white font-extrabold" style={cqf(sizes.batchTimeFontSize, sizes.batchTitleRowWidth)}>
                    {num(batch.time)}
                  </span>
                  {/* الفرن والغرفة: شرايح خضرا بنفس المقاس - kiln and room: green chips, same size */}
                  <span className={`cq-fs shrink-0 px-2 py-1 ${GREEN_CHIP}`} style={cqf(sizes.batchKilnFontSize, sizes.batchTitleRowWidth)}>
                    {toEnglishDigits(batch.kiln || "—")}
                  </span>
                  {batch.room && (
                    <span className={`cq-fs shrink-0 px-2 py-1 ${GREEN_CHIP}`} style={cqf(sizes.batchKilnFontSize, sizes.batchTitleRowWidth)}>
                      غرفة {num(toEnglishDigits(batch.room))}
                    </span>
                  )}
                  <TypeBadge
                    label={batch.type}
                    iconSize={Math.round(sizes.batchTypeFontSize * 1.1)}
                    className="cq-fs shrink-0 font-extrabold"
                    style={cqf(sizes.batchTypeFontSize, sizes.batchTitleRowWidth)}
                  />
                </div>
                <span className="cq-fs shrink-0 whitespace-nowrap font-extrabold text-white" style={cqf(sizes.batchTotalFontSize, sizes.batchTitleRowWidth)}>
                  {batch.weighed > 0 ? (
                    <>
                      {num(formatKg(batch.kg))} <span className="text-gray-400 font-bold text-[0.55em]">كجم</span>
                    </>
                  ) : (
                    <span className="text-gray-500 text-[0.6em]">بدون وزن</span>
                  )}
                </span>
              </div>
              {/* الترولات: رسمة لكل ترول وتحتها رقمه ووزنه - the trolleys: a drawing each, number and weight under it */}
              <div className="flex-1 min-h-0 flex items-stretch justify-center gap-4 min-w-0">
                {batch.trolleys.map((t, i) => {
                  const isNew = !!alertExit && sameExit(t, alertExit);
                  return (
                    <div key={exitKey(t)} className="flex-1 min-w-0 min-h-0 flex flex-col items-center">
                      <TrolleyIllustration highlight={isNew} className="flex-1 min-h-0 w-full" />
                      <p className="shrink-0 font-bold text-gray-200 whitespace-nowrap leading-tight" style={px(label)}>
                        ترول {num(toEnglishDigits(t.trolley || String(i + 1)))}
                      </p>
                      <p className="shrink-0 font-extrabold text-white whitespace-nowrap leading-tight" style={px(label * 1.1)}>
                        {num(t.kg !== null ? formatKg(t.kg) : "—")} <span className="text-gray-400 font-bold text-[0.7em]">كجم</span>
                      </p>
                    </div>
                  );
                })}
                {Array.from({ length: missing }, (_, i) => (
                  <div key={`wait-${i}`} className="flex-1 min-w-0 min-h-0 flex flex-col items-center">
                    <TrolleyIllustration waiting className="flex-1 min-h-0 w-full" />
                    <p className="shrink-0 font-bold text-statusAmber whitespace-nowrap leading-tight" style={px(label)}>
                      ترول {num(String(batch.count + i + 1))}
                    </p>
                    <p className="shrink-0 font-extrabold text-statusAmber/90 whitespace-nowrap leading-tight" style={px(label * 1.1)}>
                      مستني
                    </p>
                  </div>
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
        {field("النوع", <TypeBadge label={exit.type} iconSize={Math.round(c.chipFontSize * 0.95)} />, { color })}
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
}: {
  data: ProductionData | null;
  active?: boolean; // الصفحة دي اللي على الشاشة (مش مستخدمة دلوقتي) - this page is on screen (currently unused)
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
        <BatchList batches={s.todayBatches} allBatches={s.batches} sizes={left} alertExit={alertExit} />
      </Card>

      {/* شمال: "آخر وزنة" صغيرة فوق، والأرقام تحتها - left: the small "آخر وزنة" on top, the KPIs under it */}
      <div className="prod-left min-h-0 min-w-0 flex flex-col" style={{ gridColumn: 3, gridRow: 1, gap }}>
        <LastExitCard data={data} last={s.last} batches={s.batches} sizes={left} />
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
