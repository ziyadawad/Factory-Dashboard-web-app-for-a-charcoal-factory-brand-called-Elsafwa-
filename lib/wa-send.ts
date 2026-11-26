// الإرسال للواتساب من الداشبورد (السيرفر بس): الباسورد، الطابور (wa_outbox)، والسجل (wa_send_log)
// - الباسورد في WA_SEND_PASSWORD (Vercel بس). الصح = كوكي httpOnly موقّع (HMAC) صالح unlockMinutes، فالباسورد نفسه
//   عمره ما بيتخزن ولا بيرجع للمتصفح، ولو اتغير في Vercel كل الكوكيز القديمة بتقف
// - الغلط: passwordTries مرة لنفس الـ IP = قفل passwordLockMinutes (في Postgres عشان كل السيرفرات تشوفه)
// - الحدود: رسالة كل minSecondsBetween ثانية و perHour في الساعة (لكل الداشبورد مع بعض)
// Sending to WhatsApp from the dashboard (server only): the password, the outbox (wa_outbox) and the log (wa_send_log).
// The password lives in WA_SEND_PASSWORD (Vercel only); a correct one sets a signed (HMAC) httpOnly cookie valid for
// unlockMinutes, so the password is never stored or sent back, and changing it in Vercel voids every old cookie.
// Wrong: passwordTries per IP = locked for passwordLockMinutes (in Postgres so every instance sees it).
// Limits: one message per minSecondsBetween and perHour per hour (for the whole dashboard together)

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { dashboardConfig } from "@/config/dashboard.config";
import { WaError, waQuery as q } from "./wa-store";
import { WaOutboxItem, WaSendLogEntry, WaSendSession } from "./types";

const cfg = dashboardConfig.whatsapp;
export const SEND_COOKIE = "wa-send";
export const SEND_PASSWORD_ENV = "WA_SEND_PASSWORD";

const password = () => (process.env[SEND_PASSWORD_ENV] ?? "").trim();
export const sendConfigured = () => password().length > 0;

const sha = (text: string) => createHash("sha256").update(text).digest();
const sameBytes = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
const sign = (exp: string) => createHmac("sha256", sha(`wa-send:${password()}`)).update(exp).digest("base64url");

// ===== الجلسة (الكوكي) - the session (cookie) =====
export function newSessionCookie(): { value: string; expiresAt: string; maxAge: number } {
  const maxAge = cfg.unlockMinutes * 60;
  const exp = String(Date.now() + maxAge * 1000);
  return { value: `${exp}.${sign(exp)}`, expiresAt: new Date(Number(exp)).toISOString(), maxAge };
}

// الكوكي صالح؟ (التوقيع صح ولسه مخلصش) - is the cookie valid (correct signature, not expired)?
export function sessionOf(request: NextRequest): WaSendSession {
  if (!sendConfigured()) return { configured: false, unlocked: false, expiresAt: null, lockedUntil: null };
  const raw = request.cookies.get(SEND_COOKIE)?.value ?? "";
  const dot = raw.indexOf(".");
  const exp = dot > 0 ? raw.slice(0, dot) : "";
  const ok = !!exp && /^\d+$/.test(exp) && Number(exp) > Date.now() && sameBytes(Buffer.from(raw.slice(dot + 1)), Buffer.from(sign(exp)));
  return { configured: true, unlocked: ok, expiresAt: ok ? new Date(Number(exp)).toISOString() : null, lockedUntil: null };
}

export function clientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim().slice(0, 64) || "local";
}

// طلب من نفس الموقع بس (حماية زيادة من CSRF فوق sameSite) - same-origin requests only (extra CSRF guard on top of sameSite)
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

