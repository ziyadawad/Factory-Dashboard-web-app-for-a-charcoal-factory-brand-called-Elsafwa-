// تنضيف بيانات إيجنت IT على الشكل المتفق عليه - من غير أي حاجة خاصة بالسيرفر، فبيتستخدم في السيرفر (POST /api/it/status)
// وفي المتصفح (status.json من الإيجنت على الشبكة المحلية) بنفس القواعد بالظبط
// Sanitizes IT agent data to the agreed schema - no server-only imports, so the same rules run on the server
// (POST /api/it/status) and in the browser (status.json read straight from the agent on the LAN)
import { ItCamera, ItDevice, ItDeviceGroup, ItDeviceType, ItEvent, ItRouter, ItSnapshot } from "./types";

export const MAX_EVENTS = 200; // آخر 200 حدث - keep the last 200 events
const EVENT_DAYS = 3; // والأحداث الأقدم من 3 أيام بتتمسح - and drop events older than 3 days

// ===== التنضيف: الشكل المتفق عليه بس - sanitizing: the agreed schema only =====
const text = (value: unknown, max = 120): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const bool = (value: unknown): boolean => value === true;
const optBool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const num = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value * 10) / 10)) : null;
// تاريخ ISO صحيح بس - a valid ISO date only
const iso = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
// IP أو اسم جهاز بس (مفيش user:pass@ ولا مسافات) - an IP or host name only (no user:pass@, no spaces)
const ip = (value: unknown): string => {
  const v = text(value, 64);
  return /^[A-Za-z0-9.:\-\[\]]+$/.test(v) ? v : "";
};
const list = (value: unknown, max = 200): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === "object").slice(0, max) : [];
const DEVICE_TYPES: ItDeviceType[] = ["fingerprint", "nvr", "printer", "pc", "scale", "other"];

export class ItPayloadError extends Error {}

