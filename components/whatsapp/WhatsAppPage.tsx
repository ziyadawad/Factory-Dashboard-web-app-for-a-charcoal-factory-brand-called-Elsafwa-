"use client";

// الصفحة 7 "واتساب": جروبات الواتساب قراية بس (مفيش كتابة ولا إرسال خالص). كروت الجروبات بآخر نشاط، والضغط على كارت
// بيفتح الشات صفحة كاملة. بتسأل بس والصفحة ظاهرة (كل whatsapp.gridRefreshSeconds)، ووقف خالص في الخلفية
// Page 7 "واتساب": read-only WhatsApp groups (no typing or sending anywhere). Group blocks by last activity; a block
// opens the chat full page. Polls only while the page is visible (every whatsapp.gridRefreshSeconds)

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, RefreshCw, Users } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePolling } from "@/lib/usePolling";
import { WaGroup, WaGroupsResponse } from "@/lib/types";
import WhatsAppChat from "./WhatsAppChat";
import { sectionOf } from "@/lib/wa-sections";
import {
  cairoTime,
  groupColor,
  loadSeen,
  markSeen,
  mediaUrl,
  minutesSince,
  perDayText,
  shortWhen,
  sortGroups,
  typePreview,
  waFetch,
  WaFetchError,
} from "./wa-common";

const cfg = dashboardConfig.whatsapp;

// شارة "قراية بس" - the read-only badge
export function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-0.5 text-[13px] font-bold text-sky-300 whitespace-nowrap">
      <Eye size={14} /> قراية بس
    </span>
  );
}