async function log(entry: { groupId?: string; groupName?: string; text?: string; result: string; detail?: string | null; outboxId?: number | null; ip?: string }) {
  try {
    await q(`INSERT INTO wa_send_log (group_id, group_name, body, result, detail, outbox_id, ip) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      entry.groupId ?? "", entry.groupName ?? "", (entry.text ?? "").slice(0, 4000), entry.result, entry.detail ?? null, entry.outboxId ?? null, entry.ip ?? null,
    ]);
  } catch (error) {
    console.error("[wa-send] log failed:", error instanceof Error ? error.message : error);
  }
}

// ===== الباسورد - the password =====
export type UnlockResult = { ok: true } | { ok: false; lockedUntil: string | null; triesLeft: number };

export async function checkPassword(candidate: string, ip: string): Promise<UnlockResult> {
  if (!sendConfigured()) throw new WaError(`${SEND_PASSWORD_ENV} مش متظبط في Vercel — الإرسال مقفول`, 503);
  const rows = await q(`SELECT fails, first_at, locked_until FROM wa_send_auth WHERE ip = $1`, [ip]);
  const row = rows[0];
  const lockedUntil = row?.locked_until ? new Date(String(row.locked_until)) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    await log({ result: "unlock-locked", ip });
    return { ok: false, lockedUntil: lockedUntil.toISOString(), triesLeft: 0 };
  }
  if (sameBytes(sha(candidate), sha(password()))) {
    await q(`DELETE FROM wa_send_auth WHERE ip = $1`, [ip]);
    await log({ result: "unlock-ok", ip });
    return { ok: true };
  }
  // الغلط بيتعد في شباك passwordLockMinutes - wrong tries count within a passwordLockMinutes window
  const windowMs = cfg.passwordLockMinutes * 60_000;
  const fresh = !row || lockedUntil !== null || Date.now() - new Date(String(row.first_at)).getTime() > windowMs;
  const fails = fresh ? 1 : Number(row.fails) + 1;
  const lock = fails >= cfg.passwordTries ? new Date(Date.now() + windowMs).toISOString() : null;
  await q(
    `INSERT INTO wa_send_auth (ip, fails, first_at, locked_until) VALUES ($1, $2, now(), $3)
     ON CONFLICT (ip) DO UPDATE SET fails = $2, locked_until = $3, first_at = CASE WHEN $4 THEN now() ELSE wa_send_auth.first_at END`,
    [ip, lock ? 0 : fails, lock, fresh]
  );
  await log({ result: lock ? "unlock-wrong-locked" : "unlock-wrong", ip });
  return { ok: false, lockedUntil: lock, triesLeft: lock ? 0 : cfg.passwordTries - fails };
}

export async function logRelock(ip: string) {
  await log({ result: "relock", ip });
}

// ===== الإرسال - sending =====
const outboxItem = (r: Record<string, unknown>): WaOutboxItem => ({
  id: Number(r.id),
  groupId: String(r.group_id),
  groupName: String(r.group_name ?? ""),
  text: String(r.body ?? ""),
  reply: r.reply_id ? { id: String(r.reply_id), sender: String(r.reply_sender ?? ""), text: String(r.reply_text ?? "") } : null,
  senderLabel: String(r.sender_label ?? ""),
  status: r.status === "sent" || r.status === "failed" ? r.status : "pending",
  error: r.error ? String(r.error) : null,
  messageId: r.wa_message_id ? String(r.wa_message_id) : null,
  createdAt: new Date(String(r.created_at)).toISOString(),
  doneAt: r.done_at ? new Date(String(r.done_at)).toISOString() : null,
});

export async function queueMessage(input: { groupId: unknown; text: unknown; replyId?: unknown }, ip: string): Promise<WaOutboxItem> {
  const groupId = typeof input.groupId === "string" ? input.groupId.trim().slice(0, 160) : "";
  const text = typeof input.text === "string" ? input.text.replace(/\r\n/g, "\n").trim() : "";
  const replyId = typeof input.replyId === "string" && input.replyId.trim() ? input.replyId.trim().slice(0, 200) : null;
  const reject = async (reason: string, status = 400, groupName = ""): Promise<never> => {
    await log({ groupId, groupName, text, result: "rejected", detail: reason, ip });
    throw new WaError(reason, status);
  };
  if (!groupId) return reject("group is required");
  const groups = await q(`SELECT name FROM wa_groups WHERE id = $1`, [groupId]);
  const groupName = groups[0] ? String(groups[0].name) : "";
  if (!groups[0] || cfg.hidden.includes(groupId) || cfg.hidden.includes(groupName)) return reject("الجروب مش موجود", 404);
  if (!text) return reject("الرسالة فاضية", 400, groupName);
  if (text.length > cfg.sendLimits.maxChars) return reject(`الرسالة أطول من ${cfg.sendLimits.maxChars} حرف`, 400, groupName);

  // الحدود (من الطابور نفسه، لكل الداشبورد) - the limits (from the outbox itself, whole dashboard)
  const [stats] = await q(
    `SELECT max(created_at) AS last_at, count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour FROM wa_outbox`
  );
  const lastAt = stats?.last_at ? new Date(String(stats.last_at)).getTime() : 0;
  const wait = Math.ceil((lastAt + cfg.sendLimits.minSecondsBetween * 1000 - Date.now()) / 1000);
  if (wait > 0) return reject(`استنى ${wait} ثانية قبل الرسالة الجاية`, 429, groupName);
  if (Number(stats?.hour ?? 0) >= cfg.sendLimits.perHour) return reject(`وصلت لحد ${cfg.sendLimits.perHour} رسالة في الساعة`, 429, groupName);

  // الرد: الراسل والكلام من الرسالة الأصلية - the reply: sender and text from the original message
  let reply: { sender: string; text: string } | null = null;
  if (replyId) {
    const [m] = await q(`SELECT sender, body, type FROM wa_messages WHERE id = $1 AND group_id = $2`, [replyId, groupId]);
    if (!m) return reject("الرسالة اللي بترد عليها مش موجودة", 404, groupName);
    reply = { sender: String(m.sender ?? ""), text: String(m.body ?? "").slice(0, 300) };
  }
  const [row] = await q(
    `INSERT INTO wa_outbox (group_id, group_name, body, reply_id, reply_sender, reply_text, sender_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [groupId, groupName, text, replyId, reply?.sender ?? null, reply?.text ?? null, cfg.sendLabel]
  );
  const item = outboxItem(row);
  await log({ groupId, groupName, text, result: "queued", outboxId: item.id, ip });
  return item;
}

// رسايل الداشبورد لجروب (آخر 24 ساعة) عشان الفقاعة تبين ⏳ / ✓ / ⚠ - the dashboard's messages to a group (last 24 h)
export async function outboxForGroup(groupId: string): Promise<WaOutboxItem[]> {
  const rows = await q(`SELECT * FROM wa_outbox WHERE group_id = $1 AND created_at > now() - interval '24 hours' ORDER BY created_at ASC LIMIT 100`, [groupId]);
  return rows.map(outboxItem);
}

export async function sendLog(limit = 50): Promise<WaSendLogEntry[]> {
  const rows = await q(
    `SELECT l.id, l.at, l.group_name, l.body, l.result, l.detail, o.status AS outbox_status, o.error AS outbox_error
     FROM wa_send_log l LEFT JOIN wa_outbox o ON o.id = l.outbox_id
     WHERE l.result IN ('queued', 'rejected', 'sent', 'failed')
     ORDER BY l.at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    at: new Date(String(r.at)).toISOString(),
    groupName: String(r.group_name ?? ""),
    text: String(r.body ?? ""),
    // queued = اتحطت في الطابور: النتيجة النهائية من الطابور - queued: the final result comes from the outbox
    result: r.result === "queued" ? (r.outbox_status === "sent" || r.outbox_status === "failed" ? r.outbox_status : "pending") : "rejected",
    detail: r.result === "queued" ? (r.outbox_error ? String(r.outbox_error) : null) : r.detail ? String(r.detail) : null,
  }));
}

// ===== الإيجنت - the agent =====
let lastCleanup = 0;

// اللي مستني: اللي اتاخد من أكتر من دقيقة ولسه مخلصش بيرجع تاني (الإيجنت وقع في النص)، والقديم أوي بيتلغي
// Pending items: one claimed over a minute ago and not finished is offered again (the agent died midway);
// very old ones are cancelled so they are never sent late
export async function claimOutbox(limit = 10): Promise<WaOutboxItem[]> {
  await q(
    `UPDATE wa_outbox SET status = 'failed', error = 'expired', done_at = now()
     WHERE status = 'pending' AND created_at < now() - ($1::int * interval '1 minute')`,
    [cfg.outboxMaxAgeMinutes]
  );
  if (Date.now() - lastCleanup > 6 * 3600_000) {
    lastCleanup = Date.now();
    const days = cfg.retentionDays.text;
    await q(`DELETE FROM wa_outbox WHERE created_at < now() - ($1::int * interval '1 day')`, [days]);
    await q(`DELETE FROM wa_send_log WHERE at < now() - ($1::int * interval '1 day')`, [days]);
    await q(`DELETE FROM wa_send_auth WHERE first_at < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())`);
  }
  const rows = await q(
    `UPDATE wa_outbox SET claimed_at = now()
     WHERE id IN (
       SELECT id FROM wa_outbox WHERE status = 'pending' AND (claimed_at IS NULL OR claimed_at < now() - interval '60 seconds')
       ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [Math.min(Math.max(limit, 1), 50)]
  );
  return rows.map(outboxItem).sort((a, b) => a.id - b.id);
}

// الإيجنت بيقول بعت ولا فشل - the agent reports sent / failed
export async function reportOutbox(raw: unknown): Promise<{ updated: number }> {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [raw];
  let updated = 0;
  for (const entry of list.slice(0, 50)) {
    if (!entry || typeof entry !== "object") throw new WaError("each item must be an object { id, status }");
    const e = entry as Record<string, unknown>;
    const id = Number(e.id);
    const status = e.status;
    if (!Number.isInteger(id) || id <= 0) throw new WaError("id must be the outbox id (a positive integer)");
    if (status !== "sent" && status !== "failed") throw new WaError('status must be "sent" or "failed"');
    const error = status === "failed" ? String(e.error ?? "failed").slice(0, 500) : null;
    const messageId = typeof e.messageId === "string" && e.messageId.trim() ? e.messageId.trim().slice(0, 200) : null;
    const rows = await q(
      `UPDATE wa_outbox SET status = $2, error = $3, wa_message_id = COALESCE($4, wa_message_id), done_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING group_id, group_name, body`,
      [id, status, error, messageId]
    );
    if (rows[0]) {
      updated++;
      await log({ groupId: String(rows[0].group_id), groupName: String(rows[0].group_name), text: String(rows[0].body), result: `agent-${status}`, detail: error, outboxId: id });
    }
  }
  return { updated };
}
