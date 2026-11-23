// أحداث "رسالة جديدة" للتنبيه على كل الصفحات: ingest بيكتب ليستة صغيرة في Upstash Redis، والشاشة بتسأل عليها كل
// whatsapp.latestPollSeconds بطلب واحد رخيص (GET واحد). من غير Redis: من Postgres مع كاش 10 ثواني
// "New message" events for the alert on every page: ingest writes a tiny list to Upstash Redis and the screen polls it
// every whatsapp.latestPollSeconds with one cheap request (one GET). Without Redis: from Postgres with a 10 s cache
// (Postgres is not polled on every page, so the free Neon database can still auto-suspend)

import { redis, redisSettings } from "./redis";

const KEY = "elsafwa:wa:events";
const KEEP = 100; // آخر 100 حدث - the last 100 events
const KEEP_MS = 24 * 3600_000; // وآخر 24 ساعة - and the last 24 hours

// رسايل جديدة في جروب (مجمّعة لكل طلب ingest) - new messages in one group (one per ingest request)
export interface WaEvent {
  receivedAt: string; // ISO: وصلت السيرفر امتى - when the server got them
  groupId: string;
  groupName: string;
  count: number;
  at: string; // ISO: وقت آخر رسالة فيهم - the latest message time
}

let memory: WaEvent[] = [];

async function readEvents(): Promise<WaEvent[]> {
  if (!redisSettings()) return memory;
  try {
    const raw = await redis<string>(["GET", KEY]);
    return raw ? (JSON.parse(raw) as WaEvent[]) : [];
  } catch (error) {
    console.error("[wa] events read failed:", error instanceof Error ? error.message : error);
    return memory;
  }
}

export async function pushEvents(list: Omit<WaEvent, "receivedAt">[]): Promise<void> {
  if (list.length === 0) return;
  const receivedAt = new Date().toISOString();
  const now = Date.now();
  const merged = [...(await readEvents()), ...list.map((e) => ({ ...e, receivedAt }))]
    .filter((e) => now - Date.parse(e.receivedAt) < KEEP_MS)
    .slice(-KEEP);
  memory = merged;
  if (redisSettings()) {
    try {
      await redis(["SET", KEY, JSON.stringify(merged), "EX", 2 * 86_400]);
    } catch (error) {
      // التنبيه مش بيبوظ الحفظ - the alert never fails a save
      console.error("[wa] events write failed:", error instanceof Error ? error.message : error);
    }
  }
}

export const eventsConfigured = () => !!redisSettings();

// الأحداث بعد since (والـ cursor الجديد). من غير since = الـ cursor بس (أول ما الصفحة تفتح مفيش تنبيه)
// Events after `since` (and the new cursor). Without since: the cursor only (no alert when the page opens)
export async function eventsSince(since: string | null): Promise<{ cursor: string; events: WaEvent[] }> {
  const all = await readEvents();
  const latest = all.reduce((max, e) => (e.receivedAt > max ? e.receivedAt : max), "");
  if (!since) return { cursor: latest || new Date().toISOString(), events: [] };
  const events = all.filter((e) => e.receivedAt > since);
  return { cursor: latest > since ? latest : since, events };
}
