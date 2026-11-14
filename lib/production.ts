// الإنتاج والأفران: سجلات Kiln Exit (طرحة لكل سجل) من أول الشهر (أو من امبارح لو أول الشهر) لحد النهارده
// + حالة الأفران من Workstation. قراية بس من ERPNext، كاش production.cacheSeconds على السيرفر
// Production and kilns: Kiln Exit records (one per batch) from the month start (or yesterday, on the 1st) to today,
// plus each kiln's Workstation status. Read-only; cached production.cacheSeconds on the server.
// الملخصات (طن النهارده، لكل فرن/نوع/ساعة) بتتحسب في الواجهة من القايمة دي (lib/production-stats.ts)
// The summaries (today's tons, per kiln / type / hour) are computed in the UI from this list (lib/production-stats.ts)

import { erpGet, erpToday } from "./erp";
import { loadKilns, normalizeArabic } from "./data-source";
import { ConfigErpBatches, ProductionData, ProductionExit, ProductionType } from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

type BatchesMapping = Extract<ConfigErpBatches, { source: "erp" }>;
type KilnExitRow = { name: string; kiln: string | null; exit_time: string | null } & Record<string, string | number | null>;

// تعريف الـ DocType: خيارات حقل النوع، وهل حقل الوزن موجود (كاش optionsCacheMinutes، ولو فشل آخر نتيجة نجحت)
// The DocType: the type field's options and whether the weight field exists (cached; on failure the last good one)
type DoctypeInfo = { options: string[]; hasWeight: boolean };
let doctypeCache: { at: number; info: DoctypeInfo } | null = null;
async function doctypeInfo(mapping: BatchesMapping): Promise<DoctypeInfo> {
  const maxAge = mapping.optionsCacheMinutes * 60_000;
  if (doctypeCache && Date.now() - doctypeCache.at < maxAge) return doctypeCache.info;
  try {
    const body = await erpGet<{ docs?: { fields?: { fieldname: string; options?: string | null }[] }[] }>(
      "/api/method/frappe.desk.form.load.getdoctype",
      { doctype: mapping.exitsDoctype }
    );
    const fields = body.docs?.[0]?.fields ?? [];
    const field = fields.find((f) => f.fieldname === mapping.typeField);
    const info = {
      options: (field?.options ?? "").split("\n").map((o) => o.trim()).filter(Boolean),
      hasWeight: fields.some((f) => f.fieldname === mapping.weightField),
    };
    doctypeCache = { at: Date.now(), info };
    return info;
  } catch (error) {
    console.error("[erp] production: could not read the Kiln Exit DocType:", error instanceof Error ? error.message : error);
    return doctypeCache?.info ?? { options: [], hasWeight: false };
  }
}

// الأنواع بالترتيب: المعروفة (بترتيب الكونفج ولونها) اللي في خيارات ERPNext، وبعدها الجديدة بـ defaultTypeColor.
// لو الخيارات مش متاحة: أنواع الكونفج كلها. resolve بيرجع النوع لأي كتابة (ولو جديد بيضيفه في الآخر)
// Types in order: the known ones (config order and color) that are among the ERPNext options, then new ones in
// defaultTypeColor. Without options: every config type. resolve() maps any spelling to its type (appending new ones)
function typeList(mapping: ConfigErpBatches, options: string[]) {
  const known = mapping.types.map((t) => ({ label: t.label, color: t.color, names: [t.label, ...(t.aliases ?? [])].map(normalizeArabic) }));
  const findKnown = (raw: string) => known.find((t) => t.names.includes(normalizeArabic(raw)));
  const optionKeys = new Set(options.map((o) => normalizeArabic(findKnown(o)?.label ?? o)));
  const types: ProductionType[] = (options.length ? known.filter((t) => optionKeys.has(normalizeArabic(t.label))) : known).map((t) => ({
    label: t.label,
    color: t.color,
  }));
  const resolve = (raw: string): ProductionType => {
    const match = findKnown(raw);
    const label = match?.label ?? raw;
    let type = types.find((t) => normalizeArabic(t.label) === normalizeArabic(label));
    if (!type) {
      type = { label, color: match?.color ?? mapping.defaultTypeColor };
      types.push(type);
    }
    return type;
  };
  options.forEach(resolve);
  return { types, resolve };
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// الوزن بالكيلو: فاضي / صفر / مش رقم = بدون وزن (null) - weight in kg: empty / zero / not a number = no weight
function kgOf(value: unknown): number | null {
  const kg = Number(value);
  return Number.isFinite(kg) && kg > 0 ? Math.round(kg * 100) / 100 : null;
}

async function loadProduction(): Promise<ProductionData> {
  const mapping = dashboardConfig.erp.batches;
  if (mapping.source !== "erp") throw new Error("erp.batches is manual");
  const today = erpToday();
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = yesterday < monthStart ? yesterday : monthStart;
  const [info, kilns] = await Promise.all([doctypeInfo(mapping), loadKilns()]);
  // حقل الوزن بيتطلب بس لو موجود في الـ DocType (السجلات القديمة من غير وزن = null)
  // The weight field is requested only when the DocType has it (old records without a weight = null)
  const fields = ["name", mapping.typeField, "kiln", "exit_time", ...(info.hasWeight ? [mapping.weightField] : [])];
  const { data: rows } = await erpGet<{ data: KilnExitRow[] }>(`/api/resource/${encodeURIComponent(mapping.exitsDoctype)}`, {
    fields: JSON.stringify(fields),
    filters: JSON.stringify([
      ["exit_time", ">=", `${from} 00:00:00`],
      ["exit_time", "<=", `${today} 23:59:59`],
      ["docstatus", "!=", 2], // الملغي مش بيتعد - cancelled records don't count
    ]),
    limit_page_length: 0,
    order_by: "exit_time desc",
  });
  const { types, resolve } = typeList(mapping, info.options);
  const exits: ProductionExit[] = rows.map((row) => {
    const raw = String(row[mapping.typeField] ?? "").trim();
    const type = raw ? resolve(raw) : null;
    const stamp = String(row.exit_time ?? "");
    return {
      id: row.name,
      date: stamp.slice(0, 10),
      time: stamp.slice(11, 16), // "2026-10-27 10:45:12" -> "10:45"
      kiln: (row.kiln ?? "").trim(),
      type: type?.label ?? "",
      kg: info.hasWeight ? kgOf(row[mapping.weightField]) : null,
    };
  });
  return {
    today,
    yesterday,
    monthStart,
    weightField: info.hasWeight,
    types,
    kilns: kilns.map((k) => ({ name: k.name, status: k.status })),
    exits,
    updatedAt: new Date().toISOString(),
    offline: false,
  };
}

// كاش على السيرفر + طلب واحد للكل في نفس الوقت، ولو ERPNext فشل آخر نتيجة نجحت النهارده مع offline
// Server cache + one shared request at a time; on failure today's last good result marked offline
const CACHE_MS = dashboardConfig.production.cacheSeconds * 1000;
let cached: { at: number; data: ProductionData } | null = null;
let inFlight: Promise<ProductionData> | null = null;

export function productionData(): Promise<ProductionData> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.data);
  if (!inFlight) {
    inFlight = loadProduction()
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .catch((error) => {
        console.error("[erp] production failed:", error instanceof Error ? error.message : error);
        if (cached && cached.data.today === erpToday()) return { ...cached.data, offline: true };
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
