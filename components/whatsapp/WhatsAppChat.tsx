"use client";

// الشات صفحة كاملة (قراية بس - مفيش خانة كتابة ولا زرار إرسال): فقاعات زي الواتساب باسم الراسل والساعة، الردود متقتبسة،
// فواصل الأيام، والأقدم بيتحمل وانت طالع لفوق. الصور بتتفتح كبيرة، والـ PDF والملفات بتتفتح أو تتحمل، والفويس بيشتغل.
// بحث بالكلام / الراسل / اليوم. الجديد بيتسأل عليه كل whatsapp.chatRefreshSeconds والصفحة ظاهرة بس
// The chat full page (read-only: no input box, no send button): WhatsApp-like bubbles with sender and time, quoted
// replies, day separators, older messages load while scrolling up. Images open full size, PDFs / files open or
// download, voice notes play. Search by text / sender / day. New messages are polled every chatRefreshSeconds,
// only while the page is visible

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Download, ExternalLink, FileText, Mic, Search, Users, X } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePageVisible } from "@/lib/usePolling";
import { WaGroup, WaMessage, WaMessagesResponse } from "@/lib/types";
import { GroupAvatar, ReadOnlyBadge, SyncStatus } from "./WhatsAppPage";
import { cairoDay, cairoTime, dayLabel, fileSize, groupColor, mediaUrl, senderColor, waFetch } from "./wa-common";

const cfg = dashboardConfig.whatsapp;
const cursorOf = (m: WaMessage) => encodeURIComponent(`${m.at}~${m.id}`);

// الرسايل متقسمة بالأيام (بتوقيت القاهرة) - messages split by Cairo day
function days(list: WaMessage[]): { key: string; list: WaMessage[] }[] {
  const out: { key: string; list: WaMessage[] }[] = [];
  for (const m of list) {
    const key = cairoDay(m.at);
    if (out.length && out[out.length - 1].key === key) out[out.length - 1].list.push(m);
    else out.push({ key, list: [m] });
  }
  return out;
}

// الملف جوه الفقاعة - the file inside a bubble
function MediaView({ m, onImage, onLoaded }: { m: WaMessage; onImage: (src: string) => void; onLoaded?: () => void }) {
  const media = m.media;
  // رسالة نص عمرها ما تتعرض كملف - a text message is never shown as a file
  if (!media || m.type === "text" || m.type === "system") return null;
  // ملف مش متخزن ومعاه كلام: الكلام بس (زي الرسايل القديمة) - a missing file with words: just the words (old messages)
  if (!media.available && m.text) return null;
  if (!media.available) {
    return <p className="rounded-lg bg-black/20 px-3 py-2 text-[14px] text-gray-400">📎 الملف مش متاح (اتمسح بعد {cfg.retentionDays.media} يوم أو لسه ما اترفعش)</p>;
  }
  const src = mediaUrl(media.id);
  if (m.type === "image" || m.type === "sticker") {
    return (
      <button type="button" onClick={() => onImage(src)} className="block overflow-hidden rounded-lg" title="افتح الصورة كبيرة">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" onLoad={onLoaded} className={m.type === "sticker" ? "max-h-40" : "max-h-80 max-w-full object-contain"} />
      </button>
    );
  }
  if (m.type === "video") return <video src={src} controls preload="metadata" onLoadedMetadata={onLoaded} className="max-h-80 max-w-full rounded-lg bg-black" />;
  if (m.type === "audio" || m.type === "voice") {
    return (
      <div className="flex items-center gap-2">
        <Mic size={18} className="shrink-0 text-emerald-300" />
        <audio src={src} controls preload="none" className="h-10 max-w-full" />
      </div>
    );
  }
  // PDF وأي ملف: فتح أو تحميل - PDFs and any file: open or download
  return (
    <div className="flex items-center gap-3 rounded-lg bg-black/25 px-3 py-2.5">
      <FileText size={30} className="shrink-0 text-rose-300" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-white" dir="auto">
          {media.fileName ?? "ملف"}
        </p>
        <p className="text-[12px] text-gray-400 font-numbers">{[fileSize(media.size), media.mime].filter(Boolean).join(" · ")}</p>
      </div>
      <a href={src} target="_blank" rel="noopener" className="shrink-0 rounded-lg border border-white/15 p-2 text-gray-200 hover:bg-white/10" title="فتح">
        <ExternalLink size={18} />
      </a>
      <a href={mediaUrl(media.id, true)} className="shrink-0 rounded-lg border border-white/15 p-2 text-gray-200 hover:bg-white/10" title="تحميل">
        <Download size={18} />
      </a>
    </div>
  );
}

