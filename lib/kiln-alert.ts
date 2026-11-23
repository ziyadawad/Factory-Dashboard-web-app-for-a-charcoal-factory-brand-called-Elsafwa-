"use client";

// تنبيه طرحة جديدة على كل الصفحات: صوت + الشاشة بتروح لصفحة الإنتاج + كارت كبير للطرحة (production.alert*)
// New kiln exit alert on every page: a chime + a jump to the production page + a big card (production.alert*)

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductionData, ProductionExit } from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

const cfg = dashboardConfig.production;
export const ALERTS_ENABLED = cfg.alertEnabled;
const SOUND_KEY = "elsafwa:sound"; // الصوت اتفعّل مرة قبل كده - the sound was enabled once before

// كل المفاتيح اللي ممكن الطرحة تتعرف بيها (سجل ERPNext والحدث المباشر) - every key an exit is known by (ERPNext record and live event)
export const exitKeys = (e: ProductionExit) => (e.liveId ? [e.id, e.liveId] : [e.id]);
export const sameExit = (a: ProductionExit, b: ProductionExit) => {
  const keys = exitKeys(b);
  return exitKeys(a).some((k) => keys.includes(k));
};

// "2026-11-21 15:04" بتوقيت القاهرة - Cairo date and minute
const cairo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function cairoStamp(ms: number): string {
  const p = Object.fromEntries(cairo.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// ===== الصوت - the chime =====
// Web Audio: بيتحمل مرة واحدة، والـ AudioContext بيقول لو المتصفح مانع الصوت (suspended) لحد أول ضغطة
// Web Audio: loaded once; the AudioContext tells whether the browser blocks sound (suspended) until a first gesture
// play = صوت الطرحة (الملف)، playSoft = نغمة واتساب هادية (متولدة، مش ملف) - play = the kiln sound, playSoft = a soft WhatsApp tone
export type Chime = { play: () => void; playSoft: () => void; needsUnlock: boolean; unlock: () => void };

export function useChime(): Chime {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const [running, setRunning] = useState(true);
  const [remembered, setRemembered] = useState(false);
  // صوت اتمنع فعلا - a chime was actually blocked
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ALERTS_ENABLED) return;
    try {
      setRemembered(window.localStorage.getItem(SOUND_KEY) === "1");
    } catch {}
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    ctxRef.current = ctx;
    const sync = () => setRunning(ctx.state === "running");
    sync();
    ctx.onstatechange = sync;
    fetch(cfg.alertSound)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        bufRef.current = buf;
      })
      .catch(() => {});
    // أي ضغطة أو زرار في الصفحة بيفك الصوت - any click or key on the page unlocks the sound
    const onGesture = () => {
      if (ctx.state !== "running") ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      ctx.onstatechange = null;
      ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  const start = useCallback((ctx: AudioContext) => {
    const buf = bufRef.current;
    if (!buf) return false;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, cfg.alertVolume));
    source.buffer = buf;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return true;
  }, []);

  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "running" && start(ctx)) return;
    // مفيش Web Audio أو لسه متحملش: عنصر <audio> عادي - no Web Audio / not loaded yet: a plain <audio> element
    try {
      const audio = new Audio(cfg.alertSound);
      audio.volume = Math.max(0, Math.min(1, cfg.alertVolume));
      audio.play().catch(() => setFailed(true));
    } catch {
      setFailed(true);
    }
  }, [start]);

  const unlock = useCallback(() => {
    const ctx = ctxRef.current;
    try {
      window.localStorage.setItem(SOUND_KEY, "1");
    } catch {}
    setRemembered(true);
    setFailed(false);
    if (!ctx) return;
    ctx
      .resume()
      .then(() => start(ctx))
      .catch(() => {});
  }, [start]);

  // الزرار بيظهر لو الصوت ممنوع: من أول مرة لو لسه متفعلش، ولو اتفعل قبل كده بس لما صوت يتمنع فعلا
  // The button shows while sound is blocked: right away if never enabled, else only once a chime was really blocked
  const needsUnlock = ALERTS_ENABLED && !running && (!remembered || failed);
  // نغمتين ناعمين طالعين (مختلفة عن صوت الطرحة)، على نفس الـ AudioContext اللي زرار "فعّل الصوت" بيفكه
  // Two soft rising notes (unlike the kiln sound), on the same AudioContext the "فعّل الصوت" button unlocks
  const playSoft = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return;
    const volume = Math.max(0, Math.min(1, cfg.alertVolume)) * 0.35;
    [
      { freq: 784, at: 0 }, // G5
      { freq: 1175, at: 0.14 }, // D6
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + at;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }, []);

  return { play, playSoft, needsUnlock, unlock };
}

