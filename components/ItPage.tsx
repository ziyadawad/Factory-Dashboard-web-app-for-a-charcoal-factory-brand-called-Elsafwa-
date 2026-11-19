"use client";

import { createContext, ReactNode, RefObject, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// صفحة IT والمراقبة: النت والشبكات والأجهزة من إيجنت IT في المصنع (عن طريق /api/it/status)، والكاميرات من الإيجنت
// المحلي على طول في المتصفح (مش من Vercel)
// The IT & monitoring page: internet, networks and devices from the factory IT agent (via /api/it/status); cameras come
// straight from the local agent in the browser (never through Vercel)

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

// مقاس عنصر (بيتحدث مع أي تغيير) - an element's size, kept up to date
function useSize(ref: RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// localStorage جوه try/catch (ممكن يبقى مقفول) - localStorage inside try/catch (it may be blocked)
function readStored<T>(key: string, valid: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // مش مهم - not important
  }
}

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

// جهاز من غير اسم: الإيجنت بيبعته "unknown 192.168.1.x" (الأسامي بتيجي من devices.json على جهاز IT)
// An unnamed device: the agent sends "unknown 192.168.1.x" (names come from devices.json on the IT PC)
function isUnnamed(name: string, ip: string): boolean {
  const n = name.trim();
  return !n || /^unknown\b/i.test(n) || n === ip;
}
const sortKey = (item: { name: string; ip: string }) => (isUnnamed(item.name, item.ip) ? `￿${item.ip}` : item.name);
// الواقع الأول، وبعدين بالاسم (اللي من غير اسم في الآخر) - down first, then by name (unnamed last)
const byStatusThenName = <T extends { up: boolean; name: string; ip: string }>(a: T, b: T) =>
  Number(a.up) - Number(b.up) || sortKey(a).localeCompare(sortKey(b), "ar", { numeric: true });

function NameLabel({ name, ip, up, hint = true }: { name: string; ip: string; up: boolean; hint?: boolean }) {
  if (isUnnamed(name, ip)) {
    return (
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`truncate min-w-0 ${up ? "text-gray-400" : "text-statusRed"}`}>
          جهاز{" "}
          <span dir="ltr" className="font-numbers tabular-nums">
            {ip}
          </span>
        </span>
        {hint && <NameHint />}
      </span>
    );
  }
  return <span className={`truncate min-w-0 ${up ? "text-white" : "text-statusRed"}`}>{toEnglishDigits(name)}</span>;
}

function NameHint() {
  return (
    <span
      className="shrink-0 rounded-md border border-dashed border-gray-600 px-1.5 text-[11px] leading-[1.5] text-gray-500 font-normal"
      title="اكتب اسمه في devices.json على جهاز IT"
    >
      سمّيه
    </span>
  );
}

// "unknown 192.168.1.x" في الأحداث = "جهاز 192.168.1.x" - in events too
const eventName = (name: string) => name.replace(/^unknown\s+/i, "جهاز ");

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
const ROUTER_ROW = 56; // ارتفاع سطر الراوتر - router row height
const ROUTER_GAP = 6;

