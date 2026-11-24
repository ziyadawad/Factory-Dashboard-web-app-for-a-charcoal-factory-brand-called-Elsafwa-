"use client";

// تنبيه "رسالة جديدة في الواتساب" على كل الصفحات (spotlight - whatsapp.spotlight*):
// - كل latestPollSeconds سؤال صغير بس (/api/wa/latest) والتاب ظاهر. أول رد = بيتعلم عليه بس (مفيش تنبيه أول ما الصفحة تفتح)
// - فيه جديد: بنجيب الرسايل نفسها (/api/wa/new). كل رسالة بتتعرض مرة واحدة بس (بالـ id) - ده اللي كان بيكرر الصوت
// - رسايل نفس الراسل في نفس الجروب خلال spotlightGroupMinutes = كارت واحد؛ الباقي طابور
// - صوت هادي واحد لكل كارت أول ما يظهر، وعمره ما بيتكرر لنفس الكارت (حتى لو الطرحة قطعته ورجع)
// - بعد آخر كارت: الجروبات بتلمع spotlightFlashSeconds وبعدين الشاشة بترجع
// - بيستنى لو لوحة تفاصيل / شات مفتوح (blocked) أو تنبيه طرحة شغال أو مستني (الطرحة ليها الأولوية)
// - ساعات الهدوء: من غير صوت ولا نقل (الصفحة بتتحدث بس)
// The "new WhatsApp message" alert on every page (a spotlight): a tiny check every latestPollSeconds while visible (the
// first answer only sets the cursor); when something is new the messages themselves are fetched. Each message id is
// shown once (the old repeated chime came from the same messages coming back). Same sender + same group within
// spotlightGroupMinutes = one card; others queue. One soft chime per card when it first shows, never again for it.
// After the last card the groups flash, then the screen returns. Waits for panels / chats and kiln alerts. Quiet hours:
// no chime and no jump (the page still refreshes)

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { dashboardConfig } from "@/config/dashboard.config";
import { WaMessage } from "./types";
import { usePageVisible } from "./usePolling";

const cfg = dashboardConfig.whatsapp;

export type WaSpotGroup = { id: string; name: string; pictureId: string | null };
export type WaSpotCard = { key: string; group: WaSpotGroup; sender: string; messages: WaMessage[] };
// held = صورة مفتوحة كبيرة: الوقت واقف - held = an image is open full size: the countdown is paused
export type WaSpotShown = { card: WaSpotCard; startedAt: number; endsAt: number; held?: boolean };
export type WaFlash = { groupIds: string[]; nonce: number };
type LatestEvent = { receivedAt: string; groupId: string; groupName: string; count: number; at: string };

// ساعات الهدوء بتوقيت القاهرة (بتعدي نص الليل) - quiet hours in Cairo time (may cross midnight)
const cairoHm = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function inQuietHours(at = new Date()): boolean {
  const q = cfg.quietHours;
  if (!q) return false;
  const now = cairoHm.format(at);
  return q.from <= q.to ? now >= q.from && now < q.to : now >= q.from || now < q.to;
}

// مدة الكارت: spotlightSeconds، و+spotlightExtraSeconds لو فيه صور أو نص طويل - the card's duration
export function cardSeconds(card: WaSpotCard): number {
  const images = card.messages.some((m) => m.type === "image" || m.type === "sticker");
  const long = card.messages.reduce((n, m) => n + (m.text?.length ?? 0), 0) > cfg.spotlightLongText;
  return cfg.spotlightSeconds + (images || long ? cfg.spotlightExtraSeconds : 0);
}

const GROUP_MS = cfg.spotlightGroupMinutes * 60_000;
const lastAt = (card: WaSpotCard) => Date.parse(card.messages[card.messages.length - 1].at);
const sameThread = (card: WaSpotCard, m: WaMessage) =>
  card.group.id === m.groupId && card.sender === m.sender && Math.abs(Date.parse(m.at) - lastAt(card)) <= GROUP_MS;

type State = { queue: WaSpotCard[]; current: WaSpotShown | null; flash: (WaFlash & { until: number }) | null; run: string[]; nonce: number };
type Action =
  | { type: "incoming"; messages: WaMessage[]; groups: WaSpotGroup[]; now: number }
  | { type: "next"; now: number; canStart: boolean } // الكارت خلص أو اتقفل: اللي بعده - the card ended / closed: the next one
  | { type: "start"; now: number }
  | { type: "requeue" } // الطرحة: الكارت يرجع أول الطابور - a kiln alert: the card goes back to the queue front
  | { type: "drop" } // لوحة / شات اتفتح: الكارت يختفي - a panel / chat opened: the card goes away
  | { type: "flashDone" }
  | { type: "extend"; key: string; ms: number } // صورة وصلت متأخر: الكارت بيتمد - a late image: the card gets longer
  | { type: "hold"; key: string; on: boolean; now: number };

