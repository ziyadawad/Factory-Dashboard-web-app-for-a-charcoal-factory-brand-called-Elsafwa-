// الوزنات المستنية (من الإيجنت لحد ما الأوبريتر يسجلها طرحة أو يقول "مش طرحة") - السيرفر بس
// في Upstash Redis (hash واحد) 24 ساعة، ولو Redis مش متظبط في الذاكرة (بتضيع مع الـ cold start)
// الوزنة اللي اتحلت بتتعلم 24 ساعة كمان، فلو الإيجنت بعتها تاني (retry) مش بترجع تظهر
// Pending weighings (from the agent until the operator saves them or says "مش طرحة") - server only.
// Kept in Upstash Redis (one hash) for 24 h, else in memory (lost on a cold start). A resolved id is remembered for
// 24 h too, so an agent retry of the same id does not bring it back
import { dashboardConfig } from "@/config/dashboard.config";
import { redis, redisSettings } from "./redis";
import { PendingWeighing } from "./types";

const HASH = "elsafwa:scale:pending";
const resolvedKey = (id: string) => `elsafwa:scale:resolved:${id}`;
const ttlMs = () => dashboardConfig.operator.pendingTtlHours * 3_600_000;

export class PendingError extends Error {}

// الشكل اللي الإيجنت بيبعته: {id, gross_kg, time} - the agent's payload
export function parsePending(body: unknown): PendingWeighing {
  if (!body || typeof body !== "object") throw new PendingError("body must be a JSON object {id, gross_kg, time}");
  const b = body as Record<string, unknown>;
  const id = String(b.id ?? "").trim();
  if (!/^[A-Za-z0-9_.:\-]{1,64}$/.test(id)) throw new PendingError("id: 1-64 chars of A-Z a-z 0-9 _ . : -");
  const gross = Number(b.gross_kg);
  if (!Number.isFinite(gross) || gross <= 0 || gross > dashboardConfig.operator.maxKg) {
    throw new PendingError(`gross_kg must be a number between 0 and ${dashboardConfig.operator.maxKg}`);
  }
  const rawTime = b.time === undefined || b.time === null || b.time === "" ? new Date().toISOString() : String(b.time);
  const at = Date.parse(rawTime);
  if (!Number.isFinite(at)) throw new PendingError("time must be an ISO date-time (e.g. 2026-11-22T09:15:00+02:00)");
  // وقت في المستقبل البعيد = ساعة الجهاز غلط - far in the future = a wrong device clock
  if (at > Date.now() + 10 * 60_000) throw new PendingError("time is in the future");
  return { id, grossKg: Math.round(gross * 10) / 10, time: new Date(at).toISOString(), receivedAt: new Date().toISOString() };
}

const memory = new Map<string, PendingWeighing>();
const memoryResolved = new Map<string, number>();

const fresh = (p: PendingWeighing) => Date.now() - Date.parse(p.time) < ttlMs();

// بيرجع false لو الوزنة دي اتحلت قبل كده - returns false when this id was already resolved
export async function addPending(p: PendingWeighing): Promise<{ added: boolean; storage: "redis" | "memory" }> {
  if (redisSettings()) {
    if (await redis<string>(["GET", resolvedKey(p.id)])) return { added: false, storage: "redis" };
    await redis(["HSET", HASH, p.id, JSON.stringify(p)]);
    await redis(["EXPIRE", HASH, Math.ceil(ttlMs() / 1000)]);
    return { added: true, storage: "redis" };
  }
  if ((memoryResolved.get(p.id) ?? 0) > Date.now()) return { added: false, storage: "memory" };
  memory.set(p.id, p);
  return { added: true, storage: "memory" };
}

// الأحدث الأول، والأقدم من 24 ساعة بيتمسح - newest first; anything older than 24 h is dropped
export async function listPending(): Promise<PendingWeighing[]> {
  let all: PendingWeighing[] = [];
  if (redisSettings()) {
    const flat = (await redis<string[]>(["HGETALL", HASH])) ?? [];
    const stale: string[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        const p = JSON.parse(flat[i + 1]) as PendingWeighing;
        if (fresh(p)) all.push(p);
        else stale.push(flat[i]);
      } catch {
        stale.push(flat[i]);
      }
    }
    if (stale.length) await redis(["HDEL", HASH, ...stale]).catch(() => null);
  } else {
    for (const [id, p] of Array.from(memory)) if (!fresh(p)) memory.delete(id);
    all = Array.from(memory.values());
  }
  return all.sort((a, b) => b.time.localeCompare(a.time));
}

export async function getPending(id: string): Promise<PendingWeighing | null> {
  if (redisSettings()) {
    const raw = await redis<string>(["HGET", HASH, id]);
    return raw ? (JSON.parse(raw) as PendingWeighing) : null;
  }
  return memory.get(id) ?? null;
}

// بتشيلها وبترجع true لو كانت موجودة (عشان اتنين ميسجلوش نفس الوزنة) - removes it; true if it was there
// (so two operators can't save the same weighing)
export async function takePending(id: string): Promise<boolean> {
  if (redisSettings()) {
    const removed = Number((await redis<number>(["HDEL", HASH, id])) ?? 0);
    if (removed) await redis(["SET", resolvedKey(id), "1", "EX", Math.ceil(ttlMs() / 1000)]);
    return removed > 0;
  }
  const had = memory.delete(id);
  if (had) memoryResolved.set(id, Date.now() + ttlMs());
  return had;
}

// رجوعها لو الحفظ في ERPNext فشل - put it back when saving to ERPNext failed
export async function restorePending(p: PendingWeighing): Promise<void> {
  if (redisSettings()) {
    await redis(["DEL", resolvedKey(p.id)]);
    await redis(["HSET", HASH, p.id, JSON.stringify(p)]);
    return;
  }
  memoryResolved.delete(p.id);
  memory.set(p.id, p);
}
