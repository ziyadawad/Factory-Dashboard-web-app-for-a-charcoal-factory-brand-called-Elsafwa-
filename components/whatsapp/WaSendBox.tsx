"use client";

// الإرسال من الشات (نص بس + رد اختياري): الكتابة مقفولة لحد الباسورد (بيتفحص على السيرفر)، تأكيد قبل كل رسالة،
// والرسايل اللي اتبعتت بتظهر فقاعات خضرا بحالتها ⏳ / ✓ / ⚠ (من الطابور، كمبيوتر الـ IT هو اللي بيبعت)
// Sending from the chat (text only + optional reply): locked until the password (checked on the server), a confirm
// before every message, and the sent messages show as green bubbles with ⏳ / ✓ / ⚠ (from the outbox; the IT PC sends)

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Lock, LockOpen, Send, X } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePageVisible } from "@/lib/usePolling";
import { WaMessage, WaOutboxItem, WaSendLogEntry, WaSendSession } from "@/lib/types";
import { cairoTime, dayLabel } from "./wa-common";

const cfg = dashboardConfig.whatsapp;

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 401 && !url.includes("/session")) window.location.href = "/login";
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, status: res.status, body };
}

// حالة الكتابة (مفتوحة لحد امتى) - the composer state (unlocked until when)
export function useSendSession() {
  const [session, setSession] = useState<WaSendSession | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await call<WaSendSession>("/api/wa/send/session");
      if (r.ok) setSession(r.body);
    } catch {
      // المرة الجاية - next time
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  // الكوكي خلص: نقفل لوحدنا - the cookie expired: lock on our own
  useEffect(() => {
    if (!session?.unlocked || !session.expiresAt) return;
    const ms = Date.parse(session.expiresAt) - Date.now();
    const timer = setTimeout(() => setSession((s) => (s ? { ...s, unlocked: false, expiresAt: null } : s)), Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [session?.unlocked, session?.expiresAt]);
  return { session, setSession, refresh };
}

// رسايل الداشبورد للجروب ده: كل 5 ثواني لو فيه حاجة مستنية، وإلا كل chatRefreshSeconds
// The dashboard's messages to this group: every 5 s while one is pending, else every chatRefreshSeconds
export function useOutbox(groupId: string, active: boolean) {
  const visible = usePageVisible();
  const [items, setItems] = useState<WaOutboxItem[]>([]);
  const refresh = useCallback(async () => {
    try {
      const r = await call<{ items: WaOutboxItem[] }>(`/api/wa/send?group=${encodeURIComponent(groupId)}`);
      if (r.ok) setItems(r.body.items ?? []);
    } catch {
      // المرة الجاية - next time
    }
  }, [groupId]);
  const pending = items.some((i) => i.status === "pending");
  useEffect(() => {
    if (!active || !visible) return;
    refresh();
    const timer = setInterval(refresh, (pending ? 5 : cfg.chatRefreshSeconds) * 1000);
    return () => clearInterval(timer);
  }, [active, visible, pending, refresh]);
  return { items, refresh };
}

export function OutboxStatus({ item }: { item: WaOutboxItem }) {
  if (item.status === "sent") return <span className="text-sky-300" title="اتبعتت">✓</span>;
  if (item.status === "failed")
    return (
      <span className="text-statusRed font-bold" title={item.error ?? "فشلت"}>
        ⚠ فشلت{item.error === "expired" ? " (اتأخرت)" : ""}
      </span>
    );
  return <span title="مستنية كمبيوتر الـ IT يبعتها">⏳</span>;
}

// فقاعة رسالة من الداشبورد (على الشمال، خضرا) - a dashboard message bubble (left side, green)
export function OutboxBubble({ item }: { item: WaOutboxItem }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(720px,85%)] rounded-2xl rounded-se-sm bg-[#005C4B] px-3.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.4)] flex flex-col gap-1.5">
        <p className="text-[13px] font-extrabold text-emerald-200">{item.senderLabel || cfg.sendLabel}</p>
        {item.reply && (
          <div className="rounded-lg bg-black/25 px-2.5 py-1.5 border-s-4 border-emerald-300/70">
            <p className="text-[13px] font-bold text-emerald-200" dir="auto">
              {item.reply.sender}
            </p>
            <p className="text-[13px] text-gray-200 line-clamp-2" dir="auto">
              {item.reply.text || "📎"}
            </p>
          </div>
        )}
        <p className="text-[16px] leading-[1.55] text-white whitespace-pre-wrap break-words" dir="auto">
          {item.text}
        </p>
        <p className="self-end flex items-center gap-1.5 font-numbers text-[12px] text-gray-300">
          {cairoTime(item.createdAt)} <OutboxStatus item={item} />
        </p>
      </div>
    </div>
  );
}

// "سجل الإرسال" في هيدر صفحة الواتساب: آخر 50 محاولة (الوقت، الجروب، الكلام، النتيجة)
// "سجل الإرسال" in the WhatsApp page header: the last 50 attempts (time, group, text, result)
const RESULT: Record<WaSendLogEntry["result"], { label: string; cls: string }> = {
  pending: { label: "⏳ مستنية", cls: "text-gray-300" },
  sent: { label: "✓ اتبعتت", cls: "text-sky-300" },
  failed: { label: "⚠ فشلت", cls: "text-statusRed" },
  rejected: { label: "✕ اترفضت", cls: "text-statusAmber" },
};

export function SendLogButton({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<WaSendLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);
  // اتشال (الصفحة اتقفلت): مش مفتوح - unmounted (page left): not open
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const load = async () => {
      try {
        const r = await call<{ entries: WaSendLogEntry[] }>("/api/wa/send/log");
        if (stopped) return;
        if (r.ok) {
          setEntries(r.body.entries ?? []);
          setError(null);
        } else setError(r.body.error ?? `HTTP ${r.status}`);
      } catch {
        if (!stopped) setError("مفيش اتصال");
      }
    };
    load();
    const timer = setInterval(load, 10_000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold whitespace-nowrap transition-colors ${
          open ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300" : "border-cardBorder bg-background/60 text-gray-200 hover:border-emerald-400/50"
        }`}
      >
        <History size={16} /> سجل الإرسال
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full mt-2 start-0 z-50 w-[min(560px,90vw)] max-h-[60vh] overflow-auto rounded-2xl border border-cardBorder bg-card shadow-2xl p-3 flex flex-col gap-1.5">
            <p className="text-[15px] font-extrabold text-white px-1">سجل الإرسال <span className="text-gray-500 font-semibold text-[13px]">(آخر 50)</span></p>
            {error && <p className="text-[14px] text-statusRed px-1">⚠ {error}</p>}
            {!entries && !error && <p className="text-[14px] text-gray-500 px-1">جاري التحميل…</p>}
            {entries?.length === 0 && <p className="text-[14px] text-gray-500 px-1">لسه مفيش رسايل اتبعتت</p>}
            {entries?.map((e) => (
              <div key={e.id} className="rounded-lg bg-white/[0.04] px-3 py-1.5 flex flex-col gap-0.5">
                <p className="flex items-center gap-2 text-[13px]">
                  <span className="shrink-0 font-numbers text-gray-400">{dayLabel(e.at)} · {cairoTime(e.at)}</span>
                  <span className="font-bold text-gray-100 truncate">{e.groupName || "—"}</span>
                  <span className={`ms-auto shrink-0 font-bold ${RESULT[e.result].cls}`}>{RESULT[e.result].label}</span>
                </p>
                <p className="text-[14px] text-gray-300 line-clamp-2 whitespace-pre-wrap" dir="auto">
                  {e.text || "—"}
                </p>
                {e.detail && <p className="text-[12px] text-gray-500" dir="auto">{e.detail}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

const minutesLeft = (iso: string | null) => (iso ? Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000)) : 0);

export default function WaSendBox({
  groupId,
  groupName,
  session,
  onSession,
  reply,
  onClearReply,
  onSent,
}: {
  groupId: string;
  groupName: string;
  session: WaSendSession | null;
  onSession: (s: WaSendSession) => void;
  reply: WaMessage | null;
  onClearReply: () => void;
  onSent: () => void;
}) {
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [, setNow] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);

  // عداد الدقايق الفاضلة - the minutes-left counter
  useEffect(() => {
    const timer = setInterval(() => setNow((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (reply) area.current?.focus();
  }, [reply]);
  // Esc في التأكيد بيقفل التأكيد بس (مش الشات) - Esc in the confirm closes only the confirm (not the chat)
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setConfirming(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirming]);

  const unlock = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<WaSendSession>("/api/wa/send/session", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      if (r.ok) {
        onSession(r.body);
        return;
      }
      if (r.body.lockedUntil) setError(`باسورد غلط كتير — مقفول ${minutesLeft(r.body.lockedUntil)} دقيقة`);
      else if (r.status === 401 && r.body.triesLeft !== undefined) setError(`باسورد غلط — فاضل ${r.body.triesLeft} محاولة`);
      else setError(r.body.error ?? `HTTP ${r.status}`);
    } catch {
      setError("مفيش اتصال");
    } finally {
      setBusy(false);
    }
  };

  const relock = async () => {
    try {
      const r = await call<WaSendSession>("/api/wa/send/session", { method: "DELETE" });
      onSession(r.ok ? r.body : { configured: true, unlocked: false, expiresAt: null, lockedUntil: null });
    } catch {
      onSession({ configured: true, unlocked: false, expiresAt: null, lockedUntil: null });
    }
    setConfirming(false);
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ item?: WaOutboxItem; locked?: boolean }>("/api/wa/send", {
        method: "POST",
        body: JSON.stringify({ group: groupId, text: text.trim(), replyId: reply?.id ?? null }),
      });
      if (r.ok) {
        setText("");
        onClearReply();
        onSent();
      } else {
        setError(r.body.error ?? `HTTP ${r.status}`);
        if (r.body.locked) onSession({ configured: true, unlocked: false, expiresAt: null, lockedUntil: null });
      }
    } catch {
      setError("مفيش اتصال — الرسالة ما اتبعتتش");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const input = "rounded-xl border border-cardBorder bg-background/80 px-3 text-[16px] text-white placeholder:text-gray-500 focus:border-emerald-400/60 outline-none";

  if (!session) return null;
  if (!session.configured) {
    return (
      <div className="shrink-0 border-t border-cardBorder bg-card/90 px-4 py-2.5 text-center text-[14px] text-gray-500">
        🔒 الإرسال مش متفعّل (WA_SEND_PASSWORD مش متظبط في Vercel)
      </div>
    );
  }

  return (
    <div className="relative shrink-0 border-t border-cardBorder bg-card/90 px-4 py-3">
      <div className="mx-auto max-w-[1100px] flex flex-col gap-2">
        {error && <p className="text-[14px] font-bold text-statusRed">⚠ {error}</p>}
        {!session.unlocked ? (
          // مقفولة - locked
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              unlock();
            }}
          >
            <span className="inline-flex items-center gap-2 text-[16px] font-bold text-gray-300">
              <Lock size={18} className="text-statusAmber" /> 🔒 الكتابة مقفولة — اكتب الباسورد
            </span>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="الباسورد"
              className={`${input} h-11 w-[220px]`}
            />
            <button type="submit" disabled={!password || busy} className="h-11 rounded-xl bg-emerald-500 px-4 text-[15px] font-extrabold text-black disabled:opacity-50">
              {busy ? "…" : "فتح"}
            </button>
          </form>
        ) : (
          <>
            {reply && (
              <div className="flex items-start gap-2 rounded-lg bg-black/25 px-3 py-1.5 border-s-4 border-emerald-400">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-emerald-300" dir="auto">
                    ↩ رد على {reply.sender || "—"}
                  </p>
                  <p className="text-[13px] text-gray-300 truncate" dir="auto">
                    {reply.text || "📎"}
                  </p>
                </div>
                <button type="button" onClick={onClearReply} className="shrink-0 p-1 text-gray-400 hover:text-white" aria-label="إلغاء الرد">
                  <X size={16} />
                </button>
              </div>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim() && !busy) setConfirming(true);
              }}
            >
              <textarea
                ref={area}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, cfg.sendLimits.maxChars))}
                onKeyDown={(e) => {
                  // Ctrl+Enter = إرسال (Enter لوحده = سطر جديد) - Ctrl+Enter sends (Enter alone = a new line)
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) {
                    e.preventDefault();
                    setConfirming(true);
                  }
                }}
                rows={Math.min(5, Math.max(1, text.split("\n").length))}
                placeholder={`اكتب رسالة لـ ${groupName}…`}
                dir="auto"
                className={`${input} flex-1 min-w-0 resize-none py-2.5 leading-[1.5]`}
              />
              <button
                type="submit"
                disabled={!text.trim() || busy}
                className="h-11 shrink-0 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 text-[15px] font-extrabold text-black disabled:opacity-50"
              >
                <Send size={18} /> إرسال
              </button>
              <button
                type="button"
                onClick={relock}
                className="h-11 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-cardBorder bg-background/70 px-3 text-[14px] font-bold text-gray-200 hover:border-statusAmber/60"
                title={`مفتوحة ${minutesLeft(session.expiresAt)} دقيقة كمان`}
              >
                <LockOpen size={16} className="text-emerald-300" /> قفل
                <span className="font-numbers text-[12px] text-gray-400">({minutesLeft(session.expiresAt)} د)</span>
              </button>
            </form>
          </>
        )}
      </div>

      {/* التأكيد - the confirm */}
      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => !busy && setConfirming(false)}>
          <div className="w-full max-w-[560px] rounded-2xl border border-emerald-400/50 bg-card p-5 flex flex-col gap-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[18px] font-extrabold text-white">
              هتبعت لـ <span className="text-emerald-300">{groupName}</span>:
            </p>
            {reply && (
              <p className="text-[13px] text-gray-400" dir="auto">
                ↩ رد على {reply.sender}: {(reply.text ?? "📎").slice(0, 120)}
              </p>
            )}
            <p className="max-h-[40vh] overflow-auto rounded-xl bg-[#005C4B] px-4 py-3 text-[16px] text-white whitespace-pre-wrap break-words" dir="auto">
              {text.trim()}
            </p>
            <p className="text-[18px] font-extrabold text-white">— متأكد؟</p>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="h-11 rounded-xl border border-cardBorder px-4 text-[15px] font-bold text-gray-200">
                لأ
              </button>
              <button type="button" disabled={busy} onClick={send} autoFocus className="h-11 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 text-[15px] font-extrabold text-black disabled:opacity-50">
                <Send size={18} /> {busy ? "بيبعت…" : "أيوه، ابعت"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
