"use client";

// الصفحة 7 "واتساب": جروبات الواتساب قراية بس (مفيش كتابة ولا إرسال خالص). 3 أعمدة جنب بعض، عمود لكل قسم بنوره ولونه،
// وجوه كل عمود الجروبات بالأحدث فوق (ورسالة جديدة بتطلّع جروبها فوق بحركة). الضغط على جروب بيفتح الشات صفحة كاملة.
// التحميل الكامل بس والصفحة ظاهرة (كل whatsapp.gridRefreshSeconds)، وعلى طول لما تنبيه رسالة جديدة يوصل
// Page 7 "واتساب": read-only WhatsApp groups (no typing or sending anywhere). 3 columns side by side, one per section
// with its own glow and color, groups newest first inside (a new message slides its group to the top). A group opens
// the chat full page. Full loads only while visible (every gridRefreshSeconds), and at once when a new-message alert
// arrives

import { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, RefreshCw, BookOpen, CheckCheck } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePolling } from "@/lib/usePolling";
import { WaGroup, WaGroupsResponse } from "@/lib/types";
import WhatsAppChat from "./WhatsAppChat";
import WaImage from "./WaImage";
import AllMessagesModal from "./AllMessagesModal";
import { SendLogButton } from "./WaSendBox";
import { sectionOf } from "@/lib/wa-sections";
import { WaFlash, WaSpotGroup } from "@/lib/wa-alert";
import {
  asWaGroup,
  pinIndex,
  cairoTime,
  groupColor,
  loadSeen,
  markSeen,
  markAllSeen,
  mediaUrl,
  minutesSince,
  shortWhen,
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

// سطر جروب صغير جوه العمود: الصورة، الاسم والساعة، آخر رسالة (سطر أو اتنين)، وعدد الجديد
// A compact group row inside a column: picture, name and time, the last message (1–2 lines), unread count
function GroupRow({ group, color, pulse, onOpen }: { group: WaGroup; color: string; pulse: number | null; onOpen: () => void }) {
  const preview = group.lastText || typePreview(group.lastType) || "لسه مفيش رسايل";
  return (
    <button
      type="button"
      data-wa-row={group.id}
      onClick={onOpen}
      // key الـ pulse بيعيد الحركة كل تنبيه - the pulse key restarts the flash on each alert
      key={pulse ?? "still"}
      className={`w-full text-start rounded-xl border border-white/[0.07] bg-card/85 px-3 py-2.5 flex items-start gap-3 hover:bg-white/[0.05] transition-colors min-w-0 ${pulse ? "wa-pulse" : ""}`}
    >
      <GroupAvatar group={group} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="flex-1 min-w-0 text-[16px] min-[1600px]:text-[17px] font-extrabold text-white truncate">{group.name}</p>
          <span className={`shrink-0 font-numbers text-[12px] ${group.unread > 0 ? "font-bold" : "text-gray-500"}`} style={group.unread > 0 ? { color } : undefined}>
            {shortWhen(group.lastAt)}
          </span>
        </div>
        <div className="flex items-start gap-2 min-w-0">
          {/* آخر رسالة صورة: صورة صغيرة حقيقية - the last message is an image: a real small thumbnail */}
          {group.lastMediaId && (
            <span className="shrink-0 mt-0.5 w-10 h-10 overflow-hidden rounded-md">
              <WaImage mediaId={group.lastMediaId} compact retrySeconds={0} className="w-10 h-10 rounded-md object-cover text-[16px]" />
            </span>
          )}
          <p className="flex-1 min-w-0 text-[13px] min-[1600px]:text-[14px] text-gray-300 line-clamp-2 leading-[1.35]" dir="auto">
            {group.lastSender && <span className="font-bold text-gray-200">{group.lastSender}: </span>}
            {preview}
          </p>
          {group.unread > 0 && (
            <span className="shrink-0 mt-0.5 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center font-numbers text-[12px] font-extrabold text-black" style={{ background: color }}>
              {group.unread > 99 ? "99+" : group.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// عمود قسم: عنوان ثابت فوق (الأيقونة والاسم والعدد والجديد)، وتحته الجروبات بالأحدث بسكرول لوحده، ونور خفيف بلونه.
// الجروب اللي جاله رسالة بيطلع فوق بحركة (FLIP)، ولو جه تنبيه العمود بيطلع لفوق والجروب بيلمع مرتين
// A section column: a fixed header (icon, title, count, new badge), its groups newest first in their own scroll, and a
// soft glow in its color. A group with a new message slides to the top (FLIP); on an alert the column scrolls up and
// the group flashes twice
function GroupColumn({
  section,
  groups,
  alert,
  onOpen,
}: {
  section: (typeof cfg.sections)[number];
  groups: WaGroup[];
  alert: WaFlash | null;
  onOpen: (g: WaGroup) => void;
}) {
  const color = section.color;
  const unread = groups.reduce((n, g) => n + g.unread, 0);
  const scroller = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  const order = groups.map((g) => g.id).join("|");

  // FLIP: كل سطر بيتحرك من مكانه القديم لمكانه الجديد - each row slides from its old place to the new one
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-wa-row]"));
    const next = new Map<string, number>();
    for (const row of rows) next.set(row.dataset.waRow ?? "", row.offsetTop);
    if (!reduceMotion()) {
      for (const row of rows) {
        const before = tops.current.get(row.dataset.waRow ?? "");
        const after = next.get(row.dataset.waRow ?? "") ?? 0;
        if (before === undefined || before === after) continue;
        row.style.transition = "none";
        row.style.transform = `translateY(${before - after}px)`;
        requestAnimationFrame(() => {
          row.style.transition = "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)";
          row.style.transform = "";
        });
      }
    }
    tops.current = next;
  }, [order]);

  // تنبيه لجروب في العمود ده: نطلع لفوق - an alert for a group in this column: scroll to the top
  // اللمعة بعد الـ spotlight لجروب في العمود ده: نطلع لفوق - the flash after the spotlight for a group here: scroll up
  const alerted = alert && groups.some((g) => alert.groupIds.includes(g.id)) ? alert : null;
  useEffect(() => {
    if (alerted) scroller.current?.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  }, [alerted?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section
      className="wa-col relative min-h-0 min-w-0 flex flex-col rounded-2xl border"
      style={{ "--c": color, borderColor: `${color}55`, boxShadow: `0 0 28px -10px ${color}88, inset 0 0 0 1px ${color}14` } as CSSProperties}
    >
      {/* النور ورا العمود - the glow behind the column */}
      <div aria-hidden className="wa-col-glow" />
      {/* العنوان (ثابت) - the header (fixed) */}
      <header
        className="relative shrink-0 flex items-center gap-2 rounded-t-2xl border-b px-4 py-3"
        style={{ borderColor: `${color}40`, background: `linear-gradient(180deg, ${color}30, ${color}08)` }}
      >
        <span className="text-[20px] min-[1600px]:text-[22px] font-extrabold truncate" style={{ color }}>
          {section.icon} {section.title}
        </span>
        <span className="shrink-0 text-[14px] text-gray-300">
          · <span className="font-numbers font-bold">{groups.length}</span> جروب
        </span>
        {unread > 0 && (
          <span className="ms-auto shrink-0 rounded-full px-2.5 py-0.5 font-numbers text-[13px] font-extrabold text-black" style={{ background: color }}>
            {unread > 99 ? "99+" : unread} جديدة
          </span>
        )}
      </header>
      {/* الجروبات (سكرول لوحده) - the groups (own scroll) */}
      <div ref={scroller} className="wa-col-scroll relative flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-gray-500">مفيش جروبات هنا لسه</p>
        ) : (
          groups.map((g) => (
            <GroupRow key={g.id} group={g} color={color} pulse={alerted && alerted.groupIds.includes(g.id) ? alerted.nonce : null} onOpen={() => onOpen(g)} />
          ))
        )}
      </div>
    </section>
  );
}

// الأحدث فوق - newest first
const byLast = (a: WaGroup, b: WaGroup) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || a.name.localeCompare(b.name);

export default function WhatsAppPage({
  active,
  onOverlayChange,
  flash = null,
  openRequest = null,
  refreshKey = 0,
}: {
  active: boolean;
  onOverlayChange: (open: boolean) => void;
  flash?: WaFlash | null; // الجروبات اللي بتلمع بعد الـ spotlight - the groups flashing after the spotlight
  openRequest?: { group: WaSpotGroup; nonce: number } | null; // الضغط على كارت الـ spotlight = افتح الشات
  refreshKey?: number; // بيزيد مع أي رسايل جديدة = تحديث على طول - bumps on new messages = refresh now
}) {
  const [open, setOpen] = useState<WaGroup | null>(null);
  const [seenState, setSeenState] = useState<{ seen: Record<string, string>; baseline: string } | null>(null);
  const [allMessagesOpen, setAllMessagesOpen] = useState(false);
  const [sendLogOpen, setSendLogOpen] = useState(false);
  useEffect(() => setSeenState(loadSeen()), []);
  useEffect(() => onOverlayChange(open !== null || allMessagesOpen || sendLogOpen), [open, allMessagesOpen, sendLogOpen, onOverlayChange]);
  // الصفحة اتقفلت (صفحة تانية) = الشات يتقفل - leaving the page closes the chat
  useEffect(() => {
    if (!active) {
      setOpen(null);
      setAllMessagesOpen(false);
    }
  }, [active]);

  const [ids, setIds] = useState<string[]>([]);
  const key = useMemo(() => {
    if (!seenState) return null;
    const parts = ids.map((id) => `${id}~${seenState.seen[id] ?? seenState.baseline}`);
    return `/api/wa/groups?seen=${encodeURIComponent(parts.join(","))}`;
  }, [ids, seenState]);
  const { data, error, mutate } = usePolling<WaGroupsResponse>(key, waFetch, cfg.gridRefreshSeconds * 1000, active && !open, { keepPreviousData: true });
  // رسالة جديدة (من التنبيه) والصفحة ظاهرة: تحديث على طول عشان الجروب يطلع فوق - new message while shown: refresh now
  useEffect(() => {
    if (active && refreshKey > 0) mutate();
  }, [refreshKey, active, flash?.nonce, mutate]);

  // أول رد بيقول الجروبات إيه، فالطلب الجاي بيبعت آخر زيارة لكل واحد - the first answer lists the groups; next requests send each visit
  const groupIds = (data?.groups ?? []).map((g) => g.id).sort().join("|");
  useEffect(() => {
    if (groupIds) setIds(groupIds.split("|"));
  }, [groupIds]);

  const groups = useMemo(() => (data?.groups ?? []).filter(Boolean), [data]);
  // الأعمدة بترتيب whatsapp.columnOrder (من اليمين)، وجوه كل عمود: المتثبت (whatsapp.pinned) بترتيبه، وبعدين الأحدث فوق
  // Columns in columnOrder; inside each: the pinned groups (whatsapp.pinned) in their order, then newest first
  const columns = useMemo(() => {
    const ids = cfg.columnOrder.filter((id) => cfg.sections.some((s) => s.id === id));
    const rest = cfg.sections.filter((s) => !ids.includes(s.id)).map((s) => s.id);
    return [...ids, ...rest].map((id) => {
      const section = cfg.sections.find((s) => s.id === id)!;
      const pinned = (g: WaGroup) => pinIndex(g, id);
      const list = groups.filter((g) => sectionOf(g).id === id).sort((a, b) => {
        const pa = pinned(a);
        const pb = pinned(b);
        return pa !== pb ? (pa < pb ? -1 : 1) : byLast(a, b);
      });
      return { section, list };
    });
  }, [groups]);
  const openGroup = useCallback((g: WaGroup) => {
    setSeenState((s) => (s ? { ...s, seen: markSeen(g.id) } : s));
    setOpen(g);
  }, []);

  // علامة كل الجروبات كمقروءة - mark all groups as read
  const markAllAsRead = useCallback(() => {
    const allGroupIds = groups.map((g) => g.id);
    setSeenState((s) => (s ? { ...s, seen: markAllSeen(allGroupIds) } : s));
    mutate();
  }, [groups, mutate]);
  // كارت الـ spotlight اتضغط: افتح شات الجروب ده - the spotlight card was clicked: open that group's chat
  useEffect(() => {
    if (!openRequest) return;
    const g = data?.groups.find((x) => x.id === openRequest.group.id) ?? asWaGroup(openRequest.group);
    openGroup(g);
  }, [openRequest?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {/* زرار ملخص الصباح - morning summary button */}
        <button
          type="button"
          onClick={() => setAllMessagesOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brandOrange/60 bg-brandOrange/10 text-brandOrange text-sm font-bold whitespace-nowrap hover:bg-brandOrange/20 transition-colors"
          title="عرض جميع الرسائل من كل الجروبات"
        >
          <BookOpen size={16} />
          ملخص الصباح
        </button>
        {/* سجل الإرسال (من الشات) - the send log (from the chat) */}
        {active && <SendLogButton onOpenChange={setSendLogOpen} />}
        {/* زرار علامة الكل كمقروء - mark all as read button */}
        {data && groups.some((g) => g.unread > 0) && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-green-500/60 bg-green-500/10 text-green-400 text-sm font-bold whitespace-nowrap hover:bg-green-500/20 transition-colors"
            title="علامة كل الجروبات كمقروءة"
          >
            <CheckCheck size={16} />
            علامة الكل كمقروء
          </button>
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

      {setupError ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle size={40} className="text-statusAmber" />
          <p className="text-[20px] font-bold text-white">الواتساب لسه مش متوصل</p>
          <p className="text-[16px] text-gray-400 max-w-[560px]">{setupError}</p>
        </div>
      ) : !data ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-gray-500 text-[18px]">
          {error ? `مش قادرين نجيب الجروبات — بنحاول تاني… (${error instanceof Error ? error.message : ""})` : "جاري التحميل…"}
        </div>
      ) : (
        // الأعمدة جنب بعض (من اليمين)، كل واحد 300px على الأقل: لو الشاشة ضيقة (1366) سكرول بالعرض بيقف على عمود
        // Columns side by side (from the right), each at least 300px: on a narrow screen (1366) a horizontal snap scroll
        <div
          className="flex-1 min-h-0 grid grid-flow-col gap-3 min-[1600px]:gap-4 overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
          style={{ gridAutoColumns: "minmax(300px, 1fr)" }}
        >
          {columns.map(({ section, list }) => (
            <div key={section.id} className="min-h-0 min-w-0 grid snap-start">
              <GroupColumn section={section} groups={list} alert={flash} onOpen={openGroup} />
            </div>
          ))}
        </div>
      )}

      {open && <WhatsAppChat group={open} active={active} onClose={closeChat} />}
      {allMessagesOpen && <AllMessagesModal open={allMessagesOpen} onClose={() => setAllMessagesOpen(false)} />}
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
