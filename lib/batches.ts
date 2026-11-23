// الطرحة = 2 أو 3 ترولات من نفس الفرن، وكل وزنة (سجل Kiln Exit) = ترول واحد
// التجميع: السجلات اللي ليها batch_id بتتجمع بيه (وعدد الترولات من batch_size)، والقديمة من غير batch_id بالقاعدة:
// نفس الفرن (ونفس الغرفة لو مكتوبة) وكل ترول خارج في حدود windowMinutes من الترول اللي قبله، وبحد أقصى maxTrolleys
// A "طرحة" (kiln exit batch) is 2 or 3 trolleys from the same kiln; each weighing (Kiln Exit record) is ONE trolley.
// Grouping: records with a batch_id group by it (size from batch_size); older ones without a batch_id by the rule:
// same kiln (+ same room when set), each trolley within windowMinutes of the previous one, at most maxTrolleys.
//
// الملف ده من غير أي import عشان السيرفر والمتصفح وسكريبتات node يستخدموه زي ما هو
// No imports on purpose: the server, the browser and plain node scripts all use this file as is

export interface BatchMember {
  id: string;
  date: string; // "2026-11-23" بتوقيت القاهرة - Cairo time
  time: string; // "07:15"
  kiln: string;
  room: string;
  type: string;
  trolley: string;
  kg: number | null; // الصافي - net
  batchId: string; // "" = مفيش (سجل قديم) - none (older record)
  batchSize: number | null;
}

export interface Batch<T extends BatchMember = BatchMember> {
  key: string; // batch_id، أو "auto:<أول سجل>" للمتجمع بالقاعدة - the batch_id, or "auto:<first record>" for rule-grouped
  batchId: string; // "" = متجمعة بالقاعدة - rule-grouped
  kiln: string;
  room: string;
  type: string;
  date: string; // تاريخ أول ترول - the first trolley's date
  time: string; // ساعة أول ترول - the first trolley's time
  lastTime: string;
  trolleys: T[]; // الأقدم الأول - oldest first
  size: number | null; // عدد الترولات المتوقع (batch_size)، null = مش معروف - expected trolleys, null = unknown
  count: number;
  weighed: number;
  kg: number;
  complete: boolean; // size معروف والترولات وصلته (أو size مش معروف) - reached size (or size unknown)
}

export type BatchRules = { windowMinutes: number; maxTrolleys: number };

// دقايق من غير منطقة زمنية (للفرق بين سجلين بتوقيت القاهرة) - naive minutes, for differences between Cairo times
export const minutesOf = (date: string, time: string) => Date.parse(`${date}T${time || "00:00"}:00Z`) / 60_000;

// دلوقتي بتوقيت القاهرة بنفس المقياس - "now" in Cairo time on the same naive scale
export function cairoNowMinutes(at = Date.now()): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value])
  );
  return minutesOf(`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`);
}

const sameRoom = (a: string, b: string) => !a || !b || a === b;

function newBatch<T extends BatchMember>(first: T, batchId: string): Batch<T> {
  return {
    key: batchId || `auto:${first.id}`,
    batchId,
    kiln: first.kiln,
    room: first.room,
    type: first.type,
    date: first.date,
    time: first.time,
    lastTime: first.time,
    trolleys: [],
    size: null,
    count: 0,
    weighed: 0,
    kg: 0,
    complete: true,
  };
}

function add<T extends BatchMember>(batch: Batch<T>, e: T) {
  batch.trolleys.push(e);
  batch.count += 1;
  batch.lastTime = e.time;
  batch.room ||= e.room;
  batch.type ||= e.type;
  if (e.batchSize && e.batchSize > 0) batch.size = Math.max(batch.size ?? 0, e.batchSize);
  if (e.kg !== null) {
    batch.weighed += 1;
    batch.kg += e.kg;
  }
}

// الترولات ← طرحات (الأحدث الأول) - trolleys -> batches, newest first
export function groupBatches<T extends BatchMember>(exits: T[], rules: BatchRules): Batch<T>[] {
  const ordered = [...exits].sort((a, b) => minutesOf(a.date, a.time) - minutesOf(b.date, b.time) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map<string, Batch<T>>();
  const batches: Batch<T>[] = [];
  // آخر طرحة متجمعة بالقاعدة لكل فرن - the latest rule-grouped batches per kiln
  const autoByKiln = new Map<string, Batch<T>[]>();
  for (const e of ordered) {
    if (e.batchId) {
      let b = byId.get(e.batchId);
      if (!b) {
        b = newBatch(e, e.batchId);
        byId.set(e.batchId, b);
        batches.push(b);
      }
      add(b, e);
      continue;
    }
    const now = minutesOf(e.date, e.time);
    const open = e.kiln
      ? (autoByKiln.get(e.kiln) ?? [])
          .filter((b) => b.date === e.date && sameRoom(b.room, e.room) && b.count < rules.maxTrolleys && now - minutesOf(b.date, b.lastTime) <= rules.windowMinutes)
          .pop()
      : undefined;
    if (open) {
      add(open, e);
      continue;
    }
    const b = newBatch(e, "");
    add(b, e);
    batches.push(b);
    if (e.kiln) autoByKiln.set(e.kiln, [...(autoByKiln.get(e.kiln) ?? []), b]);
  }
  for (const b of batches) {
    b.kg = Math.round(b.kg * 100) / 100;
    b.complete = b.size === null || b.count >= b.size;
  }
  return batches.sort((a, b) => minutesOf(b.date, b.time) - minutesOf(a.date, a.time) || (a.key < b.key ? 1 : -1));
}

// الطرحة اللي فيها السجل ده وترتيبه فيها (1 = الأول) - the batch holding this record and its position (1 = first)
export function batchOf<T extends BatchMember>(batches: Batch<T>[], id: string): { batch: Batch<T>; index: number } | null {
  for (const batch of batches) {
    const i = batch.trolleys.findIndex((t) => t.id === id);
    if (i >= 0) return { batch, index: i + 1 };
  }
  return null;
}

// الطرحة لسه مفتوحة؟ (ليها batch_id وعددها معروف وناقصة، وآخر ترول في حدود الوقت) - still open?
export function isOpen(batch: Batch, nowMinutes: number, rules: BatchRules): boolean {
  return !!batch.batchId && batch.size !== null && batch.count < batch.size && nowMinutes - minutesOf(batch.date, batch.lastTime) <= rules.windowMinutes;
}

// رقم الفرن من الاسم ("فرن 3" ← "3") - the kiln number from its name
export const kilnNumber = (kiln: string) => {
  const latin = kiln.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return (latin.match(/\d+/)?.[0] ?? latin.trim().replace(/\s+/g, "-")) || "0";
};

// batch_id جديد: KILN-3-20261123-0715 (فرن، تاريخ وساعة أول ترول) - a new batch_id from the kiln and first trolley time
export function makeBatchId(kiln: string, date: string, time: string): string {
  return `KILN-${kilnNumber(kiln)}-${date.replace(/-/g, "")}-${time.replace(":", "").slice(0, 4)}`;
}

// "2 من 3" أو "3 ترول" - progress text
export const progressText = (b: Pick<Batch, "count" | "size">) => (b.size !== null ? `${b.count} من ${b.size}` : `${b.count} ترول`);