// ===== الطابور - the queue =====
export type KilnAlert = {
  current: ProductionExit | null; // الطرحة اللي معروضة دلوقتي - the exit being shown
  pending: number; // اللي مستنيين وراها - how many are queued behind it
  dismiss: () => void;
};

// production = بيانات الإنتاج (ERPNext + المباشر). blocked = لوحة تفاصيل مفتوحة (التنبيه بيستنى)
// production = the merged production data. blocked = a details panel is open (the alert waits)
export function useKilnExitAlerts(production: ProductionData | null, blocked: boolean, play: () => void): KilnAlert {
  const openedAt = useRef(0);
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<ProductionExit[]>([]);
  const [current, setCurrent] = useState<ProductionExit | null>(null);
  const [tick, setTick] = useState(0);
  const shownAt = useRef(0);
  const holdUntil = useRef(0);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  // طرحات جديدة: مفتاح مش متشاف قبل كده، ووقتها بعد ما الصفحة فتحت (أول تحميل = بيتعلم عليها بس)
  // New exits: a key never seen before, timed after the page opened (the first load only marks them seen)
  useEffect(() => {
    if (!ALERTS_ENABLED || !production) return;
    const today = production.exits.filter((e) => e.date === production.today);
    const known = seen.current;
    if (known === null) {
      seen.current = new Set(today.flatMap(exitKeys));
      return;
    }
    const since = cairoStamp(openedAt.current);
    const fresh: ProductionExit[] = [];
    for (const e of today) {
      const keys = exitKeys(e);
      const isNew = !keys.some((k) => known.has(k));
      keys.forEach((k) => known.add(k));
      if (isNew && `${e.date} ${e.time}` >= since) fresh.push(e);
    }
    if (fresh.length === 0) return;
    // الأقدم الأول - oldest first
    fresh.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    setQueue((q) => [...q, ...fresh]);
  }, [production]);

  // واحدة ورا التانية: كل واحدة alertQueueSeconds لو في غيرها مستني، والأخيرة لحد ما alertHoldSeconds يخلص
  // One after another: each for alertQueueSeconds while others wait; the last stays until alertHoldSeconds ends
  useEffect(() => {
    const now = Date.now();
    if (queue.length > 0 && !blocked) {
      const wait = current ? shownAt.current + cfg.alertQueueSeconds * 1000 - now : 0;
      if (wait <= 0) {
        const [next, ...rest] = queue;
        setQueue(rest);
        setCurrent(next);
        shownAt.current = now;
        holdUntil.current = now + cfg.alertHoldSeconds * 1000;
        play();
        return;
      }
      const timer = setTimeout(() => setTick((t) => t + 1), wait);
      return () => clearTimeout(timer);
    }
    if (current) {
      const wait = holdUntil.current - now;
      if (wait <= 0) {
        setCurrent(null);
        return;
      }
      const timer = setTimeout(() => setTick((t) => t + 1), wait);
      return () => clearTimeout(timer);
    }
  }, [queue, current, blocked, tick, play]);

  const dismiss = useCallback(() => {
    holdUntil.current = 0;
    shownAt.current = 0;
    setTick((t) => t + 1);
  }, []);

  return { current, pending: queue.length, dismiss };
}
