// شاشة الأوبريتر على السيرفر: اختيارات الفورم، طرحات النهارده، وحفظ طرحة جديدة في ERPNext (Kiln Exit + Trolley جديد)
// The operator screen, server side: form choices, today's exits, and saving a new exit to ERPNext (Kiln Exit + new Trolley)
import { dashboardConfig } from "@/config/dashboard.config";
import { ErpError, erpInsert, erpPost, erpToday } from "./erp";
import { normalizeArabic } from "./data-source";
import { BatchesMapping, doctypeInfo } from "./production";
import { getPending, restorePending, takePending } from "./scale-pending";
import { OperatorExit, OperatorOptions, OperatorSaveRequest, OperatorTrolley } from "./types";

const cfg = dashboardConfig.operator;

export class OperatorError extends Error {
  constructor(message: string, readonly status = 400, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function mapping(): BatchesMapping {
  const batches = dashboardConfig.erp.batches;
  if (batches.source !== "erp") throw new OperatorError("erp.batches is not connected to ERPNext", 503);
  return batches;
}

// وقت القاهرة "YYYY-MM-DD HH:mm:ss" (نفس شكل ERPNext) - Cairo local time in ERPNext's format
const cairoFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
export function cairoDateTime(at: Date): string {
  const p = Object.fromEntries(cairoFmt.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// ===== الترولات (كاش دقيقة) - trolleys (1 min cache) =====
let trolleyCache: { at: number; list: OperatorTrolley[] } | null = null;
async function trolleys(fresh = false): Promise<OperatorTrolley[]> {
  if (!fresh && trolleyCache && Date.now() - trolleyCache.at < 60_000) return trolleyCache.list;
  const { message } = await erpPost<{ message: { name: string; trolley_no: number | null; empty_weight_kg: number | null }[] }>(
    "/api/method/frappe.client.get_list",
    { doctype: cfg.trolleyDoctype, fields: ["name", "trolley_no", "empty_weight_kg"], limit_page_length: 0 }
  );
  const list = message
    .map((t) => ({ no: Number(t.trolley_no ?? t.name), emptyKg: Number(t.empty_weight_kg) || 0 }))
    .filter((t) => Number.isInteger(t.no) && t.no > 0)
    .sort((a, b) => a.no - b.no);
  trolleyCache = { at: Date.now(), list };
  return list;
}

// الأنواع بنفس كتابة ERPNext بالظبط (Select لازم يتطابق)، واللون من erp.batches.types
// Types spelled exactly like the ERPNext options (a Select must match), colored from erp.batches.types
function typesFrom(options: string[], m: BatchesMapping) {
  const colorOf = (label: string) =>
    m.types.find((t) => [t.label, ...(t.aliases ?? [])].some((n) => normalizeArabic(n) === normalizeArabic(label)))?.color ?? m.defaultTypeColor;
  const labels = options.length ? options : m.types.map((t) => t.label);
  return labels.map((label) => ({ label, color: colorOf(label) }));
}

export async function operatorOptions(): Promise<OperatorOptions> {
  const m = mapping();
  const [info, list] = await Promise.all([doctypeInfo(m), trolleys()]);
  return { kilns: cfg.kilns, rooms: cfg.rooms, types: typesFrom(info.options, m), trolleys: list, manualField: info.fields.includes(cfg.manualField) };
}

// ===== طرحات النهارده - today's exits =====
const kg = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
};

export async function todayExits(): Promise<OperatorExit[]> {
  const m = mapping();
  const info = await doctypeInfo(m);
  const has = (f: string) => info.fields.includes(f);
  const today = erpToday();
  const fields = ["name", "kiln", "exit_time", m.typeField, ...[m.weightField, m.fullWeightField, m.emptyWeightField, m.trolleyField, m.roomField, cfg.manualField].filter(has)];
  const { message } = await erpPost<{ message: Record<string, unknown>[] }>("/api/method/frappe.client.get_list", {
    doctype: m.exitsDoctype,
    fields,
    filters: [["exit_time", ">=", `${today} 00:00:00`], ["exit_time", "<=", `${today} 23:59:59`]],
    order_by: "exit_time desc, creation desc",
    limit_page_length: 200,
  });
  return message.map((r) => ({
    name: String(r.name),
    time: String(r.exit_time ?? "").slice(11, 16),
    kiln: String(r.kiln ?? ""),
    room: String(r[m.roomField] ?? ""),
    type: String(r[m.typeField] ?? ""),
    trolley: String(r[m.trolleyField] ?? ""),
    grossKg: kg(r[m.fullWeightField]),
    tareKg: kg(r[m.emptyWeightField]),
    netKg: kg(r[m.weightField]),
    manual: Number(r[cfg.manualField]) === 1,
  }));
}

// ===== الحفظ - saving =====

// نفس الترول اتسجل في آخر duplicateTrolleyMinutes؟ - was the same trolley saved in the last few minutes?
async function recentSameTrolley(trolley: number): Promise<{ time: string; kiln: string; netKg: number | null } | null> {
  const m = mapping();
  const since = cairoDateTime(new Date(Date.now() - cfg.duplicateTrolleyMinutes * 60_000));
  const { message } = await erpPost<{ message: Record<string, unknown>[] }>("/api/method/frappe.client.get_list", {
    doctype: m.exitsDoctype,
    fields: ["name", "kiln", "exit_time", m.weightField],
    filters: [[m.trolleyField, "=", String(trolley)], ["creation", ">=", since]],
    order_by: "creation desc",
    limit_page_length: 1,
  });
  const r = message[0];
  return r ? { time: String(r.exit_time ?? "").slice(11, 16), kiln: String(r.kiln ?? ""), netKg: kg(r[m.weightField]) } : null;
}

export async function saveExit(input: OperatorSaveRequest): Promise<{ name: string; netKg: number; trolleyCreated: boolean }> {
  const m = mapping();
  const [info, known] = await Promise.all([doctypeInfo(m), trolleys(true)]);
  const has = (f: string) => info.fields.includes(f);

  // التحقق - validation
  if (!cfg.kilns.includes(input.kiln)) throw new OperatorError("اختار الفرن");
  if (!cfg.rooms.includes(input.room)) throw new OperatorError("اختار الغرفة");
  const types = typesFrom(info.options, m).map((t) => t.label);
  if (!types.includes(input.type)) throw new OperatorError("اختار النوع");
  const trolleyNo = Number(input.trolley);
  if (!Number.isInteger(trolleyNo) || trolleyNo <= 0 || trolleyNo > 99_999) throw new OperatorError("رقم الترول غلط");

  // الوزن الممتلئ: من الوزنة المستنية لو فيه (السيرفر مش بيصدق رقم المتصفح)، وإلا اللي اتكتب
  // Gross: from the pending weighing when there is one (the browser's number is not trusted), else the typed one
  const pending = input.pendingId ? await getPending(input.pendingId) : null;
  if (input.pendingId && !pending) throw new OperatorError("الوزنة دي اتسجلت أو اتشالت خلاص", 409, { gone: true });
  const gross = pending ? pending.grossKg : Number(input.grossKg);
  if (!Number.isFinite(gross) || gross <= 0 || gross > cfg.maxKg) throw new OperatorError("اكتب الوزن الممتلئ");

  // الفاضي: من ERPNext للترول المسجل، وإلا اللي اتكتب - tare: from ERPNext for a known trolley, else the typed one
  const trolley = known.find((t) => t.no === trolleyNo) ?? null;
  const tare = trolley ? trolley.emptyKg : Number(input.tareKg);
  if (!Number.isFinite(tare) || tare <= 0 || tare > cfg.maxKg) throw new OperatorError("اكتب وزن الترول الفاضي");
  const net = Math.round((gross - tare) * 10) / 10;
  if (net <= 0) throw new OperatorError("الصافي لازم يبقى أكبر من صفر — راجع الوزن");

  if (!input.confirmDuplicate) {
    const recent = await recentSameTrolley(trolleyNo);
    if (recent) {
      throw new OperatorError(`الترول ${trolleyNo} اتسجل من شوية (${recent.time} — ${recent.kiln})`, 409, { duplicate: recent });
    }
  }

  // الترول الجديد: بيتحفظ لو الأوبريتر عايز، وإلا الطرحة من غير رقم ترول (Link لازم يبقى موجود)
  // A new trolley: created when asked; otherwise the exit is saved without a trolley (a Link must exist)
  let trolleyCreated = false;
  if (!trolley && input.saveTrolley) {
    try {
      await erpInsert(cfg.trolleyDoctype, { trolley_no: trolleyNo, empty_weight_kg: tare });
      trolleyCreated = true;
      trolleyCache = null;
    } catch (error) {
      // اتعمل في نفس اللحظة من جهاز تاني؟ - created at the same moment elsewhere?
      if (!(await trolleys(true)).some((t) => t.no === trolleyNo)) {
        throw new OperatorError(`مقدرناش نحفظ الترول ${trolleyNo}: ${error instanceof Error ? error.message : error}`, 502);
      }
    }
  }
  const linkTrolley = !!trolley || input.saveTrolley;

  // الوزنة المستنية بتتشال قبل الحفظ عشان اتنين ميسجلوهاش مع بعض، وبترجع لو الحفظ فشل
  // The pending weighing is taken before saving so two operators can't both save it; restored if saving fails
  if (pending && !(await takePending(pending.id))) throw new OperatorError("الوزنة دي اتسجلت خلاص من جهاز تاني", 409, { gone: true });

  const doc: Record<string, unknown> = {
    kiln: input.kiln,
    [m.roomField]: input.room,
    [m.typeField]: input.type,
    exit_time: cairoDateTime(pending ? new Date(pending.time) : new Date()),
    [m.weightField]: net,
  };
  if (has(m.fullWeightField)) doc[m.fullWeightField] = gross;
  if (has(m.emptyWeightField)) doc[m.emptyWeightField] = tare;
  if (linkTrolley) doc[m.trolleyField] = String(trolleyNo);
  // يدوي = الوزن اتكتب بالإيد (مش من وزنة مستنية ولا من الميزان المباشر) - manual = typed, not from a pending / live scale
  if (has(cfg.manualField)) doc[cfg.manualField] = !pending && !input.fromScale ? 1 : 0;

  try {
    const saved = await erpInsert<{ name: string }>(m.exitsDoctype, doc);
    return { name: saved.name, netKg: net, trolleyCreated };
  } catch (error) {
    if (pending) await restorePending(pending).catch(() => null);
    const message = error instanceof ErpError ? error.message : String(error);
    console.error("[operator] save failed:", message);
    throw new OperatorError(`الحفظ في ERPNext فشل — جرب تاني (${message})`, 502);
  }
}
