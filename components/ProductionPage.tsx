"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock, Factory, Flame, Scale } from "lucide-react";
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
  TypeSummary,
  useCompact,
  useMinutesSince,
} from "@/lib/production-stats";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";

// صفحة الإنتاج والأفران: الأرقام فوق، آخر وزنة، الأفران، الأنواع، بالساعة، طرحات النهارده، ملخص الشهر
// The production page: KPIs, the last weighing, kilns, types, hourly, today's exits, the month summary

export type ProductionTarget = { kind: "kiln" | "type"; name: string };

const STATUS: Record<string, { label: string; text: string; border: string; dot: string }> = {
  working: { label: "شغالة", text: "text-statusGreen", border: "border-statusGreen/60", dot: "bg-statusGreen" },
  maintenance: { label: "صيانة", text: "text-statusAmber", border: "border-statusAmber/60", dot: "bg-statusAmber" },
  stopped: { label: "متوقفة", text: "text-statusRed", border: "border-statusRed/50", dot: "bg-statusRed" },
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

function Card({ title, icon, extra, children, className = "" }: { title: string; icon?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-card border border-cardBorder rounded-2xl p-3 min-[1600px]:p-4 flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`}>
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

// آخر وزنة: بتنور شوية لما طرحة جديدة توصل - the last weighing; glows briefly when a new exit arrives
function LastExitCard({ data, last, sizes }: { data: ProductionData; last: ProductionExit | null; sizes: Sizes }) {
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
      className={`h-full rounded-2xl border bg-card px-4 flex items-center gap-4 min-w-0 overflow-hidden transition-[box-shadow,border-color] duration-700 ${
        glow ? "border-brandOrange shadow-[0_0_28px_6px_rgba(255,122,0,0.55)] animate-new-exit" : "border-cardBorder"
      }`}
    >
      <Scale className="text-brandOrange shrink-0" size={sizes.kpiFontSize * 0.8} />
      {last ? (
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="flex items-center gap-2 text-gray-400 font-semibold text-[14px] min-[1600px]:text-[17px] whitespace-nowrap">
            آخر وزنة
            {glow && <span className="rounded-full bg-brandOrange text-black px-2 text-[0.8em] font-extrabold">جديدة</span>}
            <span className="ms-auto text-gray-300">{agoText(minutes)}</span>
          </p>
          <p className="leading-[1.15] whitespace-nowrap">
            {last.kg !== null ? (
              <>
                <span className="font-extrabold text-white" style={{ fontSize: sizes.lastWeightFontSize }}>
                  {num(formatKg(last.kg))}
                </span>
                <span className="text-gray-400 font-bold"> كجم</span>
              </>
            ) : (
              <span className="font-extrabold text-gray-500" style={{ fontSize: sizes.lastWeightFontSize * 0.6 }}>
                بدون وزن
              </span>
            )}
          </p>
          <p className="flex items-center gap-2 min-w-0 whitespace-nowrap text-[14px] min-[1600px]:text-[17px] font-semibold">
            <span className="rounded-md bg-white/10 text-white px-2">{toEnglishDigits(last.kiln || "—")}</span>
            <span className="flex items-center gap-1.5 truncate" style={{ color }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {last.type || "غير محدد"}
            </span>
            <span className="ms-auto text-gray-300 inline-flex items-center gap-1">
              <Clock size={15} />
              {num(last.time)}
              {last.date !== data.today && <span className="text-gray-500"> ({num(shortDate(last.date))})</span>}
            </span>
          </p>
        </div>
      ) : (
        <p className="text-gray-500 text-lg">لسه مفيش طرحات</p>
      )}
    </div>
  );
}

function KilnTile({ kiln, today, sizes, onOpen }: { kiln: KilnSummary; today: string; sizes: Sizes; onOpen: () => void }) {
  const st = STATUS[kiln.status] ?? STATUS.stopped;
  const active = kiln.today.count > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`min-h-0 min-w-0 rounded-xl border-2 ${st.border} bg-background/60 px-2.5 py-1 flex flex-col justify-center text-start hover:bg-white/5 overflow-hidden`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white font-extrabold text-[15px] min-[1600px]:text-[19px] whitespace-nowrap">{toEnglishDigits(kiln.name)}</span>
        <span className={`ms-auto inline-flex items-center gap-1 text-[12px] min-[1600px]:text-[14px] font-bold ${st.text} whitespace-nowrap`}>
          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>
      <p className="whitespace-nowrap leading-[1.25]">
        <span className={`font-extrabold ${active ? "text-white" : "text-gray-600"}`} style={{ fontSize: sizes.kilnTonsFontSize }}>
          {num(tons(kiln.today))}
        </span>
        <span className="text-gray-500 text-[13px] min-[1600px]:text-[15px] font-semibold"> طن</span>
      </p>
      <p className="flex items-center gap-2 text-[12px] min-[1600px]:text-[14px] text-gray-400 whitespace-nowrap min-w-0">
        <span className={active ? "text-gray-200 font-bold" : ""}>{num(formatNumber(kiln.today.count))} طرحة</span>
        <span className="ms-auto truncate">
          {kiln.last ? (
            <>
              <span title="آخر خروج">
                <Clock size={13} className="inline align-[-2px]" /> {num(kiln.last.time)}
              </span>
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

// سطر نوع بشريط (أطنان، ولو مفيش أوزان بالعدد) - a type row with a bar (tons, or count without weights)
function TypeRow({ type, max, byTons, onOpen, pick }: { type: TypeSummary; max: number; byTons: boolean; onOpen: () => void; pick: (t: TypeSummary) => Tally }) {
  const t = pick(type);
  const value = byTons ? t.kg : t.count;
  return (
    <button type="button" onClick={onOpen} className="min-h-0 w-full grid items-center gap-3 text-start rounded-lg hover:bg-white/5 px-1" style={{ gridTemplateColumns: "minmax(4.5em,auto) minmax(0,1fr) auto" }}>
      <span className="flex items-center gap-2 font-bold whitespace-nowrap" style={{ color: t.count ? type.color : "#6B7280" }}>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: type.color, opacity: t.count ? 1 : 0.4 }} />
        {type.label}
      </span>
      <div className="h-3 min-[1600px]:h-4 rounded-full bg-cardBorder overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: type.color }} />
      </div>
      <span className="whitespace-nowrap text-end">
        <b className={t.count ? "text-white" : "text-gray-600"}>{num(tons(t))}</b>
        <span className="text-gray-500 text-[0.85em]"> طن · </span>
        <b className={t.count ? "text-gray-200" : "text-gray-600"}>{num(formatNumber(t.count))}</b>
        <span className="text-gray-500 text-[0.85em]"> طرحة</span>
      </span>
    </button>
  );
}

// قايمة طرحات النهارده: اللي ياخد مكانه، والباقي "و X طرحة أخرى" - today's exits: as many as fit, then "و X طرحة أخرى"
function ExitList({ data, exits, sizes }: { data: ProductionData; exits: ProductionExit[]; sizes: Sizes }) {
  const gap = 4;
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const row = sizes.exitRowHeight;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setFit(Math.max(0, Math.floor((el.clientHeight + gap) / (row + gap))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [row]);
  const shown = exits.length <= fit ? exits.length : Math.max(0, fit - 1);
  const hidden = exits.length - shown;
  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ gap }}>
      {exits.length === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-cardBorder">
          <p className="text-gray-500">لم تخرج طرحات النهارده</p>
        </div>
      )}
      {exits.slice(0, shown).map((exit, index) => {
        const color = typeColor(data, exit.type);
        return (
          <div
            key={exit.id}
            className={`shrink-0 grid items-center gap-2 px-2 rounded-lg border ${index === 0 ? "border-brandOrange/50 bg-brandOrange/10" : "border-cardBorder bg-background/60"}`}
            style={{ height: row, fontSize: sizes.exitFontSize, gridTemplateColumns: "3.2em auto minmax(0,1fr) auto" }}
          >
            <span className="text-gray-300 font-semibold">{num(exit.time)}</span>
            <span className="px-2 rounded-md bg-white/10 text-white font-semibold whitespace-nowrap leading-[1.6]">{toEnglishDigits(exit.kiln || "—")}</span>
            <span className="flex items-center gap-1.5 min-w-0 font-semibold" style={{ color }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="truncate">{exit.type || "غير محدد"}</span>
            </span>
            {exit.kg !== null ? (
              <span className="text-white font-bold whitespace-nowrap">
                {num(formatKg(exit.kg))} <span className="text-gray-500 font-normal text-[0.85em]">كجم</span>
              </span>
            ) : (
              <span className="text-gray-500 whitespace-nowrap text-[0.9em]">بدون وزن</span>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <div className="shrink-0 flex items-center justify-center text-gray-400 font-semibold" style={{ height: row, fontSize: sizes.exitFontSize }}>
          و {formatNumber(hidden)} طرحة أخرى
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

export default function ProductionPage({ data, onOpen }: { data: ProductionData | null; onOpen: (target: ProductionTarget) => void }) {
  const compact = useCompact();
  const page = dashboardConfig.sizes.productionPage;
  const sizes: Sizes = compact ? page.compact : page;

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
  const typeMax = Math.max(0, ...s.types.map((t) => (byTonsToday ? t.today.kg : t.today.count)));
  const gap = compact ? 12 : 16;

  return (
    <div
      className="grid h-full"
      style={{
        gap,
        gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.45fr) minmax(0,0.95fr)",
        gridTemplateRows: `${sizes.kpiHeight}px minmax(0,1.12fr) minmax(0,1fr)`,
      }}
    >
      <div className="col-span-2 min-h-0">
        <KpiRow s={s} sizes={sizes} />
      </div>
      <div className="min-h-0 min-w-0">
        <LastExitCard data={data} last={s.last} sizes={sizes} />
      </div>

      <Card
        title="الأفران"
        icon={<Flame className="text-brandOrange" size={compact ? 18 : 22} />}
        extra={
          <>
            {data.offline && <OfflineBadge />}
            <span className="text-gray-400 text-[13px] min-[1600px]:text-[16px] whitespace-nowrap">
              شغالة <b className="text-statusGreen">{num(String(s.working))}</b> / {num(String(s.kilns.length))}
            </span>
          </>
        }
      >
        <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-2 gap-2">
          {s.kilns.slice(0, 6).map((k) => (
            <KilnTile key={k.name} kiln={k} today={data.today} sizes={sizes} onOpen={() => onOpen({ kind: "kiln", name: k.name })} />
          ))}
        </div>
      </Card>

      <Card
        title="الإنتاج بالساعة النهارده"
        icon={<Clock className="text-brandOrange" size={compact ? 18 : 22} />}
        extra={<span className="text-gray-500 text-[13px] min-[1600px]:text-[15px] whitespace-nowrap">{byTonsToday ? "طن في الساعة" : "عدد الطرحات (مفيش أوزان)"}</span>}
      >
        <HourlyChart s={s} />
      </Card>

      <Card
        title="طرحات النهارده"
        icon={<Factory className="text-brandOrange" size={compact ? 18 : 22} />}
        extra={<span className="text-gray-400 whitespace-nowrap text-[13px] min-[1600px]:text-[16px]">{num(formatNumber(s.today.count))} طرحة</span>}
        className="row-span-2"
      >
        <ExitList data={data} exits={s.todayExits} sizes={sizes} />
      </Card>

      <Card title="الأنواع النهارده" extra={<span className="text-gray-500 text-[13px] min-[1600px]:text-[15px] whitespace-nowrap">اضغط على نوع للتفاصيل</span>}>
        <div className="flex-1 min-h-0 flex flex-col justify-around text-[14px] min-[1600px]:text-[18px]">
          {s.types.map((t) => (
            <TypeRow key={t.label} type={t} max={typeMax} byTons={byTonsToday} pick={(x) => x.today} onOpen={() => onOpen({ kind: "type", name: t.label })} />
          ))}
        </div>
      </Card>

      <Card
        title="ملخص الشهر"
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
