// مراجعة الإنتاج يوم بيوم من ERPNext (قراية بس، مش بيغير أي حاجة لا في ERPNext ولا في الداشبورد)
// Production audit, day by day, from ERPNext (read-only: changes nothing in ERPNext or the dashboard)
//
// التشغيل - run:  npm run audit:production -- --from 2026-10-01 --to today
// الناتج - output: reports/production-audit.md / .csv / .xlsx / .pdf (الـ PDF بيتطبع بـ Edge أو Chrome اللي على الجهاز)
// فولدر reports/ في .gitignore ومينفعش يترفع (الريبو public) - reports/ is gitignored, never commit it (public repo)
//
// المصدر: Stock Entry نوعها Manufacture. Submitted بس هو اللي بيتحسب إنتاج، والـ Draft والـ Cancelled بيظهروا لوحدهم
// Source: Stock Entry of type Manufacture. Only Submitted counts as production; Draft and Cancelled are listed apart
// السطر اللي is_finished_item = 1 = المنتج، والسطر اللي فيه s_warehouse = خامة اتصرفت
// Rows with is_finished_item = 1 are produced items, rows with s_warehouse are consumed materials

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { chromium } from "playwright-core";

// ============================================================
// الإعدادات - settings
// ============================================================

// المنتجات المعبأة (أعمدة الجدول اليومي) - packaged products (the day table columns)
const PACKAGED = [
  "باكت ربع",
  "باكت ربع كامل",
  "باكت نص",
  "باكت نص كامل",
  "باكت كيلو",
  "كرتونة 1 كيلو",
  "باكت 2 كيلو",
  "كرتونة 2 كيلو",
  "كيس 3 كيلو جازورينا",
];

// منتجات تانية عادي تطلع من Manufacture (شكاير مصنع الإنتاج + فحم فواكه للتعبئة) - other usual finished items
const OTHER_USUAL = [
  "شيكارة فحم برتقال ناعم",
  "شيكارة فحم برتقال خشن",
  "شيكارة فحم مانجة ناعم",
  "شيكارة فحم مانجة خشن",
  "شيكارة فحم جازورينا ناعم",
  "شيكارة فحم جازورينا خشن",
  "فحم فواكه",
];

// خامة التعبئة الأساسية لكل منتج معبأ: لو متصرفتش يبقى تحذير - the key packaging each packaged item must consume
const KEY_PACKAGING: Record<string, string[]> = {
  "باكت ربع": ["رول احمر"],
  "باكت ربع كامل": ["رول احمر"],
  "باكت نص": ["رول ازرق"],
  "باكت نص كامل": ["رول ازرق"],
  "باكت كيلو": ["بوكس كيلو"],
  "كرتونة 1 كيلو": ["بوكس كيلو"],
  "باكت 2 كيلو": ["بوكس 2 كيلو"],
  "كرتونة 2 كيلو": ["بوكس 2 كيلو"],
  "كيس 3 كيلو جازورينا": ["بوكس 3 كيلو"],
};

// خامات التعبئة اللي بنراجع نسبتها للمنتج - packaging materials whose ratio to the product is checked
const PACKAGING_MATERIALS = [
  "اكياس تعبئة 60*70",
  "اكياس تعبئة 40*50",
  "رول احمر",
  "رول ازرق",
  "بوكس كيلو",
  "بوكس 2 كيلو",
  "بوكس 3 كيلو",
  "بكر لاصق",
];

const RATIO_TOLERANCE = 2; // النسبة أكتر من ضعف أو أقل من نص المعتاد = تحذير - ratio over 2x or under 0.5x the usual
const HIGH_QTY = 2; // كمية اليوم أكتر من 2x متوسط الصنف - day quantity over 2x the item's daily average
const LOW_QTY = 0.3; // أو أقل من 0.3x - or under 0.3x
const FRIDAY = 5;

const FACTORY_NAME = "الصفوة";

// ============================================================
// شكل التقرير - the report shape (md / csv / xlsx / pdf are all written from it)
// ============================================================

type Severity = "high" | "medium"; // high = أحمر، medium = برتقالي - red / orange
type WarningKind = "noProduction" | "drafts" | "unusualItem" | "unusualWarehouse" | "unusualQty" | "packaging" | "late";
type Warning = { kind: WarningKind; severity: Severity; date: string; entry: string; text: string };