export function sanitizePayload(body: unknown): ItSnapshot {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ItPayloadError("body must be a JSON object");
  const b = body as Record<string, unknown>;
  const agent = b.agent && typeof b.agent === "object" ? (b.agent as Record<string, unknown>) : null;
  const internet = b.internet && typeof b.internet === "object" ? (b.internet as Record<string, unknown>) : null;

  // راوتر / أكسس بوينت جاي في devices بالنوع router أو ap بيتنقل للشبكات، وأي حاجة في routers نوعها جهاز بتتنقل للأجهزة
  // A router / AP sent inside devices (type router or ap) moves to the networks list; anything in routers whose kind is a
  // device type moves to the devices list. Unnamed entries keep their IP (the page shows "جهاز <ip>")
  const NETWORK_KINDS = ["router", "ap", "accesspoint", "access_point"];
  const rawRouters = list(b.routers, 50);
  const rawDevices = list(b.devices, 300);
  const isNetworkKind = (value: unknown) => typeof value === "string" && NETWORK_KINDS.includes(value.toLowerCase());
  const GROUPS: ItDeviceGroup[] = ["critical", "staff", "network", "other"];
  // من غير group: الراوتر / الأكسس = network، غير كده other - no group: router / AP = network, otherwise other
  const groupOf = (d: Record<string, unknown>): ItDeviceGroup =>
    GROUPS.includes(d.group as ItDeviceGroup) ? (d.group as ItDeviceGroup) : isNetworkKind(d.type) ? "network" : "other";
  const isNetwork = (d: Record<string, unknown>) => groupOf(d) === "network";
  const nameOf = (r: Record<string, unknown>) => text(r.name) || (ip(r.ip) ? `unknown ${ip(r.ip)}` : "");

  const toRouter = (r: Record<string, unknown>, kind: unknown): ItRouter => ({
    id: text(r.id, 64) || ip(r.ip),
    name: nameOf(r),
    kind: typeof kind === "string" && ["ap", "accesspoint", "access_point"].includes(kind.toLowerCase()) ? ("ap" as const) : ("router" as const),
    ip: ip(r.ip),
    up: bool(r.up),
    latencyMs: num(r.latencyMs, 0, 60_000),
    internet: optBool(r.internet),
    since: iso(r.since),
    uptimeTodayPct: num(r.uptimeTodayPct, 0, 100),
  });
  const toDevice = (d: Record<string, unknown>, type: unknown): ItDevice => ({
    id: text(d.id, 64) || ip(d.ip),
    name: nameOf(d),
    type: DEVICE_TYPES.includes(type as ItDeviceType) ? (type as ItDeviceType) : ("other" as const),
    group: groupOf(d),
    monitor: bool(d.monitor),
    ip: ip(d.ip),
    up: bool(d.up),
    latencyMs: num(d.latencyMs, 0, 60_000),
    lastSeen: iso(d.lastSeen),
    since: iso(d.since),
  });

  const routers: ItRouter[] = [
    ...rawRouters.filter((r) => r.kind === undefined || isNetworkKind(r.kind)).map((r) => toRouter(r, r.kind)),
    ...rawDevices.filter(isNetwork).map((d) => toRouter(d, d.type ?? d.kind)),
  ].filter((r) => r.id && r.name);
  const devices: ItDevice[] = [
    ...rawDevices.filter((d) => !isNetwork(d)).map((d) => toDevice(d, d.type)),
    ...rawRouters.filter((r) => r.kind !== undefined && !isNetworkKind(r.kind)).map((r) => toDevice(r, r.kind)),
  ].filter((d) => d.id && d.name);
  // من غير تكرار (نفس id) - no duplicates (same id)
  const unique = <T extends { id: string }>(items: T[]) => items.filter((item, i) => items.findIndex((x) => x.id === item.id) === i);
  routers.splice(0, routers.length, ...unique(routers));
  devices.splice(0, devices.length, ...unique(devices));

  // الكاميرات: id واسم وحالة بس - أي رابط أو باسورد بيترمي - cameras: id, name and status only; any URL / password is dropped
  const cameras: ItCamera[] = list(b.cameras, 64)
    .map((c) => ({ id: text(c.id, 64), name: text(c.name), online: optBool(c.online) }))
    .filter((c) => /^[A-Za-z0-9_-]+$/.test(c.id) && c.name);

  const hiddenTargets = new Set(devices.filter((d) => d.group === "other" && !d.monitor).flatMap((d) => [d.name, d.ip].filter(Boolean)));
  const TARGETS = ["internet", "router", "ap", ...DEVICE_TYPES];
  const events: ItEvent[] = list(b.events, MAX_EVENTS)
    .map((e) => ({
      id: text(e.id, 80),
      at: iso(e.at) ?? "",
      kind: e.kind === "up" ? ("up" as const) : ("down" as const),
      targetName: text(e.targetName),
      targetType: (TARGETS.includes(e.targetType as string) ? e.targetType : "other") as ItEvent["targetType"],
      ip: ip(e.ip) || null,
    }))
    .filter((e) => e.id && e.at && e.targetName)
    // أجهزة other من غير monitor: true أحداثها مبتظهرش خالص - other devices without monitor: true never reach the events
    .filter((e) => !hiddenTargets.has(e.targetName) && !(e.ip && hiddenTargets.has(e.ip)));

  if (!internet && routers.length === 0 && devices.length === 0 && cameras.length === 0 && events.length === 0) {
    throw new ItPayloadError("payload has none of internet / routers / devices / cameras / events");
  }

  return {
    agent: agent ? { name: text(agent.name, 60), version: text(agent.version, 30) } : null,
    sentAt: iso(b.sentAt),
    internet: internet ? { up: bool(internet.up), since: iso(internet.since), latencyMs: num(internet.latencyMs, 0, 60_000) } : null,
    routers,
    devices,
    cameras,
    events,
  };
}

// الأحداث من كل التحديثات مع بعض (من غير تكرار)، الأحدث الأول - events from every update merged (no duplicates), newest first
export function mergeEvents(old: ItEvent[], fresh: ItEvent[]): ItEvent[] {
  const byId = new Map<string, ItEvent>();
  for (const event of [...old, ...fresh]) byId.set(event.id, event);
  const cutoff = new Date(Date.now() - EVENT_DAYS * 86_400_000).toISOString();
  return Array.from(byId.values())
    .filter((e) => e.at >= cutoff)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, MAX_EVENTS);
}
