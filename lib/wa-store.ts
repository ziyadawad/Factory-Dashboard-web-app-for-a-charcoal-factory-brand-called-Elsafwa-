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
import { WaGroup, WaMedia, WaMessage, WaMessageType, WaMessagesResponse, WaStatus } from "./types";
import { eventsConfigured, eventsSince, pushEvents, WaEvent } from "./wa-events";

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
  // وقت ما الرسالة وصلت السيرفر (جدول قديم بياخده كمان) - when the message reached the server (added to older tables too)
  `ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now()`,
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
  const d = v instanceof Date ? v : typeof v === "number" ? new Date(v) : new Date(String(v));
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

// ===== قراية شكل الإيجنت: بيقبل الشكل في docs/whatsapp-agent.md، وكمان الأشكال المشهورة من مكتبات الواتساب
// (whatsapp-web.js / Baileys): id جوه object ({_serialized})، chatId / from / remoteJid، timestamp بالثواني، body / caption
// Reading the agent's shape: the documented one, plus the common WhatsApp library shapes (whatsapp-web.js / Baileys):
// ids as objects ({_serialized}), chatId / from / remoteJid, timestamp in seconds, body / caption
function idOf(v: unknown, max = 160): string {
  if (typeof v === "string" || typeof v === "number") return String(v).trim().slice(0, max);
  if (v && typeof v === "object") {
    const o = v as Row;
    return idOf(o._serialized ?? o.id ?? o.jid ?? (o.user && o.server ? `${o.user}@${o.server}` : ""), max);
  }
  return "";
}
// وقت: ISO، أو رقم بالثواني / بالملي ثانية (رقم أو نص) - a time: ISO, or epoch seconds / ms (number or numeric string)
function timeOf(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  if (Number.isFinite(n)) return iso(n < 1e12 ? n * 1000 : n);
  return iso(v);
}
const first = (o: Row, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
const TYPE_ALIASES: Record<string, WaMessageType> = {
  text: "text", chat: "text", conversation: "text", extendedtextmessage: "text",
  image: "image", imagemessage: "image",
  video: "video", videomessage: "video", gif: "video",
  audio: "audio", audiomessage: "audio",
  voice: "voice", ptt: "voice",
  document: "document", documentmessage: "document", file: "document",
  sticker: "sticker", stickermessage: "sticker",
  system: "system", notification: "system", notification_template: "system", e2e_notification: "system", gp2: "system", call_log: "system",
};

type ParsedMessage = {
  id: string; groupId: string; sender: string; at: string; type: WaMessageType; text: string | null;
  replyId: string | null; replySender: string | null; replyText: string | null; mediaId: string | null; deleted: boolean;
};

// سبب رفض الرسالة (بيرجع للإيجنت ويتخزن في wa_meta.last_ingest) - why a message was rejected (returned and stored)
type Reject = "no id" | "no group id" | "no/invalid time" | "not an object";

function parseMessage(raw: unknown): ParsedMessage | Reject {
  if (!raw || typeof raw !== "object") return "not an object";
  const m = raw as Row;
  const key = m.key && typeof m.key === "object" ? (m.key as Row) : {};
  const id = idOf(first(m, ["id", "messageId", "msgId"]) ?? key.id, 160);
  if (!id) return "no id";
  const chat = m.chat && typeof m.chat === "object" ? (m.chat as Row) : {};
  let groupId = idOf(first(m, ["groupId", "group_id", "chatId", "chat_id", "remoteJid", "jid"]) ?? chat.id ?? key.remoteJid, 120);
  if (!groupId) {
    // whatsapp-web.js: رسالة جاية = from هو الجروب، رسالة مني = to هو الجروب - incoming: from is the group; mine: to is the group
    const from = idOf(m.from, 120);
    const to = idOf(m.to, 120);
    groupId = from.endsWith("@g.us") ? from : to.endsWith("@g.us") ? to : from || to;
  }
  if (!groupId) return "no group id";
  const at = timeOf(first(m, ["at", "timestamp", "time", "t", "messageTimestamp", "date", "sentAt"]));
  if (!at) return "no/invalid time";

  const rawType = String(first(m, ["type", "messageType"]) ?? "").toLowerCase();
  const deleted = m.deleted === true || m.isDeleted === true || rawType === "revoked";
  const media = m.media && typeof m.media === "object" ? (m.media as Row) : null;
  const textValue = first(m, ["text", "body", "caption", "content", "message"]);
  const hasText = typeof textValue === "string" && textValue.trim() !== "";
  let mediaId = (media ? idOf(first(media, ["id", "mediaId"]), 120) : "") || idOf(m.mediaId, 120) || (m.hasMedia === true ? id.slice(0, 120) : "") || null;
  // نوع مش معروف (زي الرسايل القديمة المستوردة): نص لو فيه كلام، وملف بس لو مفيش كلام وفيه ملف
  // An unknown type (e.g. old imported messages): text when there are words; a file only with no words and a file
  let type: WaMessageType = TYPE_ALIASES[rawType] ?? (TYPES.includes(rawType as WaMessageType) ? (rawType as WaMessageType) : mediaId && !hasText ? "document" : "text");
  // رسالة نص / نظام عمرها ما تتعرض كملف - a text / system message is never shown as a file
  if (type === "text" || type === "system") mediaId = null;
  if (!mediaId && type === "document" && hasText) type = "text";

  const sender = str(
    first(m, ["senderName", "sender_name", "pushName", "notifyName", "authorName", "fromName"]) ??
      (typeof m.sender === "string" ? m.sender : (m.sender as Row | undefined)?.name ?? (m.sender as Row | undefined)?.pushname) ??
      // وإلا رقم الراسل: author / participant، أو from لو مش الجروب (رسالة من رقم كمبيوتر الـ IT نفسه)
      // else the sender's number: author / participant, or from when it isn't the group (a message from the IT PC's number)
      (idOf(first(m, ["author", "participant"]) ?? key.participant, 120) || (idOf(m.from, 120).endsWith("@g.us") ? "" : idOf(m.from, 120))).replace(/@.*$/, ""),
    120
  );
  const textRaw = textValue;
  const reply = (first(m, ["replyTo", "quoted", "quotedMsg", "quotedMessage"]) ?? null) as Row | null;
  return {
    id,
    groupId,
    sender,
    at,
    type,
    text: typeof textRaw === "string" ? textRaw.replace(/\u0000/g, "").slice(0, 8000) || null : null,
    replyId: reply && typeof reply === "object" ? idOf(first(reply, ["id", "messageId"]), 160) || null : null,
    replySender: reply && typeof reply === "object" ? str(first(reply, ["senderName", "sender", "author", "pushName", "notifyName"]), 120).replace(/@.*$/, "") : null,
    replyText: reply && typeof reply === "object" ? str(first(reply, ["text", "body", "caption"]), 500).replace(/\u0000/g, "") : null,
    mediaId,
    deleted,
  };
}

function parseGroup(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Row;
  const id = idOf(first(g, ["id", "groupId", "chatId", "jid"]), 120);
  if (!id) return null;
  const p = g.participants ?? g.participantsCount ?? g.size;
  const participants = Array.isArray(p) ? p.length : Number.isFinite(Number(p)) && p !== null && p !== "" ? Math.max(0, Math.round(Number(p))) : null;
  return {
    id,
    name: str(first(g, ["name", "subject", "title"]), 200).replace(/\u0000/g, ""),
    participants,
    picture: idOf(first(g, ["pictureMediaId", "pictureId", "picture"]), 120) || null,
  };
}

export type IngestResult = {
  groups: { received: number; saved: number };
  messages: { received: number; saved: number; rejected: number };
  reasons: Record<string, number>;
};

// الشكل في docs/whatsapp-agent.md. لو اتبعت حاجة ومفيش ولا حاجة اتحفظت = WaError 422 بالأسباب (مش 200)
// The shape is in docs/whatsapp-agent.md. When something was sent but nothing could be saved = WaError 422 with reasons
export async function ingest(body: unknown): Promise<IngestResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WaError("body must be a JSON object: { groups: [...], messages: [...] }");
  const b = body as Row;
  const rawGroups = Array.isArray(b.groups) ? b.groups.slice(0, 500) : Array.isArray(b.chats) ? b.chats.slice(0, 500) : [];
  const rawMessages = Array.isArray(b.messages) ? b.messages.slice(0, 1000) : [];

  const groups = rawGroups.map(parseGroup).filter((g): g is NonNullable<ReturnType<typeof parseGroup>> => g !== null);
  const reasons: Record<string, number> = {};
  const messages: ParsedMessage[] = [];
  let sampleKeys: string[] | null = null;
  for (const raw of rawMessages) {
    const parsed = parseMessage(raw);
    if (typeof parsed === "string") {
      reasons[parsed] = (reasons[parsed] ?? 0) + 1;
      // أسامي الحقول بس (مش المحتوى) عشان نعرف الشكل اللي جاي - field names only (never content), to see the shape
      if (!sampleKeys && raw && typeof raw === "object") sampleKeys = Object.keys(raw as Row).slice(0, 30);
    } else messages.push(parsed);
  }
  if (rawGroups.length > groups.length) reasons["group without id"] = rawGroups.length - groups.length;
  // نفس الرسالة مرتين في نفس الطلب: الأخيرة تكسب (وإلا ON CONFLICT بيفشل) - the same message twice: the last wins
  const unique = Array.from(new Map(messages.map((m) => [m.id, m])).values());
  const uniqueGroups = Array.from(new Map(groups.map((g) => [g.id, g])).values());

  if (uniqueGroups.length) {
    await q(
      `INSERT INTO wa_groups (id, name, participants, picture_media_id)
       SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[])
       ON CONFLICT (id) DO UPDATE SET
         name = CASE WHEN EXCLUDED.name <> '' AND EXCLUDED.name <> EXCLUDED.id THEN EXCLUDED.name ELSE wa_groups.name END,
         participants = COALESCE(EXCLUDED.participants, wa_groups.participants),
         picture_media_id = COALESCE(EXCLUDED.picture_media_id, wa_groups.picture_media_id),
         updated_at = now()`,
      [uniqueGroups.map((g) => g.id), uniqueGroups.map((g) => g.name || g.id), uniqueGroups.map((g) => g.participants), uniqueGroups.map((g) => g.picture)]
    );
  }
  let inserted: Row[] = [];
  if (unique.length) {
    // جروب لسه مبعتش اسمه: بيتعمل باسم الـ id لحد ما الاسم يوصل - a group not sent yet: created with its id as the name
    const ids = Array.from(new Set(unique.map((m) => m.groupId)));
    await q(`INSERT INTO wa_groups (id, name) SELECT g, g FROM unnest($1::text[]) AS g ON CONFLICT (id) DO NOTHING`, [ids]);
    // نفس الرسالة تاني = تعديل أو مسح (الـ id هو هو) - the same message again = an edit or a delete (same id)
    inserted = await q(
      `INSERT INTO wa_messages (id, group_id, sender, at, type, body, reply_id, reply_sender, reply_text, media_id, deleted)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::text[], $6::text[], $7::text[],
                            $8::text[], $9::text[], $10::text[], $11::boolean[])
       ON CONFLICT (id) DO UPDATE SET
         body = COALESCE(EXCLUDED.body, wa_messages.body), media_id = COALESCE(EXCLUDED.media_id, wa_messages.media_id),
         deleted = EXCLUDED.deleted OR wa_messages.deleted,
         sender = CASE WHEN EXCLUDED.sender <> '' THEN EXCLUDED.sender ELSE wa_messages.sender END
       RETURNING group_id, at, type, deleted, (xmax = 0) AS inserted`,
      [
        unique.map((m) => m.id),
        unique.map((m) => m.groupId),
        unique.map((m) => m.sender),
        unique.map((m) => m.at),
        unique.map((m) => m.type),
        unique.map((m) => m.text),
        unique.map((m) => m.replyId),
        unique.map((m) => m.replySender),
        unique.map((m) => m.replyText),
        unique.map((m) => m.mediaId),
        unique.map((m) => m.deleted),
      ]
    );
  }

  const result: IngestResult = {
    groups: { received: rawGroups.length, saved: uniqueGroups.length },
    messages: { received: rawMessages.length, saved: unique.length, rejected: rawMessages.length - messages.length },
    reasons,
  };
  const received = rawGroups.length + rawMessages.length;
  const saved = uniqueGroups.length + unique.length;
  // آخر طلب (أرقام وأسامي حقول بس) عشان نعرف لو في مشكلة - the last request (counts and field names only) for diagnosis
  await q(`INSERT INTO wa_meta (key, value) VALUES ('last_ingest', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [
    JSON.stringify({ at: new Date().toISOString(), ...result, sampleRejectedKeys: sampleKeys }),
  ]);
  console.log(`[wa] ingest: groups ${result.groups.saved}/${result.groups.received}, messages ${result.messages.saved}/${result.messages.received}`, received > saved ? JSON.stringify(reasons) : "");

  if (received > 0 && saved === 0) {
    // اتبعت حاجة ومفيش ولا حاجة اتحفظت: غلط (مش 200)، وآخر مزامنة متتحركش - nothing saved: an error, last sync unchanged
    throw new WaError(
      `nothing saved: ${JSON.stringify(reasons)}. Each message needs id, groupId (or chatId/from), at (ISO or epoch). ` +
        (sampleKeys ? `Fields received: ${sampleKeys.join(", ")}` : ""),
      422
    );
  }
  // آخر مزامنة: لما حاجة اتحفظت، أو نبضة {} فاضية - last sync: when something was saved, or an empty {} heartbeat
  await touchSync();
  // تنبيه "رسالة جديدة": الرسايل الجديدة فعلا (مش تعديل) وحديثة (مش تاريخ قديم مستورد) - the alert: really new, recent messages
  await publishNew(inserted).catch((error) => console.error("[wa] alert events failed:", error instanceof Error ? error.message : error));
  // التنضيف مش بيبوظ طلب اتحفظ - the cleanup never fails a request that was saved
  await cleanupIfDue().catch((error) => console.error("[wa] cleanup failed:", error instanceof Error ? error.message : error));
  return result;
}

// رسايل جديدة فعلا (xmax = 0 = اتعملت دلوقتي مش اتعدلت)، مش نظام ولا ممسوحة، وأحدث من alertMaxAgeMinutes
// (الرسايل القديمة المستوردة عمرها ما تعمل تنبيه) - really new messages (inserted, not updated), not system / deleted,
// newer than alertMaxAgeMinutes (imported history never alerts)
async function publishNew(rows: Row[]) {
  const minAt = Date.now() - cfg.alertMaxAgeMinutes * 60_000;
  const fresh = rows.filter((r) => r.inserted === true && r.deleted !== true && r.type !== "system" && Date.parse(iso(r.at) ?? "") > minAt);
  if (fresh.length === 0) return;
  const byGroup = new Map<string, { count: number; at: string }>();
  for (const r of fresh) {
    const id = String(r.group_id);
    const at = iso(r.at) ?? "";
    const cur = byGroup.get(id);
    byGroup.set(id, { count: (cur?.count ?? 0) + 1, at: cur && cur.at > at ? cur.at : at });
  }
  const names = await q(`SELECT id, name FROM wa_groups WHERE id = ANY($1::text[])`, [Array.from(byGroup.keys())]);
  const nameOf = new Map(names.map((n) => [String(n.id), String(n.name)]));
  const hidden = new Set(cfg.hidden);
  await pushEvents(
    Array.from(byGroup, ([groupId, v]) => ({ groupId, groupName: nameOf.get(groupId) ?? groupId, count: v.count, at: v.at })).filter(
      (e) => !hidden.has(e.groupId) && !hidden.has(e.groupName)
    )
  );
}

// آخر رسايل جديدة للتنبيه: من Redis، ومن غيره من Postgres (كاش 10 ثواني على السيرفر)
// The latest new messages for the alert: from Redis; without it from Postgres (10 s server cache)
let latestCache: { at: number; since: string | null; value: { cursor: string; events: WaEvent[] } } | null = null;
export async function latestEvents(since: string | null): Promise<{ cursor: string; events: WaEvent[] }> {
  if (eventsConfigured()) return eventsSince(since);
  if (latestCache && latestCache.since === since && Date.now() - latestCache.at < 10_000) return latestCache.value;
  const rows = await q(
    // الـ cursor بالملي ثانية وPostgres بالمايكرو: المقارنة بالملي، وإلا نفس الرسايل بترجع كل مرة (الصوت اللي بيتكرر)
    // The cursor has milliseconds, Postgres microseconds: compare at ms, or the same messages come back every time
    `SELECT m.group_id, g.name, count(*)::int AS n, max(m.at) AS at, max(m.received_at) AS received
     FROM wa_messages m JOIN wa_groups g ON g.id = m.group_id
     WHERE date_trunc('milliseconds', m.received_at) > $1::timestamptz AND NOT m.deleted AND m.type <> 'system'
       AND m.at > now() - make_interval(mins => $2::int)
     GROUP BY m.group_id, g.name`,
    [since ?? new Date().toISOString(), cfg.alertMaxAgeMinutes]
  );
  const events: WaEvent[] = since
    ? rows.map((r) => ({ receivedAt: iso(r.received) ?? "", groupId: String(r.group_id), groupName: String(r.name), count: Number(r.n), at: iso(r.at) ?? "" }))
    : [];
  const latest = events.reduce((max, e) => (e.receivedAt > max ? e.receivedAt : max), since ?? new Date().toISOString());
  const value = { cursor: latest, events };
  latestCache = { at: Date.now(), since, value };
  return value;
}

// الرسايل الجديدة نفسها للـ spotlight: اللي وصلت بعد since في الجروبات دي (مش نظام ولا ممسوحة، وأحدث من alertMaxAgeMinutes)
// The new messages themselves for the spotlight: received after `since` in these groups (no system / deleted messages,
// newer than alertMaxAgeMinutes). The page drops ids it already showed, so an overlapping window is fine
export async function newMessages(since: string, groupIds: string[]): Promise<{ groups: { id: string; name: string; pictureId: string | null }[]; messages: WaMessage[] }> {
  const hidden = new Set(cfg.hidden);
  const ids = groupIds.map((id) => str(id, 120)).filter((id) => id && !hidden.has(id)).slice(0, 30);
  if (ids.length === 0) return { groups: [], messages: [] };
  const rows = await q(
    `SELECT ${MESSAGE_SELECT}, g.name AS group_name, g.picture_media_id AS group_picture
     FROM wa_messages m JOIN wa_groups g ON g.id = m.group_id LEFT JOIN wa_media md ON md.id = m.media_id
     WHERE m.group_id = ANY($1::text[]) AND date_trunc('milliseconds', m.received_at) > $2::timestamptz
       AND NOT m.deleted AND m.type <> 'system' AND m.at > now() - make_interval(mins => $3::int)
     ORDER BY m.at ASC, m.id ASC LIMIT 60`,
    [ids, since, cfg.alertMaxAgeMinutes]
  );
  const groups = new Map<string, { id: string; name: string; pictureId: string | null }>();
  for (const r of rows) {
    const id = String(r.group_id);
    if (!groups.has(id)) groups.set(id, { id, name: String(r.group_name || id), pictureId: r.group_picture ? String(r.group_picture) : null });
  }
  const list = Array.from(groups.values()).filter((g) => !hidden.has(g.name));
  const shown = new Set(list.map((g) => g.id));
  return { groups: list, messages: rows.map(toMessage).filter((m) => shown.has(m.groupId)) };
}

// ===== الحالة: الجداول والأرقام وآخر طلب - status: tables, row counts and the last request =====
export async function waStatus(): Promise<WaStatus> {
  const [counts, meta] = await Promise.all([
    q(`SELECT (SELECT count(*) FROM wa_groups)::int AS groups, (SELECT count(*) FROM wa_messages)::int AS messages,
              (SELECT count(*) FROM wa_media)::int AS media, (SELECT max(received_at) FROM wa_messages) AS latest_received_at,
              (SELECT max(at) FROM wa_messages) AS latest_message_at`),
    q(`SELECT key, value FROM wa_meta WHERE key IN ('last_sync', 'last_ingest')`),
  ]);
  const c = counts[0] ?? {};
  const get = (k: string) => meta.find((r) => r.key === k)?.value;
  let lastIngest: WaStatus["lastIngest"] = null;
  try {
    lastIngest = get("last_ingest") ? JSON.parse(String(get("last_ingest"))) : null;
  } catch {}
  return {
    database: "neon-postgres",
    counts: { groups: Number(c.groups ?? 0), messages: Number(c.messages ?? 0), media: Number(c.media ?? 0) },
    latestReceivedAt: iso(c.latest_received_at),
    latestMessageAt: iso(c.latest_message_at),
    lastSyncAt: get("last_sync") ? String(get("last_sync")) : null,
    lastIngest,
  };
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

// الملف بيظهر بس لرسالة نوعها ملف فعلا. رسالة "ملف" فيها كلام والملف مش متخزن (زي الرسايل القديمة المستوردة) = فقاعة نص عادية
// A file shows only for a real media message. A "file" message with words but no stored file (e.g. old imported
// messages) is shown as a normal text bubble
const MEDIA_TYPES: WaMessageType[] = ["image", "video", "audio", "voice", "document", "sticker"];
function toMessage(r: Row): WaMessage {
  let type = (TYPES.includes(r.type as WaMessageType) ? r.type : "text") as WaMessageType;
  const hasText = !!r.body && String(r.body).trim() !== "";
  if (type === "document" && hasText && !r.md_id) type = "text";
  const mediaId = r.media_id && MEDIA_TYPES.includes(type) ? String(r.media_id) : null;
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
    type,
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
           m.at AS last_at, m.sender AS last_sender, m.body AS last_body, m.type AS last_type, m.deleted AS last_deleted,
           (SELECT count(*) FROM wa_messages r WHERE r.group_id = g.id AND r.at > now() - interval '30 days' AND NOT r.deleted)::int AS recent
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
      // متوسط الرسايل في اليوم آخر 30 يوم - average messages per day over the last 30 days
      perDay: Math.round((Number(r.recent ?? 0) / 30) * 10) / 10,
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