const WARNING_TITLES: Record<WarningKind, string> = {
  noProduction: "أيام من غير إنتاج تعبئة متسجل (الجمعة مش محسوبة لو مفيهاش حاجة)",
  drafts: "مسودات عمرها ما اتسجلت، وحركات ملغية",
  unusualItem: "أصناف مش من المنتجات المعتادة (ممكن صنف غلط)",
  unusualWarehouse: "منتج دخل مخزن غير المعتاد",
  unusualQty: `كمية غريبة (أكتر من ${HIGH_QTY}x أو أقل من ${LOW_QTY}x متوسط الصنف في اليوم)`,
  packaging: `خامات التعبئة مش ماشية مع المنتج (ناقصة، أو النسبة أكتر من ${RATIO_TOLERANCE}x / أقل من 1/${RATIO_TOLERANCE} المعتاد)`,
  late: "حركات اتعملت في يوم غير تاريخها (ممكن اتسجلت متأخر)",
};
const WARNING_KINDS = Object.keys(WARNING_TITLES) as WarningKind[];

const SUMMARY_HEAD = ["الصنف", "الإجمالي", "الوحدة", "عدد الأيام", "متوسط اليوم", "عدد الحركات"];
const DAY_HEAD = ["التاريخ", "اليوم", ...PACKAGED, "إنتاج تاني", "متسجل", "مسودة", "ملغي", "ملاحظة"];
const BY_PRODUCTS_TITLE = "منتجات ثانوية (Scrap) - مش محسوبة في الملخص";

type Report = {
  from: string;
  to: string;
  generated: string;
  counts: { submitted: number; drafts: number; cancelled: number };
  summary: { item: string; total: number; unit: string; days: number; average: number | null; entries: number; usual: boolean }[];
  byProducts: { item: string; total: number; unit: string }[];
  days: {
    day: string;
    name: string;
    packaged: number[];
    other: string[];
    submitted: number;
    drafts: number;
    cancelled: number;
    friday: boolean;
    missing: boolean;
    note: string;
  }[];
  details: {
    day: string;
    entry: string;
    time: string;
    kind: string;
    item: string;
    qty: number;
    unit: string;
    warehouse: string;
    status: string;
    owner: string;
    created: string;
  }[];
  warnings: Warning[];
};

// ============================================================
// ERPNext
// ============================================================

const TIMEOUT_MS = 30000;

type EntryRow = {
  name: string;
  docstatus: number;
  posting_date: string;
  posting_time: string;
  creation: string;
  owner: string;
};
type DetailRow = {
  parent: string;
  item_code: string;
  transfer_qty: number;
  stock_uom: string;
  s_warehouse: string | null;
  t_warehouse: string | null;
  is_finished_item: number;
  is_scrap_item: number;
};

function settings() {
  const url = process.env.FACTORY_API_URL;
  const key = process.env.FACTORY_API_KEY;
  const secret = process.env.FACTORY_API_SECRET;
  if (!url || !key || !secret) throw new Error("FACTORY_API_URL / FACTORY_API_KEY / FACTORY_API_SECRET مش موجودين في .env.local");
  return { baseUrl: url.replace(/\/+$/, ""), auth: `token ${key}:${secret}` };
}

// frappe.client.get_list بـ POST عشان قايمة الحركات طويلة - POST because the entry list is long
async function getList<T>(body: Record<string, unknown>): Promise<T[]> {
  const { baseUrl, auth } = settings();
  const response = await fetch(`${baseUrl}/api/method/frappe.client.get_list`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ limit_page_length: 0, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ERPNext ${body.doctype}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return (JSON.parse(text) as { message: T[] }).message;
}

// ============================================================
// التواريخ - dates
// ============================================================

const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const DAY_NAMES = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const today = cairoToday();
  const resolve = (raw: string | undefined, fallback: string) => {
    const date = !raw ? fallback : raw === "today" ? today : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`تاريخ غلط: ${raw} (اكتبه YYYY-MM-DD أو today)`);
    return date;
  };
  const from = resolve(value("--from"), `${today.slice(0, 8)}01`);
  const to = resolve(value("--to"), today);
  if (from > to) throw new Error(`--from (${from}) بعد --to (${to})`);
  return { from, to };
}

