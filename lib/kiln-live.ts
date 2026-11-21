"use client";

// طرحات على طول من الإيجنت على شبكة المصنع (أحداث "kiln_exit") - بتتدمج في بيانات الإنتاج اللي جاية من ERPNext
// فالطرحة الجديدة بتظهر في الصفحة على طول من غير ما تستنى كاش السيرفر. برا المصنع الإيجنت مش بيرد = مفيش حاجة بتتغير
// Live exits straight from the agent on the factory LAN ("kiln_exit" events), merged into the ERPNext production data
// so a new exit shows at once instead of waiting for the server cache. Outside the factory the agent never answers and
// nothing changes (the normal refresh carries on)

import { useEffect, useState } from "react";
import { ProductionData, ProductionExit } from "./types";
import { usePageVisible } from "./usePolling";
import { dashboardConfig } from "@/config/dashboard.config";

const cfg = dashboardConfig.production;
const BASE = dashboardConfig.it.cameraBaseUrl.replace(/\/+$/, "");
const STATUS_URL = BASE ? `${BASE}/status.json` : "";
const WS_URL = BASE && cfg.liveWsPath ? `${BASE.replace(/^http/, "ws")}${cfg.liveWsPath}` : "";
const FAILS_TOLERATED = 1; // فشلة واحدة مش بتقلب للتحديث العادي - one missed answer is tolerated
const RETRY_MS = 30_000; // برا المصنع: بيجرب الشبكة تاني كل 30 ثانية - outside the factory: re-probe every 30 s
const MATCH_MINUTES = 3; // نفس الفرن وفرق أقل من كده = نفس الطرحة اللي في ERPNext - same kiln within this = the same ERPNext exit
const MAX_LIVE = 300;

// الوقت بتوقيت القاهرة - Cairo date and time
const cairo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function cairoParts(ms: number): { date: string; time: string } {
  const p = Object.fromEntries(cairo.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const text = (v: unknown, max = 60) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
const kg = (...values: unknown[]): number | null => {
  for (const v of values) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100_000) return Math.round(n * 100) / 100;
  }
  return null;
};

export type LiveExit = ProductionExit & { at: number; erpName: string };

// حدث "kiln_exit" واحد (الشكل في docs/it-agent-payload.md) - one "kiln_exit" event (schema in docs/it-agent-payload.md)
function parseExit(raw: unknown): LiveExit | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.kind !== undefined && e.kind !== "kiln_exit") return null;
  const id = text(e.id, 80);
  const at = Date.parse(text(e.at, 40));
  if (!id || !Number.isFinite(at)) return null;
  let full = kg(e.fullKg, e.full_weight_kg);
  let empty = kg(e.emptyKg, e.empty_weight_kg);
  let net = kg(e.netKg, e.weight_kg);
  if (net === null && full !== null && empty !== null && full > empty) net = Math.round((full - empty) * 100) / 100;
  if (full === null && net !== null && empty !== null) full = Math.round((net + empty) * 100) / 100;
  if (empty === null && net !== null && full !== null && full > net) empty = Math.round((full - net) * 100) / 100;
  return {
    id: `live:${id}`,
    ...cairoParts(at),
    at,
    kiln: text(e.kiln),
    type: text(e.type ?? e.charcoal_type),
    kg: net,
    fullKg: full,
    emptyKg: empty,
    trolley: text(e.trolley),
    room: text(e.room),
    live: true,
    erpName: text(e.erpName ?? e.erp_name, 80),
  };
}

// من status.json (events + kilnExits) أو رسالة WebSocket (حدث واحد، أو {events}، أو ليستة)
// From status.json (events + kilnExits) or a WebSocket message (one event, {events} or a list)
function exitsIn(body: unknown): LiveExit[] {
  const b = body && typeof body === "object" && "data" in (body as object) ? (body as { data: unknown }).data : body;
  const list: unknown[] = Array.isArray(b)
    ? b
    : b && typeof b === "object"
      ? [...(Array.isArray((b as { events?: unknown }).events) ? (b as { events: unknown[] }).events : []),
         ...(Array.isArray((b as { kilnExits?: unknown }).kilnExits) ? (b as { kilnExits: unknown[] }).kilnExits : []),
         ...((b as { kind?: unknown }).kind === "kiln_exit" ? [b] : [])]
      : [];
  return list.filter((x) => (x as { kind?: unknown })?.kind === "kiln_exit").map(parseExit).filter((x): x is LiveExit => x !== null);
}

// الطرحات المتجمعة (من غير تكرار)، الأحدث الأول، النهارده بس - accumulated (deduplicated), newest first, today only
function mergeLive(old: LiveExit[], fresh: LiveExit[]): LiveExit[] {
  const today = cairoParts(Date.now()).date;
  const byId = new Map(old.map((e) => [e.id, e]));
  for (const e of fresh) byId.set(e.id, e);
  return Array.from(byId.values())
    .filter((e) => e.date === today)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_LIVE);
}