const show = (card: WaSpotCard, now: number): WaSpotShown => ({ card, startedAt: now, endsAt: now + cardSeconds(card) * 1000 });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "incoming": {
      const groups = new Map(action.groups.map((g) => [g.id, g]));
      let current = state.current;
      const queue = state.queue.map((c) => ({ ...c, messages: [...c.messages] }));
      let nonce = state.nonce;
      for (const m of action.messages) {
        const group = groups.get(m.groupId);
        if (!group) continue;
        // نفس الراسل والجروب خلال دقيقتين: على نفس الكارت (المعروض دلوقتي كمان، ووقته بيتمد) - same thread: the same card
        if (current && sameThread(current.card, m)) {
          const card = { ...current.card, messages: [...current.card.messages, m] };
          const endsAt = Math.max(current.endsAt, current.startedAt + cardSeconds(card) * 1000, action.now + 3000);
          current = { ...current, card, endsAt };
          continue;
        }
        const queued = queue.find((c) => sameThread(c, m));
        if (queued) queued.messages.push(m);
        else queue.push({ key: `${m.groupId}|${m.id}|${++nonce}`, group, sender: m.sender, messages: [m] });
      }
      return { ...state, current, queue, nonce };
    }
    case "start": {
      if (state.current || state.queue.length === 0) return state;
      const [next, ...rest] = state.queue;
      return { ...state, queue: rest, current: show(next, action.now), flash: null };
    }
    case "next": {
      if (!state.current) return state;
      const run = state.run.includes(state.current.card.group.id) ? state.run : [...state.run, state.current.card.group.id];
      // اللي بعده على طول (من غير ما الشاشة ترجع بين الكروت) - straight to the next (the screen never returns in between)
      if (state.queue.length > 0 && action.canStart) {
        const [next, ...rest] = state.queue;
        return { ...state, queue: rest, current: show(next, action.now), run };
      }
      if (state.queue.length > 0) return { ...state, current: null, run };
      // الطابور خلص: الجروبات بتلمع وبعدين الشاشة بترجع - the queue is done: the groups flash, then the screen returns
      const nonce = state.nonce + 1;
      return { ...state, current: null, run: [], nonce, flash: { groupIds: run, nonce, until: action.now + cfg.spotlightFlashSeconds * 1000 } };
    }
    case "requeue":
      return state.current ? { ...state, queue: [state.current.card, ...state.queue], current: null, flash: null } : { ...state, flash: null };
    case "drop":
      return { ...state, current: null, flash: null, run: [] };
    case "flashDone":
      return { ...state, flash: null };
    case "extend":
      if (state.current?.card.key !== action.key) return state;
      return { ...state, current: { ...state.current, endsAt: state.current.endsAt + action.ms } };
    case "hold":
      if (state.current?.card.key !== action.key) return state;
      // الصورة اتقفلت: 3 ثواني كمان على الأقل - the image closed: at least 3 more seconds
      return {
        ...state,
        current: { ...state.current, held: action.on, endsAt: action.on ? state.current.endsAt : Math.max(state.current.endsAt, action.now + 3000) },
      };
  }
}

export type WaSpotlight = {
  current: WaSpotShown | null;
  pending: number; // اللي في الطابور - queued cards
  flash: WaFlash | null; // الجروبات اللي بتلمع بعد آخر كارت - the groups flashing after the last card
  active: boolean; // الشاشة لازم تفضل على صفحة الواتساب - the screen must stay on the WhatsApp page
  activity: number; // بيزيد مع أي رسايل جديدة (حتى في الهدوء) - bumps on any new messages (even in quiet hours)
  dismiss: () => void; // ✕ / Esc: اللي بعده - close early: the next card
  extend: (key: string, ms: number) => void; // صورة وصلت متأخر - a late image
  hold: (key: string, on: boolean) => void; // صورة مفتوحة كبيرة - an image open full size
  drop: () => void; // فتح الشات من الكارت - opening the chat from the card
};

