"use client";

import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ActivityData, ActivityEvent, ActivityKind } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { agoText, cairoTime, useCompact } from "@/lib/production-stats";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";

// ⚡ اللي بيحصل دلوقتي (كارت الرئيسية): أي حاجة بتتعمل في ERPNext بعد ما الصفحة فتحت بتظهر في الصندوق الكبير
// وتنبض pulseCount مرة وبعدين تنزل للقايمة. الأحداث اللي بتيجي مع بعض بتستنى في طابور (FIFO) وبتتعرض واحدة واحدة
// The live activity card: anything done in ERPNext after the page opened shows in the big box, pulses pulseCount
// times, then moves into the list. Events arriving together wait in a FIFO queue and play one at a time.

const config = dashboardConfig.activity;
const PULSE_MS = config.pulseCount * config.pulseSeconds * 1000;
const GAP_MS = 450; // بين حدث والتاني (وقت النزول للقايمة) - between two events (the slide into the list)

// شكل كل نوع: الأيقونة واللون - each kind's icon and color
const KINDS: Record<ActivityKind, { icon: string; color: string }> = {
  in: { icon: "💰", color: "#22C55E" },
  out: { icon: "💸", color: "#EF4444" },
  kiln: { icon: "🔥", color: "#FF7A00" },
  sale: { icon: "🧾", color: "#2F80ED" },
  return: { icon: "↩️", color: "#F59E0B" },
  stock: { icon: "📦", color: "#A855F7" },
  charity: { icon: "🤲", color: "#14B8A6" },
  salary: { icon: "👤", color: "#38BDF8" },
};