export type LiveKilnExits = { exits: LiveExit[]; lan: boolean };

// بيشترك في الـ WebSocket لو متظبط، وإلا (أو لو وقع) بيسأل status.json كل liveSeconds - والصفحة ظاهرة بس
// Subscribes to the WebSocket when configured, otherwise (or when it drops) polls status.json every liveSeconds,
// only while the page is on screen
export function useLiveKilnExits(active: boolean): LiveKilnExits {
  const visible = usePageVisible();
  const [state, setState] = useState<LiveKilnExits>({ exits: [], lan: false });
  useEffect(() => {
    if (!active || !visible || !STATUS_URL) return;
    let stopped = false;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;
    const add = (fresh: LiveExit[]) =>
      setState((s) => ({ exits: fresh.length ? mergeLive(s.exits, fresh) : s.exits, lan: true }));

    const poll = async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store", signal: AbortSignal.timeout(cfg.liveTimeoutMs) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (stopped) return;
        fails = 0;
        add(exitsIn(body));
      } catch {
        if (stopped) return;
        fails += 1;
        if (fails > FAILS_TOLERATED) setState((s) => (s.lan ? { ...s, lan: false } : s));
      }
      if (!stopped) timer = setTimeout(poll, fails > FAILS_TOLERATED ? RETRY_MS : cfg.liveSeconds * 1000);
    };

    const subscribe = () => {
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        return poll();
      }
      let opened = false;
      ws.onopen = () => {
        opened = true;
        // أول ما يفتح: status.json مرة عشان اللي فات - on open: one status.json read for what was missed
        fetch(STATUS_URL, { cache: "no-store", signal: AbortSignal.timeout(cfg.liveTimeoutMs) })
          .then((r) => (r.ok ? r.json() : null))
          .then((body) => !stopped && body && add(exitsIn(body)))
          .catch(() => {});
        setState((s) => (s.lan ? s : { ...s, lan: true }));
      };
      ws.onmessage = (msg) => {
        try {
          add(exitsIn(JSON.parse(String(msg.data))));
        } catch {}
      };
      ws.onclose = () => {
        ws = null;
        if (stopped) return;
        // وقع: status.json على طول، والـ WebSocket تاني بعد شوية - dropped: status.json now, the WebSocket again later
        if (opened) setTimeout(() => !stopped && !ws && subscribe(), RETRY_MS);
        poll();
      };
    };

    if (WS_URL) subscribe();
    else poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [active, visible]);
  return state;
}

const minutesOf = (e: ProductionExit) => Date.parse(`${e.date}T${e.time}:00Z`) / 60_000;

// بيدمج الطرحات المباشرة في بيانات ERPNext: لو الطرحة موجودة في ERPNext (erpName، أو نفس الفرن في حدود MATCH_MINUTES)
// بتكمّل الناقص فيها (الوزن، ممتلئ، فاضي، الترول، الغرفة)، ولو لسه مش موجودة بتتضاف فوق
// Merges the live exits into the ERPNext data: an exit already in ERPNext (erpName, or the same kiln within
// MATCH_MINUTES) gets its missing values filled (net, full, empty, trolley, room); one not there yet is added on top
export function withLiveExits(data: ProductionData, live: LiveExit[]): ProductionData {
  if (live.length === 0) return data;
  const exits = data.exits.map((e) => ({ ...e }));
  const taken = new Set<string>();
  const added: ProductionExit[] = [];
  // الأقدم الأول عشان كل حدث ياخد أقرب طرحة ليه بالترتيب - oldest first so each event claims its closest exit in order
  for (const l of [...live].reverse()) {
    let match = l.erpName ? exits.find((e) => e.id === l.erpName) : undefined;
    if (!match) {
      let best = MATCH_MINUTES + 1;
      for (const e of exits) {
        if (taken.has(e.id) || e.liveId || e.date !== l.date || e.kiln !== l.kiln) continue;
        const diff = Math.abs(minutesOf(e) - minutesOf(l));
        if (diff < best) {
          best = diff;
          match = e;
        }
      }
    }
    if (match) {
      taken.add(match.id);
      match.liveId = l.id;
      match.kg ??= l.kg;
      match.fullKg ??= l.fullKg;
      match.emptyKg ??= l.emptyKg;
      match.trolley ||= l.trolley;
      match.room ||= l.room;
      match.type ||= l.type;
    } else {
      added.push({ id: l.id, date: l.date, time: l.time, kiln: l.kiln, type: l.type, kg: l.kg, fullKg: l.fullKg, emptyKg: l.emptyKg, trolley: l.trolley, room: l.room, live: true });
    }
  }
  if (added.length === 0) return { ...data, exits };
  // الجديدة فوق (الأحدث الأول) - the new ones on top (newest first)
  const all = [...added, ...exits].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : a.date + a.time > b.date + b.time ? -1 : 0));
  return { ...data, exits: all };
}
