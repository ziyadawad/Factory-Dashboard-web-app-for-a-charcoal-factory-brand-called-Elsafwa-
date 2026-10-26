// مراجعة الإنتاج يوم بيوم من ERPNext (قراية بس، مش بيغير أي حاجة لا في ERPNext ولا في الداشبورد)
// Production audit, day by day, from ERPNext (read-only: changes nothing in ERPNext or the dashboard)
//
// التشغيل - run:  npm run audit:production -- --from 2026-10-01 --to today
// الناتج - output: reports/production-audit.md + reports/production-audit.csv
// فولدر reports/ في .gitignore ومينفعش يترفع (الريبو public) - reports/ is gitignored, never commit it (public repo)
//
// المصدر: Stock Entry نوعها Manufacture. Submitted بس هو اللي بيتحسب إنتاج، والـ Draft والـ Cancelled بيظهروا لوحدهم
// Source: Stock Entry of type Manufacture. Only Submitted counts as production; Draft and Cancelled are listed apart
// السطر اللي is_finished_item = 1 = المنتج، والسطر اللي فيه s_warehouse = خامة اتصرفت
// Rows with is_finished_item = 1 are produced items, rows with s_warehouse are consumed materials

import fs from "node:fs";
import path from "node:path";

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

  const warnings: Record<string, string[]> = {
    noProduction: [],
    drafts: [],
    unusualItem: [],
    unusualWarehouse: [],
    unusualQty: [],
    packaging: [],
    late: [],
  };

  // 1) أيام من غير إنتاج - days without submitted production
  for (const day of days) {
    const items = perDay.get(day)!;
    const packaged = PACKAGED.some((item) => items.get(item));
    if (weekday(day) === FRIDAY && !items.size) continue;
    if (day === cairoToday() && !items.size) continue; // النهارده لسه ممكن يتسجل - today may still be entered
    if (!packaged) {
      const note = items.size ? `فيه إنتاج تاني بس: ${Array.from(items.keys()).join("، ")}` : "مفيش أي إنتاج خالص";
      const friday = weekday(day) === FRIDAY ? " (جمعة)" : "";
      warnings.noProduction.push(`**${day}** ${DAY_NAMES[weekday(day)]}${friday}: مفيش إنتاج تعبئة متسجل — ${note}`);
    }
  }

  // 2) مسودات ومتلغي - drafts and cancelled
  for (const e of entries.filter((x) => x.docstatus !== 1)) {
    const items = finished(e).map((r) => `${r.item_code} ${fmt(r.transfer_qty)}`).join("، ") || "من غير منتج";
    const what = e.docstatus === 0 ? "مسودة عمرها ما اتسجلت (Draft)" : "ملغية (Cancelled)";
    warnings.drafts.push(`\`${e.name}\` بتاريخ ${e.posting_date}: ${what} — ${items} — ${e.owner}`);
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
        warnings.unusualItem.push(
          `\`${e.name}\` بتاريخ ${e.posting_date} (${STATUS[e.docstatus]}): **${r.item_code}** ${fmt(r.transfer_qty)} ${r.stock_uom} ← ${r.t_warehouse} — صنف مش من المنتجات المعتادة، اتأكد إنه صح`
        );
      const usual = usualWarehouse.get(r.item_code);
      if (usual && r.t_warehouse !== usual)
        warnings.unusualWarehouse.push(
          `\`${e.name}\` بتاريخ ${e.posting_date}: ${r.item_code} دخل **${r.t_warehouse}** والمعتاد ${usual}`
        );
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
        warnings.unusualQty.push(`**${day}**: ${item} = ${fmt(q)} — أكتر من ${HIGH_QTY}x المتوسط (${fmt(average)})`);
      else if (q > 0 && q < LOW_QTY * average)
        warnings.unusualQty.push(`**${day}**: ${item} = ${fmt(q)} — أقل من ${LOW_QTY}x المتوسط (${fmt(average)})`);
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
          warnings.packaging.push(
            `\`${e.name}\` بتاريخ ${e.posting_date}: ${fin.item_code} ${fmt(fin.transfer_qty)} من غير ما يتصرف **${key}**`
          );
      for (const c of used) {
        const sample = ratios.get(`${fin.item_code}\u0000${c.item_code}`);
        if (!sample || sample.length < 3 || fin.transfer_qty <= 0) continue;
        const usual = median(sample);
        const ratio = c.transfer_qty / fin.transfer_qty;
        if (ratio > usual * RATIO_TOLERANCE || ratio < usual / RATIO_TOLERANCE)
          warnings.packaging.push(
            `\`${e.name}\` بتاريخ ${e.posting_date}: ${fin.item_code} ${fmt(fin.transfer_qty)} صرف ${c.item_code} ${fmt(c.transfer_qty)} ${c.stock_uom} — ${fmt(ratio)} للوحدة والمعتاد ${fmt(usual)}`
          );
      }
    }

  // 6) اتسجل في يوم غير تاريخ الحركة - entered on a different day than its posting date
  for (const e of entries) {
    const created = e.creation.slice(0, 10);
    if (created !== e.posting_date)
      warnings.late.push(
        `\`${e.name}\` (${STATUS[e.docstatus]}): تاريخ الحركة ${e.posting_date} بس اتعملت يوم ${created} ${e.creation.slice(11, 16)} — ${e.owner}`
      );
  }

  // ============================================================
  // الكتابة - writing the reports
  // ============================================================

  const otherItems = allItems.filter((item) => !PACKAGED.includes(item));
  const dayRows = days.map((day) => {
    const items = perDay.get(day)!;
    const dayEntries = entries.filter((e) => e.posting_date === day);
    const count = (status: number) => dayEntries.filter((e) => e.docstatus === status).length;
    const packaged = PACKAGED.some((item) => items.get(item));
    const friday = weekday(day) === FRIDAY;
    const today = day === cairoToday() && !items.size;
    const note = packaged ? "" : friday ? "جمعة" : today ? "النهارده (لسه ممكن يتسجل)" : "⚠️ مفيش إنتاج تعبئة";
    return {
      day,
      name: DAY_NAMES[weekday(day)],
      packaged: PACKAGED.map((item) => items.get(item) ?? 0),
      other: otherItems.filter((item) => items.get(item)).map((item) => `${item} ${fmt(items.get(item)!)}`),
      submitted: count(1),
      drafts: count(0),
      cancelled: count(2),
      note,
    };
  });

  const md: string[] = [];
  md.push(`# مراجعة الإنتاج من ${from} لحد ${to}`);
  md.push(
    `اتعمل ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" })} (بتوقيت مصر) من ERPNext — Stock Entry نوعها Manufacture.\n\n` +
      `الحركات: **${submitted.length}** متسجلة (Submitted) — ${entries.filter((e) => e.docstatus === 0).length} مسودة — ${entries.filter((e) => e.docstatus === 2).length} ملغية. ` +
      `المتسجل بس هو اللي بيتحسب إنتاج.`
  );

  md.push(`## الملخص: إجمالي الإنتاج في الفترة (Submitted بس)`);
  const summaryItems = [...PACKAGED, ...otherItems];
  md.push(
    table(
      ["الصنف", "الإجمالي", "الوحدة", "عدد الأيام", "متوسط اليوم", "عدد الحركات"],
      summaryItems.map((item) => {
        const total = days.reduce((sum, d) => sum + (perDay.get(d)!.get(item) ?? 0), 0);
        const dayCount = days.filter((d) => perDay.get(d)!.get(item)).length;
        const entryCount = submitted.filter((e) => finished(e).some((r) => r.item_code === item)).length;
        const name = PACKAGED.includes(item) ? item : OTHER_USUAL.includes(item) ? item : `⚠️ ${item}`;
        return [name, fmt(total), units.get(item) ?? "", String(dayCount), dayCount ? fmt(averages.get(item) ?? 0) : "-", String(entryCount)];
      })
    )
  );
  const scrapTotals = new Map<string, number>();
  for (const e of submitted) for (const r of scrap(e)) scrapTotals.set(r.item_code, (scrapTotals.get(r.item_code) ?? 0) + r.transfer_qty);
  if (scrapTotals.size) {
    md.push(`### منتجات ثانوية (Scrap) - مش محسوبة فوق`);
    md.push(table(["الصنف", "الإجمالي", "الوحدة"], Array.from(scrapTotals).map(([item, q]) => [item, fmt(q), units.get(item) ?? ""])));
  }

  const warningSections: [string, string[]][] = [
    ["أيام من غير إنتاج تعبئة متسجل (الجمعة مش محسوبة لو مفيهاش حاجة)", warnings.noProduction],
    ["مسودات عمرها ما اتسجلت، وحركات ملغية", warnings.drafts],
    ["أصناف مش من المنتجات المعتادة (ممكن صنف غلط)", warnings.unusualItem],
    ["منتج دخل مخزن غير المعتاد", warnings.unusualWarehouse],
    [`كمية غريبة (أكتر من ${HIGH_QTY}x أو أقل من ${LOW_QTY}x متوسط الصنف في اليوم)`, warnings.unusualQty],
    [`خامات التعبئة مش ماشية مع المنتج (ناقصة، أو النسبة أكتر من ${RATIO_TOLERANCE}x / أقل من 1/${RATIO_TOLERANCE} المعتاد)`, warnings.packaging],
    ["حركات اتعملت في يوم غير تاريخها (ممكن اتسجلت متأخر)", warnings.late],
  ];
  md.push(`## ⚠️ التحذيرات`);
  for (const [title, list] of warningSections) {
    md.push(`### ${title} (${list.length})`);
    md.push(list.length ? list.map((w) => `- ${w}`).join("\n") : "- مفيش ✅");
  }

  md.push(`## يوم بيوم`);
  md.push(
    table(
      ["التاريخ", "اليوم", ...PACKAGED, "إنتاج تاني", "متسجل", "مسودة", "ملغي", "ملاحظة"],
      dayRows.map((r) => [
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
    ["التاريخ", "اليوم", ...PACKAGED, "إنتاج تاني", "متسجل", "مسودة", "ملغي", "ملاحظة"],
    ...dayRows.map((r) => [
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
  fs.writeFileSync(path.join(dir, "production-audit.md"), md.join("\n\n") + "\n", "utf8");
  fs.writeFileSync(path.join(dir, "production-audit.csv"), "﻿" + csv.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8");

  console.log(`\nالحركات: ${submitted.length} متسجلة، ${entries.length - submitted.length} مسودة/ملغية`);
  for (const [title, list] of warningSections) console.log(`⚠️ ${list.length} — ${title}`);
  console.log(`\nالتقرير: reports/production-audit.md\nالجدول:  reports/production-audit.csv`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