function Bubble({ m, onImage, onLoaded, showGroup = false }: { m: WaMessage; onImage: (src: string) => void; onLoaded?: () => void; showGroup?: boolean }) {
  if (m.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[13px] text-gray-400" dir="auto">
          {m.text}
        </span>
      </div>
    );
  }
  const color = senderColor(m.sender);
  return (
    <div id={`wa-${m.id}`} className="flex justify-start">
      <div className="max-w-[min(720px,85%)] rounded-2xl rounded-ss-sm bg-[#1F2C34] px-3.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.4)] flex flex-col gap-1.5">
        <p className="text-[14px] font-extrabold" style={{ color }} dir="auto">
          {m.sender || "—"}
          {showGroup && m.groupName && <span className="text-gray-400 font-semibold"> · {m.groupName}</span>}
        </p>
        {m.reply && (
          <button
            type="button"
            onClick={() => m.reply?.id && document.getElementById(`wa-${m.reply.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="text-start rounded-lg bg-black/25 px-2.5 py-1.5"
            style={{ borderInlineStart: `4px solid ${senderColor(m.reply.sender)}` }}
          >
            <p className="text-[13px] font-bold" style={{ color: senderColor(m.reply.sender) }} dir="auto">
              {m.reply.sender}
            </p>
            <p className="text-[13px] text-gray-300 line-clamp-2" dir="auto">
              {m.reply.text || "📎"}
            </p>
          </button>
        )}
        {m.deleted ? (
          <p className="text-[15px] italic text-gray-400">🚫 الرسالة اتمسحت</p>
        ) : (
          <>
            <MediaView m={m} onImage={onImage} onLoaded={onLoaded} />
            {m.text && (
              <p className="text-[16px] leading-[1.55] text-gray-100 whitespace-pre-wrap break-words" dir="auto">
                {m.text}
              </p>
            )}
          </>
        )}
        <p className="self-end font-numbers text-[12px] text-gray-400">
          {showGroup && <>{dayLabel(m.at)} · </>}
          {cairoTime(m.at)}
        </p>
      </div>
    </div>
  );
}

// الصورة كبيرة - the image full size
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={onClose} role="dialog" aria-modal="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-full max-w-full object-contain" />
      <div className="absolute top-4 start-4 flex gap-2">
        <a href={`${src}?download=1`} onClick={(e) => e.stopPropagation()} className="rounded-xl border border-white/20 bg-black/60 p-2.5 text-white" title="تحميل">
          <Download size={22} />
        </a>
        <button type="button" onClick={onClose} className="rounded-xl border border-white/20 bg-black/60 p-2.5 text-white" aria-label="إغلاق">
          <X size={22} />
        </button>
      </div>
    </div>
  );
}

export default function WhatsAppChat({ group, active, onClose }: { group: WaGroup; active: boolean; onClose: () => void }) {
  const visible = usePageVisible();
  const color = groupColor(group);
  const [info, setInfo] = useState<WaGroup>(group);
  const [messages, setMessages] = useState<WaMessage[]>([]); // الأقدم الأول - oldest first
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  // البحث - search
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sender, setSender] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState<WaMessage[] | null>(null);
  const [searching, setSearching] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null); // بعد تحميل الأقدم: نفس المكان - after loading older: keep the position
  const stickBottom = useRef(true);
  // أول ثواني بعد الفتح: الصور اللي بتحمّل متبعدناش عن آخر رسالة - right after opening, loading images keep us at the bottom
  const pinUntil = useRef(0);

  const nearBottom = () => {
    const el = scroller.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  // صورة / فيديو اتحمّل: لو احنا تحت (أو لسه فاتحين) نفضل تحت - a picture / video loaded: stay at the bottom if we were there
  const onMediaLoaded = useCallback(() => {
    const el = scroller.current;
    if (el && (Date.now() < pinUntil.current || el.scrollHeight - el.scrollTop - el.clientHeight < 500)) el.scrollTop = el.scrollHeight;
  }, []);
  const toBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(0);
  };

  // أول تحميل: آخر صفحة، وننزل لتحت - the first load: the latest page, scrolled to the bottom
  useEffect(() => {
    let stopped = false;
    setLoading(true);
    waFetch<WaMessagesResponse>(`/api/wa/messages?group=${encodeURIComponent(group.id)}`)
      .then((r) => {
        if (stopped) return;
        setMessages([...r.messages].reverse());
        pinUntil.current = Date.now() + 5000;
        setHasMore(r.hasMore);
        setLastSyncAt(r.lastSyncAt);
        if (r.group) setInfo(r.group);
        stickBottom.current = true;
      })
      .catch((e) => !stopped && setError(e instanceof Error ? e.message : "حصل خطأ"))
      .finally(() => !stopped && setLoading(false));
    return () => {
      stopped = true;
    };
  }, [group.id]);

  // بعد ما الرسايل تتغير: نفضل تحت، أو نرجع لنفس المكان بعد الأقدم - after messages change: stay at the bottom, or keep the place
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    } else if (stickBottom.current) {
      el.scrollTop = el.scrollHeight;
      stickBottom.current = false;
    }
  }, [messages]);

  // الأقدم وانت طالع لفوق - older messages while scrolling up
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const r = await waFetch<WaMessagesResponse>(`/api/wa/messages?group=${encodeURIComponent(group.id)}&before=${cursorOf(messages[0])}`);
      const el = scroller.current;
      keepFromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
      setMessages((list) => [...[...r.messages].reverse(), ...list]);
      setHasMore(r.hasMore);
    } catch {
      // هيتجرب تاني لما تطلع لفوق تاني - retried on the next scroll up
    } finally {
      setLoadingOlder(false);
    }
  }, [group.id, hasMore, loadingOlder, messages]);

  useEffect(() => {
    const el = topSentinel.current;
    const root = scroller.current;
    if (!el || !root || results) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadOlder(), { root, rootMargin: "300px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadOlder, results]);

  // الجديد كل chatRefreshSeconds والصفحة ظاهرة بس - new messages every chatRefreshSeconds, only while visible
  const newest = messages[messages.length - 1];
  useEffect(() => {
    if (!active || !visible || loading) return;
    let stopped = false;
    const tick = async () => {
      try {
        const after = newest ? `&after=${cursorOf(newest)}` : "";
        const r = await waFetch<WaMessagesResponse>(`/api/wa/messages?group=${encodeURIComponent(group.id)}${after}`);
        if (stopped) return;
        setLastSyncAt(r.lastSyncAt);
        if (r.group) setInfo(r.group);
        const fresh = newest ? r.messages : [...r.messages].reverse();
        if (fresh.length) {
          const atBottom = nearBottom();
          stickBottom.current = atBottom;
          setMessages((list) => {
            const known = new Set(list.map((m) => m.id));
            return [...list, ...fresh.filter((m) => !known.has(m.id))];
          });
          if (!atBottom) setNewBelow((n) => n + fresh.length);
        }
      } catch {
        // المرة الجاية - next time
      }
    };
    const timer = setInterval(tick, cfg.chatRefreshSeconds * 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, visible, loading, group.id, newest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !image && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, image]);

  const runSearch = async () => {
    if (!q.trim() && !sender.trim() && !date) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ group: group.id, q, sender, date });
      const r = await waFetch<{ messages: WaMessage[] }>(`/api/wa/search?${params}`);
      setResults(r.messages);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "البحث فشل");
    } finally {
      setSearching(false);
    }
  };
  const clearSearch = () => {
    setResults(null);
    setQ("");
    setSender("");
    setDate("");
    stickBottom.current = true;
    setMessages((m) => [...m]);
  };

  const input = "h-10 rounded-xl border border-cardBorder bg-background/80 px-3 text-[15px] text-white placeholder:text-gray-500 focus:border-emerald-400/60 outline-none";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={info.name}>
      <div aria-hidden className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[360px] w-[720px] rounded-full opacity-20 blur-[120px]" style={{ background: color }} />
      {/* الهيدر - the header */}
      <header className="relative shrink-0 flex flex-wrap items-center gap-3 border-b border-cardBorder bg-card/90 px-4 py-3">
        <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-cardBorder bg-background/70 text-gray-200" aria-label="رجوع">
          <ArrowRight size={22} />
        </button>
        <GroupAvatar group={info} size={46} />
        <div className="min-w-0">
          <p className="text-[20px] font-extrabold text-white truncate">{info.name}</p>
          {info.participants !== null && (
            <p className="text-[13px] text-gray-400 inline-flex items-center gap-1">
              <Users size={13} /> <span className="font-numbers">{info.participants}</span> عضو
            </p>
          )}
        </div>
        <ReadOnlyBadge />
        <div className="ms-auto flex items-center gap-3">
          <SyncStatus lastSyncAt={lastSyncAt} />
          <button
            type="button"
            onClick={() => (searchOpen ? (setSearchOpen(false), clearSearch()) : setSearchOpen(true))}
            className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-[15px] font-bold ${searchOpen ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-cardBorder bg-background/70 text-gray-200"}`}
          >
            <Search size={18} /> بحث
          </button>
        </div>
        {/* البحث: كلام / راسل / يوم - search: text / sender / day */}
        {searchOpen && (
          <form
            className="basis-full flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <input className={`${input} flex-1 min-w-[200px]`} placeholder="كلمة في الرسالة أو اسم ملف" value={q} onChange={(e) => setQ(e.target.value)} />
            <input className={`${input} w-[200px]`} placeholder="اسم الراسل" value={sender} onChange={(e) => setSender(e.target.value)} />
            <input className={`${input} w-[170px] font-numbers`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="submit" disabled={searching} className="h-10 rounded-xl bg-emerald-500 px-4 text-[15px] font-extrabold text-black disabled:opacity-50">
              {searching ? "بيدور…" : "دوّر"}
            </button>
            {results && (
              <button type="button" onClick={clearSearch} className="h-10 rounded-xl border border-cardBorder px-3 text-[15px] font-bold text-gray-300">
                رجوع للشات
              </button>
            )}
          </form>
        )}
      </header>

      {/* الرسايل - the messages */}
      <div ref={scroller} className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-2">
          {results ? (
            <>
              <p className="text-center text-[14px] text-gray-400">
                {results.length === 0 ? "مفيش نتايج" : <><span className="font-numbers">{results.length}</span> نتيجة (الأحدث الأول)</>}
              </p>
              {results.map((m) => (
                <Bubble key={m.id} m={m} onImage={setImage} showGroup />
              ))}
            </>
          ) : (
            <>
              <div ref={topSentinel} className="h-1" />
              {loadingOlder && <p className="text-center text-[13px] text-gray-500">بيحمّل الأقدم…</p>}
              {!hasMore && messages.length > 0 && (
                <p className="text-center text-[13px] text-gray-500">بداية المحفوظ (الرسايل بتتشال بعد {cfg.retentionDays.text} يوم)</p>
              )}
              {loading && <p className="py-10 text-center text-[16px] text-gray-500">جاري التحميل…</p>}
              {error && !loading && messages.length === 0 && <p className="py-10 text-center text-[16px] text-statusRed">{error}</p>}
              {!loading && !error && messages.length === 0 && <p className="py-10 text-center text-[16px] text-gray-500">لسه مفيش رسايل</p>}
              {/* كل يوم في جزء لوحده، فعنوان اليوم بيلزق فوق لحد ما يومه يخلص بس - each day is its own section, so its label
                  sticks only until that day ends */}
              {days(messages).map((day) => (
                <section key={day.key} className="flex flex-col gap-2">
                  <div className="sticky top-0 z-10 flex justify-center py-1">
                    <span className="rounded-full border border-cardBorder bg-card/95 px-3 py-1 text-[13px] font-bold text-gray-300">{dayLabel(day.list[0].at)}</span>
                  </div>
                  {day.list.map((m) => (
                    <Bubble key={m.id} m={m} onImage={setImage} onLoaded={onMediaLoaded} />
                  ))}
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {newBelow > 0 && !results && (
        <button
          type="button"
          onClick={() => toBottom(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-[15px] font-extrabold text-black shadow-lg"
        >
          <ArrowDown size={18} /> <span className="font-numbers">{newBelow}</span> رسالة جديدة
        </button>
      )}
      {image && <Lightbox src={image} onClose={() => setImage(null)} />}
    </div>
  );
}
