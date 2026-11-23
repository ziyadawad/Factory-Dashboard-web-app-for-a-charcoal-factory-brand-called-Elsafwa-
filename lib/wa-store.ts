// واتساب (قراية بس) على السيرفر: الرسايل في Neon Postgres (DATABASE_URL)، والملفات في Vercel Blob (private) - السيرفر بس
// - الجداول بتتعمل لوحدها أول مرة (wa_groups, wa_messages, wa_media, wa_meta)
// - التنضيف: الرسايل أقدم من whatsapp.retentionDays.text يوم والملفات أقدم من retentionDays.media بتتمسح
//   (الملفات كمان بتتمسح من Blob لوحدها بـ ttlDays). التنضيف بيحصل مع المزامنة، مرة كل 6 ساعات بالكتير
// WhatsApp (read-only), server side: messages in Neon Postgres (DATABASE_URL), files in Vercel Blob (private).
// Tables are created on first use. Retention: messages older than retentionDays.text and files older than
// retentionDays.media are deleted (Blob also expires files by itself through ttlDays); the cleanup runs with the
// sync, at most every 6 hours

import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { del, get, put } from "@vercel/blob";
import { dashboardConfig } from "@/config/dashboard.config";
import { WaGroup, WaMedia, WaMessage, WaMessageType, WaMessagesResponse } from "./types";

const cfg = dashboardConfig.whatsapp;

export class WaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// ===== الاتصال - the connection =====
// تكامل Neon في Vercel بيضيف DATABASE_URL (وأحيانا POSTGRES_URL، أو بـ prefix) - the Neon integration adds DATABASE_URL
function envEndingWith(suffix: string): string | undefined {
  const key = Object.keys(process.env).find((k) => k.endsWith(suffix) && process.env[k]);
  return key ? process.env[key] : undefined;
}
export function databaseUrl(): string | null {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || envEndingWith("_DATABASE_URL") || envEndingWith("POSTGRES_URL") || "").trim() || null;
}
export const blobConfigured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || envEndingWith("BLOB_READ_WRITE_TOKEN"));
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || envEndingWith("BLOB_READ_WRITE_TOKEN");