// "آخر مزامنة من كمبيوتر الـ IT: 14:05" وتحذير لو عدى staleSyncMinutes - the last sync, with a warning when stale
export function SyncStatus({ lastSyncAt }: { lastSyncAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = minutesSince(lastSyncAt, now);
  const stale = minutes === null || minutes >= cfg.staleSyncMinutes;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[14px] whitespace-nowrap ${stale ? "text-statusAmber font-bold" : "text-gray-400"}`}>
      {stale ? <AlertTriangle size={16} /> : <RefreshCw size={14} />}
      {lastSyncAt ? <>آخر مزامنة من كمبيوتر الـ IT: <span className="font-numbers">{cairoTime(lastSyncAt)}</span></> : "لسه مفيش مزامنة من كمبيوتر الـ IT"}
      {stale && minutes !== null && <> — مفيش مزامنة من {minutes} دقيقة</>}
    </span>
  );
}

// صورة الجروب، أو أول حرف بلونه - the group picture, or its first letter in its color
export function GroupAvatar({ group, size }: { group: WaGroup; size: number }) {
  const [broken, setBroken] = useState(false);
  const color = groupColor(group);
  if (group.pictureId && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={mediaUrl(group.pictureId)}
        alt=""
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: `0 0 0 2px ${color}` }}
      />
    );
  }
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center font-extrabold text-white"
      style={{ width: size, height: size, background: `${color}33`, boxShadow: `0 0 0 2px ${color}`, fontSize: size * 0.42 }}
    >
      {Array.from(group.name.trim().replace(/^ال(?=\S)/, ""))[0] ?? "؟"}
    </span>
  );
}

function GroupBlock({ group, onOpen }: { group: WaGroup; onOpen: () => void }) {
  const color = groupColor(group);
  const preview = group.lastText || typePreview(group.lastType) || "لسه مفيش رسايل";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative text-start rounded-2xl border border-cardBorder bg-card/90 p-4 flex flex-col gap-3 overflow-hidden hover:bg-white/[0.04] transition-colors min-w-0"
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: color }}
    >
      {/* نور خفيف بلون الجروب - a soft glow in the group color */}
      <span aria-hidden className="pointer-events-none absolute -top-16 -end-16 h-40 w-40 rounded-full opacity-25 blur-3xl" style={{ background: color }} />
      <div className="relative flex items-center gap-3 min-w-0">
        <GroupAvatar group={group} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[19px] font-extrabold text-white truncate">{group.name}</p>
          {group.participants !== null && (
            <p className="text-[13px] text-gray-400 inline-flex items-center gap-1">
              <Users size={13} /> <span className="font-numbers">{group.participants}</span> عضو
            </p>
          )}
          {/* النشاط: متوسط آخر 30 يوم - activity: the 30-day average */}
          <p className="text-[12px] font-bold font-numbers" style={{ color: group.perDay > 0 ? color : "#6B7280" }}>
            {perDayText(group.perDay)}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`font-numbers text-[13px] ${group.unread > 0 ? "font-bold" : "text-gray-500"}`} style={group.unread > 0 ? { color } : undefined}>
            {shortWhen(group.lastAt)}
          </span>
          {group.unread > 0 && (
            <span className="min-w-[26px] h-[26px] px-1.5 rounded-full flex items-center justify-center font-numbers text-[14px] font-extrabold text-black" style={{ background: color }}>
              {group.unread > 99 ? "99+" : group.unread}
            </span>
          )}
        </div>
      </div>
      <p className="relative text-[15px] text-gray-300 line-clamp-2 min-h-[2.6em] leading-[1.3]" dir="auto">
        {group.lastSender && <span className="font-bold text-gray-200">{group.lastSender}: </span>}
        {preview}
      </p>
    </button>
  );
}

const COLLAPSED_KEY = "elsafwa:wa:collapsed";

// قسم: عنوان بيتقفل ويتفتح ("▾ الإنتاج · 14 جروب") بلونه، وتحته الجروبات 4 في الصف (3 على شاشة أصغر من 1600)
// A section: a collapsible header in its color ("▾ الإنتاج · 14 جروب"), then its groups, 4 per row (3 under 1600 wide)
function GroupSection({
  section,
  groups,
  collapsed,
  onToggle,
  onOpen,
}: {
  section: (typeof cfg.sections)[number];
  groups: WaGroup[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (g: WaGroup) => void;
}) {
  const unread = groups.reduce((n, g) => n + g.unread, 0);
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-start"
        style={{ borderColor: `${section.color}66`, background: `linear-gradient(90deg, ${section.color}1f, transparent 70%)` }}
      >
        <span className="text-[18px] text-gray-300 transition-transform" style={{ transform: collapsed ? "rotate(90deg)" : "none" }}>
          ▾
        </span>
        <span className="text-[22px] font-extrabold" style={{ color: section.color }}>
          {section.icon} {section.title}
        </span>
        <span className="text-[16px] text-gray-300">
          · <span className="font-numbers font-bold">{groups.length}</span> جروب
        </span>
        {unread > 0 && (
          <span className="rounded-full px-2.5 py-0.5 font-numbers text-[14px] font-extrabold text-black" style={{ background: section.color }}>
            {unread > 99 ? "99+" : unread} جديدة
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="grid grid-cols-3 min-[1600px]:grid-cols-4 gap-4">
          {groups.map((g) => (
            <GroupBlock key={g.id} group={g} onOpen={() => onOpen(g)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function WhatsAppPage({ active, onOverlayChange }: { active: boolean; onOverlayChange: (open: boolean) => void }) {
  const [open, setOpen] = useState<WaGroup | null>(null);
  const [seenState, setSeenState] = useState<{ seen: Record<string, string>; baseline: string } | null>(null);
  useEffect(() => setSeenState(loadSeen()), []);
  useEffect(() => onOverlayChange(open !== null), [open, onOverlayChange]);
  // الصفحة اتقفلت (صفحة تانية) = الشات يتقفل - leaving the page closes the chat
  useEffect(() => {
    if (!active) setOpen(null);
  }, [active]);

  const [ids, setIds] = useState<string[]>([]);
  const key = useMemo(() => {
    if (!seenState) return null;
    const parts = ids.map((id) => `${id}~${seenState.seen[id] ?? seenState.baseline}`);
    return `/api/wa/groups?seen=${encodeURIComponent(parts.join(","))}`;
  }, [ids, seenState]);
  const { data, error, mutate } = usePolling<WaGroupsResponse>(key, waFetch, cfg.gridRefreshSeconds * 1000, active && !open, { keepPreviousData: true });

  // أول رد بيقول الجروبات إيه، فالطلب الجاي بيبعت آخر زيارة لكل واحد - the first answer lists the groups; next requests send each visit
  const groupIds = (data?.groups ?? []).map((g) => g.id).sort().join("|");
  useEffect(() => {
    if (groupIds) setIds(groupIds.split("|"));
  }, [groupIds]);

  const groups = useMemo(() => sortGroups(data?.groups ?? []), [data]);
  // الأقسام بترتيب الكونفج، وكل قسم بنفس ترتيب الجروبات (الصورة الأول وبعدين رسالة/يوم). قسم فاضي مش بيظهر
  // Sections in config order, each keeping the group sort (picture first, then messages/day). Empty sections are hidden
  const sections = useMemo(
    () =>
      cfg.sections
        .map((section) => ({ section, list: groups.filter((g) => sectionOf(g).id === section.id) }))
        .filter((s) => s.list.length > 0),
    [groups]
  );
  // الأقسام المقفولة (بتتفتكر في المتصفح) - collapsed sections (remembered in this browser)
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      setCollapsed(JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
    } catch {}
  }, []);
  const toggleSection = useCallback((id: string) => {
    setCollapsed((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const openGroup = useCallback((g: WaGroup) => {
    setSeenState((s) => (s ? { ...s, seen: markSeen(g.id) } : s));
    setOpen(g);
  }, []);
  const closeChat = useCallback(() => {
    if (open) setSeenState((s) => (s ? { ...s, seen: markSeen(open.id) } : s));
    setOpen(null);
    mutate();
  }, [open, mutate]);

  const setupError = error instanceof WaFetchError && error.setup ? error.message : null;

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* الشريط اللي فوق - the top bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-cardBorder bg-card/80 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[22px] font-extrabold text-white">
          <WhatsAppIcon /> جروبات الواتساب
        </span>
        <ReadOnlyBadge />
        {data && (
          <span className="text-[14px] text-gray-400">
            <span className="font-numbers font-bold text-gray-200">{groups.length}</span> جروب ·{" "}
            <span className="font-numbers font-bold text-gray-200">{data.status?.counts.messages ?? 0}</span> رسالة محفوظة
          </span>
        )}
        {/* آخر طلب من كمبيوتر الـ IT اترفض فيه رسايل: نقول ليه - the last IT request had rejected messages: say why */}
        {data?.status?.lastIngest && data.status.lastIngest.messages.rejected > 0 && (
          <span
            className="rounded-full border border-statusRed/50 bg-statusRed/10 px-2.5 py-0.5 text-[13px] font-bold text-statusRed"
            title={JSON.stringify(data.status.lastIngest.reasons)}
          >
            ⚠ آخر مزامنة: <span className="font-numbers">{data.status.lastIngest.messages.rejected}</span> رسالة اترفضت (
            {Object.keys(data.status.lastIngest.reasons).join("، ")})
          </span>
        )}
        <span className="ms-auto">
          <SyncStatus lastSyncAt={data?.lastSyncAt ?? null} />
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pe-1">
        {setupError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle size={40} className="text-statusAmber" />
            <p className="text-[20px] font-bold text-white">الواتساب لسه مش متوصل</p>
            <p className="text-[16px] text-gray-400 max-w-[560px]">{setupError}</p>
          </div>
        ) : !data ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-[18px]">{error ? `مش قادرين نجيب الجروبات — بنحاول تاني… (${error instanceof Error ? error.message : ""})` : "جاري التحميل…"}</div>
        ) : groups.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-[18px]">لسه مفيش جروبات وصلت من كمبيوتر الـ IT</div>
        ) : (
          <div className="flex flex-col gap-5">
            {sections.map(({ section, list }) => (
              <GroupSection
                key={section.id}
                section={section}
                groups={list}
                collapsed={collapsed.includes(section.id)}
                onToggle={() => toggleSection(section.id)}
                onOpen={openGroup}
              />
            ))}
          </div>
        )}
      </div>

      {open && <WhatsAppChat group={open} active={active} onClose={closeChat} />}
    </div>
  );
}

// أيقونة واتساب بسيطة (دايرة خضرا وسماعة) - a simple WhatsApp-like icon (green circle and handset)
export function WhatsAppIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.6 21.4l4.7-1.2A9.5 9.5 0 1 0 12 2.5Z" fill="#22C55E" />
      <path
        d="M8.6 7.4c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.5.7c-.1.2-.2.3 0 .6.3.6 1 1.5 1.8 2.1.8.6 1.5.9 1.9 1 .2.1.4 0 .5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.4.4 0 .3-.1 1.1-.6 1.6-.5.5-1.4.9-2.3.8-.9-.1-2.6-.7-4-1.9-1.6-1.4-2.6-3.2-2.8-3.8-.3-.7-.4-1.9.3-2.9Z"
        fill="#fff"
      />
    </svg>
  );
}
