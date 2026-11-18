"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Boxes,
  Camera,
  ChevronLeft,
  ChevronRight,
  Cctv,
  Fingerprint,
  Globe,
  LucideIcon,
  Monitor,
  Network,
  Printer,
  Router,
  Scale,
  TriangleAlert,
  Wifi,
  X,
} from "lucide-react";
import { ItCamera, ItDevice, ItDeviceType, ItEvent, ItRouter, ItSnapshot, ItStatus } from "@/lib/types";
import { sampleCameraFrame, sampleItSnapshot } from "@/lib/it-sample";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// صفحة IT والمراقبة: النت والشبكات والأجهزة والكاميرات من إيجنت IT في المصنع
// لحد ما الإيجنت يبعت أول مرة (و previewMode = true) بتظهر بيانات تجريبية بشريط "معاينة"؛ أول ما بيانات حقيقية توصل
// التجريبي مبيظهرش تاني خالص
// The IT & monitoring page: internet, networks, devices and cameras from the factory IT agent. Until the agent has
// ever sent (and previewMode = true) it shows sample data with a "معاينة" ribbon; once real data arrives the sample
// is never shown again

const cfg = dashboardConfig.it;
const GREEN = "#22C55E";
const RED = "#EF4444";
const ACCENT = "#38BDF8"; // لون الصفحة (سماوي) - the page accent (sky)

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// ===== الوقت - time =====
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit", hour12: true });
// "10:42 ص" بتوقيت القاهرة - Cairo time, like the header clock
function clock(isoTime: string | null): string {
  if (!isoTime) return "—";
  const parts = timeFormat.formatToParts(new Date(isoTime));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod") === "AM" ? "ص" : "م"}`;
}

// مدة بالعربي: "5 دقيقة" / "3 س 12 د" / "2 يوم"؛ short = "5 د" للسطور الضيقة
// A duration in Arabic; short = "5 د" for narrow rows
function duration(fromIso: string | null, now: number, short = false): string {
  if (!fromIso) return "—";
  const minutes = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000));
  if (minutes < 1) return short ? "< 1 د" : "أقل من دقيقة";
  if (minutes < 60) return short ? `${minutes} د` : `${minutes} دقيقة`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} س ${rest} د` : `${hours} ساعة`;
  }
  return `${Math.floor(minutes / 1440)} يوم`;
}

// "آخر ظهور": الآن / من 12 دقيقة - "last seen": now / 12 minutes ago
function lastSeen(device: ItDevice, now: number): string {
  if (!device.lastSeen) return "—";
  const minutes = (now - Date.parse(device.lastSeen)) / 60_000;
  return minutes < 2 ? "الآن" : `من ${duration(device.lastSeen, now, true)}`;
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

// ===== قطع صغيرة - small pieces =====
function Dot({ up, size = 10, pulse = false }: { up: boolean | null; size?: number; pulse?: boolean }) {
  const color = up === null ? "#6B7280" : up ? GREEN : RED;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.5 }} />}
      <span className="relative rounded-full" style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 8px ${color}99` }} />
    </span>
  );
}

const Ip = ({ value }: { value: string }) => (
  <span dir="ltr" className="font-numbers tabular-nums text-gray-500">
    {value || "—"}
  </span>
);

const Ms = ({ value }: { value: number | null }) =>
  value === null ? (
    <span className="text-gray-600">—</span>
  ) : (
    <span className="font-numbers tabular-nums" style={{ color: value > 150 ? "#F59E0B" : "#D1D5DB" }}>
      {formatNumber(value)}
      <span className="text-gray-500 text-[0.8em]"> ms</span>
    </span>
  );