let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS wa_groups (
     id text PRIMARY KEY, name text NOT NULL, participants int, picture_media_id text,
     updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS wa_messages (
     id text PRIMARY KEY, group_id text NOT NULL, sender text NOT NULL DEFAULT '', at timestamptz NOT NULL,
     type text NOT NULL DEFAULT 'text', body text, reply_id text, reply_sender text, reply_text text, media_id text,
     deleted boolean NOT NULL DEFAULT false)`,
  `CREATE INDEX IF NOT EXISTS wa_messages_group_at ON wa_messages (group_id, at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS wa_media (
     id text PRIMARY KEY, pathname text NOT NULL, mime text, file_name text, size int, at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS wa_meta (key text PRIMARY KEY, value text NOT NULL)`,
];

async function db(): Promise<NeonQueryFunction<false, false>> {
  const url = databaseUrl();
  if (!url) throw new WaError("DATABASE_URL مش متظبط — فعّل Neon Postgres من Vercel → Storage", 503);
  if (!client) client = neon(url);
  if (!ready) {
    const sql = client;
    ready = (async () => {
      for (const statement of SCHEMA) await sql.query(statement);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  await ready;
  return client;
}

type Row = Record<string, unknown>;
async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  const sql = await db();
  return (await sql.query(text, params)) as Row[];
}

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const str = (v: unknown, max: number): string => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");
const TYPES: WaMessageType[] = ["text", "image", "video", "audio", "voice", "document", "sticker", "system"];

// ===== المزامنة من كمبيوتر الـ IT - the sync from the IT PC =====
async function touchSync() {
  await q(`INSERT INTO wa_meta (key, value) VALUES ('last_sync', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [new Date().toISOString()]);
}

export async function lastSyncAt(): Promise<string | null> {
  const rows = await q(`SELECT value FROM wa_meta WHERE key = 'last_sync'`);
  return rows[0] ? String(rows[0].value) : null;
}

// الشكل في docs/whatsapp-agent.md - the shape is in docs/whatsapp-agent.md
export async function ingest(body: unknown): Promise<{ groups: number; messages: number }> {
  if (!body || typeof body !== "object") throw new WaError("body must be a JSON object");
  const b = body as { groups?: unknown; messages?: unknown };
  const rawGroups = Array.isArray(b.groups) ? b.groups.slice(0, 200) : [];
  const rawMessages = Array.isArray(b.messages) ? b.messages.slice(0, 1000) : [];

  const groups = rawGroups
    .map((g) => g as Row)
    .map((g) => ({
      id: str(g.id, 120),
      name: str(g.name, 200),
      participants: Number.isFinite(Number(g.participants)) && g.participants !== null ? Math.max(0, Math.round(Number(g.participants))) : null,
      picture: str(g.pictureMediaId ?? g.pictureId, 120) || null,
    }))
    .filter((g) => g.id);

  const messages = rawMessages
    .map((m) => m as Row)
    .map((m) => {
      const reply = m.replyTo && typeof m.replyTo === "object" ? (m.replyTo as Row) : null;
      const media = m.media && typeof m.media === "object" ? (m.media as Row) : null;
      const type = TYPES.includes(m.type as WaMessageType) ? (m.type as WaMessageType) : media ? "document" : "text";
      return {
        id: str(m.id, 160),
        groupId: str(m.groupId, 120),
        sender: str(m.senderName ?? m.sender, 120),
        at: iso(m.at),
        type,
        text: str(m.text, 8000) || null,
        replyId: reply ? str(reply.id, 160) || null : null,
        replySender: reply ? str(reply.senderName ?? reply.sender, 120) : null,
        replyText: reply ? str(reply.text, 500) : null,
        mediaId: media ? str(media.id, 120) || null : str(m.mediaId, 120) || null,
        deleted: m.deleted === true,
      };
    })
    .filter((m) => m.id && m.groupId && m.at);

  if (groups.length) {
    await q(
      `INSERT INTO wa_groups (id, name, participants, picture_media_id)
       SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[])
       ON CONFLICT (id) DO UPDATE SET
         name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE wa_groups.name END,
         participants = COALESCE(EXCLUDED.participants, wa_groups.participants),
         picture_media_id = COALESCE(EXCLUDED.picture_media_id, wa_groups.picture_media_id),
         updated_at = now()`,
      [groups.map((g) => g.id), groups.map((g) => g.name || g.id), groups.map((g) => g.participants), groups.map((g) => g.picture)]
    );
  }
  if (messages.length) {
    // جروب لسه مبعتش اسمه: بيتعمل باسم الـ id لحد ما الاسم يوصل - a group not sent yet: created with its id as the name
    const ids = Array.from(new Set(messages.map((m) => m.groupId)));
    await q(`INSERT INTO wa_groups (id, name) SELECT g, g FROM unnest($1::text[]) AS g ON CONFLICT (id) DO NOTHING`, [ids]);
    // نفس الرسالة تاني = تعديل أو مسح (الـ id هو هو) - the same message again = an edit or a delete (same id)
    await q(
      `INSERT INTO wa_messages (id, group_id, sender, at, type, body, reply_id, reply_sender, reply_text, media_id, deleted)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::text[], $6::text[], $7::text[],
                            $8::text[], $9::text[], $10::text[], $11::boolean[])
       ON CONFLICT (id) DO UPDATE SET
         body = EXCLUDED.body, media_id = COALESCE(EXCLUDED.media_id, wa_messages.media_id), deleted = EXCLUDED.deleted,
         sender = CASE WHEN EXCLUDED.sender <> '' THEN EXCLUDED.sender ELSE wa_messages.sender END`,
      [
        messages.map((m) => m.id),
        messages.map((m) => m.groupId),
        messages.map((m) => m.sender),
        messages.map((m) => m.at),
        messages.map((m) => m.type),
        messages.map((m) => m.text),
        messages.map((m) => m.replyId),
        messages.map((m) => m.replySender),
        messages.map((m) => m.replyText),
        messages.map((m) => m.mediaId),
        messages.map((m) => m.deleted),
      ]
    );
  }
  await touchSync();
  await cleanupIfDue();
  return { groups: groups.length, messages: messages.length };
}

// ===== الملفات - files =====
export async function saveMedia(input: { id: string; body: ArrayBuffer; mime: string; fileName: string | null }): Promise<{ id: string; size: number }> {
  if (!blobConfigured()) throw new WaError("BLOB_READ_WRITE_TOKEN مش متظبط — فعّل Vercel Blob من Vercel → Storage", 503);
  const id = str(input.id, 120);
  if (!id) throw new WaError("x-media-id is required");
  const size = input.body.byteLength;
  if (size === 0) throw new WaError("empty file");
  if (size > cfg.maxUploadMB * 1024 * 1024) throw new WaError(`file too large: at most ${cfg.maxUploadMB} MB`, 413);
  const safe = id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  // private = محدش يقدر يفتحه غير من الداشبورد بعد الدخول، وبيتمسح لوحده بعد retentionDays.media يوم
  // private = only reachable through the dashboard after login; deleted by itself after retentionDays.media days
  const blob = await put(`wa/${safe}`, Buffer.from(input.body), {
    access: "private",
    addRandomSuffix: true,
    contentType: input.mime || "application/octet-stream",
    ttlDays: cfg.retentionDays.media,
    token: blobToken(),
  });
  const old = await q(`SELECT pathname FROM wa_media WHERE id = $1`, [id]);
  await q(
    `INSERT INTO wa_media (id, pathname, mime, file_name, size, at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET pathname = EXCLUDED.pathname, mime = EXCLUDED.mime, file_name = EXCLUDED.file_name,
       size = EXCLUDED.size, at = now()`,
    [id, blob.pathname, input.mime || null, input.fileName, size]
  );
  // نفس الملف اتبعت تاني: القديم يتمسح - the same file sent again: the old copy is deleted
  if (old[0]?.pathname && old[0].pathname !== blob.pathname) await del(String(old[0].pathname), { token: blobToken() }).catch(() => {});
  await touchSync();
  return { id, size };
}

export async function openMedia(id: string): Promise<{ stream: ReadableStream<Uint8Array>; mime: string; fileName: string | null; size: number | null } | null> {
  const rows = await q(`SELECT pathname, mime, file_name, size FROM wa_media WHERE id = $1`, [str(id, 120)]);
  const row = rows[0];
  if (!row || !blobConfigured()) return null;
  const result = await get(String(row.pathname), { access: "private", token: blobToken() });
  if (!result || result.statusCode !== 200) return null;
  return {
    stream: result.stream,
    mime: String(row.mime || result.blob.contentType || "application/octet-stream"),
    fileName: row.file_name ? String(row.file_name) : null,
    size: row.size === null || row.size === undefined ? null : Number(row.size),
  };
}

// ===== التنضيف - retention =====
async function cleanupIfDue() {
  const rows = await q(`SELECT value FROM wa_meta WHERE key = 'last_cleanup'`);
  const last = rows[0] ? Date.parse(String(rows[0].value)) : 0;
  if (Date.now() - last < 6 * 3600_000) return;
  await q(`INSERT INTO wa_meta (key, value) VALUES ('last_cleanup', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [new Date().toISOString()]);
  await q(`DELETE FROM wa_messages WHERE at < now() - make_interval(days => $1::int)`, [cfg.retentionDays.text]);
  const old = await q(`DELETE FROM wa_media WHERE at < now() - make_interval(days => $1::int) RETURNING pathname`, [cfg.retentionDays.media]);
  // Blob بيمسحهم لوحده (ttlDays)، وده للاحتياط - Blob expires them itself (ttlDays); this is a safety net
  const paths = old.map((r) => String(r.pathname)).filter(Boolean);
  if (paths.length && blobConfigured()) await del(paths, { token: blobToken() }).catch(() => {});
}

// ===== القراية - reading =====
const MESSAGE_SELECT = `
  m.id, m.group_id, m.sender, m.at, m.type, m.body, m.reply_id, m.reply_sender, m.reply_text, m.media_id, m.deleted,
  md.id AS md_id, md.mime AS md_mime, md.file_name AS md_name, md.size AS md_size`;

function toMessage(r: Row): WaMessage {
  const mediaId = r.media_id ? String(r.media_id) : null;
  const media: WaMedia | null = mediaId
    ? {
        id: mediaId,
        mime: r.md_mime ? String(r.md_mime) : null,
        fileName: r.md_name ? String(r.md_name) : null,
        size: r.md_size === null || r.md_size === undefined ? null : Number(r.md_size),
        available: !!r.md_id,
      }
    : null;
  return {
    id: String(r.id),
    groupId: String(r.group_id),
    sender: String(r.sender ?? ""),
    at: iso(r.at) ?? "",
    type: (TYPES.includes(r.type as WaMessageType) ? r.type : "text") as WaMessageType,
    text: r.deleted ? null : r.body ? String(r.body) : null,
    reply: r.reply_sender || r.reply_text ? { id: r.reply_id ? String(r.reply_id) : null, sender: String(r.reply_sender ?? ""), text: String(r.reply_text ?? "") } : null,
    media: r.deleted ? null : media,
    deleted: r.deleted === true,
    ...(r.group_name ? { groupName: String(r.group_name) } : {}),
  };
}

// الجروبات + آخر رسالة + غير المقري من آخر زيارة (seen = {groupId: ISO}) - groups + last message + unread since the last visit
export async function listGroups(seen: Record<string, string>): Promise<WaGroup[]> {
  const rows = await q(`
    SELECT g.id, g.name, g.participants, g.picture_media_id,
           m.at AS last_at, m.sender AS last_sender, m.body AS last_body, m.type AS last_type, m.deleted AS last_deleted
    FROM wa_groups g
    LEFT JOIN LATERAL (
      SELECT at, sender, body, type, deleted FROM wa_messages WHERE group_id = g.id ORDER BY at DESC, id DESC LIMIT 1
    ) m ON true`);
  const seenIds = Object.keys(seen).filter((k) => iso(seen[k]));
  const unread = new Map<string, number>();
  if (seenIds.length) {
    const counts = await q(
      `SELECT m.group_id, LEAST(count(*), 999)::int AS n
       FROM wa_messages m JOIN unnest($1::text[], $2::timestamptz[]) AS s(gid, ts) ON m.group_id = s.gid AND m.at > s.ts
       WHERE NOT m.deleted GROUP BY m.group_id`,
      [seenIds, seenIds.map((k) => iso(seen[k]))]
    );
    counts.forEach((c) => unread.set(String(c.group_id), Number(c.n)));
  }
  const hidden = new Set(cfg.hidden);
  return rows
    .filter((r) => !hidden.has(String(r.id)) && !hidden.has(String(r.name)))
    .map((r) => ({
      id: String(r.id),
      name: String(r.name || r.id),
      participants: r.participants === null || r.participants === undefined ? null : Number(r.participants),
      pictureId: r.picture_media_id ? String(r.picture_media_id) : null,
      lastAt: iso(r.last_at),
      lastSender: r.last_sender ? String(r.last_sender) : null,
      lastText: r.last_deleted ? "🚫 الرسالة اتمسحت" : r.last_body ? String(r.last_body).slice(0, 160) : null,
      lastType: r.last_type ? (String(r.last_type) as WaMessageType) : null,
      unread: unread.get(String(r.id)) ?? 0,
    }));
}

// رسايل جروب: before = الأقدم من الرسالة دي (الأحدث الأول)، after = الأحدث منها (الأقدم الأول)
// A group's messages: before = older than this one (newest first); after = newer than it (oldest first)
export async function listMessages(groupId: string, cursor: { before?: { at: string; id: string }; after?: { at: string; id: string } }): Promise<Omit<WaMessagesResponse, "lastSyncAt">> {
  const gid = str(groupId, 120);
  const groupRows = (await listGroups({})).filter((g) => g.id === gid);
  const limit = cfg.pageSize;
  let rows: Row[];
  if (cursor.after) {
    rows = await q(
      `SELECT ${MESSAGE_SELECT} FROM wa_messages m LEFT JOIN wa_media md ON md.id = m.media_id
       WHERE m.group_id = $1 AND (m.at, m.id) > ($2::timestamptz, $3::text) ORDER BY m.at ASC, m.id ASC LIMIT 300`,
      [gid, cursor.after.at, cursor.after.id]
    );
    return { group: groupRows[0] ?? null, messages: rows.map(toMessage), hasMore: false };
  }
  rows = cursor.before
    ? await q(
        `SELECT ${MESSAGE_SELECT} FROM wa_messages m LEFT JOIN wa_media md ON md.id = m.media_id
         WHERE m.group_id = $1 AND (m.at, m.id) < ($2::timestamptz, $3::text) ORDER BY m.at DESC, m.id DESC LIMIT $4`,
        [gid, cursor.before.at, cursor.before.id, limit + 1]
      )
    : await q(
        `SELECT ${MESSAGE_SELECT} FROM wa_messages m LEFT JOIN wa_media md ON md.id = m.media_id
         WHERE m.group_id = $1 ORDER BY m.at DESC, m.id DESC LIMIT $2`,
        [gid, limit + 1]
      );
  return { group: groupRows[0] ?? null, messages: rows.slice(0, limit).map(toMessage), hasMore: rows.length > limit };
}

// البحث: كلام / اسم الراسل / يوم (بتوقيت القاهرة)، في جروب واحد أو كلهم - search by text / sender / day, one group or all
export async function search(input: { q: string; sender: string; date: string; groupId: string }): Promise<WaMessage[]> {
  const where: string[] = ["NOT m.deleted"];
  const params: unknown[] = [];
  const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  if (input.groupId) {
    params.push(str(input.groupId, 120));
    where.push(`m.group_id = $${params.length}`);
  }
  if (input.q.trim()) {
    params.push(like(input.q.trim().slice(0, 200)));
    where.push(`(m.body ILIKE $${params.length} OR md.file_name ILIKE $${params.length})`);
  }
  if (input.sender.trim()) {
    params.push(like(input.sender.trim().slice(0, 120)));
    where.push(`m.sender ILIKE $${params.length}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    params.push(input.date);
    where.push(`(m.at AT TIME ZONE 'Africa/Cairo')::date = $${params.length}::date`);
  }
  if (params.length === (input.groupId ? 1 : 0)) throw new WaError("اكتب كلمة أو اسم أو اختار يوم");
  params.push(cfg.searchLimit);
  const rows = await q(
    `SELECT ${MESSAGE_SELECT}, g.name AS group_name FROM wa_messages m
     LEFT JOIN wa_media md ON md.id = m.media_id LEFT JOIN wa_groups g ON g.id = m.group_id
     WHERE ${where.join(" AND ")} ORDER BY m.at DESC, m.id DESC LIMIT $${params.length}`,
    params
  );
  return rows.map(toMessage);
}
