"use client";

import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock, Factory, Flame, PowerOff, Scale, Wrench } from "lucide-react";
import KilnIllustration, { type KilnState } from "./KilnIllustration";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ProductionData, ProductionExit } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import {
  agoText,
  formatKg,
  formatTons,
  KilnSummary,
  ProductionSummary,
  summarize,
  Tally,
  typeColor,
  useCompact,
  useMinutesSince,
} from "@/lib/production-stats";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";

// صفحة الإنتاج والأفران: الأرقام فوق، آخر وزنة، الأفران، الأنواع، بالساعة، طرحات النهارده، ملخص الشهر
// The production page: KPIs, the last weighing, kilns, types, hourly, today's exits, the month summary

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

function KpiRow({ s, sizes }: { s: ProductionSummary; sizes: Sizes }) {
  const { compare } = s;
  const up = compare.pct !== null && compare.pct >= 0;
  const unweighed = s.today.count - s.today.weighed;
  return (
    <div className="grid gap-3 min-[1600px]:gap-4 h-full" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1.1fr 1.2fr" }}>
      <Kpi label="إنتاج النهارده" accent sub={unweighed > 0 ? `${unweighed} طرحة بدون وزن` : undefined}>
        <span
          className="font-extrabold bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange bg-clip-text text-transparent"
          style={{ fontSize: sizes.kpiTonsFontSize }}
        >
          {num(tons(s.today))}
        </span>
        <span className="text-gray-300 font-bold text-[18px] min-[1600px]:text-[24px]"> طن</span>
      </Kpi>
      <Kpi label="عدد الطرحات" sub="النهارده">
        <span className="font-extrabold text-white" style={{ fontSize: sizes.kpiFontSize }}>
          {num(formatNumber(s.today.count))}
        </span>
      </Kpi>
      <Kpi label="متوسط وزن الطرحة" sub={s.today.weighed > 0 ? `من ${s.today.weighed} طرحة متوزنة` : "مفيش أوزان النهارده"}>
        {s.today.weighed > 0 ? (
          <>
            <span className="font-extrabold text-white" style={{ fontSize: sizes.kpiFontSize }}>
              {num(formatTons(s.today.kg / s.today.weighed))}
            </span>
            <span className="text-gray-400 font-bold text-[15px] min-[1600px]:text-[19px]"> طن</span>
          </>
        ) : (
          <span className="font-extrabold text-gray-600" style={{ fontSize: sizes.kpiFontSize }}>—</span>
        )}
      </Kpi>
      <Kpi
        label="مقارنة بإمبارح"
        sub={
          <>
            امبارح: {compare.by === "tons" ? `${formatTons(compare.yesterday)} طن` : `${formatNumber(compare.yesterday)} طرحة`}
          </>
        }
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
      <Kpi label="إنتاج الشهر" sub={`${formatNumber(s.month.count)} طرحة${s.month.count > s.month.weighed ? ` (${s.month.count - s.month.weighed} بدون وزن)` : ""}`}>
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
function LastExitCard({ data, last, sizes }: { data: ProductionData; last: ProductionExit | null; sizes: LeftSizes }) {
  const minutes = useMinutesSince(last);
  const [glow, setGlow] = useState(false);
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = last?.id ?? null;
    // أول مرة مش بتنور - no glow on the first render
    if (seen.current !== undefined && id && id !== seen.current) {
      setGlow(true);
      const timer = setTimeout(() => setGlow(false), dashboardConfig.production.glowSeconds * 1000);
      seen.current = id;
      return () => clearTimeout(timer);
    }
    seen.current = id;
  }, [last?.id]);

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
        {last && (
          <span className="prod-fs ms-auto text-gray-300 font-semibold truncate" style={fs(sizes.lastAgoFontSize)}>
            {agoText(minutes)}
          </span>
        )}
      </div>
      {last ? (
        <>
          {/* الوزن الكبير في النص - the big weight in the center */}
          <div className="flex-1 min-h-0 flex items-center justify-center whitespace-nowrap">
            {last.kg !== null ? (
              <p className="leading-none">
                <span className="prod-fs font-extrabold text-white" style={fs(sizes.lastWeightFontSize)}>
                  {num(formatKg(last.kg))}
                </span>
                <span className="prod-fs text-gray-400 font-bold" style={fs(sizes.lastChipFontSize)}>
                  {" "}
                  كجم
                </span>
              </p>
            ) : (
              <span className="prod-fs font-extrabold text-gray-500" style={fs(sizes.lastNoWeightFontSize)}>
                بدون وزن
              </span>
            )}
          </div>
          {/* الفرن · النوع · الساعة في سطر واحد - kiln · type · time in one row */}
          <div className="shrink-0 flex items-center justify-center gap-3 min-w-0 whitespace-nowrap font-bold">
            <span className="prod-fs rounded-lg bg-white/10 text-white px-2.5 leading-[1.5]" style={fs(sizes.lastChipFontSize)}>
              {toEnglishDigits(last.kiln || "—")}
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

// كارت فرن: رسمة الفرن بحالته (شغالة نار ودخان / صيانة / متوقفة)، وتحتها طرحات النهارده وأطنانها وآخر خروج
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
      {/* طرحات النهارده · الأطنان · آخر خروج - today's exits · tons · last exit */}
      <p className="shrink-0 flex items-baseline gap-3 whitespace-nowrap min-w-0 text-gray-400" style={{ fontSize: sizes.kilnStatFontSize }}>
        <span>
          <span className={`font-extrabold ${active ? "text-white" : "text-gray-600"}`} style={{ fontSize: sizes.kilnTonsFontSize }}>
            {num(tons(kiln.today))}
          </span>{" "}
          طن
        </span>
        <span className={active ? "text-gray-100 font-bold" : ""}>{num(formatNumber(kiln.today.count))} طرحة</span>
        <span className="ms-auto truncate" title="آخر خروج">
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

// قايمة طرحات النهارده: السطور بتملا الكارت (بتكبر لحد exitRowMax لو قليلة، وبتصغر لحد exitRowMin لو كتير)
// من غير scroll ولا قص: لو أكتر من اللي ياخد مكانه، الأحدث اللي ياخدوا مكانهم وتحتهم "+N طرحة تانية"
// Today's exits: rows fill the card (grow up to exitRowMax with few exits, shrink to exitRowMin with many);
// never scroll, never cut: when more than fit, the newest that fit and a "+N طرحة تانية" line under them
function ExitList({ data, exits, sizes }: { data: ProductionData; exits: ProductionExit[]; sizes: LeftSizes }) {
  const gap = 6;
  const moreHeight = Math.round(sizes.exitMoreFontSize * 1.9);
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

  const n = exits.length;
  let shown = n;
  let row = sizes.exitRowHeight;
  if (height > 0 && n > 0) {
    const fitsAll = n * sizes.exitRowMin + (n - 1) * gap <= height;
    if (fitsAll) {
      row = Math.min(sizes.exitRowMax, Math.floor((height - (n - 1) * gap) / n));
    } else {
      // اللي ياخد مكانه بأقل ارتفاع، وسطر "+N" تحت - as many as fit at the minimum height, plus the "+N" line
      shown = Math.max(0, Math.floor((height - moreHeight + 0) / (sizes.exitRowMin + gap)));
      row = shown > 0 ? Math.min(sizes.exitRowMax, Math.floor((height - moreHeight - shown * gap) / shown)) : sizes.exitRowMin;
    }
  }
  const hidden = n - shown;
  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ gap }}>
      {n === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-cardBorder">
          <p className="prod-fs text-gray-500 font-semibold" style={fs(sizes.exitTypeFontSize)}>
            لم تخرج طرحات النهارده
          </p>
        </div>
      )}
      {height > 0 &&
        exits.slice(0, shown).map((exit, index) => {
          const color = typeColor(data, exit.type);
          return (
            <div
              key={exit.id}
              className={`shrink-0 grid items-center gap-2.5 px-3 rounded-xl border ${
                index === 0 ? "border-brandOrange bg-brandOrange/10 shadow-[0_0_16px_2px_rgba(255,122,0,0.28)]" : "border-cardBorder bg-background/60"
              }`}
              style={{ height: row, gridTemplateColumns: "auto auto minmax(0,1fr) auto" }}
            >
              <span className="prod-fs text-gray-100 font-bold tabular-nums" style={fs(sizes.exitTimeFontSize)}>
                {num(exit.time)}
              </span>
              <span className="prod-fs px-2 rounded-lg bg-white/10 text-white font-bold whitespace-nowrap leading-[1.5]" style={fs(sizes.exitKilnFontSize)}>
                {toEnglishDigits(exit.kiln || "—")}
              </span>
              <span className="prod-fs flex items-center gap-2 min-w-0 font-bold" style={{ ...fs(sizes.exitTypeFontSize), color }}>
                <span className="prod-dot rounded-full shrink-0" style={{ "--dot": `${sizes.exitDotSize}px`, backgroundColor: color } as CSSProperties} />
                <span className="truncate" title={exit.type || "غير محدد"}>
                  {exit.type || "غير محدد"}
                </span>
              </span>
              {exit.kg !== null ? (
                <span className="prod-fs text-white font-bold whitespace-nowrap" style={fs(sizes.exitWeightFontSize)}>
                  {num(formatKg(exit.kg))} <span className="text-gray-500 font-semibold text-[0.7em]">كجم</span>
                </span>
              ) : (
                <span className="prod-fs text-gray-500 font-semibold whitespace-nowrap" style={fs(sizes.exitNoWeightFontSize)}>
                  بدون وزن
                </span>
              )}
            </div>
          );
        })}
      {height > 0 && hidden > 0 && (
        <div className="prod-fs shrink-0 flex items-center justify-center text-gray-400 font-semibold" style={{ ...fs(sizes.exitMoreFontSize), height: moreHeight }}>
          {num(`+${formatNumber(hidden)}`)} طرحة تانية
        </div>
      )}
    </div>
  );
}