// قسم بنفس شكل أقسام صفحة المخازن: إطار، خط ملون على اليمين، أيقونة وعنوان - a section like the stock page sections
function Section({ title, icon: Icon, extra, className = "", children }: { title: string; icon: LucideIcon; extra?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div
      className={`relative bg-card border border-cardBorder rounded-2xl p-3 flex flex-col min-h-0 min-w-0 ${className}`}
      style={{ backgroundImage: `linear-gradient(to left, ${ACCENT}0F, transparent 60%)` }}
    >
      <div className="absolute top-0 bottom-0 right-0 w-1" style={{ backgroundColor: ACCENT, borderTopRightRadius: 15, borderBottomRightRadius: 15 }} />
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="shrink-0" size={22} style={{ color: ACCENT }} />
          <h2 className="font-bold text-white whitespace-nowrap text-[20px] leading-[1.6]">{title}</h2>
        </div>
        {extra}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

// ===== الشبكات - networks =====
function RouterCard({ router, now }: { router: ItRouter; now: number }) {
  const pct = router.uptimeTodayPct;
  const pctColor = pct === null ? "#6B7280" : pct >= 99 ? GREEN : pct >= 90 ? "#F59E0B" : RED;
  return (
    // سطرين، والنسبة بتاعة النهارده شريط رفيع على الحافة اللي تحت - two lines; today's uptime is a thin strip on the bottom edge
    <div
      className={`relative min-h-0 rounded-xl border px-3 pt-1 pb-1.5 flex flex-col justify-center overflow-hidden ${
        router.up ? "border-cardBorder bg-background/70" : "border-statusRed/60 bg-statusRed/10"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 text-[15px] leading-[1.55]">
        <Dot up={router.up} pulse={!router.up} />
        {router.kind === "ap" ? <Wifi size={16} className="text-gray-400 shrink-0" /> : <Router size={16} className="text-gray-400 shrink-0" />}
        <span className="font-bold text-white truncate min-w-0">{toEnglishDigits(router.name)}</span>
        <span className="ms-auto shrink-0">
          <Ms value={router.latencyMs} />
        </span>
      </div>
      <div className="flex items-center gap-1.5 min-w-0 text-[13px] leading-[1.55] whitespace-nowrap">
        <Ip value={router.ip} />
        <span className="text-gray-600">·</span>
        {router.internet === null ? (
          <span className="text-gray-500">النت مش معروف</span>
        ) : router.internet ? (
          <span className="text-statusGreen font-semibold">فيه نت ✓</span>
        ) : (
          <span className="text-statusRed font-semibold">مفيش نت ✗</span>
        )}
        <span className="text-gray-600">·</span>
        <span className={`truncate min-w-0 ${router.up ? "text-gray-400" : "text-statusRed font-semibold"}`}>
          {router.up ? "شغال من" : "واقع من"} {duration(router.since, now, true)}
        </span>
        <span className="ms-auto shrink-0 font-numbers tabular-nums" style={{ color: pctColor }} title="نسبة الشغل النهارده">
          {pct === null ? "—" : `${formatNumber(pct)}%`}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-cardBorder">
        <div className="h-full" style={{ width: `${pct ?? 0}%`, backgroundColor: pctColor }} />
      </div>
    </div>
  );
}

// ===== الأجهزة - devices =====
const DEVICE_GROUPS: { type: ItDeviceType; label: string; icon: LucideIcon }[] = [
  { type: "fingerprint", label: "البصمة", icon: Fingerprint },
  { type: "nvr", label: "NVR الكاميرات", icon: Cctv },
  { type: "printer", label: "الطابعات", icon: Printer },
  { type: "pc", label: "الكمبيوترات", icon: Monitor },
  { type: "scale", label: "الميزان", icon: Scale },
  { type: "other", label: "أخرى", icon: Boxes },
];

function DeviceRow({ device, now }: { device: ItDevice; now: number }) {
  return (
    <div className={`rounded-lg px-2 py-1 ${device.up ? "" : "bg-statusRed/10 border border-statusRed/40"}`}>
      <div className="flex items-center gap-2 min-w-0 text-[14px] leading-[1.5]">
        <Dot up={device.up} size={9} pulse={!device.up} />
        <span className={`truncate min-w-0 font-semibold ${device.up ? "text-gray-100" : "text-statusRed"}`}>{toEnglishDigits(device.name)}</span>
        <span className="ms-auto shrink-0 text-[13px]">
          <Ms value={device.latencyMs} />
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0 text-[12px] leading-[1.45] ps-[17px] whitespace-nowrap">
        <Ip value={device.ip} />
        <span className={`ms-auto truncate min-w-0 ${device.up ? "text-gray-500" : "text-statusRed"}`}>
          {device.up ? `آخر ظهور: ${lastSeen(device, now)}` : `واقع من ${duration(device.since ?? device.lastSeen, now, true)}`}
        </span>
      </div>
    </div>
  );
}

// ===== الكاميرات - cameras =====
// رابط صورة الكاميرا من السيرفر المحلي (من غير أي باسورد) - the snapshot URL on the local server (never a password)
function cameraUrl(camera: ItCamera, tick: number): string | null {
  const base = cfg.cameraBaseUrl.trim().replace(/\/+$/, "");
  return base ? `${base}/cameras/${encodeURIComponent(camera.id)}/snapshot.jpg?t=${tick}` : null;
}

// صورة الكاميرا: الصورة الجديدة بتتحمل في الخلفية وبتتبدل لما تخلص (من غير رمشة). مش متاحة = شكل بديل
// The camera image: the next snapshot loads in the background and swaps in when ready (no flicker). Unavailable = placeholder
function CameraImage({ camera, index, tick, preview, fit = "cover", compact = false }: { camera: ItCamera; index: number; tick: number; preview: boolean; fit?: "cover" | "contain"; compact?: boolean }) {
  const src = preview ? sampleCameraFrame(camera.name, index, tick) : cameraUrl(camera, tick);
  const [shown, setShown] = useState<string | null>(preview ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return;
    if (preview) {
      setShown(src);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setShown(src);
      setFailed(false);
    };
    image.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, preview]);

  if (!src || (failed && !shown)) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-3 bg-[repeating-linear-gradient(135deg,#111827_0,#111827_14px,#0f1623_14px,#0f1623_28px)]">
        <Camera size={compact ? 18 : 40} className="text-gray-600" />
        {!compact && <p className="text-gray-400 font-semibold text-[15px] leading-[1.6]">الكاميرات متاحة جوه المصنع بس</p>}
      </div>
    );
  }
  return shown ? <img src={shown} alt={camera.name} className={`absolute inset-0 w-full h-full ${fit === "cover" ? "object-cover" : "object-contain"}`} draggable={false} /> : null;
}

function LiveTag({ online }: { online: boolean | null }) {
  return online === false ? (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-[13px] leading-[1.8] text-gray-300">
      <Dot up={false} size={8} /> مش متصلة
    </span>
  ) : (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-[13px] leading-[1.8] text-white font-semibold">
      <Dot up={false} size={8} pulse /> مباشر
    </span>
  );
}

// الكاميرا في صفحة كاملة: ◀ ▶ والأسهم للتنقل، صور صغيرة تحت، Esc يقفل
// A camera filling the page: ◀ ▶ and arrow keys to switch, a thumbnail strip, Esc closes
function CameraViewer({ cameras, start, preview, onClose }: { cameras: ItCamera[]; start: number; preview: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const tick = useTick(cfg.cameraRefreshSeconds * 1000);
  const count = cameras.length;
  const go = useCallback((step: number) => setIndex((i) => (i + step + count) % count), [count]);

  useEffect(() => {
    // الشمال = الجاية واليمين = اللي فاتت (زي باقي الداشبورد)؛ الأسهم مش بتقلب الصفحات وهي مفتوحة
    // Left = next, right = previous (like the rest of the dashboard); arrows never switch pages while open
    const onKey = (e: KeyboardEvent) => {
      const step = ["ArrowLeft", "ArrowDown", "PageDown"].includes(e.key) ? 1 : ["ArrowRight", "ArrowUp", "PageUp"].includes(e.key) ? -1 : 0;
      if (e.key === "Escape") onClose();
      else if (step) go(step);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  const camera = cameras[index];
  return (
    <div className="fixed inset-0 z-[60] bg-[#05080f] flex flex-col" role="dialog" aria-modal="true" aria-label={camera.name}>
      <div className="shrink-0 flex items-center gap-3 px-5 py-3">
        <Cctv size={26} style={{ color: ACCENT }} />
        <h2 className="text-white font-extrabold text-[24px] leading-[1.5]">{toEnglishDigits(camera.name)}</h2>
        <LiveTag online={camera.online} />
        <span dir="ltr" className="font-numbers text-gray-400 text-[16px]">
          {index + 1} / {count}
        </span>
        {preview && <span className="rounded-full bg-amber-400/15 border border-amber-400/50 text-amber-300 px-3 text-[13px] leading-[1.8] font-bold">معاينة</span>}
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="ms-auto p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
        >
          <X size={26} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 mx-5 rounded-2xl overflow-hidden border border-cardBorder bg-black">
        <CameraImage key={camera.id} camera={camera} index={index} tick={tick} preview={preview} fit="contain" />
        {/* اليمين = اللي فاتت، الشمال = الجاية - right = previous, left = next */}
        <button type="button" aria-label="الكاميرا اللي فاتت" onClick={() => go(-1)} className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-white/15 text-white hover:bg-black/80">
          <ChevronRight size={34} />
        </button>
        <button type="button" aria-label="الكاميرا الجاية" onClick={() => go(1)} className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-white/15 text-white hover:bg-black/80">
          <ChevronLeft size={34} />
        </button>
      </div>

      {/* صور صغيرة لكل الكاميرات - thumbnails of every camera */}
      <div className="shrink-0 flex items-stretch gap-2 px-5 py-3 overflow-x-auto">
        {cameras.map((cam, i) => (
          <button
            key={cam.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`relative shrink-0 w-[150px] h-[86px] rounded-xl overflow-hidden border-2 ${i === index ? "border-sky-400" : "border-cardBorder opacity-70 hover:opacity-100"}`}
          >
            <CameraImage camera={cam} index={i} tick={tick} preview={preview} compact />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pt-3 text-[12px] leading-[1.6] text-white font-semibold truncate text-start">
              {toEnglishDigits(cam.name)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function useTick(everyMs: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return tick;
}

// ===== آخر الأحداث - latest events =====
function EventRow({ event }: { event: ItEvent }) {
  const up = event.kind === "up";
  return (
    <div className="flex items-center gap-2 min-w-0 text-[14px] shrink-0" style={{ height: 30 }}>
      <span className="shrink-0 w-5 text-center" style={{ color: up ? GREEN : RED }}>
        {up ? "✓" : "⚠"}
      </span>
      <span className="truncate min-w-0 text-gray-200">
        {toEnglishDigits(event.targetName)} <span style={{ color: up ? GREEN : RED }}>{up ? "رجع" : "فصل"}</span>
      </span>
      <span className="ms-auto shrink-0 font-numbers text-gray-400 text-[13px]">{clock(event.at)}</span>
    </div>
  );
}

// ===== الصفحة - the page =====
export default function ItPage({ onOverlayChange }: { onOverlayChange?: (open: boolean) => void }) {
  const { data: status, error } = useSWR<ItStatus>("/api/it/status", fetcher, {
    refreshInterval: cfg.refreshSeconds * 1000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshWhenOffline: true,
    errorRetryInterval: 15_000,
  });
  const now = useNow(10_000);

  // البيانات الحقيقية دايما تكسب: لو وصلت مرة، التجريبي مبيرجعش تاني (حتى لو الطلب فشل بعدها)
  // Real data always wins: once it has arrived, the sample never comes back (even if a later request fails)
  const lastReal = useRef<ItSnapshot | null>(null);
  if (status?.data) lastReal.current = status.data;
  const real = status?.data ?? lastReal.current;
  const preview = !real && cfg.previewMode;
  const sampleNow = Math.floor(now / 15_000) * 15_000;
  const snapshot = useMemo<ItSnapshot | null>(() => real ?? (preview ? sampleItSnapshot(sampleNow) : null), [real, preview, sampleNow]);

  // الكاميرا الكبيرة بتتقلب كل cameraRotateSeconds (وبتقف والكاميرا مفتوحة صفحة كاملة)
  // The big camera rotates every cameraRotateSeconds (paused while a camera is open full-page)
  const cameras = snapshot?.cameras ?? [];
  const [cameraIndex, setCameraIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const tileTick = useTick(cfg.cameraRefreshSeconds * 1000);
  useEffect(() => {
    if (viewer !== null || cameras.length < 2) return;
    const timer = setInterval(() => setCameraIndex((i) => (i + 1) % cameras.length), cfg.cameraRotateSeconds * 1000);
    return () => clearInterval(timer);
  }, [viewer, cameras.length]);
  const openViewer = (index: number) => {
    setViewer(index);
    onOverlayChange?.(true);
  };
  const closeViewer = useCallback(() => {
    setViewer(null);
    onOverlayChange?.(false);
  }, [onOverlayChange]);

  // آخر الأحداث: عدد السطور على قد المكان (لحد eventsShown) - latest events: as many rows as fit (up to eventsShown)
  const eventsRef = useRef<HTMLDivElement>(null);
  const [eventsFit, setEventsFit] = useState<number>(cfg.eventsShown);
  useIsomorphicLayoutEffect(() => {
    const el = eventsRef.current;
    if (!el) return;
    const measure = () => setEventsFit(Math.max(1, Math.floor(el.clientHeight / 30)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const devices = snapshot?.devices ?? [];
  const routers = snapshot?.routers ?? [];
  const upCount = devices.filter((d) => d.up).length;
  const downCount = devices.length - upCount;
  const camera = cameras.length > 0 ? cameras[cameraIndex % cameras.length] : null;
  const internet = snapshot?.internet ?? null;
  const agentDown = !preview && !!real && status !== undefined && !status.agentOnline;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      {/* شريط المعاينة - the preview ribbon */}
      {preview && (
        <div
          className="shrink-0 rounded-xl border border-amber-400/60 px-4 flex items-center justify-center gap-2 text-amber-200 font-bold text-[16px] leading-[2.1]"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(251,191,36,0.20) 0 18px, rgba(251,191,36,0.10) 18px 36px)" }}
        >
          <TriangleAlert size={18} className="text-amber-300" />
          معاينة — بيانات تجريبية، لسه مش متربطة
        </div>
      )}

      {/* النت والإيجنت - internet and agent */}
      <div className="shrink-0 bg-card border border-cardBorder rounded-2xl px-4 py-2 flex items-center gap-4 min-w-0">
        <Globe size={24} style={{ color: ACCENT }} className="shrink-0" />
        {!internet ? (
          <span className="text-gray-400 font-bold text-[20px] leading-[1.6]">{snapshot ? "حالة النت مش معروفة" : "مستني الإيجنت…"}</span>
        ) : internet.up ? (
          <span className="flex items-center gap-2 font-extrabold text-[22px] leading-[1.6] text-statusGreen">
            <Dot up size={12} /> النت شغال ✓
            <span className="text-gray-400 font-semibold text-[15px]">من {duration(internet.since, now)}</span>
            {internet.latencyMs !== null && (
              <span className="text-[15px] font-semibold">
                <Ms value={internet.latencyMs} />
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-2 font-extrabold text-[22px] leading-[1.6] text-statusRed">
            <Dot up={false} size={12} pulse /> النت واقع من {duration(internet.since, now)}
          </span>
        )}
        <span className="ms-auto flex items-center gap-3 shrink-0 text-[15px]">
          {agentDown && (
            <span className="rounded-full border border-statusRed/60 bg-statusRed/10 text-statusRed px-3 leading-[1.9] font-bold">
              الإيجنت مش متصل من {duration(status?.receivedAt ?? null, now)}
            </span>
          )}
          {error && !real && !preview && <span className="text-statusRed font-bold">غير متصل</span>}
          <span className="text-gray-400">
            آخر تحديث من الإيجنت:{" "}
            <span className="font-numbers text-white font-bold">{preview ? "—" : clock(status?.receivedAt ?? null)}</span>
          </span>
        </span>
      </div>

      {!snapshot ? (
        <div className="flex-1 min-h-0 bg-card border border-cardBorder rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
          <Network size={48} className="text-gray-600" />
          <p className="text-gray-300 text-[22px] font-bold">لسه مفيش بيانات من إيجنت IT</p>
          <p className="text-gray-500 text-[16px]">أول ما الإيجنت على جهاز IT يبعت، الصفحة هتتملى لوحدها</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.25fr) minmax(0,1.2fr)", gridTemplateRows: "minmax(0,1fr)" }}>
          {/* الشبكات + آخر الأحداث - networks + latest events */}
          <div className="min-h-0 grid gap-3" style={{ gridTemplateRows: "minmax(0,2.2fr) minmax(0,1fr)" }}>
            <Section
              title="الشبكات"
              icon={Router}
              extra={
                <span className="text-[14px] text-gray-400 whitespace-nowrap">
                  <span className="text-statusGreen font-bold">{routers.filter((r) => r.up).length}</span> / {routers.length} شغال
                </span>
              }
            >
              <div className="flex-1 min-h-0 grid gap-2" style={{ gridTemplateRows: `repeat(${Math.max(routers.length, 1)}, minmax(0,1fr))` }}>
                {routers.length === 0 ? (
                  <p className="text-gray-500 text-[15px]">مفيش راوترات في البيانات</p>
                ) : (
                  routers.map((router) => <RouterCard key={router.id} router={router} now={now} />)
                )}
              </div>
            </Section>
            <Section title="آخر الأحداث" icon={TriangleAlert}>
              <div ref={eventsRef} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ contain: "size" }}>
                {(snapshot.events ?? []).length === 0 ? (
                  <p className="text-gray-500 text-[15px] leading-[30px]">مفيش أحداث</p>
                ) : (
                  snapshot.events.slice(0, Math.min(cfg.eventsShown, eventsFit)).map((event) => <EventRow key={event.id} event={event} />)
                )}
              </div>
            </Section>
          </div>

          {/* الأجهزة متجمعة بالنوع - devices grouped by type */}
          <Section
            title="الأجهزة"
            icon={Monitor}
            extra={
              <span className="rounded-full border border-cardBorder bg-background/70 px-3 text-[14px] leading-[1.9] whitespace-nowrap font-semibold">
                <span className="text-statusGreen">{formatNumber(upCount)} شغال</span>
                <span className="text-gray-500"> · </span>
                <span className={downCount ? "text-statusRed" : "text-gray-500"}>{formatNumber(downCount)} واقع</span>
              </span>
            }
          >
            <div className="flex-1 min-h-0 overflow-hidden" style={{ columnCount: 2, columnGap: 12, columnFill: "balance" }}>
              {DEVICE_GROUPS.map((group) => {
                const list = devices.filter((d) => d.type === group.type);
                if (list.length === 0) return null;
                const Icon = group.icon;
                const down = list.filter((d) => !d.up).length;
                return (
                  <div key={group.type} className="mb-2 rounded-xl border border-cardBorder bg-background/60 p-1.5" style={{ breakInside: "avoid" }}>
                    <div className="flex items-center gap-2 px-1 text-[14px] leading-[1.7]">
                      <Icon size={16} style={{ color: ACCENT }} className="shrink-0" />
                      <span className="font-bold text-gray-200">{group.label}</span>
                      <span className={`ms-auto font-numbers text-[13px] ${down ? "text-statusRed" : "text-gray-500"}`}>
                        {list.length - down}/{list.length}
                      </span>
                    </div>
                    {list.map((device) => (
                      <DeviceRow key={device.id} device={device} now={now} />
                    ))}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* الكاميرات - cameras */}
          <Section
            title="الكاميرات"
            icon={Cctv}
            extra={
              cameras.length > 0 && (
                <span className="text-[14px] text-gray-400 whitespace-nowrap">
                  <span className="text-statusGreen font-bold">{cameras.filter((c) => c.online !== false).length}</span> / {cameras.length} شغالة
                </span>
              )
            }
          >
            {camera ? (
              <>
                <button
                  type="button"
                  onClick={() => openViewer(cameraIndex % cameras.length)}
                  className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-cardBorder bg-black cursor-zoom-in"
                  aria-label={`افتح ${camera.name}`}
                >
                  <CameraImage key={camera.id} camera={camera} index={cameraIndex % cameras.length} tick={tileTick} preview={preview} />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2.5 bg-gradient-to-b from-black/70 to-transparent">
                    <LiveTag online={camera.online} />
                    <span dir="ltr" className="font-numbers text-[13px] text-gray-200 bg-black/50 rounded-full px-2 leading-[1.8]">
                      {(cameraIndex % cameras.length) + 1} / {cameras.length}
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 bg-gradient-to-t from-black/85 to-transparent text-start">
                    <p className="text-white font-extrabold text-[20px] leading-[1.6] truncate">{toEnglishDigits(camera.name)}</p>
                  </div>
                </button>
                {/* نقطة لكل كاميرا (الضغط يفتحها) - a dot per camera (click opens it) */}
                <div className="shrink-0 flex items-center justify-center gap-1.5 pt-2">
                  {cameras.map((cam, i) => (
                    <button
                      key={cam.id}
                      type="button"
                      aria-label={cam.name}
                      onClick={() => setCameraIndex(i)}
                      className="rounded-full transition-all"
                      style={{
                        width: i === cameraIndex % cameras.length ? 22 : 8,
                        height: 8,
                        backgroundColor: i === cameraIndex % cameras.length ? ACCENT : cam.online === false ? "#7f1d1d" : "#374151",
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-[15px]">مفيش كاميرات في البيانات</div>
            )}
          </Section>
        </div>
      )}

      {viewer !== null && cameras.length > 0 && <CameraViewer cameras={cameras} start={viewer} preview={preview} onClose={closeViewer} />}
    </div>
  );
}