// ============================================================
// التنسيق - formatting
// ============================================================

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("en");
const STATUS = ["Draft", "Submitted", "Cancelled"];
const STATUS_AR = ["مسودة (Draft)", "متسجل (Submitted)", "ملغي (Cancelled)"];
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head: string[], rows: string[][]) =>
  [`| ${head.map(cell).join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
const csvCell = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ============================================================
// المراجعة - the audit
// ============================================================

async function main() {
  const { from, to } = parseArgs();
  console.log(`مراجعة الإنتاج من ${from} لحد ${to} ...`);

  const entries = await getList<EntryRow>({
    doctype: "Stock Entry",
    filters: [["stock_entry_type", "=", "Manufacture"], ["posting_date", ">=", from], ["posting_date", "<=", to]],
    fields: ["name", "docstatus", "posting_date", "posting_time", "creation", "owner"],
    order_by: "posting_date asc, posting_time asc",
  });
  const details = entries.length
    ? await getList<DetailRow>({
        doctype: "Stock Entry Detail",
        parent: "Stock Entry",
        filters: [["parent", "in", entries.map((e) => e.name)]],
        fields: ["parent", "item_code", "transfer_qty", "stock_uom", "s_warehouse", "t_warehouse", "is_finished_item", "is_scrap_item"],
        order_by: "idx asc",
      })
    : [];

  const rowsOf = new Map<string, DetailRow[]>();
  for (const row of details) rowsOf.set(row.parent, [...(rowsOf.get(row.parent) ?? []), row]);
  const finished = (e: EntryRow) => (rowsOf.get(e.name) ?? []).filter((r) => r.is_finished_item);
  const scrap = (e: EntryRow) => (rowsOf.get(e.name) ?? []).filter((r) => r.is_scrap_item);
  const consumed = (e: EntryRow) => (rowsOf.get(e.name) ?? []).filter((r) => r.s_warehouse);
  const submitted = entries.filter((e) => e.docstatus === 1);

  const days = daysBetween(from, to);
  const units = new Map<string, string>();
  for (const row of details) units.set(row.item_code, row.stock_uom);

  // إجمالي المنتج لكل صنف لكل يوم (Submitted بس) - produced per item per day (Submitted only)
  const perDay = new Map<string, Map<string, number>>(days.map((d) => [d, new Map()]));
  for (const e of submitted) {
    const day = perDay.get(e.posting_date)!;
    for (const r of finished(e)) day.set(r.item_code, (day.get(r.item_code) ?? 0) + r.transfer_qty);
  }

  const warnings: Warning[] = [];
  const warn = (kind: WarningKind, severity: Severity, date: string, entry: string, text: string) =>
    warnings.push({ kind, severity, date, entry, text });

  // 1) أيام من غير إنتاج - days without submitted production
  for (const day of days) {
    const items = perDay.get(day)!;
    const packaged = PACKAGED.some((item) => items.get(item));
    if (weekday(day) === FRIDAY && !items.size) continue;
    if (day === cairoToday() && !items.size) continue; // النهارده لسه ممكن يتسجل - today may still be entered
    if (!packaged) {
      const note = items.size ? `فيه إنتاج تاني بس: ${Array.from(items.keys()).join("، ")}` : "مفيش أي إنتاج خالص";
      const friday = weekday(day) === FRIDAY ? " (جمعة)" : "";
      warn("noProduction", "high", day, "", `${DAY_NAMES[weekday(day)]}${friday}: مفيش إنتاج تعبئة متسجل — ${note}`);
    }
  }

  // 2) مسودات ومتلغي - drafts and cancelled
  for (const e of entries.filter((x) => x.docstatus !== 1)) {
    const items = finished(e).map((r) => `${r.item_code} ${fmt(r.transfer_qty)}`).join("، ") || "من غير منتج";
    const what = e.docstatus === 0 ? "مسودة عمرها ما اتسجلت (Draft)" : "ملغية (Cancelled)";
    warn("drafts", e.docstatus === 0 ? "high" : "medium", e.posting_date, e.name, `${what} — ${items} — ${e.owner}`);
  }

  // 3) منتج مش من المعتاد، أو راح مخزن غير المعتاد - unusual finished item, or an unusual target warehouse
  const usualWarehouse = new Map<string, string>();
  {
    const counts = new Map<string, Map<string, number>>();
    for (const e of submitted)
      for (const r of finished(e)) {
        const c = counts.get(r.item_code) ?? new Map<string, number>();
        c.set(r.t_warehouse ?? "", (c.get(r.t_warehouse ?? "") ?? 0) + 1);
        counts.set(r.item_code, c);
      }
    for (const [item, c] of Array.from(counts)) {
      // المعتاد = المخزن اللي فيه 3 حركات على الأقل وأغلب الحركات - usual = at least 3 entries and the majority
      const [top, n] = Array.from(c).sort((a, b) => b[1] - a[1])[0];
      const total = Array.from(c.values()).reduce((a, b) => a + b, 0);
      if (n >= 3 && n / total > 0.5) usualWarehouse.set(item, top);
    }
  }
  for (const e of entries)
    for (const r of finished(e)) {
      if (!PACKAGED.includes(r.item_code) && !OTHER_USUAL.includes(r.item_code))
        warn("unusualItem", "high", e.posting_date, e.name,
          `(${STATUS[e.docstatus]}) ${r.item_code} ${fmt(r.transfer_qty)} ${r.stock_uom} ← ${r.t_warehouse} — صنف مش من المنتجات المعتادة، اتأكد إنه صح`);
      const usual = usualWarehouse.get(r.item_code);
      if (usual && r.t_warehouse !== usual)
        warn("unusualWarehouse", "high", e.posting_date, e.name, `${r.item_code} دخل ${r.t_warehouse} والمعتاد ${usual}`);
    }

  // 4) كمية غريبة مقارنة بمتوسط الصنف في الأيام اللي اتنتج فيها - unusual quantity vs the item's average production day
  const allItems = Array.from(new Set(submitted.flatMap((e) => finished(e).map((r) => r.item_code))));
  const averages = new Map<string, number>();
  for (const item of allItems) {
    const totals = days.map((d) => perDay.get(d)!.get(item) ?? 0).filter((q) => q > 0);
    const average = totals.reduce((a, b) => a + b, 0) / totals.length;
    averages.set(item, average);
    if (totals.length < 3) continue;
    for (const day of days) {
      const q = perDay.get(day)!.get(item) ?? 0;
      if (q > HIGH_QTY * average)
        warn("unusualQty", "medium", day, "", `${item} = ${fmt(q)} — أكتر من ${HIGH_QTY}x المتوسط (${fmt(average)})`);
      else if (q > 0 && q < LOW_QTY * average)
        warn("unusualQty", "medium", day, "", `${item} = ${fmt(q)} — أقل من ${LOW_QTY}x المتوسط (${fmt(average)})`);
    }
  }

  // 5) خامات التعبئة مش ماشية مع المنتج - packaging consumption doesn't match the product
  const ratios = new Map<string, number[]>(); // "منتج\0خامة" -> نسب الحركات المتسجلة - ratios of submitted entries
  for (const e of submitted)
    for (const fin of finished(e))
      for (const c of consumed(e))
        if (PACKAGING_MATERIALS.includes(c.item_code) && fin.transfer_qty > 0) {
          const key = `${fin.item_code}\u0000${c.item_code}`;
          ratios.set(key, [...(ratios.get(key) ?? []), c.transfer_qty / fin.transfer_qty]);
        }
  for (const e of submitted)
    for (const fin of finished(e)) {
      if (!PACKAGED.includes(fin.item_code)) continue;
      const used = consumed(e);
      for (const key of KEY_PACKAGING[fin.item_code] ?? [])
        if (!used.some((c) => c.item_code === key))
          warn("packaging", "high", e.posting_date, e.name, `${fin.item_code} ${fmt(fin.transfer_qty)} من غير ما يتصرف ${key}`);
      for (const c of used) {
        const sample = ratios.get(`${fin.item_code}\u0000${c.item_code}`);
        if (!sample || sample.length < 3 || fin.transfer_qty <= 0) continue;
        const usual = median(sample);
        const ratio = c.transfer_qty / fin.transfer_qty;
        if (ratio > usual * RATIO_TOLERANCE || ratio < usual / RATIO_TOLERANCE)
          warn("packaging", "medium", e.posting_date, e.name,
            `${fin.item_code} ${fmt(fin.transfer_qty)} صرف ${c.item_code} ${fmt(c.transfer_qty)} ${c.stock_uom} — ${fmt(ratio)} للوحدة والمعتاد ${fmt(usual)}`);
      }
    }

  // 6) اتسجل في يوم غير تاريخ الحركة - entered on a different day than its posting date
  for (const e of entries) {
    const created = e.creation.slice(0, 10);
    if (created !== e.posting_date)
      warn("late", "medium", e.posting_date, e.name,
        `(${STATUS[e.docstatus]}) اتعملت يوم ${created} ${e.creation.slice(11, 16)} — ${e.owner}`);
  }

  // ============================================================
  // التقرير - the report every output is written from
  // ============================================================

  const otherItems = allItems.filter((item) => !PACKAGED.includes(item));
  const scrapTotals = new Map<string, number>();
  for (const e of submitted) for (const r of scrap(e)) scrapTotals.set(r.item_code, (scrapTotals.get(r.item_code) ?? 0) + r.transfer_qty);

  const report: Report = {
    from,
    to,
    generated: new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" }),
    counts: {
      submitted: submitted.length,
      drafts: entries.filter((e) => e.docstatus === 0).length,
      cancelled: entries.filter((e) => e.docstatus === 2).length,
    },
    summary: [...PACKAGED, ...otherItems].map((item) => {
      const dayCount = days.filter((d) => perDay.get(d)!.get(item)).length;
      return {
        item,
        total: days.reduce((sum, d) => sum + (perDay.get(d)!.get(item) ?? 0), 0),
        unit: units.get(item) ?? "",
        days: dayCount,
        average: dayCount ? averages.get(item) ?? 0 : null,
        entries: submitted.filter((e) => finished(e).some((r) => r.item_code === item)).length,
        usual: PACKAGED.includes(item) || OTHER_USUAL.includes(item),
      };
    }),
    byProducts: Array.from(scrapTotals).map(([item, total]) => ({ item, total, unit: units.get(item) ?? "" })),
    days: days.map((day) => {
      const items = perDay.get(day)!;
      const dayEntries = entries.filter((e) => e.posting_date === day);
      const count = (status: number) => dayEntries.filter((e) => e.docstatus === status).length;
      const packaged = PACKAGED.some((item) => items.get(item));
      const friday = weekday(day) === FRIDAY;
      const today = day === cairoToday() && !items.size;
      return {
        day,
        name: DAY_NAMES[weekday(day)],
        packaged: PACKAGED.map((item) => items.get(item) ?? 0),
        other: otherItems.filter((item) => items.get(item)).map((item) => `${item} ${fmt(items.get(item)!)}`),
        submitted: count(1),
        drafts: count(0),
        cancelled: count(2),
        friday,
        missing: !packaged && !friday && !today,
        note: packaged ? "" : friday ? "جمعة" : today ? "النهارده (لسه ممكن يتسجل)" : "⚠️ مفيش إنتاج تعبئة",
      };
    }),
    details: entries.flatMap((e) =>
      [...finished(e), ...scrap(e)].map((r) => ({
        day: e.posting_date,
        entry: e.name,
        time: e.posting_time.slice(0, 5),
        kind: r.is_finished_item ? "منتج" : "ثانوي",
        item: r.item_code,
        qty: r.transfer_qty,
        unit: r.stock_uom,
        warehouse: r.t_warehouse ?? "",
        status: STATUS_AR[e.docstatus],
        owner: e.owner,
        created: e.creation.slice(0, 16),
      }))
    ),
    warnings,
  };

  // ============================================================
  // الكتابة - writing the reports
  // ============================================================

  const md: string[] = [];
  md.push(`# مراجعة الإنتاج من ${from} لحد ${to}`);
  md.push(
    `اتعمل ${report.generated} (بتوقيت مصر) من ERPNext — Stock Entry نوعها Manufacture.\n\n` +
      `الحركات: **${report.counts.submitted}** متسجلة (Submitted) — ${report.counts.drafts} مسودة — ${report.counts.cancelled} ملغية. ` +
      `المتسجل بس هو اللي بيتحسب إنتاج.`
  );

  md.push(`## الملخص: إجمالي الإنتاج في الفترة (Submitted بس)`);
  md.push(
    table(
      SUMMARY_HEAD,
      report.summary.map((s) => [
        s.usual ? s.item : `⚠️ ${s.item}`,
        fmt(s.total),
        s.unit,
        String(s.days),
        s.average === null ? "-" : fmt(s.average),
        String(s.entries),
      ])
    )
  );
  if (report.byProducts.length) {
    md.push(`### ${BY_PRODUCTS_TITLE}`);
    md.push(table(["الصنف", "الإجمالي", "الوحدة"], report.byProducts.map((b) => [b.item, fmt(b.total), b.unit])));
  }

  md.push(`## ⚠️ التحذيرات`);
  for (const kind of WARNING_KINDS) {
    const list = warnings.filter((w) => w.kind === kind);
    md.push(`### ${WARNING_TITLES[kind]} (${list.length})`);
    md.push(
      list.length
        ? list.map((w) => `- ${w.severity === "high" ? "🔴" : "🟠"} **${w.date}**${w.entry ? ` \`${w.entry}\`` : ""}: ${w.text}`).join("\n")
        : "- مفيش ✅"
    );
  }

  md.push(`## يوم بيوم`);
  md.push(
    table(
      DAY_HEAD,
      report.days.map((r) => [
        r.day,
        r.name,
        ...r.packaged.map((q) => (q ? fmt(q) : "0")),
        r.other.join("، ") || "-",
        String(r.submitted),
        String(r.drafts || ""),
        String(r.cancelled || ""),
        r.note,
      ])
    )
  );

  md.push(`## تفاصيل كل يوم`);
  for (const day of days) {
    const dayEntries = entries.filter((e) => e.posting_date === day);
    md.push(`### ${day} ${DAY_NAMES[weekday(day)]}${dayEntries.length ? "" : " — مفيش حركات"}`);
    for (const e of dayEntries) {
      const lines = [
        `**\`${e.name}\`** — ${STATUS_AR[e.docstatus]} — الساعة ${e.posting_time.slice(0, 5)} — عملها ${e.owner} يوم ${e.creation.slice(0, 16)}`,
        ...finished(e).map((r) => `  - 🟢 منتج: ${r.item_code} **${fmt(r.transfer_qty)}** ${r.stock_uom} ← ${r.t_warehouse}`),
        ...scrap(e).map((r) => `  - 🔵 ثانوي: ${r.item_code} ${fmt(r.transfer_qty)} ${r.stock_uom} ← ${r.t_warehouse}`),
        ...consumed(e).map((r) => `  - 🔻 اتصرف: ${r.item_code} ${fmt(r.transfer_qty)} ${r.stock_uom} من ${r.s_warehouse}`),
      ];
      md.push(`- ${lines.join("\n")}`);
    }
  }

  const csv = [
    DAY_HEAD,
    ...report.days.map((r) => [
      r.day,
      r.name,
      ...r.packaged.map(String),
      r.other.join(" + "),
      String(r.submitted),
      String(r.drafts),
      String(r.cancelled),
      r.note,
    ]),
  ];

  const dir = path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });
  const out = (name: string) => path.join(dir, name);
  fs.writeFileSync(out("production-audit.md"), md.join("\n\n") + "\n", "utf8");
  fs.writeFileSync(out("production-audit.csv"), "﻿" + csv.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8");
  await writeExcel(out("production-audit.xlsx"), report);
  await writePdf(out("production-audit.pdf"), report);

  console.log(`\nالحركات: ${report.counts.submitted} متسجلة، ${report.counts.drafts} مسودة، ${report.counts.cancelled} ملغية`);
  for (const kind of WARNING_KINDS) console.log(`⚠️ ${warnings.filter((w) => w.kind === kind).length} — ${WARNING_TITLES[kind]}`);
  console.log("\nالملفات في reports/: production-audit.md / .csv / .xlsx / .pdf");
}

// ============================================================
// Excel
// ============================================================

const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const COLORS = {
  head: "FFFF7A00", // برتقالي الداشبورد - the dashboard orange
  friday: "FFE7E6E6", // رمادي فاتح - light gray
  missing: "FFFFC7CE", // أحمر فاتح - light red
  high: { fill: "FFFFC7CE", font: "FF9C0006" }, // أحمر - red
  medium: { fill: "FFFFE5CC", font: "FF9C4A00" }, // برتقالي - orange
};
// رقم صحيح من غير علامة عشرية، وكسر لحد 3 أرقام - integers without a decimal point, fractions up to 3 digits
const qtyFormat = (n: number) => (Number.isInteger(n) ? "#,##0" : "#,##0.0##");
const excelDate = (day: string) => new Date(`${day}T00:00:00Z`);

async function writeExcel(file: string, report: Report) {
  const book = new ExcelJS.Workbook();
  book.creator = FACTORY_NAME;

  const styleHead = (row: ExcelJS.Row) => {
    row.height = 32;
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = solid(COLORS.head);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
  };
  // شيت RTL، صف العناوين ثابت وبولد وعليه فلتر - an RTL sheet with a frozen, bold, filtered header row
  const sheet = (name: string, columns: { header: string; width: number }[]) => {
    const ws = book.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = columns;
    styleHead(ws.getRow(1));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  };
  const fillRow = (row: ExcelJS.Row, argb: string, font?: string) =>
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = solid(argb);
      if (font) cell.font = { color: { argb: font } };
    });
  const numbers = (row: ExcelJS.Row) =>
    row.eachCell((cell) => {
      if (typeof cell.value === "number") cell.numFmt = qtyFormat(cell.value);
    });

  // الملخص - summary
  const summary = sheet("الملخص", [
    { header: SUMMARY_HEAD[0], width: 28 },
    { header: SUMMARY_HEAD[1], width: 12 },
    { header: SUMMARY_HEAD[2], width: 16 },
    { header: SUMMARY_HEAD[3], width: 11 },
    { header: SUMMARY_HEAD[4], width: 13 },
    { header: SUMMARY_HEAD[5], width: 13 },
  ]);
  for (const s of report.summary) {
    const average = s.average === null ? "-" : Math.round(s.average * 10) / 10;
    const row = summary.addRow([s.item, s.total, s.unit, s.days, average, s.entries]);
    numbers(row);
    if (!s.usual) fillRow(row, COLORS.high.fill, COLORS.high.font);
  }
  if (report.byProducts.length) {
    summary.addRow([]);
    summary.addRow([BY_PRODUCTS_TITLE]).font = { bold: true };
    styleHead(summary.addRow(["الصنف", "الإجمالي", "الوحدة"]));
    for (const b of report.byProducts) numbers(summary.addRow([b.item, b.total, b.unit]));
  }
  summary.addRow([]);
  const { submitted, drafts, cancelled } = report.counts;
  summary.addRow([`الفترة: ${report.from} ← ${report.to} — متسجل ${submitted}، مسودة ${drafts}، ملغي ${cancelled}`]);

  // يوم بيوم - day by day
  const daySheet = sheet("يوم بيوم", [
    { header: "التاريخ", width: 12 },
    { header: "اليوم", width: 9 },
    ...PACKAGED.map((item) => ({ header: item, width: 11 })),
    { header: "إنتاج تاني", width: 40 },
    { header: "عدد الحركات (متسجل)", width: 11 },
    { header: "مسودة", width: 8 },
    { header: "ملغي", width: 8 },
    { header: "ملاحظة", width: 24 },
  ]);
  for (const r of report.days) {
    const row = daySheet.addRow([excelDate(r.day), r.name, ...r.packaged, r.other.join("، "), r.submitted, r.drafts, r.cancelled, r.note]);
    numbers(row);
    row.getCell(1).numFmt = "yyyy-mm-dd";
    if (r.friday) fillRow(row, COLORS.friday);
    else if (r.missing) fillRow(row, COLORS.missing, COLORS.high.font);
  }

  // التفاصيل - details
  const details = sheet("التفاصيل", [
    { header: "التاريخ", width: 12 },
    { header: "رقم الحركة", width: 20 },
    { header: "الساعة", width: 8 },
    { header: "النوع", width: 8 },
    { header: "الصنف", width: 28 },
    { header: "الكمية", width: 10 },
    { header: "الوحدة", width: 15 },
    { header: "دخل مخزن", width: 28 },
    { header: "الحالة", width: 18 },
    { header: "عملها", width: 28 },
    { header: "اتعملت يوم", width: 17 },
  ]);
  for (const d of report.details) {
    const row = details.addRow([excelDate(d.day), d.entry, d.time, d.kind, d.item, d.qty, d.unit, d.warehouse, d.status, d.owner, d.created]);
    numbers(row);
    row.getCell(1).numFmt = "yyyy-mm-dd";
    if (d.status !== STATUS_AR[1]) fillRow(row, COLORS.medium.fill, COLORS.medium.font);
  }

  // التحذيرات - warnings
  const warningSheet = sheet("التحذيرات", [
    { header: "النوع", width: 34 },
    { header: "الخطورة", width: 9 },
    { header: "التاريخ", width: 12 },
    { header: "رقم الحركة", width: 20 },
    { header: "الوصف", width: 90 },
  ]);
  for (const w of report.warnings) {
    const severity = w.severity === "high" ? "عالية" : "متوسطة";
    const row = warningSheet.addRow([WARNING_TITLES[w.kind], severity, excelDate(w.date), w.entry, w.text]);
    row.getCell(3).numFmt = "yyyy-mm-dd";
    fillRow(row, COLORS[w.severity].fill, COLORS[w.severity].font);
  }

  await book.xlsx.writeFile(file);
}