function RouterRow({ router, now, compact }: { router: ItRouter; now: number; compact: boolean }) {
  const pct = router.uptimeTodayPct;
  const pctColor = pct === null ? "#374151" : pct >= 99 ? GREEN : pct >= 90 ? "#F59E0B" : RED;
  const unnamed = isUnnamed(router.name, router.ip);
  return (
    <div
      className={`relative rounded-xl border ps-3 pe-3 flex flex-col justify-center overflow-hidden ${router.up ? "border-cardBorder bg-background/70" : "border-statusRed/60 bg-statusRed/10"}`}
      style={{ height: ROUTER_ROW }}
    >
      <div className="flex items-center gap-2 min-w-0 text-[15px] leading-[22px] font-bold">
        <Dot up={router.up} pulse={!router.up} />
        {!compact && (router.kind === "ap" ? <Wifi size={15} className="text-gray-400 shrink-0" /> : <Router size={15} className="text-gray-400 shrink-0" />)}
        <NameLabel name={router.name} ip={router.ip} up={router.up} hint={!compact} />
        <span className="ms-auto shrink-0 text-[13px] font-semibold">
          <Ms value={router.latencyMs} />
        </span>
      </div>
      <div className={`flex items-center gap-1.5 min-w-0 leading-[18px] whitespace-nowrap ${compact ? "text-[11.5px] ps-[16px]" : "text-[12px] ps-[18px]"}`}>
        {!unnamed && <Ip value={router.ip} />}
        {unnamed && compact && <NameHint />}
        {(!unnamed || compact) && <span className="text-gray-600">·</span>}
        {router.internet === null ? (
          <span className="text-gray-500">نت؟</span>
        ) : router.internet ? (
          <span className="text-statusGreen font-semibold">{compact ? "نت ✓" : "فيه نت ✓"}</span>
        ) : (
          <span className="text-statusRed font-semibold">{compact ? "نت ✗" : "مفيش نت ✗"}</span>
        )}
        <span className={`ms-auto truncate min-w-0 ${router.up ? "text-gray-400" : "text-statusRed font-semibold"}`}>
          {compact ? (router.up ? "" : "واقع ") : router.up ? "شغال من " : "واقع من "}
          {duration(router.since, now, true)}
        </span>
      </div>
      {/* نسبة الشغل النهارده: شريط رفيع تحت - today's uptime: a thin bar at the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-cardBorder" title={pct === null ? undefined : `شغال ${formatNumber(pct)}% النهارده`}>
        <div className="h-full" style={{ width: `${pct ?? 0}%`, backgroundColor: pctColor }} />
      </div>
    </div>
  );
}

// سطر لكل راوتر: عمود واحد، ولو مش مكفي عمودين، ولو برضه مش مكفي scroll جوه الكارت بس
// One row per router: one column, two when they don't fit, and a scroll inside the card only as a last resort
function NetworksList({ routers, now }: { routers: ItRouter[]; now: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const fit = Math.max(1, Math.floor((h + ROUTER_GAP) / (ROUTER_ROW + ROUTER_GAP)));
  const cols = routers.length > fit ? 2 : 1;
  const rows = Math.ceil(routers.length / cols);
  const scroll = rows > fit;
  // عمود ضيق = سطر مختصر (من غير أيقونة، "نت ✓"، المدة بس) - a narrow column = a compact row
  const compact = (w - ROUTER_GAP * (cols - 1)) / cols < 300;
  return (
    <div ref={ref} className="flex-1 min-h-0" style={{ overflowY: scroll ? "auto" : "hidden" }}>
      {routers.length === 0 ? (
        <p className="text-gray-500 text-[15px]">مفيش راوترات في البيانات</p>
      ) : (
        <div
          className="grid"
          style={{
            gap: ROUTER_GAP,
            gridAutoFlow: "column",
            gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
            gridTemplateRows: `repeat(${rows}, ${ROUTER_ROW}px)`,
          }}
        >
          {routers.map((router) => (
            <RouterRow key={router.id} router={router} now={now} compact={compact} />
          ))}
        </div>
      )}
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
const DEVICE_ROW = 40;
const DEVICE_ROW_GAP = 2;
const GROUP_HEADER = 30;
const GROUP_SUMMARY = 28;
const GROUP_CHROME = 12 + 8; // padding + المسافة بين المجموعات - padding + gap between groups

function DeviceRow({ device, now }: { device: ItDevice; now: number }) {
  const unnamed = isUnnamed(device.name, device.ip);
  return (
    <div className={`rounded-lg px-2 flex flex-col justify-center ${device.up ? "" : "bg-statusRed/10 border border-statusRed/40"}`} style={{ height: DEVICE_ROW }}>
      <div className="flex items-center gap-2 min-w-0 text-[14px] leading-[19px] font-semibold">
        <Dot up={device.up} size={9} pulse={!device.up} />
        <NameLabel name={device.name} ip={device.ip} up={device.up} />
        <span className="ms-auto shrink-0 text-[12px] font-normal">
          <Ms value={device.latencyMs} />
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0 text-[11.5px] leading-[16px] ps-[17px] whitespace-nowrap">
        {!unnamed && <Ip value={device.ip} />}
        <span className={`ms-auto truncate min-w-0 ${device.up ? "text-gray-500" : "text-statusRed"}`}>
          {device.up ? `آخر ظهور: ${lastSeen(device, now)}` : `واقع من ${duration(device.since ?? device.lastSeen, now, true)}`}
        </span>
      </div>
    </div>
  );
}

type DeviceGroup = { type: ItDeviceType; label: string; icon: LucideIcon; list: ItDevice[]; down: number; unnamed: number };

function groupHeight(group: DeviceGroup, collapsed: boolean): number {
  const rows = collapsed ? group.down : group.list.length;
  const summary = collapsed && group.list.length > group.down ? GROUP_SUMMARY : 0;
  return GROUP_HEADER + rows * (DEVICE_ROW + DEVICE_ROW_GAP) + summary + GROUP_CHROME;
}

// توزيع المجموعات على الأعمدة: أطول مجموعة بتتقفل لعددها (والواقع بس يفضل ظاهر) لحد ما الكل يكفي
// Pack the groups into columns: the longest group collapses to its counts (down devices stay visible) until all fit
function planDevices(groups: DeviceGroup[], cols: number, height: number, manual: Record<string, boolean>) {
  const collapsed = new Set<ItDeviceType>(groups.filter((g) => manual[g.type] === false).map((g) => g.type));
  const pack = () => {
    const columns: DeviceGroup[][] = Array.from({ length: cols }, () => []);
    const heights = new Array(cols).fill(0);
    for (const group of groups) {
      const i = heights.indexOf(Math.min(...heights));
      columns[i].push(group);
      heights[i] += groupHeight(group, collapsed.has(group.type));
    }
    return { columns, tallest: Math.max(...heights) };
  };
  let plan = pack();
  while (height > 0 && plan.tallest > height) {
    const next = groups
      .filter((g) => !collapsed.has(g.type) && manual[g.type] !== true && g.list.length > g.down)
      .sort((a, b) => b.list.length - a.list.length)[0];
    if (!next) break;
    collapsed.add(next.type);
    plan = pack();
  }
  return { ...plan, collapsed, scroll: height > 0 && plan.tallest > height };
}

function DevicesList({ devices, now }: { devices: ItDevice[]; now: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  // الضغط على عنوان المجموعة بيفتحها / يقفلها - clicking a group header opens / collapses it
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const groups = useMemo<DeviceGroup[]>(
    () =>
      DEVICE_GROUPS.map((g) => {
        const list = devices.filter((d) => d.type === g.type).sort(byStatusThenName);
        return { ...g, list, down: list.filter((d) => !d.up).length, unnamed: list.filter((d) => isUnnamed(d.name, d.ip)).length };
      })
        .filter((g) => g.list.length > 0)
        // المجموعات اللي فيها واقع الأول - groups with a down device first
        .sort((a, b) => Number(b.down > 0) - Number(a.down > 0)),
    [devices]
  );
  const cols = w >= 470 ? 2 : 1;
  const plan = planDevices(groups, cols, h, manual);

  return (
    <div ref={ref} className="flex-1 min-h-0 flex gap-3 items-start" style={{ overflowY: plan.scroll ? "auto" : "hidden" }}>
      {groups.length === 0 && <p className="text-gray-500 text-[15px]">مفيش أجهزة في البيانات</p>}
      {plan.columns.map((column, ci) => (
        <div key={ci} className="flex-1 min-w-0 flex flex-col gap-2">
          {column.map((group) => {
            const collapsed = plan.collapsed.has(group.type);
            const Icon = group.icon;
            const shown = collapsed ? group.list.filter((d) => !d.up) : group.list;
            const upCount = group.list.length - group.down;
            return (
              <div key={group.type} className="rounded-xl border border-cardBorder bg-background/60 p-1.5">
                <button
                  type="button"
                  onClick={() => setManual((m) => ({ ...m, [group.type]: collapsed }))}
                  className="w-full flex items-center gap-2 px-1 text-[14px] text-start"
                  style={{ height: GROUP_HEADER - 4 }}
                >
                  <Icon size={16} style={{ color: ACCENT }} className="shrink-0" />
                  <span className="font-bold text-gray-200 truncate">{group.label}</span>
                  <span className="ms-auto shrink-0 font-numbers text-[13px]">
                    {group.down > 0 && <span className="text-statusRed font-bold">{formatNumber(group.down)} واقع · </span>}
                    <span className="text-gray-400">
                      {formatNumber(upCount)}/{formatNumber(group.list.length)}
                    </span>
                  </span>
                </button>
                <div className="flex flex-col" style={{ gap: DEVICE_ROW_GAP }}>
                  {shown.map((device) => (
                    <DeviceRow key={device.id} device={device} now={now} />
                  ))}
                </div>
                {collapsed && upCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 text-[12.5px] whitespace-nowrap min-w-0" style={{ height: GROUP_SUMMARY }}>
                    <Dot up size={8} />
                    <span className="text-gray-300 font-semibold">{formatNumber(upCount)} شغال</span>
                    {group.unnamed > 0 && (
                      <span className="text-gray-500 truncate min-w-0" title="سمّيهم في devices.json على جهاز IT">
                        · {formatNumber(group.unnamed)} من غير اسم
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ===== الكاميرات - cameras =====
// الكاميرات بتتحمل من المتصفح على طول من الإيجنت المحلي (مش من Vercel)، فبتشتغل جوه المصنع بس
// Cameras load in the browser straight from the local agent (never through Vercel), so they only work inside the factory
const CAMERA_BASE = cfg.cameraBaseUrl.trim().replace(/\/+$/, "");
const STREAM_BASE = (cfg.streamBaseUrl.trim() || cfg.cameraBaseUrl.trim()).replace(/\/+$/, "");
type StreamKind = "main" | "sub";

// main = الجودة الكاملة، sub = الـ sub-stream الصغير (قناة X02 على الـ NVR) للشبكة - main = full quality, sub = the small
// sub-stream (NVR channel X02) for the grid. The agent should answer ?stream=sub; if it ignores it, main still works
function snapshotUrl(camera: ItCamera, kind: StreamKind): string {
  return `${CAMERA_BASE}/cameras/${encodeURIComponent(camera.id)}/snapshot.jpg?${kind === "sub" ? "stream=sub&" : ""}t=${Date.now()}`;
}

// آخر صورة اتحملت لكل كاميرا: أي مربع جديد بيبدأ بيها على طول (من غير رمشة) - the last loaded frame per camera: a new
// tile starts with it immediately (no flicker)
const frameCache = new Map<string, string>();
function preloadSnapshot(camera: ItCamera, kind: StreamKind) {
  if (!CAMERA_BASE) return;
  const url = snapshotUrl(camera, kind);
  const image = new Image();
  image.onload = () => frameCache.set(`${camera.id}:${kind}`, url);
  image.src = url;
}

// {cameraBaseUrl}/cameras.json: مصفوفة أو { cameras: [...] }، كل كاميرا { id, name, nvr?, online?, stream? }
// {cameraBaseUrl}/cameras.json: an array or { cameras: [...] }, each camera { id, name, nvr?, online?, stream? }
async function fetchLocalCameras(url: string): Promise<ItCamera[]> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  const raw = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { cameras?: unknown }).cameras)
      ? (body as { cameras: unknown[] }).cameras
      : null;
  if (!raw) throw new Error("cameras.json has no camera list");
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .slice(0, 64)
    .map((c) => {
      const stream = str(c.stream, 64);
      return {
        id: str(c.id, 64),
        name: str(c.name),
        nvr: str(c.nvr ?? c.nvrName) || null,
        online: typeof c.online === "boolean" ? c.online : null,
        stream: /^[A-Za-z0-9_.-]+$/.test(stream) ? stream : null,
      };
    })
    .filter((c) => /^[A-Za-z0-9_-]+$/.test(c.id) && c.name);
}

// "loading" لحد أول رد، "ok" = الليستة الحقيقية، "unreachable" = مش جوه المصنع / الشهادة مش متسطبة / الإيجنت واقف
// "loading" until the first answer, "ok" = the real list, "unreachable" = outside the factory / CA not installed / agent down
type LocalCameras = { state: "loading" | "ok" | "unreachable"; cameras: ItCamera[] };
function useLocalCameras(): LocalCameras {
  const { data, error } = useSWR<ItCamera[]>(CAMERA_BASE ? `${CAMERA_BASE}/cameras.json` : null, fetchLocalCameras, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    errorRetryInterval: 15_000,
  });
  // آخر ليستة ناجحة بتفضل لو طلب واحد فشل - the last good list stays if a single request fails
  const lastGood = useRef<ItCamera[] | null>(null);
  if (data) lastGood.current = data;
  if (!CAMERA_BASE) return { state: "unreachable", cameras: [] };
  if (lastGood.current) return { state: "ok", cameras: lastGood.current };
  return { state: error ? "unreachable" : "loading", cameras: [] };
}

function CamerasUnreachable() {
  return (
    <div className="flex-1 min-h-0 rounded-xl border border-cardBorder flex flex-col items-center justify-center gap-2 text-center px-4 bg-[repeating-linear-gradient(135deg,#111827_0,#111827_14px,#0f1623_14px,#0f1623_28px)]">
      <Camera size={40} className="text-gray-600" />
      <p className="text-gray-300 font-bold text-[17px] leading-[1.6]">الكاميرات متاحة جوه المصنع بس</p>
      <p className="text-gray-500 text-[13px] leading-[1.6]">لو إنت جوه المصنع، اتأكد إن شهادة elsafwa-ca متسطّبة</p>
    </div>
  );
}

// الكاميرات اللي ورا الصفحة الكاملة بتقف (مش بتحمّل صور على الفاضي) - tiles behind the full-page viewer pause
const CamerasPaused = createContext(false);

// المربع ظاهر على الشاشة؟ - is the tile on screen?
function useInView(ref: RefObject<HTMLElement>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

// صورة بتتحدث كل everyMs: الجديدة بتتحمل في الخلفية وبتتبدل لما تخلص؛ الطلب الجاي بيبدأ بعد ما اللي قبله يخلص (مفيش
// طلبات متكومة)، وبيقف لو المربع مش ظاهر أو الشاشة مستخبية
// A snapshot refreshed every everyMs: the next one loads in the background and swaps in when ready; the next request
// starts only after the previous one finished (no pile-up), and it stops while the tile is hidden or the tab is hidden
function useSnapshot(camera: ItCamera, kind: StreamKind, everyMs: number, startDelayMs: number, active: boolean) {
  const key = `${camera.id}:${kind}`;
  const [frame, setFrame] = useState<{ key: string; src: string | null; failed: boolean }>(() => ({ key, src: frameCache.get(key) ?? null, failed: false }));
  const current = frame.key === key ? frame : { key, src: frameCache.get(key) ?? null, failed: false };

  useEffect(() => {
    if (!active || !CAMERA_BASE) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let image: HTMLImageElement | null = null;
    const load = () => {
      if (stopped) return;
      if (document.hidden) {
        timer = setTimeout(load, everyMs);
        return;
      }
      const url = snapshotUrl(camera, kind);
      image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (stopped) return;
        frameCache.set(key, url);
        setFrame({ key, src: url, failed: false });
        timer = setTimeout(load, everyMs);
      };
      image.onerror = () => {
        if (stopped) return;
        setFrame((f) => ({ key, src: f.key === key ? f.src : (frameCache.get(key) ?? null), failed: true }));
        timer = setTimeout(load, Math.max(everyMs * 2, 5000));
      };
      image.src = url;
    };
    timer = setTimeout(load, startDelayMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
    };
    // camera.id جوه key - camera.id is part of key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, everyMs, startDelayMs, active]);

  return current;
}

function Spinner({ size = 22 }: { size?: number }) {
  return <span className="inline-block rounded-full border-2 border-gray-600 border-t-sky-400 animate-spin" style={{ width: size, height: size }} />;
}

// الصورة نفسها: أول تحميل = دايرة صغيرة، بعد كده آخر صورة بتفضل لحد ما اللي بعدها تخلص
// The frame itself: a tiny spinner on the first load only, then the last frame stays until the next one is ready
function Frame({ src, failed, alt, fit = "cover", compact = false }: { src: string | null; failed: boolean; alt: string; fit?: "cover" | "contain"; compact?: boolean }) {
  if (src) return <img src={src} alt={alt} className={`absolute inset-0 w-full h-full ${fit === "cover" ? "object-cover" : "object-contain"}`} draggable={false} />;
  if (failed)
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-2 bg-[repeating-linear-gradient(135deg,#111827_0,#111827_14px,#0f1623_14px,#0f1623_28px)]">
        <Camera size={compact ? 16 : 34} className="text-gray-600" />
        {!compact && <p className="text-gray-400 font-semibold text-[14px] leading-[1.6]">الصورة مش متاحة دلوقتي</p>}
      </div>
    );
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b111c]">
      <Spinner size={compact ? 14 : 22} />
    </div>
  );
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

const nvrLabel = (nvr: string) => toEnglishDigits(cfg.nvrLabels[nvr] ?? nvr);

// مربع كاميرا (في الشبكة أو الصور الصغيرة) - a camera tile (grid or thumbnails)
function CameraTile({
  camera,
  kind,
  everyMs,
  delayMs,
  onOpen,
  size = "grid",
  selected = false,
}: {
  camera: ItCamera;
  kind: StreamKind;
  everyMs: number;
  delayMs: number;
  onOpen: () => void;
  size?: "single" | "grid" | "thumb";
  selected?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const inView = useInView(ref);
  const paused = useContext(CamerasPaused);
  const frame = useSnapshot(camera, kind, everyMs, delayMs, inView && !paused);
  const single = size === "single";
  const thumb = size === "thumb";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={`افتح ${camera.name}`}
      className={`relative min-h-0 min-w-0 overflow-hidden bg-black cursor-zoom-in ${thumb ? `rounded-xl border-2 ${selected ? "border-sky-400" : "border-cardBorder opacity-70 hover:opacity-100"}` : "rounded-lg border border-cardBorder"} ${single ? "flex-1 rounded-xl" : ""} ${thumb ? "w-full h-full" : ""}`}
    >
      <Frame src={frame.src} failed={frame.failed} alt={camera.name} compact={!single} />
      {single && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-2.5 bg-gradient-to-b from-black/70 to-transparent">
          <LiveTag online={camera.online} />
        </div>
      )}
      {!single && camera.online === false && (
        <span className="absolute top-1.5 right-1.5">
          <Dot up={false} size={8} />
        </span>
      )}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent text-start ${single ? "px-3 pb-2 pt-8" : "px-1.5 pb-0.5 pt-4"}`}>
        <p className={`text-white truncate ${single ? "font-extrabold text-[20px] leading-[1.6]" : "font-semibold text-[12px] leading-[1.6]"}`}>{toEnglishDigits(camera.name)}</p>
        {single && camera.nvr && <p className="text-gray-300 text-[13px] leading-[1.5] truncate">{nvrLabel(camera.nvr)}</p>}
      </div>
    </button>
  );
}

// أحسن عدد أعمدة: المربعات تبقى أقرب لـ 16:9 وأكبر ما يمكن - the best column count: tiles as large as possible at 16:9
function bestGrid(n: number, w: number, h: number) {
  let best = { cols: 1, rows: n, score: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tw = w / cols;
    const th = h / rows;
    const fitW = Math.min(tw, (th * 16) / 9);
    const score = fitW * ((fitW * 9) / 16) - (cols * rows - n) * 0.01;
    if (score > best.score) best = { cols, rows, score };
  }
  return best;
}

const isLayout = (v: unknown): v is number => typeof v === "number" && cfg.cameraLayouts.includes(v);
const isString = (v: unknown): v is string => typeof v === "string";
const LAYOUT_KEY = "elsafwa:it:cameraLayout";
const NVR_KEY = "elsafwa:it:cameraNvr";

function CamerasPanel({ cameras, onOpen }: { cameras: ItCamera[]; onOpen: (list: ItCamera[], index: number) => void }) {
  const paused = useContext(CamerasPaused);
  const [layout, setLayoutState] = useState<number>(cfg.defaultCameraLayout);
  const [nvr, setNvrState] = useState<string>("");
  useEffect(() => {
    setLayoutState(readStored(LAYOUT_KEY, isLayout, cfg.defaultCameraLayout));
    setNvrState(readStored(NVR_KEY, isString, ""));
  }, []);
  const setLayout = (value: number) => {
    setLayoutState(value);
    setPage(0);
    writeStored(LAYOUT_KEY, value);
  };
  const setNvr = (value: string) => {
    setNvrState(value);
    setPage(0);
    writeStored(NVR_KEY, value);
  };

  const nvrs = useMemo(() => Array.from(new Set(cameras.map((c) => c.nvr).filter((v): v is string => !!v))), [cameras]);
  const activeNvr = nvrs.includes(nvr) ? nvr : "";
  const list = useMemo(() => (activeNvr ? cameras.filter((c) => c.nvr === activeNvr) : cameras), [cameras, activeNvr]);

  const perPage = layout;
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const [page, setPage] = useState(0);
  const current = page % pages;
  const shown = list.slice(current * perPage, current * perPage + perPage);
  const go = useCallback((step: number) => setPage((p) => (((p + step) % pages) + pages) % pages), [pages]);

  // التقليب التلقائي (بيبدأ من الأول بعد أي ضغطة، وبيقف والصفحة الكاملة مفتوحة)
  // Auto-rotation (restarts after any manual change, paused while the full page is open)
  useEffect(() => {
    if (paused || pages < 2) return;
    const seconds = layout === 1 ? cfg.cameraRotateSeconds : cfg.cameraPageSeconds;
    const timer = setTimeout(() => go(1), seconds * 1000);
    return () => clearTimeout(timer);
  }, [paused, pages, layout, current, go]);

  // كاميرا واحدة: الصورة الجاية بتتحمل من بدري عشان التقليب يبقى فوري - single: preload the next camera for an instant switch
  useEffect(() => {
    if (layout !== 1 || pages < 2 || paused) return;
    const next = list[(current + 1) % list.length];
    const timer = setTimeout(() => preloadSnapshot(next, "main"), Math.max(0, cfg.cameraRotateSeconds - 2) * 1000);
    return () => clearTimeout(timer);
  }, [layout, pages, paused, list, current]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(bodyRef);
  const cells = pages > 1 ? perPage : shown.length;
  const grid = bestGrid(Math.max(1, cells), w || 16, h || 9);
  const gridMs = cfg.gridRefreshSeconds * 1000;

  return (
    <>
      {/* الفلتر بالـ NVR وطريقة العرض - NVR filter and layout */}
      <div className="shrink-0 flex items-center gap-2 mb-2 min-w-0">
        {nvrs.length > 1 && (
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {[{ id: "", label: "الكل" }, ...nvrs.map((n) => ({ id: n, label: nvrLabel(n) }))].map((chip) => (
              <button
                key={chip.id || "all"}
                type="button"
                onClick={() => setNvr(chip.id)}
                className={`shrink-0 rounded-full border px-2.5 text-[13px] leading-[1.9] whitespace-nowrap ${
                  activeNvr === chip.id ? "border-sky-400 bg-sky-400/15 text-sky-200 font-bold" : "border-cardBorder text-gray-400 hover:text-gray-200"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
        <div className="ms-auto shrink-0 flex items-center rounded-lg border border-cardBorder overflow-hidden" dir="ltr" aria-label="طريقة العرض">
          {cfg.cameraLayouts.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLayout(n)}
              aria-pressed={layout === n}
              className={`font-numbers text-[13px] leading-[1.9] px-2 min-w-[28px] ${layout === n ? "bg-sky-400/20 text-sky-200 font-bold" : "text-gray-400 hover:text-gray-200"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div ref={bodyRef} className="relative flex-1 min-h-0 flex flex-col">
        {list.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-[15px]">مفيش كاميرات</div>
        ) : layout === 1 ? (
          <CameraTile
            key={shown[0].id}
            camera={shown[0]}
            kind="main"
            everyMs={cfg.cameraRefreshSeconds * 1000}
            delayMs={0}
            size="single"
            onOpen={() => onOpen(list, current)}
          />
        ) : (
          <div
            className="flex-1 min-h-0 grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0,1fr))` }}
          >
            {shown.map((camera, i) => (
              <CameraTile
                key={camera.id}
                camera={camera}
                kind="sub"
                everyMs={gridMs}
                // متوزعة على مدة التحديث، مش كلها في نفس اللحظة - spread over the refresh period, not all at once
                delayMs={frameCache.has(`${camera.id}:sub`) ? Math.round((i * gridMs) / shown.length) : i * 120}
                onOpen={() => onOpen(list, current * perPage + i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ◀ ▶ والنقط - arrows and dots */}
      {pages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-2 pt-2">
          <button type="button" aria-label="اللي فاتت" onClick={() => go(-1)} className="p-0.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10">
            <ChevronRight size={20} />
          </button>
          {pages <= 16 ? (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`صفحة ${i + 1}`}
                  onClick={() => setPage(i)}
                  className="rounded-full transition-all"
                  style={{ width: i === current ? 22 : 8, height: 8, backgroundColor: i === current ? ACCENT : "#374151" }}
                />
              ))}
            </div>
          ) : (
            <span dir="ltr" className="font-numbers text-[13px] text-gray-300">
              {current + 1} / {pages}
            </span>
          )}
          <button type="button" aria-label="الجاية" onClick={() => go(1)} className="p-0.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10">
            <ChevronLeft size={20} />
          </button>
        </div>
      )}
    </>
  );
}

// ===== الفيديو المباشر (go2rtc) - live video (go2rtc) =====
type LiveMode = "connecting" | "webrtc" | "mse" | "snapshot";
const MSE_CODECS = ["avc1.640029", "avc1.64002A", "avc1.640033", "hvc1.1.6.L153.B0", "mp4a.40.2", "mp4a.40.5", "flac", "opus"];

function resetVideo(video: HTMLVideoElement) {
  video.pause();
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
}

// بيستنى أول فريم يشتغل - waits for the first frame to play
function waitPlaying(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const done = () => {
      video.removeEventListener("playing", done);
      signal.removeEventListener("abort", fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener("playing", done);
      reject(new Error("aborted"));
    };
    video.addEventListener("playing", done);
    signal.addEventListener("abort", fail, { once: true });
  });
}

// WebRTC بطريقة WHEP: POST {streamBase}/api/webrtc?src=… بالـ SDP، والرد SDP - WebRTC via WHEP-style POST of the SDP offer
async function startWebRtc(video: HTMLVideoElement, src: string, signal: AbortSignal, onDead: () => void) {
  if (typeof RTCPeerConnection === "undefined") throw new Error("no WebRTC");
  const pc = new RTCPeerConnection({ iceServers: [] });
  signal.addEventListener("abort", () => pc.close(), { once: true });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if ((pc.connectionState === "failed" || pc.connectionState === "closed") && !signal.aborted) onDead();
  };
  await pc.setLocalDescription(await pc.createOffer());
  // شبكة محلية: الـ ICE بيخلص بسرعة - a local network: ICE gathering finishes fast
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(resolve, 1500);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const res = await fetch(`${STREAM_BASE}/api/webrtc?src=${encodeURIComponent(src)}`, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? "",
    signal,
  });
  if (!res.ok) throw new Error(`webrtc HTTP ${res.status}`);
  let answer = await res.text();
  if (answer.trim().startsWith("{")) answer = (JSON.parse(answer) as { sdp: string }).sdp;
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
}

// MSE عن طريق websocket بتاع go2rtc: {streamBase}/api/ws?src=… - MSE over the go2rtc websocket
async function startMse(video: HTMLVideoElement, src: string, signal: AbortSignal, onDead: () => void) {
  if (typeof MediaSource === "undefined" || typeof WebSocket === "undefined") throw new Error("no MSE");
  const codecs = MSE_CODECS.filter((c) => MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`)).join(",");
  const ms = new MediaSource();
  const objectUrl = URL.createObjectURL(ms);
  video.srcObject = null;
  video.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    ms.addEventListener("sourceopen", () => resolve(), { once: true });
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const ws = new WebSocket(`${STREAM_BASE.replace(/^http/, "ws")}/api/ws?src=${encodeURIComponent(src)}`);
  ws.binaryType = "arraybuffer";
  signal.addEventListener(
    "abort",
    () => {
      ws.close();
      URL.revokeObjectURL(objectUrl);
    },
    { once: true }
  );
  let buffer: SourceBuffer | null = null;
  const queue: ArrayBuffer[] = [];
  const pump = () => {
    if (!buffer || buffer.updating) return;
    try {
      // نفضل جنب اللحظة الحالية ونمسح القديم - stay at the live edge and trim old data
      if (buffer.buffered.length) {
        const start = buffer.buffered.start(0);
        const end = buffer.buffered.end(buffer.buffered.length - 1);
        if (end - start > 30) {
          buffer.remove(start, end - 10);
          return;
        }
        if (end - video.currentTime > 3) video.currentTime = end - 0.5;
      }
      const next = queue.shift();
      if (next) buffer.appendBuffer(next);
    } catch {
      if (!signal.aborted) onDead();
    }
  };
  ws.onopen = () => ws.send(JSON.stringify({ type: "mse", value: codecs }));
  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data) as { type: string; value: string };
      if (message.type === "mse" && !buffer) {
        buffer = ms.addSourceBuffer(message.value);
        buffer.mode = "segments";
        buffer.addEventListener("updateend", pump);
        video.play().catch(() => {});
      } else if (message.type === "error" && !signal.aborted) onDead();
    } else {
      queue.push(event.data as ArrayBuffer);
      pump();
    }
  };
  ws.onclose = () => {
    if (!signal.aborted) onDead();
  };
}

// الكاميرا في الصفحة الكاملة: فيديو مباشر (WebRTC ثم MSE)، ولو فشل صورة كل viewerSnapshotSeconds. الصورة بتظهر لحد ما
// الفيديو يشتغل فعلا
// The full-page camera: live video (WebRTC, then MSE); on failure a snapshot every viewerSnapshotSeconds. Snapshots show
// until the video actually plays
function LiveView({ camera }: { camera: ItCamera }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canStream = cfg.liveVideo && !!STREAM_BASE;
  const [mode, setMode] = useState<LiveMode>(canStream ? "connecting" : "snapshot");
  const playing = mode === "webrtc" || mode === "mse";
  const frame = useSnapshot(camera, "main", cfg.viewerSnapshotSeconds * 1000, 0, !playing);

  useEffect(() => {
    const video = videoRef.current;
    if (!canStream || !video) return;
    let cancelled = false;
    let attempt: AbortController | null = null;
    let live = false;
    const onDead = () => {
      // لو الفيديو وقع بعد ما اشتغل، نرجع للصور - if the video dies after it worked, fall back to snapshots
      if (live && !cancelled) {
        live = false;
        attempt?.abort();
        resetVideo(video);
        setMode("snapshot");
      }
    };
    setMode("connecting");
    (async () => {
      const src = camera.stream || camera.id;
      for (const [name, start] of [
        ["webrtc", startWebRtc],
        ["mse", startMse],
      ] as const) {
        if (cancelled) return;
        attempt = new AbortController();
        const timer = setTimeout(() => attempt?.abort(), 8000);
        try {
          const playingPromise = waitPlaying(video, attempt.signal);
          await start(video, src, attempt.signal, onDead);
          await playingPromise;
          clearTimeout(timer);
          if (cancelled) return;
          live = true;
          setMode(name);
          return;
        } catch {
          clearTimeout(timer);
          attempt.abort();
          resetVideo(video);
        }
      }
      if (!cancelled) setMode("snapshot");
    })();
    return () => {
      cancelled = true;
      attempt?.abort();
      resetVideo(video);
    };
  }, [camera.id, camera.stream, canStream]);

  const badge =
    mode === "webrtc" ? "فيديو مباشر" : mode === "mse" ? "فيديو مباشر (MSE)" : mode === "connecting" ? "بيوصل للفيديو…" : `صورة كل ${formatNumber(cfg.viewerSnapshotSeconds)} ث`;
  return (
    <>
      {!playing && <Frame src={frame.src} failed={frame.failed} alt={camera.name} fit="contain" />}
      <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 w-full h-full object-contain" style={{ opacity: playing ? 1 : 0 }} />
      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-[12px] leading-[1.8] text-gray-300">
        {mode === "connecting" && <Spinner size={10} />}
        {badge}
      </span>
    </>
  );
}

// الكاميرا في صفحة كاملة: ◀ ▶ والأسهم للتنقل، صور صغيرة تحت، Esc يقفل
// A camera filling the page: ◀ ▶ and arrow keys to switch, a thumbnail strip, Esc closes
function CameraViewer({ cameras, start, onClose }: { cameras: ItCamera[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
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

  // الصورة المختارة في الصور الصغيرة تفضل ظاهرة - keep the selected thumbnail in view
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  const camera = cameras[Math.min(index, count - 1)];
  if (!camera) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-[#05080f] flex flex-col" role="dialog" aria-modal="true" aria-label={camera.name}>
      <div className="shrink-0 flex items-center gap-3 px-5 py-3">
        <Cctv size={26} style={{ color: ACCENT }} />
        <h2 className="text-white font-extrabold text-[24px] leading-[1.5]">{toEnglishDigits(camera.name)}</h2>
        {camera.nvr && <span className="text-gray-400 text-[15px]">{nvrLabel(camera.nvr)}</span>}
        <LiveTag online={camera.online} />
        <span dir="ltr" className="font-numbers text-gray-400 text-[16px]">
          {index + 1} / {count}
        </span>
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
        <LiveView key={camera.id} camera={camera} />
        {/* اليمين = اللي فاتت، الشمال = الجاية - right = previous, left = next */}
        <button type="button" aria-label="الكاميرا اللي فاتت" onClick={() => go(-1)} className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-white/15 text-white hover:bg-black/80">
          <ChevronRight size={34} />
        </button>
        <button type="button" aria-label="الكاميرا الجاية" onClick={() => go(1)} className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-white/15 text-white hover:bg-black/80">
          <ChevronLeft size={34} />
        </button>
      </div>

      {/* صور صغيرة (sub-stream) للكاميرات اللي ظاهرة بس - thumbnails (sub-stream), only the visible ones load */}
      <div ref={stripRef} className="shrink-0 flex items-stretch gap-2 px-5 py-3 overflow-x-auto">
        {cameras.map((cam, i) => (
          <div key={cam.id} className="shrink-0 w-[150px] h-[86px] flex">
            <CameraTile
              camera={cam}
              kind="sub"
              everyMs={cfg.gridRefreshSeconds * 1000}
              delayMs={Math.round((i * cfg.gridRefreshSeconds * 1000) / Math.max(1, count))}
              size="thumb"
              selected={i === index}
              onOpen={() => setIndex(i)}
            />
          </div>
        ))}
      </div>
    </div>
  );
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
        {toEnglishDigits(eventName(event.targetName))} <span style={{ color: up ? GREEN : RED }}>{up ? "رجع" : "فصل"}</span>
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

  // آخر بيانات وصلت بتفضل لو طلب فشل - the last data stays if a request fails
  const lastReal = useRef<ItSnapshot | null>(null);
  if (status?.data) lastReal.current = status.data;
  const snapshot = status?.data ?? lastReal.current;

  const local = useLocalCameras();
  const [viewer, setViewer] = useState<{ list: ItCamera[]; index: number } | null>(null);
  const openViewer = useCallback(
    (list: ItCamera[], index: number) => {
      setViewer({ list, index });
      onOverlayChange?.(true);
    },
    [onOverlayChange]
  );
  const closeViewer = useCallback(() => {
    setViewer(null);
    onOverlayChange?.(false);
  }, [onOverlayChange]);

  // آخر الأحداث: عدد السطور على قد المكان (لحد eventsShown) - latest events: as many rows as fit (up to eventsShown)
  const eventsRef = useRef<HTMLDivElement>(null);
  const eventsSize = useSize(eventsRef);
  const eventsFit = Math.max(1, Math.floor(eventsSize.h / 30));

  const devices = snapshot?.devices ?? [];
  const routers = useMemo(() => [...(snapshot?.routers ?? [])].sort(byStatusThenName), [snapshot]);
  const upCount = devices.filter((d) => d.up).length;
  const downCount = devices.length - upCount;
  const internet = snapshot?.internet ?? null;
  // الإيجنت مبعتش من دقيقتين = "الإيجنت مش متصل" - no update for agentOfflineSeconds = agent offline
  const agentDown = !!snapshot && status !== undefined && !status.agentOnline;
  const cameras = local.cameras;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
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
          {error && !snapshot && <span className="text-statusRed font-bold">غير متصل</span>}
          <span className="text-gray-400">
            آخر تحديث من الإيجنت: <span className="font-numbers text-white font-bold">{clock(status?.receivedAt ?? null)}</span>
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0 grid gap-3" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr) minmax(0,1.2fr)", gridTemplateRows: "minmax(0,1fr)" }}>
        {/* الشبكات (العمود كله) - networks (the whole column) */}
        <Section
          title="الشبكات"
          icon={Router}
          extra={
            routers.length > 0 && (
              <span className="text-[14px] text-gray-400 whitespace-nowrap">
                <span className={routers.some((r) => !r.up) ? "text-statusRed font-bold" : "text-statusGreen font-bold"}>{routers.filter((r) => r.up).length}</span> /{" "}
                {routers.length} شغال
              </span>
            )
          }
        >
          {snapshot ? <NetworksList routers={routers} now={now} /> : <WaitingForAgent />}
        </Section>

        {/* الأجهزة + آخر الأحداث - devices + latest events */}
        <div className="min-h-0 min-w-0 grid gap-3" style={{ gridTemplateRows: "minmax(0,2.3fr) minmax(0,1fr)" }}>
          <Section
            title="الأجهزة"
            icon={Monitor}
            extra={
              devices.length > 0 && (
                <span className="rounded-full border border-cardBorder bg-background/70 px-3 text-[14px] leading-[1.9] whitespace-nowrap font-semibold">
                  <span className="text-statusGreen">{formatNumber(upCount)} شغال</span>
                  <span className="text-gray-500"> · </span>
                  <span className={downCount ? "text-statusRed" : "text-gray-500"}>{formatNumber(downCount)} واقع</span>
                </span>
              )
            }
          >
            {snapshot ? <DevicesList devices={devices} now={now} /> : <WaitingForAgent />}
          </Section>
          <Section title="آخر الأحداث" icon={TriangleAlert}>
            <div ref={eventsRef} className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ contain: "size" }}>
              {(snapshot?.events ?? []).length === 0 ? (
                <p className="text-gray-500 text-[15px] leading-[30px]">مفيش أحداث</p>
              ) : (
                snapshot!.events.slice(0, Math.min(cfg.eventsShown, eventsFit)).map((event) => <EventRow key={event.id} event={event} />)
              )}
            </div>
          </Section>
        </div>

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
          {local.state === "ok" ? (
            <CamerasPaused.Provider value={viewer !== null}>
              <CamerasPanel cameras={cameras} onOpen={openViewer} />
            </CamerasPaused.Provider>
          ) : local.state === "unreachable" ? (
            <CamerasUnreachable />
          ) : (
            <div className="flex-1 flex items-center justify-center gap-2 text-gray-500 text-[15px]">
              <Spinner size={16} /> بيدوّر على الكاميرات…
            </div>
          )}
        </Section>
      </div>

      {viewer !== null && viewer.list.length > 0 && <CameraViewer cameras={viewer.list} start={viewer.index} onClose={closeViewer} />}
    </div>
  );
}

function WaitingForAgent() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
      <Network size={36} className="text-gray-600" />
      <p className="text-gray-400 text-[15px] font-semibold">لسه مفيش بيانات من إيجنت IT</p>
    </div>
  );
}
