// حاجات مشتركة لصفحة الواتساب: الطلبات، الوقت بتوقيت القاهرة، ألوان الجروبات والراسلين، وآخر زيارة لكل جروب
// Shared bits of the WhatsApp page: requests, Cairo time, group / sender colors, and each group's last visit

import { dashboardConfig } from "@/config/dashboard.config";
import { WaGroup, WaMessage } from "@/lib/types";
import { formatTime12 } from "@/lib/format";
import { normalizeName } from "@/lib/wa-sections";

const cfg = dashboardConfig.whatsapp;

export class WaFetchError extends Error {
  constructor(message: string, readonly setup = false) {
    super(message);
  }
}

// 401 = الدخول خلص: نرجع لشاشة الدخول - 401 = the login expired: back to the login screen
export async function waFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new WaFetchError("login required");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; setup?: boolean };
  if (!res.ok) throw new WaFetchError(body.error ?? `HTTP ${res.status}`, body.setup === true);
  return body;
}

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabelFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric" });

// الساعة بـ ص / م (lib/format) - the time with ص / م (lib/format)
export const cairoTime = (iso: string) => formatTime12(iso);
export const cairoDay = (iso: string) => dayKeyFmt.format(new Date(iso));

// "النهارده" / "امبارح" / "الأحد 22 نوفمبر 2026" - a day separator label
export function dayLabel(iso: string): string {
  const day = cairoDay(iso);
  const today = cairoDay(new Date().toISOString());
  const yesterday = cairoDay(new Date(Date.now() - 86_400_000).toISOString());
  if (day === today) return "النهارده";
  if (day === yesterday) return "امبارح";
  return dayLabelFmt.format(new Date(iso));
}

// وقت آخر رسالة في كارت الجروب: الساعة لو النهارده، "امبارح"، وإلا التاريخ - the block's last time
export function shortWhen(iso: string | null): string {
  if (!iso) return "";
  const day = cairoDay(iso);
  if (day === cairoDay(new Date().toISOString())) return cairoTime(iso);
  if (day === cairoDay(new Date(Date.now() - 86_400_000).toISOString())) return "امبارح";
  return shortDayFmt.format(new Date(iso));
}

// "من 3 دقايق" - minutes since
export function minutesSince(iso: string | null, now = Date.now()): number | null {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : null;
}

// ===== الألوان - colors =====
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}
// لون الجروب: من groupColors بالاسم أو الـ id، وإلا ثابت من colors - the group color (config, else a stable pick)
export function groupColor(g: Pick<WaGroup, "id" | "name">): string {
  return cfg.groupColors[g.name] ?? cfg.groupColors[g.id] ?? cfg.colors[hash(g.id) % cfg.colors.length];
}
const SENDER_COLORS = ["#34D399", "#60A5FA", "#F472B6", "#FBBF24", "#A78BFA", "#F87171", "#2DD4BF", "#FB923C", "#A3E635", "#38BDF8"];
export const senderColor = (name: string) => SENDER_COLORS[hash(name) % SENDER_COLORS.length];

// ترتيب الجروب المتثبت في عمود قسمه (whatsapp.pinned[sectionId])، أو Infinity لو مش متثبت
// A group's pinned position in its section column (whatsapp.pinned[sectionId]), or Infinity when not pinned
export function pinIndex(g: Pick<WaGroup, "id" | "name">, sectionId: string): number {
  const list = cfg.pinned[sectionId] ?? [];
  const name = normalizeName(g.name);
  const i = list.findIndex((p) => p === g.id || p === g.name || normalizeName(p) === name);
  return i < 0 ? Infinity : i;
}

// "2.3 رسالة/يوم" - messages per day
export function perDayText(n: number): string {
  if (!n) return "0 رسالة/يوم";
  if (n < 0.1) return "أقل من 0.1 رسالة/يوم";
  return `${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")} رسالة/يوم`;
}

// معاينة رسالة من غير نص - a preview for a message without text
export function typePreview(type: WaMessage["type"] | null): string {
  switch (type) {
    case "image":
      return "📷 صورة";
    case "video":
      return "🎬 فيديو";
    case "audio":
      return "🎵 صوت";
    case "voice":
      return "🎤 رسالة صوتية";
    case "document":
      return "📄 ملف";
    case "sticker":
      return "🙂 ستيكر";
    default:
      return "";
  }
}

// جروب من كارت الـ spotlight (id واسم وصورة بس) لشكل WaGroup - a spotlight card's group (id, name, picture) as a WaGroup
export const asWaGroup = (g: Pick<WaGroup, "id" | "name" | "pictureId">): WaGroup => ({
  ...g,
  participants: null,
  lastAt: null,
  lastSender: null,
  lastText: null,
  lastType: null,
  lastMediaId: null,
  unread: 0,
  perDay: 0,
});

export const mediaUrl = (id: string, download = false) => `/api/wa/media/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;

export function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ===== آخر زيارة لكل جروب (في المتصفح) - each group's last visit (in this browser) =====
const SEEN_KEY = "elsafwa:wa:seen";
const BASE_KEY = "elsafwa:wa:baseline";
export function loadSeen(): { seen: Record<string, string>; baseline: string } {
  let seen: Record<string, string> = {};
  let baseline = new Date().toISOString();
  try {
    seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>;
    const stored = window.localStorage.getItem(BASE_KEY);
    // أول مرة الصفحة تتفتح على الجهاز ده: من دلوقتي - the first visit on this device: from now on
    if (stored) baseline = stored;
    else window.localStorage.setItem(BASE_KEY, baseline);
  } catch {}
  return { seen, baseline };
}
export function markSeen(groupId: string): Record<string, string> {
  const { seen } = loadSeen();
  seen[groupId] = new Date().toISOString();
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {}
  return seen;
}

// علامة كل الجروبات كمقروءة مرة واحدة - mark all groups as read at once
export function markAllSeen(groupIds: string[]): Record<string, string> {
  const { seen } = loadSeen();
  const now = new Date().toISOString();
  for (const id of groupIds) {
    seen[id] = now;
  }
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {}
  return seen;
}