// لون بادج نوع الصرف (زي لوحة الخزنة) - payment-type badge colors (as in the treasury panel)
const BADGE: Record<string, string> = {
  سلفة: "bg-amber-400/20 text-amber-300",
  مرتب: "bg-sky-400/20 text-sky-300",
  يومية: "bg-sky-400/20 text-sky-300",
  إضافي: "bg-sky-400/20 text-sky-300",
  عهدة: "bg-purple-400/20 text-purple-300",
  مورد: "bg-blue-400/20 text-blue-300",
  مصروف: "bg-rose-400/20 text-rose-300",
  تحصيل: "bg-emerald-400/20 text-emerald-300",
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// "من دقيقة" - "a minute ago"
const ago = (event: ActivityEvent, now: number) => {
  const minutes = Math.max(0, Math.floor((now - cairoTime(event.at.slice(0, 10), event.at.slice(11, 16))) / 60_000));
  return minutes === 1 ? "من دقيقة" : agoText(minutes);
};

const amountText = (event: ActivityEvent) => (event.amount === null ? null : `${formatNumber(event.amount)} ج.م`);

function Badge({ text }: { text: string | null }) {
  if (!text) return null;
  return <span className={`shrink-0 rounded-full px-1.5 text-[0.78em] font-bold leading-[1.6] ${BADGE[text] ?? "bg-white/10 text-gray-300"}`}>{text}</span>;
}

type Sizes = typeof dashboardConfig.sizes.activityCard.compact;

// الصندوق الكبير: حدث بينبض، أو آخر حدث باهت لما مفيش جديد - the big box: a pulsing event, or the last one dimmed when idle
function Spotlight({ event, live, waiting, now, sizes }: { event: ActivityEvent | null; live: boolean; waiting: number; now: number; sizes: Sizes }) {
  const kind = event ? KINDS[event.kind] : null;
  const style = {
    height: sizes.spotlightHeight,
    borderColor: kind && live ? kind.color : undefined,
    background: kind && live ? `linear-gradient(160deg, ${kind.color}33, ${kind.color}0d)` : undefined,
    "--glow": kind?.color ?? "#FF7A00",
    animationDuration: `${config.pulseSeconds}s`,
    animationIterationCount: config.pulseCount,
  } as CSSProperties;
  return (
    <div
      key={event?.id ?? "empty"}
      data-testid="activity-spotlight"
      data-event={event?.id ?? ""}
      data-live={live ? "1" : "0"}
      className={`relative shrink-0 rounded-2xl border-2 px-3 py-2 flex flex-col justify-center gap-0.5 overflow-hidden min-w-0 ${
        live ? "activity-pulse" : "border-cardBorder bg-background/60 opacity-60"
      }`}
      style={style}
    >
      {waiting > 0 && (
        <span data-testid="activity-queue" className="absolute top-1.5 start-1.5 rounded-full bg-brandOrange text-black text-[11px] font-extrabold px-2 leading-[1.7]">
          +{waiting} في الطابور
        </span>
      )}
      {!event ? (
        <p className="text-gray-500 text-center">لسه مفيش حاجة النهارده</p>
      ) : (
        <>
          <p className="text-gray-400 text-[12px] font-semibold">{live ? "✨ حدث جديد" : "آخر حاجة حصلت"}</p>
          <p className="flex items-center gap-1.5 min-w-0 font-extrabold text-white" style={{ fontSize: sizes.spotlightTitleFontSize }}>
            <span className="shrink-0">{kind!.icon}</span>
            <span className="truncate">{event.title}</span>
          </p>
          {(event.amount !== null || event.extra) && (
            <p className="font-extrabold leading-tight whitespace-nowrap truncate" style={{ fontSize: sizes.spotlightAmountFontSize, color: kind!.color }}>
              <span dir="ltr" className="font-numbers">
                {amountText(event) ?? event.extra}
              </span>
            </p>
          )}
          <p className="flex items-center gap-1.5 min-w-0 text-gray-200 font-semibold text-[13px] min-[1600px]:text-[15px]">
            <Badge text={event.badge} />
            <span className="truncate">{event.details}</span>
          </p>
          <p className="flex items-center gap-2 text-gray-400 text-[12px] min-[1600px]:text-[13px] whitespace-nowrap">
            {event.amount !== null && event.extra && <span className="truncate">{event.extra}</span>}
            <span className="ms-auto">{ago(event, now)}</span>
          </p>
        </>
      )}
    </div>
  );
}

// سطر في القايمة - one list row
function Row({ event, index, fresh, now, sizes }: { event: ActivityEvent; index: number; fresh: boolean; now: number; sizes: Sizes }) {
  const kind = KINDS[event.kind];
  return (
    <div
      data-testid="activity-row"
      className={`shrink-0 rounded-xl border border-cardBorder bg-background/60 px-2 flex items-center gap-2 min-w-0 transition-opacity duration-700 ${fresh ? "activity-slide-in" : ""}`}
      style={{ height: sizes.rowHeight, fontSize: sizes.rowFontSize, opacity: Math.max(0.35, 1 - index * 0.09), borderInlineStartColor: kind.color, borderInlineStartWidth: 3 }}
    >
      <span className="shrink-0 text-[1.25em]">{kind.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-bold text-white">{event.title}</span>
          {event.amount !== null && (
            <span dir="ltr" className="ms-auto shrink-0 font-numbers font-bold" style={{ color: kind.color }}>
              {formatNumber(event.amount)}
            </span>
          )}
        </p>
        <p className="flex items-center gap-1.5 min-w-0 text-gray-400 text-[0.92em]">
          <Badge text={event.badge} />
          <span className="truncate">{event.details}</span>
          <span className="ms-auto shrink-0 text-gray-500">{ago(event, now)}</span>
        </p>
      </div>
    </div>
  );
}

export default function ActivityFeed() {
  const compact = useCompact();
  const sizes: Sizes = compact ? dashboardConfig.sizes.activityCard.compact : dashboardConfig.sizes.activityCard;

  // أول طلب من غير since (آخر أحداث النهارده)، وبعده since = وقت فتح الصفحة (ناقص دقيقة للي اتسجل متأخر)
  // The first request has no since (today's last events); after it since = the page-open time (minus a minute
  // for late commits). Ids already seen are never played again.
  const [since, setSince] = useState<string | null>(null);
  const { data, error } = useSWR<ActivityData>(since ? `/api/activity?since=${encodeURIComponent(since)}` : "/api/activity", fetcher, {
    refreshInterval: config.refreshSeconds * 1000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshWhenOffline: true,
    dedupingInterval: 2000,
    keepPreviousData: true,
  });

  const seen = useRef<Set<string> | null>(null);
  const [list, setList] = useState<ActivityEvent[]>([]);
  const [queue, setQueue] = useState<ActivityEvent[]>([]);
  const [current, setCurrent] = useState<ActivityEvent | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);

  // الأحداث اللي وصلت: أول مرة بتملا القايمة من غير حركة، وبعد كده الجديد بس بيدخل الطابور (الأقدم الأول)
  // Arrived events: the first time they fill the list without animation; afterwards only new ones join the queue (oldest first)
  useEffect(() => {
    if (!data) return;
    if (!seen.current) {
      seen.current = new Set(data.events.map((e) => e.id));
      setList(data.events.slice(0, config.listSize));
      const opened = Date.parse(`${data.now.replace(" ", "T")}Z`) - 60_000;
      setSince(new Date(opened).toISOString().slice(0, 19).replace("T", " "));
      return;
    }
    const fresh = data.events.filter((e) => !seen.current!.has(e.id)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seen.current!.add(e.id));
    setQueue((q) => [...q, ...fresh]);
  }, [data]);

  // الطابور: حدث واحد في المرة - the queue: one event at a time
  useEffect(() => {
    if (current || queue.length === 0) return;
    const timer = setTimeout(() => {
      setCurrent(queue[0]);
      setQueue((q) => q.slice(1));
    }, freshId ? GAP_MS : 0);
    return () => clearTimeout(timer);
  }, [current, queue, freshId]);

  // بعد النبض: الحدث بينزل أول القايمة - after the pulses the event moves to the top of the list
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      setList((l) => [current, ...l.filter((e) => e.id !== current.id)].slice(0, config.listSize));
      setFreshId(current.id);
      setCurrent(null);
    }, PULSE_MS);
    return () => clearTimeout(timer);
  }, [current]);

  // "من دقيقة" بيتحدث كل 30 ثانية - the "ago" texts refresh every 30 s
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // القايمة: اللي ياخد مكانه من غير scroll - the list: as many rows as fit, no scroll
  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(config.listSize);
  const gap = 6;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setFit(Math.max(0, Math.floor((el.clientHeight + gap) / (sizes.rowHeight + gap))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sizes.rowHeight]);

  const offline = !!error || !!data?.offline;
  const shown = list.slice(0, Math.min(fit, config.listSize));

  return (
    <div className="w-full h-full bg-card border border-cardBorder rounded-2xl p-3 min-[1600px]:p-4 flex flex-col gap-2.5 overflow-hidden">
      <div className="flex items-center gap-1.5 shrink-0 min-w-0">
        <h2 className="text-[16px] min-[1600px]:text-xl font-bold text-white whitespace-nowrap truncate">⚡ اللي بيحصل دلوقتي</h2>
        {offline && <OfflineBadge />}
      </div>
      {!data && !list.length ? (
        <div className="flex-1 flex items-center justify-center">{error ? <OfflineBadge /> : <p className="text-gray-500">جاري التحميل...</p>}</div>
      ) : (
        <>
          <Spotlight event={current ?? list[0] ?? null} live={!!current} waiting={queue.length} now={now} sizes={sizes} />
          <div ref={listRef} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ gap }}>
            {shown.map((event, index) => (
              <Row key={event.id} event={event} index={index} fresh={event.id === freshId} now={now} sizes={sizes} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