// ============================================================
// PDF: صفحة HTML بتتطبع بـ Edge أو Chrome اللي على الجهاز - an HTML page printed by the installed Edge or Chrome
// ============================================================

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// خط Cairo من @fontsource-variable/cairo جوه الصفحة نفسها - the Cairo font embedded in the page itself
function cairoFontCss() {
  const dir = path.join(process.cwd(), "node_modules", "@fontsource-variable", "cairo");
  return fs
    .readFileSync(path.join(dir, "index.css"), "utf8")
    .replace(/url\(\.\/files\/([^)]+)\)/g, (_, name: string) =>
      `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, "files", name)).toString("base64")})`
    );
}

// تاريخ جوه جملة عربي بيتقلب من غير ده - a date inside Arabic text gets reordered without this
const ltr = (text: string) => `<bdi dir="ltr">${esc(text)}</bdi>`;

const htmlTable = (head: string[], rows: { cells: string[]; className?: string }[]) =>
  `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr${r.className ? ` class="${r.className}"` : ""}>${r.cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

const PDF_CSS = `
* { box-sizing: border-box; }
body { font-family: "Cairo Variable", sans-serif; color: #1f2328; font-size: 10px; margin: 0; }
h1 { font-size: 20px; margin: 0 0 2px; color: #c25a00; }
h2 { font-size: 15px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #FF7A00; break-after: avoid; }
h3 { font-size: 11.5px; margin: 10px 0 4px; break-after: avoid; }
.meta { color: #57606a; margin-bottom: 8px; }
.stats { display: flex; gap: 8px; margin: 6px 0 4px; }
.stat { border: 1px solid #d0d7de; border-radius: 6px; padding: 4px 12px; }
.stat b { font-size: 15px; display: block; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #FF7A00; color: #fff; font-weight: 700; padding: 4px 3px; border: 1px solid #e06a00; font-size: 9px; }
td { padding: 2.5px 4px; border: 1px solid #d0d7de; text-align: center; font-variant-numeric: tabular-nums; }
td:first-child { white-space: nowrap; }
.days td { font-size: 8.5px; }
tr.friday td { background: #e7e6e6; color: #57606a; }
tr.missing td { background: #ffc7ce; color: #9c0006; font-weight: 700; }
tr.unusual td { background: #ffc7ce; color: #9c0006; }
tr.notsubmitted td { background: #ffe5cc; color: #9c4a00; }
.count { display: inline-block; min-width: 20px; text-align: center; border-radius: 9px; background: #eaeef2; padding: 0 6px; font-size: 10px; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: 2.5px 8px; margin-bottom: 2px; border-right: 4px solid; border-radius: 3px; break-inside: avoid; }
li.high { background: #ffc7ce; border-color: #c00000; color: #6b0004; }
li.medium { background: #ffe5cc; border-color: #ff7a00; color: #6b3300; }
li.ok { background: #e6f4ea; border-color: #1a7f37; }
code { font-family: Consolas, monospace; font-size: 9px; direction: ltr; unicode-bidi: embed; }
.page-break { break-before: page; }
`;

function renderHtml(report: Report) {
  const warningBlocks = WARNING_KINDS.map((kind) => {
    const list = report.warnings.filter((w) => w.kind === kind);
    const items = list.length
      ? list
          .map((w) => `<li class="${w.severity}"><b>${ltr(w.date)}</b>${w.entry ? ` <code>${esc(w.entry)}</code>` : ""} — ${esc(w.text)}</li>`)
          .join("")
      : `<li class="ok">مفيش ✅</li>`;
    return `<h3>${esc(WARNING_TITLES[kind])} <span class="count">${list.length}</span></h3><ul>${items}</ul>`;
  }).join("");

  const summary = htmlTable(
    SUMMARY_HEAD,
    report.summary.map((s) => ({
      cells: [
        s.usual ? s.item : `⚠️ ${s.item}`,
        fmt(s.total),
        s.unit,
        String(s.days),
        s.average === null ? "-" : fmt(Math.round(s.average * 10) / 10),
        String(s.entries),
      ],
      className: s.usual ? undefined : "unusual",
    }))
  );
  const byProducts = report.byProducts.length
    ? `<h3>${esc(BY_PRODUCTS_TITLE)}</h3>` +
      htmlTable(["الصنف", "الإجمالي", "الوحدة"], report.byProducts.map((b) => ({ cells: [b.item, fmt(b.total), b.unit] })))
    : "";
  const dayTable = htmlTable(
    DAY_HEAD,
    report.days.map((r) => ({
      cells: [
        r.day,
        r.name,
        ...r.packaged.map((q) => (q ? fmt(q) : "0")),
        r.other.join("، ") || "-",
        String(r.submitted),
        String(r.drafts || ""),
        String(r.cancelled || ""),
        r.note,
      ],
      className: r.friday ? "friday" : r.missing ? "missing" : undefined,
    }))
  );
  const details = htmlTable(
    ["التاريخ", "رقم الحركة", "الساعة", "النوع", "الصنف", "الكمية", "الوحدة", "دخل مخزن", "الحالة", "عملها", "اتعملت يوم"],
    report.details.map((d) => ({
      cells: [d.day, d.entry, d.time, d.kind, d.item, fmt(d.qty), d.unit, d.warehouse, d.status, d.owner, d.created],
      className: d.status === STATUS_AR[1] ? undefined : "notsubmitted",
    }))
  );

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${cairoFontCss()}${PDF_CSS}</style></head><body>
<h1>${esc(FACTORY_NAME)} — مراجعة الإنتاج</h1>
<div class="meta">الفترة من <b>${ltr(report.from)}</b> لحد <b>${ltr(report.to)}</b> — اتعمل ${ltr(report.generated)} (بتوقيت مصر) من ERPNext، Stock Entry نوعها Manufacture. المتسجل (Submitted) بس هو اللي بيتحسب إنتاج.</div>
<div class="stats">
  <div class="stat">متسجل<b>${report.counts.submitted}</b></div>
  <div class="stat">مسودة<b>${report.counts.drafts}</b></div>
  <div class="stat">ملغي<b>${report.counts.cancelled}</b></div>
  <div class="stat">تحذيرات<b>${report.warnings.length}</b></div>
</div>
<h2>الملخص: إجمالي الإنتاج في الفترة</h2>
${summary}
${byProducts}
<h2 class="page-break">يوم بيوم</h2>
<div class="days">${dayTable}</div>
<h2 class="page-break">⚠️ التحذيرات</h2>
${warningBlocks}
<h2 class="page-break">التفاصيل: كل منتج في كل حركة</h2>
${details}
</body></html>`;
}

// Edge موجود على كل ويندوز 11، ولو مش موجود Chrome - Edge ships with Windows 11, else Chrome
async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // جرب اللي بعده - try the next one
    }
  }
  try {
    return await chromium.launch();
  } catch {
    throw new Error("مفيش Edge ولا Chrome على الجهاز عشان نطبع الـ PDF. نزّل Chromium: npx playwright-core install chromium");
  }
}

async function writePdf(file: string, report: Report) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml(report), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const band =
      "width:100%;font-family:'Segoe UI',Tahoma,sans-serif;font-size:8px;color:#57606a;direction:rtl;padding:0 8mm;display:flex;justify-content:space-between;";
    await page.pdf({
      path: file,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "14mm", bottom: "12mm", left: "8mm", right: "8mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="${band}"><span>${esc(FACTORY_NAME)} — مراجعة الإنتاج</span><span>الفترة: ${ltr(report.from)} ← ${ltr(report.to)}</span></div>`,
      footerTemplate: `<div style="${band}justify-content:center;">صفحة&nbsp;<span class="pageNumber"></span>&nbsp;من&nbsp;<span class="totalPages"></span></div>`,
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
