"use client";

// تنبيه "رسالة جديدة في الواتساب" على كل الصفحات (whatsapp.alert*):
// - كل latestPollSeconds سؤال صغير بس (/api/wa/latest) والتاب ظاهر. أول رد = بيتعلم عليه بس (مفيش تنبيه أول ما الصفحة تفتح)
// - رسايل جديدة = طابور بالجروب (صوت واحد لكل جروب مش لكل رسالة)، كل جروب alertQueueSeconds، والشاشة بتفضل على صفحة
//   الواتساب alertHoldSeconds بعد آخر واحد
// - بيستنى لو لوحة تفاصيل / شات مفتوح (blocked) أو تنبيه طرحة شغال أو مستني (الطرحة ليها الأولوية)
// - ساعات الهدوء: من غير صوت ولا نقل (الصفحة بتتحدث بس)
// The "new WhatsApp message" alert on every page: a tiny check every latestPollSeconds while the tab is visible (the
// first answer only sets the cursor: no alert on load); new messages queue per group (one chime per group), each shown
// alertQueueSeconds, and the screen stays on WhatsApp alertHoldSeconds after the last one. Waits while a panel / chat
// is open or a kiln alert is on or queued (kiln first). Quiet hours: no chime, no jump (the page still refreshes)

import { useEffect, useRef, useState } from "react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePageVisible } from "./usePolling";

const cfg = dashboardConfig.whatsapp;

export type WaAlertItem = { groupId: string; groupName: string; count: number; nonce: number };
type LatestEvent = { receivedAt: string; groupId: string; groupName: string; count: number; at: string };

// ساعات الهدوء بتوقيت القاهرة (بتعدي نص الليل) - quiet hours in Cairo time (may cross midnight)
const cairoHm = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function inQuietHours(at = new Date()): boolean {
  const q = cfg.quietHours;
  if (!q) return false;
  const now = cairoHm.format(at);
  return q.from <= q.to ? now >= q.from && now < q.to : now >= q.from || now < q.to;
}

export function useWhatsAppAlerts({
  blocked,
  kilnBusy,
  playChime,
}: {
  blocked: boolean; // لوحة تفاصيل أو شات مفتوح - a details panel or chat is open
  kilnBusy: boolean; // تنبيه طرحة شغال أو مستني - a kiln alert is on or queued
  playChime: () => void;
}): { current: WaAlertItem | null; pending: number; activity: number } {
  const visible = usePageVisible();
  const cursor = useRef<string | null>(null);
  const nonce = useRef(0);
  const [queue, setQueue] = useState<WaAlertItem[]>([]);
  const [current, setCurrent] = useState<WaAlertItem | null>(null);
  // بيزيد مع أي رسايل جديدة (حتى في الهدوء) عشان صفحة الواتساب تتحدث على طول - bumps on any new messages so the page refreshes
  const [activity, setActivity] = useState(0);
  const [tick, setTick] = useState(0);
  const shownAt = useRef(0);
  const holdUntil = useRef(0);

  // السؤال الصغير - the tiny check
  useEffect(() => {
    if (!cfg.alertEnabled || !visible) return;
    let stopped = false;
    const check = async () => {
      try {
        const url = cursor.current ? `/api/wa/latest?since=${encodeURIComponent(cursor.current)}` : "/api/wa/latest";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { cursor: string; events: LatestEvent[] };
        if (stopped) return;
        const first = cursor.current === null;
        cursor.current = body.cursor;
        if (first || body.events.length === 0) return;
        setActivity((n) => n + 1);
        if (inQuietHours()) return;
        // جروب واحد = تنبيه واحد (لو مستني في الطابور بيزيد عدده بس) - one alert per group (a queued one just grows)
        setQueue((q) => {
          const next = [...q];
          for (const e of body.events) {
            const found = next.find((x) => x.groupId === e.groupId);
            if (found) found.count += e.count;
            else next.push({ groupId: e.groupId, groupName: e.groupName, count: e.count, nonce: ++nonce.current });
          }
          return next;
        });
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

  // واحد ورا التاني: كل جروب alertQueueSeconds، والأخير لحد ما alertHoldSeconds يخلص
  // One after another: alertQueueSeconds each; the last one stays until alertHoldSeconds ends
  useEffect(() => {
    const now = Date.now();
    if (blocked || kilnBusy) {
      // الطرحة شغالة: التنبيه الحالي بيرجع أول الطابور ويستنى - a kiln alert: the current one goes back to the queue front
      if (kilnBusy && current) {
        const back = current;
        setQueue((q) => (q.some((x) => x.groupId === back.groupId) ? q : [back, ...q]));
        setCurrent(null);
      }
      return;
    }
    if (queue.length > 0) {
      const wait = current ? shownAt.current + cfg.alertQueueSeconds * 1000 - now : 0;
      if (wait <= 0) {
        const [next, ...rest] = queue;
        setQueue(rest);
        setCurrent({ ...next, nonce: ++nonce.current });
        shownAt.current = now;
        holdUntil.current = now + cfg.alertHoldSeconds * 1000;
        if (cfg.alertSound && !inQuietHours()) playChime();
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
  }, [queue, current, blocked, kilnBusy, tick, playChime]);

  return { current, pending: queue.length, activity };
}