// رسم النهارده بالساعة - today's hourly chart
function HourlyChart({ s }: { s: ProductionSummary }) {
  const byTons = s.today.weighed > 0;
  const now = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" }).format(new Date());
  const current = Number(now);
  const rows = s.hours.map((h) => ({ ...h, value: byTons ? Math.round(h.tons * 100) / 100 : h.count }));
  return (
    <div dir="ltr" className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#232B40" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 13 }} tickLine={false} axisLine={{ stroke: "#232B40" }} interval={0} />
          <YAxis
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={byTons}
            tickFormatter={(v: number) => (byTons ? v.toFixed(1) : formatNumber(v))}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.hour} fill={r.hour === current ? "#FFC107" : "#FF7A00"} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              fill="#E5E7EB"
              fontSize={12}
              formatter={(v: unknown) => (Number(v) > 0 ? (byTons ? Number(v).toFixed(2) : String(v)) : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ملخص الشهر: أطنان كل نوع وكل فرن - the month summary: tons per type and per kiln
function MonthTable({ title, rows, onOpen }: { title: string; rows: { key: string; label: ReactNode; t: Tally }[]; onOpen: (key: string) => void }) {
  return (
    <div className="min-w-0 min-h-0 flex flex-col">
      <h3 className="text-gray-300 font-bold mb-1 shrink-0 text-[13px] min-[1600px]:text-[16px]">{title}</h3>
      <div className="flex-1 min-h-0 flex flex-col justify-between">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onOpen(r.key)}
            className="min-h-0 flex items-center gap-2 border-b border-cardBorder/60 last:border-0 hover:bg-white/5 px-1 text-start text-[13px] min-[1600px]:text-[16px]"
          >
            <span className="font-semibold text-gray-100 whitespace-nowrap">{r.label}</span>
            <span className="ms-auto whitespace-nowrap">
              <b className={r.t.count ? "text-white" : "text-gray-600"}>{num(tons(r.t))}</b>
              <span className="text-gray-500 text-[0.85em]"> طن</span>
            </span>
            <span className="w-[4.2em] text-end text-gray-400 whitespace-nowrap">{num(formatNumber(r.t.count))} طرحة</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type Sizes = typeof dashboardConfig.sizes.productionPage.compact;
type LeftSizes = typeof dashboardConfig.sizes.production.compact;

export default function ProductionPage({ data, onOpen }: { data: ProductionData | null; onOpen: (target: ProductionTarget) => void }) {
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
  const byTonsToday = s.today.weighed > 0;
  const byTonsMonth = s.month.weighed > 0;
  const gap = compact ? 12 : 16;

  return (
    <div
      className="grid h-full"
      style={{
        gap,
        // يمين: الأفران (الكارت الكبير)، النص: بالساعة + ملخص الشهر، شمال: آخر وزنة + طرحات النهارده
        // Right: the kilns (the big card), middle: hourly + month summary, left: last weighing + today's exits
        gridTemplateColumns: "minmax(0,1.45fr) minmax(0,1.2fr) minmax(0,0.95fr)",
        gridTemplateRows: `${sizes.kpiHeight}px minmax(0,1fr) minmax(0,1fr)`,
      }}
    >
      <div className="col-span-2 min-h-0">
        <KpiRow s={s} sizes={sizes} />
      </div>
      {/* العمود الشمال كله: "آخر وزنة" فوق والقايمة باقي الطول - the whole left column: "آخر وزنة" on top, the list fills the rest */}
      <div className="prod-left min-h-0 min-w-0 flex flex-col" style={{ gridColumn: 3, gridRow: "1 / span 3", gap }}>
        <LastExitCard data={data} last={s.last} sizes={left} />
        <Card
          title="طرحات النهارده"
          icon={<Factory className="text-brandOrange" size={compact ? 18 : 22} />}
          extra={<span className="text-gray-400 whitespace-nowrap text-[13px] min-[1600px]:text-[16px]">{num(formatNumber(s.today.count))} طرحة</span>}
          className="flex-1"
        >
          <ExitList data={data} exits={s.todayExits} sizes={left} />
        </Card>
      </div>

      <Card
        title="الأفران"
        icon={<Flame className="text-brandOrange" size={compact ? 18 : 22} />}
        style={{ gridColumn: 1, gridRow: "2 / span 2" }}
        extra={
          <>
            {data.offline && <OfflineBadge />}
            <span className="text-gray-400 text-[13px] min-[1600px]:text-[16px] whitespace-nowrap">
              شغالة <b className="text-statusGreen">{num(String(s.working))}</b> / {num(String(s.kilns.length))}
            </span>
          </>
        }
      >
        {/* 6 أفران: عمودين × 3 صفوف (الرسمة عريضة) - 6 kilns: 2 columns × 3 rows (the drawing is wide) */}
        <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-3 gap-2 min-[1600px]:gap-3">
          {s.kilns.slice(0, 6).map((k) => (
            <KilnTile key={k.name} kiln={k} today={data.today} sizes={sizes} onOpen={() => onOpen({ kind: "kiln", name: k.name })} />
          ))}
        </div>
      </Card>

      <Card
        title="الإنتاج بالساعة النهارده"
        style={{ gridColumn: 2, gridRow: 2 }}
        icon={<Clock className="text-brandOrange" size={compact ? 18 : 22} />}
        extra={<span className="text-gray-500 text-[13px] min-[1600px]:text-[15px] whitespace-nowrap">{byTonsToday ? "طن في الساعة" : "عدد الطرحات (مفيش أوزان)"}</span>}
      >
        <HourlyChart s={s} />
      </Card>


      <Card
        title="ملخص الشهر"
        style={{ gridColumn: 2, gridRow: 3 }}
        extra={
          <span className="whitespace-nowrap text-[13px] min-[1600px]:text-[16px]">
            <b className="text-brandOrange">{num(tons(s.month))}</b>
            <span className="text-gray-400"> طن · {num(formatNumber(s.month.count))} طرحة</span>
            {!byTonsMonth && s.month.count > 0 && <span className="text-gray-500"> (بدون أوزان)</span>}
          </span>
        }
      >
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
          <MonthTable
            title="حسب النوع"
            rows={s.types.map((t) => ({
              key: t.label,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
              ),
              t: t.month,
            }))}
            onOpen={(name) => onOpen({ kind: "type", name })}
          />
          <MonthTable
            title="حسب الفرن"
            rows={s.kilns.map((k) => ({ key: k.name, label: toEnglishDigits(k.name), t: k.month }))}
            onOpen={(name) => onOpen({ kind: "kiln", name })}
          />
        </div>
      </Card>
    </div>
  );
}