export function useWhatsAppAlerts({
  blocked,
  kilnBusy,
  playChime,
}: {
  blocked: boolean; // لوحة تفاصيل أو شات مفتوح - a details panel or chat is open
  kilnBusy: boolean; // تنبيه طرحة شغال أو مستني - a kiln alert is on or queued
  playChime: () => void;
}): WaSpotlight {
  const visible = usePageVisible();
  const cursor = useRef<string | null>(null);
  const firstCursor = useRef<string | null>(null);
  // كل رسالة بتتعرض مرة واحدة بس - each message is shown once only
  const shownIds = useRef<Set<string>>(new Set());
  const chimed = useRef<Set<string>>(new Set());
  const [state, dispatch] = useReducer(reducer, { queue: [], current: null, flash: null, run: [], nonce: 0 });
  const [activity, setActivity] = useState(0);
  const [tick, setTick] = useState(0);

  // السؤال الصغير، ولو فيه جديد الرسايل نفسها - the tiny check, then the messages themselves when something is new
  useEffect(() => {
    if (!cfg.alertEnabled || !visible) return;
    let stopped = false;
    const check = async () => {
      try {
        const prev = cursor.current;
        const url = prev ? `/api/wa/latest?since=${encodeURIComponent(prev)}` : "/api/wa/latest";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { cursor: string; events: LatestEvent[] };
        if (stopped) return;
        cursor.current = body.cursor;
        if (!prev) {
          firstCursor.current = body.cursor;
          return;
        }
        if (body.events.length === 0) return;
        setActivity((n) => n + 1);
        if (inQuietHours()) return;
        // نافذة فيها 30 ثانية زيادة (ترتيب الحفظ مش مضمون)، والمكرر بيتشال بالـ id - a 30 s overlap; repeats drop by id
        const floor = Date.parse(firstCursor.current ?? prev);
        const since = new Date(Math.max(Date.parse(prev) - 30_000, floor)).toISOString();
        const groups = Array.from(new Set(body.events.map((e) => e.groupId)));
        const r = await fetch(`/api/wa/new?since=${encodeURIComponent(since)}&groups=${encodeURIComponent(groups.join(","))}`, { cache: "no-store" });
        if (!r.ok || stopped) return;
        const data = (await r.json()) as { groups: WaSpotGroup[]; messages: WaMessage[] };
        const fresh = data.messages.filter((m) => !shownIds.current.has(m.id));
        fresh.forEach((m) => shownIds.current.add(m.id));
        if (shownIds.current.size > 2000) shownIds.current = new Set(Array.from(shownIds.current).slice(-1000));
        if (fresh.length) dispatch({ type: "incoming", messages: fresh, groups: data.groups, now: Date.now() });
      } catch {
        // المرة الجاية - next time
      }
    };
    check();
    const timer = setInterval(check, cfg.latestPollSeconds * 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [visible]);

  const canStart = !blocked && !kilnBusy;

  // التوقيت: الكارت لحد endsAt، وبعده اللي بعده، وبعد الأخير اللمعة - timing: card until endsAt, next, then the flash
  useEffect(() => {
    if (kilnBusy) {
      if (state.current || state.flash) dispatch({ type: "requeue" });
      return;
    }
    if (blocked) {
      if (state.current || state.flash) dispatch({ type: "drop" });
      return;
    }
    const now = Date.now();
    if (state.current?.held) return;
    if (state.current) {
      const wait = state.current.endsAt - now;
      if (wait <= 0) {
        dispatch({ type: "next", now, canStart });
        return;
      }
      const timer = setTimeout(() => setTick((t) => t + 1), wait);
      return () => clearTimeout(timer);
    }
    if (state.queue.length > 0) {
      dispatch({ type: "start", now });
      return;
    }
    if (state.flash) {
      const wait = state.flash.until - now;
      if (wait <= 0) {
        dispatch({ type: "flashDone" });
        return;
      }
      const timer = setTimeout(() => setTick((t) => t + 1), wait);
      return () => clearTimeout(timer);
    }
  }, [state, blocked, kilnBusy, canStart, tick]);

  // صوت واحد لكل كارت، أول مرة يظهر بس - one chime per card, the first time it shows only
  const currentKey = state.current?.card.key ?? null;
  useEffect(() => {
    if (!currentKey || chimed.current.has(currentKey)) return;
    chimed.current.add(currentKey);
    if (chimed.current.size > 500) chimed.current = new Set(Array.from(chimed.current).slice(-200));
    if (cfg.alertSound && !inQuietHours()) playChime();
  }, [currentKey, playChime]);

  const dismiss = useCallback(() => dispatch({ type: "next", now: Date.now(), canStart: true }), []);
  const drop = useCallback(() => dispatch({ type: "drop" }), []);
  const extend = useCallback((key: string, ms: number) => dispatch({ type: "extend", key, ms }), []);
  const hold = useCallback((key: string, on: boolean) => dispatch({ type: "hold", key, on, now: Date.now() }), []);

  return {
    current: state.current,
    pending: state.queue.length,
    flash: state.flash ? { groupIds: state.flash.groupIds, nonce: state.flash.nonce } : null,
    active: state.current !== null || state.flash !== null || (state.queue.length > 0 && canStart),
    activity,
    dismiss,
    drop,
    extend,
    hold,
  };
}
