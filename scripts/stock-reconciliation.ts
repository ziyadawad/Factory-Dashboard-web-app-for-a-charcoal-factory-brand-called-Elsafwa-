// مطابقة رصيد مخزن المنتج التام بين ERPNext والإكسيل بتاعنا (قراية بس، مش بيغير أي حاجة)
// Finished-goods stock reconciliation: ERPNext vs our Excel (read-only: changes nothing)
//
// التشغيل - run:  npm run audit:stock -- --from 2026-10-01 --to best --match-from 2026-10-20 --warehouse "مخزن منتج تام - تعبئة - AC"
//   --to: تاريخ YYYY-MM-DD، أو today، أو best = اليوم اللي أرقامه أقرب للإكسيل - a date, today, or best = the day closest to the Excel
//   --match-from: أول يوم نجربه لما ندور على تاريخ الإكسيل - first day tried when looking for the Excel's date
// أرقام الإكسيل في reports/excel-input.json (بيتعمل أول مرة وبعد كده عدّل فيه براحتك) - Excel numbers live in
// reports/excel-input.json (created on the first run, then edit it freely)
// الناتج - output: reports/stock-reconciliation.md / .xlsx / .pdf — فولدر reports/ مينفعش يترفع (الريبو public)
//
// الرصيد من Stock Ledger Entry (is_cancelled = 0): رصيد أول = آخر qty_after_transaction قبل --from
// Balances come from Stock Ledger Entry (is_cancelled = 0): opening = the last qty_after_transaction before --from
// المنصرف زي الإكسيل = صافي: رصيد أول + الإنتاج − رصيد آخر (يعني الخارج ناقص المرتجع وأي داخل غير الإنتاج)
// المنصرف is net like our Excel: opening + production − closing (all out minus returns and any non-production in)

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { chromium } from "playwright-core";

// ============================================================
// الإعدادات - settings
// ============================================================

const FACTORY_NAME = "الصفوة";
const DEFAULT_WAREHOUSE = "مخزن منتج تام - تعبئة - AC";

// نفس ترتيب الإكسيل: label = اسم العمود عندنا، code = كود الصنف في ERPNext
// Same order as our Excel: label = our column name, code = the ERPNext item code
const ITEMS = [
  { label: "باكت ربع", code: "باكت ربع" },
  { label: "باكت نص", code: "باكت نص" },
  { label: "باكت كيلو", code: "باكت كيلو" },
  { label: "باكت 2 كيلو", code: "باكت 2 كيلو" },
  { label: "كرتونة 1 كيلو", code: "كرتونة 1 كيلو" },
  { label: "كرتونة 2 كيلو", code: "كرتونة 2 كيلو" },
  { label: "كيس 3 كيلو جازورينا", code: "كيس 3 كيلو جازورينا" },
  { label: "كارتون فحم مضغوط", code: "كارتونة فحم مضغوط" },
  { label: "باكت ربع كامل", code: "باكت ربع كامل" },
  { label: "باكت نص كامل", code: "باكت نص كامل" },
];

// مخازن العربيات: اللي تحت مخازن المناديب أو اسمها فيه كلمة من دول - vehicle warehouses
const VEHICLE_GROUP = "مخازن المناديب - AC";
const VEHICLE_WORDS = /سوزوكي|الدبابة|سيارة|عربية/;

// أرقام الإكسيل الافتراضية (أول تشغيل بس) - default Excel numbers (first run only)
const DEFAULT_EXCEL: ExcelInput = {
  note: "أرقام الإكسيل بتاعنا بنفس ترتيب items. toDate = تاريخ آخر الإكسيل لو عارفينه (null = دوّر على أقرب يوم)",
  toDate: null,
  items: ITEMS.map((i) => i.label),
  rows: {
    opening: [2550.8, 2362, 1491, 558, 0, 489, 601, 619, 130, 143],
    production: [810, 2086, 911, 535, 251, 0, 0, 0, 0, 0],
    out: [1510, 2745, 1771, 539, 42, 27, 30, 3, 1, 2],
    closing: [1850.8, 1703, 631, 554, 209, 462, 571, 616, 129, 141],
  },
};

const EPS = 0.001;

// ============================================================
// الأشكال - shapes
// ============================================================

type RowKey = "opening" | "production" | "out" | "closing";
const ROW_KEYS: RowKey[] = ["opening", "production", "out", "closing"];
const ROW_TITLES: Record<RowKey, string> = {
  opening: "رصيد أول",
  production: "الإنتاج",
  out: "المنصرف",
  closing: "رصيد آخر",
};

type ExcelInput = { note?: string; toDate: string | null; items: string[]; rows: Record<RowKey, number[]> };

type Category = "production" | "toVehicles" | "fromVehicles" | "sales" | "transferIn" | "transferOut" | "reconciliation" | "other";
const CATEGORIES: Category[] = ["production", "toVehicles", "fromVehicles", "sales", "transferIn", "transferOut", "reconciliation", "other"];
const CATEGORY_TITLES: Record<Category, string> = {
  production: "الإنتاج",
  toVehicles: "تحميل للعربيات",
  fromVehicles: "مرتجع من العربيات",
  sales: "مبيعات مباشرة",
  transferIn: "تحويلات أخرى (داخل)",
  transferOut: "تحويلات أخرى (خارج)",
  reconciliation: "جرد / تسوية",
  other: "أخرى",
};

type LedgerRow = {
  item_code: string;
  warehouse: string;
  posting_date: string;
  posting_time: string;
  posting_datetime: string;
  creation: string;
  owner: string;
  voucher_type: string;
  voucher_no: string;
  voucher_detail_no: string;
  actual_qty: number;
  qty_after_transaction: number;
  is_cancelled: number;
};

type Movement = {
  date: string;
  time: string;
  created: string; // وقت دخولها الدفتر - when it reached the ledger
  owner: string;
  voucherType: string; // نوع المستند (ولو Stock Entry نوعها) - voucher type (with the Stock Entry type)
  voucherNo: string;
  item: string; // label
  qty: number; // + داخل / − خارج - in / out
  balance: number;
  category: Category;
  detail: string; // المخزن التاني أو ملاحظة - the other warehouse or a note
};

type Totals = Record<RowKey, number> & { byCategory: Record<Category, number>; grossIn: number; grossOut: number; check: boolean };

type Explanation = { item: string; row: RowKey; erp: number; excel: number; diff: number; reasons: { text: string; entries: Movement[] }[] };

// ============================================================
// ERPNext (نفس اتصال الداشبورد من .env.local) - same connection as the dashboard, from .env.local
// ============================================================

const TIMEOUT_MS = 30000;

function settings() {
  const url = process.env.FACTORY_API_URL;
  const key = process.env.FACTORY_API_KEY;
  const secret = process.env.FACTORY_API_SECRET;
  if (!url || !key || !secret) throw new Error("FACTORY_API_URL / FACTORY_API_KEY / FACTORY_API_SECRET مش موجودين في .env.local");
  return { baseUrl: url.replace(/\/+$/, ""), auth: `token ${key}:${secret}` };
}

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

const LEDGER_FIELDS = [
  "item_code", "warehouse", "posting_date", "posting_time", "posting_datetime", "creation", "owner",
  "voucher_type", "voucher_no", "voucher_detail_no", "actual_qty", "qty_after_transaction", "is_cancelled",
];
const LEDGER_ORDER = "posting_datetime asc, creation asc";

// ============================================================
// التواريخ والتنسيق - dates and formatting
// ============================================================

const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const round = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => round(n).toLocaleString("en");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const same = (a: number, b: number) => Math.abs(a - b) < EPS;

function parseArgs(excel: ExcelInput) {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const today = cairoToday();
  const from = value("--from") ?? `${today.slice(0, 8)}01`;
  const rawTo = value("--to") ?? excel.toDate ?? "best";
  const to = rawTo === "today" ? today : rawTo;
  const matchFrom = value("--match-from") ?? addDays(isDate(to) ? to : today, -7);
  const warehouse = value("--warehouse") ?? DEFAULT_WAREHOUSE;
  for (const [name, date] of [["--from", from], ["--match-from", matchFrom]])
    if (!isDate(date)) throw new Error(`تاريخ غلط في ${name}: ${date} (اكتبه YYYY-MM-DD)`);
  if (to !== "best" && !isDate(to)) throw new Error(`--to لازم يبقى YYYY-MM-DD أو today أو best: ${rawTo}`);
  return { from, to, matchFrom: matchFrom < from ? from : matchFrom, warehouse, today };
}

// أرقام الإكسيل: بنعمل الملف أول مرة بس، وبعد كده بنقرا اللي فيه - created once, then read as edited
function loadExcelInput(file: string): ExcelInput {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(DEFAULT_EXCEL, null, 2) + "\n", "utf8");
    console.log(`اتعمل ${path.relative(process.cwd(), file)} بأرقام الإكسيل - عدّل فيه لو الأرقام اتغيرت`);
  }
  const input = JSON.parse(fs.readFileSync(file, "utf8")) as ExcelInput;
  for (const key of ROW_KEYS)
    if (!Array.isArray(input.rows?.[key]) || input.rows[key].length !== ITEMS.length)
      throw new Error(`excel-input.json: rows.${key} لازم يبقى فيه ${ITEMS.length} رقم بنفس ترتيب items`);
  return input;
}

// ============================================================
// القراية والتصنيف - loading and classifying
// ============================================================

async function main() {
  const reportsDir = path.join(process.cwd(), "reports");
  const excel = loadExcelInput(path.join(reportsDir, "excel-input.json"));
  const { from, to: rawTo, matchFrom, warehouse, today } = parseArgs(excel);
  const codes = ITEMS.map((i) => i.code);
  const labelOf = new Map(ITEMS.map((i) => [i.code, i.label]));
  const lastDay = rawTo === "best" ? today : rawTo;
  console.log(`مطابقة ${warehouse} من ${from} ...`);

  const warehouses = await getList<{ name: string; parent_warehouse: string | null }>({
    doctype: "Warehouse",
    fields: ["name", "parent_warehouse"],
  });
  const isVehicle = (name: string | null | undefined) =>
    !!name && (VEHICLE_WORDS.test(name) || warehouses.some((w) => w.name === name && w.parent_warehouse === VEHICLE_GROUP));

  // رصيد أول: آخر حركة قبل --from لكل صنف - opening: the last entry before --from, per item
  const openingRows = await Promise.all(
    codes.map((code) =>
      getList<LedgerRow>({
        doctype: "Stock Ledger Entry",
        filters: [["item_code", "=", code], ["warehouse", "=", warehouse], ["is_cancelled", "=", 0], ["posting_date", "<", from]],
        fields: LEDGER_FIELDS,
        order_by: "posting_datetime desc, creation desc",
        limit_page_length: 1,
      })
    )
  );
  const opening = new Map(codes.map((code, i) => [code, openingRows[i][0]?.qty_after_transaction ?? 0]));

  // كل الحركات (والملغية) من أسبوعين قبل --from لحد آخر يوم - all entries (and cancelled) from two weeks before --from
  const lookback = addDays(from, -14);
  const ledger = await getList<LedgerRow>({
    doctype: "Stock Ledger Entry",
    filters: [["item_code", "in", codes], ["warehouse", "=", warehouse], ["posting_date", ">=", lookback], ["posting_date", "<=", lastDay]],
    fields: LEDGER_FIELDS,
    order_by: LEDGER_ORDER,
  });
  // نفس الأصناف في مخازن تانية (مش عربيات) - the same items in other (non-vehicle) warehouses
  const elsewhere = (
    await getList<LedgerRow>({
      doctype: "Stock Ledger Entry",
      filters: [["item_code", "in", codes], ["warehouse", "!=", warehouse], ["is_cancelled", "=", 0], ["posting_date", ">=", from], ["posting_date", "<=", lastDay]],
      fields: LEDGER_FIELDS,
      order_by: LEDGER_ORDER,
    })
  ).filter((row) => !isVehicle(row.warehouse));
  // حركات قبل --from اتسجلت بعده (بتغير رصيد أول) - entries dated before --from but entered after it
  const backdated = await getList<LedgerRow>({
    doctype: "Stock Ledger Entry",
    filters: [["item_code", "in", codes], ["warehouse", "=", warehouse], ["is_cancelled", "=", 0], ["posting_date", "<", from], ["creation", ">=", `${from} 00:00:00`]],
    fields: LEDGER_FIELDS,
    order_by: LEDGER_ORDER,
  });

  // نوع الـ Stock Entry والمخزن التاني لكل سطر - Stock Entry type and the other warehouse of each row
  const stockEntryRows = [...ledger, ...elsewhere, ...backdated].filter((r) => r.voucher_type === "Stock Entry");
  const entryNames = Array.from(new Set(stockEntryRows.map((r) => r.voucher_no)));
  const [entryTypes, entryDetails] = entryNames.length
    ? await Promise.all([
        getList<{ name: string; stock_entry_type: string; purpose: string }>({
          doctype: "Stock Entry",
          filters: [["name", "in", entryNames]],
          fields: ["name", "stock_entry_type", "purpose"],
        }),
        getList<{ name: string; s_warehouse: string | null; t_warehouse: string | null }>({
          doctype: "Stock Entry Detail",
          parent: "Stock Entry",
          filters: [["name", "in", Array.from(new Set(stockEntryRows.map((r) => r.voucher_detail_no)))]],
          fields: ["name", "s_warehouse", "t_warehouse"],
        }),
      ])
    : [[], []];
  const typeOf = new Map(entryTypes.map((e) => [e.name, e]));
  const detailOf = new Map(entryDetails.map((d) => [d.name, d]));

  // حركة الدفتر ← حركة متصنفة - a ledger row -> a classified movement
  const toMovement = (row: LedgerRow, qty: number): Movement => {
    let category: Category = "other";
    let voucherType = row.voucher_type;
    let detail = "";
    if (row.voucher_type === "Stock Entry") {
      const entry = typeOf.get(row.voucher_no);
      const line = detailOf.get(row.voucher_detail_no);
      voucherType = `Stock Entry / ${entry?.stock_entry_type ?? "?"}`;
      const other = qty < 0 ? line?.t_warehouse : line?.s_warehouse;
      detail = other ?? "";
      if (entry?.purpose === "Manufacture" && qty > 0) category = "production";
      else if (entry?.purpose === "Material Transfer" && isVehicle(other)) category = qty < 0 ? "toVehicles" : "fromVehicles";
      else if (entry?.purpose === "Material Transfer") category = qty < 0 ? "transferOut" : "transferIn";
    } else if (row.voucher_type === "Delivery Note" || row.voucher_type === "Sales Invoice") {
      category = "sales";
      detail = qty > 0 ? "مرتجع بيع" : "";
    } else if (row.voucher_type === "Stock Reconciliation") {
      category = "reconciliation";
    }
    if (category === "other") detail = [voucherType, detail].filter(Boolean).join(" ← ");
    return {
      date: row.posting_date,
      time: row.posting_time.slice(0, 5),
      created: row.creation.slice(0, 16),
      owner: row.owner,
      voucherType,
      voucherNo: row.voucher_no,
      item: labelOf.get(row.item_code) ?? row.item_code,
      qty,
      balance: row.qty_after_transaction,
      category,
      detail,
    };
  };

  // الكمية = actual_qty، إلا التسوية: الفرق بين الرصيد قبلها وبعدها - qty = actual_qty, except a reconciliation: the balance change
  const movements: Movement[] = [];
  const running = new Map(opening);
  for (const row of ledger) {
    if (row.is_cancelled || row.posting_date < from) continue;
    const before = running.get(row.item_code) ?? 0;
    const qty = row.voucher_type === "Stock Reconciliation" ? row.qty_after_transaction - before : row.actual_qty;
    running.set(row.item_code, row.qty_after_transaction);
    movements.push(toMovement(row, qty));
  }
  // الإلغاء بيعلّم السطر الأصلي وسطر العكس الاتنين is_cancelled: نسيب الأصلي بس - cancelling flags the original and its
  // reversal: keep only the original (the first one entered)
  const cancelledRows = ledger.filter((r) => r.is_cancelled && r.posting_date >= from);
  const cancelled = cancelledRows
    .filter((r) => !cancelledRows.some((o) => o.voucher_no === r.voucher_no && o.item_code === r.item_code && o.creation < r.creation))
    .map((r) => toMovement(r, r.actual_qty));
  const otherWarehouses = elsewhere.map((r) => ({ ...toMovement(r, r.actual_qty), detail: `في ${r.warehouse}` }));
  const backdatedMoves = backdated.map((r) => toMovement(r, r.actual_qty));

  // الرصيد في آخر أي يوم (من الأسبوعين اللي قبل --from) - balance at the end of any day (from the lookback on)
  const balanceAt = (code: string, day: string) => {
    let balance: number | undefined;
    for (const row of ledger) if (!row.is_cancelled && row.item_code === code && row.posting_date <= day) balance = row.qty_after_transaction;
    return balance ?? (day >= addDays(from, -1) ? opening.get(code) ?? 0 : undefined);
  };

  // أرقام ERPNext لحد يوم معين - ERPNext numbers up to a given day
  const totalsAt = (day: string): Totals[] =>
    ITEMS.map((item) => {
      const moves = movements.filter((m) => m.item === item.label && m.date <= day);
      const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
      for (const m of moves) byCategory[m.category] += m.qty;
      const first = opening.get(item.code) ?? 0;
      const sum = moves.reduce((s, m) => s + m.qty, 0);
      const closing = moves.length ? moves[moves.length - 1].balance : first;
      return {
        opening: first,
        production: byCategory.production,
        out: first + byCategory.production - closing,
        closing,
        byCategory,
        grossIn: moves.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0),
        grossOut: -moves.filter((m) => m.qty < 0).reduce((s, m) => s + m.qty, 0),
        check: same(first + sum, closing),
      };
    });

  // ============================================================
  // أنهي يوم أقرب للإكسيل - which day matches the Excel best
  // ============================================================

  const matches = daysBetween(matchFrom, lastDay).map((day) => {
    const totals = totalsAt(day);
    let exact = 0;
    let gap = 0;
    for (const key of ["production", "out", "closing"] as RowKey[])
      totals.forEach((t, i) => {
        const d = Math.abs(t[key] - excel.rows[key][i]);
        if (d < EPS) exact++;
        gap += d;
      });
    return { day, exact, gap, closing: totals.reduce((s, t) => s + t.closing, 0) };
  });
  const best = [...matches].sort((a, b) => b.exact - a.exact || a.gap - b.gap)[0];
  const to = rawTo === "best" ? best.day : rawTo;
  const erp = totalsAt(to);
  const inPeriod = movements.filter((m) => m.date <= to);
  console.log(`أقرب يوم للإكسيل: ${best.day} (${best.exact} من ${ITEMS.length * 3} رقم مطابق) — التقرير لحد ${to}`);

  // ============================================================
  // أسباب الفروقات - explaining the differences
  // ============================================================

  const explanations: Explanation[] = [];
  ITEMS.forEach((item, i) => {
    for (const key of ROW_KEYS) {
      const value = erp[i][key];
      const theirs = excel.rows[key][i];
      const diff = round(value - theirs);
      if (Math.abs(diff) < EPS) continue;
      explanations.push({ item: item.label, row: key, erp: value, excel: theirs, diff, reasons: explain(item, i, key, diff) });
    }
  });

  function explain(item: (typeof ITEMS)[number], index: number, key: RowKey, diff: number) {
    const reasons: { text: string; entries: Movement[] }[] = [];
    const size = Math.abs(diff);
    const mine = inPeriod.filter((m) => m.item === item.label);
    const fits = (m: Movement) => same(Math.abs(m.qty), size);
    const theirs = excel.rows[key][index];
    const value = erp[index][key];
    if (size < 1 && Number.isInteger(theirs) && same(Math.trunc(value), theirs))
      reasons.push({ text: `الإكسيل شايل الكسر: ERPNext ${fmt(value)} والإكسيل ${fmt(theirs)}`, entries: [] });

    if (key === "closing") {
      const parts = (["opening", "production", "out"] as RowKey[]).map((k) => round(erp[index][k] - excel.rows[k][index]));
      const own = round(excel.rows.opening[index] + excel.rows.production[index] - excel.rows.out[index] - excel.rows.closing[index]);
      reasons.push({
        text: `فرق رصيد آخر = فرق رصيد أول (${signed(parts[0])}) + فرق الإنتاج (${signed(parts[1])}) − فرق المنصرف (${signed(parts[2])})`,
        entries: [],
      });
      if (Math.abs(own) > EPS)
        reasons.push({ text: `الإكسيل نفسه مش موزون: رصيد أول + الإنتاج − المنصرف − رصيد آخر = ${signed(own)}`, entries: [] });
      const near = daysBetween(addDays(to, -5), addDays(to, 5)).filter((d) => d <= lastDay && same(balanceAt(item.code, d) ?? NaN, excel.rows.closing[index]));
      if (near.length) reasons.push({ text: `رصيد آخر في الإكسيل = رصيد ERPNext في آخر يوم ${near.join(" / ")}`, entries: [] });
    }

    if (key === "opening") {
      const near = daysBetween(addDays(from, -14), addDays(from, 5)).filter((d) => same(balanceAt(item.code, d) ?? NaN, excel.rows.opening[index]));
      if (near.length) reasons.push({ text: `رصيد أول في الإكسيل = رصيد ERPNext في آخر يوم ${near.join(" / ")} (يعني الإكسيل بدأ من يوم تاني)`, entries: [] });
      const back = backdatedMoves.filter((m) => m.item === item.label);
      const backSum = back.reduce((s, m) => s + m.qty, 0);
      const backFits = back.filter(fits);
      if (same(Math.abs(backSum), size))
        reasons.push({ text: `حركات بتاريخ قبل ${from} بس اتسجلت بعده، مجموعها ${signed(backSum)} — بتفسر الفرق بالظبط`, entries: back });
      else if (backFits.length)
        reasons.push({ text: `حركة بتاريخ قبل ${from} اتسجلت بعده وكميتها ${fmt(size)}`, entries: backFits });
      else if (back.length)
        reasons.push({ text: `للعلم: ${back.length} حركة بتاريخ قبل ${from} اتسجلت بعده (مجموعها ${signed(backSum)}) — مش بتفسر الفرق لوحدها`, entries: [] });
      const firstDay = mine.filter((m) => m.date === from);
      const firstSum = firstDay.reduce((s, m) => s + m.qty, 0);
      if (firstDay.length && same(Math.abs(firstSum), size))
        reasons.push({ text: `حركات يوم ${from} نفسه مجموعها ${signed(firstSum)} — يمكن الإكسيل حسب رصيد أول بعدها`, entries: firstDay });
    }

    if (key === "production" || key === "out") {
      const pool = key === "production" ? mine.filter((m) => m.category === "production") : mine.filter((m) => m.category !== "production");
      // أثر الحركة على الصف لو الإكسيل ناقصها: الإنتاج = الكمية، المنصرف = عكسها (الخارج بيزوده والمرتجع بيقلله)
      // the movement's effect on the row if the Excel lacks it: production = qty, المنصرف = −qty (out adds, returns subtract)
      const effect = (m: Movement) => (key === "production" ? m.qty : -m.qty);
      const missing = pool.filter((m) => same(effect(m), diff));
      const extra = pool.filter((m) => same(effect(m), -diff));
      const lastDay = missing.filter((m) => m.date === to);
      if (lastDay.length)
        reasons.push({ text: `حركة يوم ${to} نفسه كميتها ${fmt(size)} — غالبًا الإكسيل اتقفل قبل ما تتسجل`, entries: lastDay });
      const earlier = missing.filter((m) => m.date !== to).reverse();
      if (earlier.length)
        reasons.push({
          text: `${earlier.length} حركة في ERPNext ممكن واحدة منهم مش في الإكسيل (الأحدث الأول)`,
          entries: earlier.slice(0, 6),
        });
      if (extra.length)
        reasons.push({
          text: `الإكسيل زيادة ${fmt(size)}: يمكن حركة من دول متسجلة فيه مرتين أو بالعكس (الأحدث الأول)`,
          entries: extra.reverse().slice(0, 6),
        });
      const exact = [...missing, ...extra];

      // رقم اتكتب غلط، زي 10 اتكتبت 1010 - a mistyped number, like 10 written as 1010
      const typos = pool.filter((m) => {
        const q = Math.abs(m.qty);
        const theirs = q - diff * Math.sign(effect(m));
        const [a, b] = [String(round(q)), String(round(theirs))];
        return q >= 10 && theirs >= 10 && !same(theirs, q) && (a.includes(b) || b.includes(a));
      });
      for (const m of typos.slice(0, 4)) {
        const theirs = Math.abs(m.qty) - diff * Math.sign(effect(m));
        reasons.push({ text: `ممكن الكمية دي اتكتبت في الإكسيل ${fmt(theirs)} بدل ${fmt(Math.abs(m.qty))}`, entries: [m] });
      }

      if (key === "out") {
        for (const category of CATEGORIES.filter((c) => c !== "production")) {
          const total = round(erp[index].byCategory[category]);
          if (Math.abs(total) > EPS && same(-total, diff))
            reasons.push({ text: `إجمالي "${CATEGORY_TITLES[category]}" = ${signed(total)} — يمكن الإكسيل مش بيحسبه`, entries: pool.filter((m) => m.category === category).slice(0, 8) });
        }
      }

      if (!exact.length && !typos.length) {
        const pairs: Movement[][] = [];
        for (let a = 0; a < pool.length && pairs.length < 3; a++)
          for (let b = a + 1; b < pool.length && pairs.length < 3; b++)
            if (same(Math.abs(pool[a].qty + pool[b].qty), size) || same(Math.abs(pool[a].qty) + Math.abs(pool[b].qty), size)) pairs.push([pool[a], pool[b]]);
        for (const pair of pairs) reasons.push({ text: `حركتين مجموعهم ${fmt(size)}`, entries: pair });
      }

      const gone = cancelled.filter((m) => m.item === item.label && m.date <= to && (key === "production" ? m.category === "production" : m.category !== "production"));
      // الإكسيل لسه حاسب حركة اتلغت: ERPNext ناقصها - the Excel still counts a cancelled movement ERPNext no longer has
      const goneFit = gone.filter((m) => same(effect(m), -diff));
      if (goneFit.length) reasons.push({ text: `حركة اتلغت (Cancelled) كميتها ${fmt(size)} — غالبًا الإكسيل لسه حاسبها`, entries: goneFit });
      // مستند اتلغى واتعدل (MAT-STE-…-1): لو الإكسيل لسه بالكمية القديمة - a cancelled and amended document, if the Excel
      // still has the old quantity
      for (const g of gone) {
        const amended = pool.filter((m) => m.voucherNo.startsWith(`${g.voucherNo}-`));
        const delta = round(amended.reduce((s, m) => s + effect(m), 0) - effect(g));
        if (Math.abs(delta) > EPS)
          reasons.push({
            text: `${g.voucherNo} اتلغى واتعدل: الأصلي ${signed(g.qty)} والمعدّل ${amended.length ? signed(amended.reduce((s, m) => s + m.qty, 0)) : "مفيهوش الصنف ده"}` +
              (same(delta, diff) ? " — لو الإكسيل لسه بالأصلي ده يفسر الفرق بالظبط" : ` (فرق ${signed(delta)})`),
            entries: [g, ...amended],
          });
      }
      if (!goneFit.length && gone.length) reasons.push({ text: `فيه ${gone.length} حركة ملغية للصنف ده في الفترة — راجعها`, entries: gone.slice(0, 5) });

      const there = otherWarehouses.filter((m) => m.item === item.label && m.date <= to && (fits(m) || (key === "production" && m.category === "production")));
      if (there.length) reasons.push({ text: `حركات للصنف ده في مخزن تاني غير ${warehouse} (ممكن اتسجلت في المخزن الغلط)`, entries: there.slice(0, 6) });
    }

    // حركات اتسجلت بعد يوم الإكسيل بتاريخ قديم - entries entered after the Excel day but dated within it
    if (key !== "opening") {
      const late = mine.filter((m) => m.created.slice(0, 10) > to && (key === "closing" || (key === "production") === (m.category === "production")));
      const lateSum = late.reduce((s, m) => s + m.qty, 0);
      if (late.length)
        reasons.push({
          text: `${late.length} حركة بتاريخ لحد ${to} بس اتسجلت في ERPNext بعده (مجموعها ${signed(lateSum)}) — الإكسيل مكانش يعرف عنها`,
          entries: late.slice(0, 8),
        });
    }

    if (!reasons.length) reasons.push({ text: "مفيش حركة واضحة بتفسر الفرق — قارن شيت الحركات بالإكسيل يوم بيوم", entries: [] });
    return reasons;
  }

  // ============================================================
  // الكتابة - writing
  // ============================================================

  const report: Report = { from, to, warehouse, best, matches, erp, excel, movements: inPeriod, explanations, generated: new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" }) };
  const out = (name: string) => path.join(reportsDir, name);
  fs.writeFileSync(out("stock-reconciliation.md"), renderMarkdown(report), "utf8");
  await writeExcel(out("stock-reconciliation.xlsx"), report);
  await writePdf(out("stock-reconciliation.pdf"), report);

  const diffs = explanations.length;
  console.log(`الفروقات: ${diffs} رقم مختلف من ${ITEMS.length * ROW_KEYS.length}`);
  console.log(`فحص (رصيد أول + الداخل − الخارج = رصيد آخر): ${erp.every((t) => t.check) ? "✔ مظبوط لكل الأصناف" : "✘ فيه صنف مش موزون"}`);
  console.log("الملفات في reports/: stock-reconciliation.md / .xlsx / .pdf");
}

// ============================================================
// التقرير - the report every output is written from
// ============================================================

type Report = {
  from: string;
  to: string;
  warehouse: string;
  best: { day: string; exact: number; gap: number };
  matches: { day: string; exact: number; gap: number; closing: number }[];
  erp: Totals[];
  excel: ExcelInput;
  movements: Movement[];
  explanations: Explanation[];
  generated: string;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const HEAD = ["", ...ITEMS.map((i) => i.label), "الإجمالي"];
const balanceRows = (r: Report) =>
  ROW_KEYS.map((key) => {
    const values = r.erp.map((t) => t[key]);
    return [ROW_TITLES[key], ...values, sum(values)];
  });
const breakdownRows = (r: Report) => [
  ...CATEGORIES.map((c) => {
    const values = r.erp.map((t) => t.byCategory[c]);
    return [CATEGORY_TITLES[c], ...values, sum(values)];
  }),
  ["إجمالي الداخل", ...r.erp.map((t) => t.grossIn), sum(r.erp.map((t) => t.grossIn))],
  ["إجمالي الخارج", ...r.erp.map((t) => t.grossOut), sum(r.erp.map((t) => t.grossOut))],
  ["المنصرف (صافي زي الإكسيل)", ...r.erp.map((t) => t.out), sum(r.erp.map((t) => t.out))],
  ["الفحص: رصيد أول + الداخل − الخارج = رصيد آخر", ...r.erp.map((t) => (t.check ? "✔" : "✘")), r.erp.every((t) => t.check) ? "✔" : "✘"],
];
// المقارنة: لكل صف 3 سطور ERPNext / الإكسيل / الفرق - comparison: ERPNext / Excel / difference per row
const comparisonRows = (r: Report) =>
  ROW_KEYS.flatMap((key) => {
    const mine = r.erp.map((t) => t[key]);
    const theirs = r.excel.rows[key];
    const diff = mine.map((v, i) => round(v - theirs[i]));
    return [
      { label: `${ROW_TITLES[key]} — ERPNext`, values: [...mine, sum(mine)], kind: "erp" as const },
      { label: `${ROW_TITLES[key]} — الإكسيل`, values: [...theirs, sum(theirs)], kind: "excel" as const },
      { label: `${ROW_TITLES[key]} — الفرق`, values: [...diff, round(sum(diff))], kind: "diff" as const },
    ];
  });
const cellText = (v: number | string) => (typeof v === "number" ? fmt(v) : v);
const movementLine = (m: Movement) =>
  `${m.date} ${m.time} — ${m.voucherType} ${m.voucherNo} — ${m.item} ${signed(m.qty)}${m.detail ? ` (${m.detail})` : ""} — ${m.owner} — اتسجلت ${m.created}`;
const MOVEMENT_HEAD = ["التاريخ", "الساعة", "نوع المستند", "رقم المستند", "الصنف", "داخل", "خارج", "الرصيد بعدها", "التصنيف", "المخزن التاني / ملاحظة", "عملها", "اتسجلت يوم"];
const movementCells = (m: Movement): (string | number)[] => [
  m.date, m.time, m.voucherType, m.voucherNo, m.item, m.qty > 0 ? m.qty : "", m.qty < 0 ? -m.qty : "", m.balance,
  CATEGORY_TITLES[m.category], m.detail, m.owner, m.created,
];

// ============================================================
// Markdown
// ============================================================

function renderMarkdown(r: Report) {
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const table = (head: string[], rows: (string | number)[][]) =>
    [`| ${head.map(cell).join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map((v) => cell(cellText(v))).join(" | ")} |`)].join("\n");
  const md: string[] = [];
  md.push(`# رصيد مخزن المنتج التام — ${FACTORY_NAME}`);
  md.push(`المخزن: **${r.warehouse}** — الفترة من **${r.from}** لحد **${r.to}** — اتعمل ${r.generated} (بتوقيت مصر) من Stock Ledger Entry.`);
  md.push(`## أنهي يوم أقرب للإكسيل`);
  md.push(`أقرب يوم: **${r.best.day}** — ${r.best.exact} من ${ITEMS.length * 3} رقم (الإنتاج / المنصرف / رصيد آخر) مطابق بالظبط.`);
  md.push(table(["اليوم", "أرقام مطابقة", "مجموع الفروقات", "إجمالي رصيد آخر في ERPNext"], r.matches.map((m) => [m.day === r.best.day ? `**${m.day}** ✅` : m.day, `${m.exact} / ${ITEMS.length * 3}`, m.gap, m.closing])));
  md.push(`## الرصيد من ERPNext (نفس شكل الإكسيل)`);
  md.push(table(HEAD, balanceRows(r)));
  md.push(`## تفصيل المنصرف`);
  md.push(table(HEAD, breakdownRows(r)));
  md.push(`## المقارنة مع الإكسيل`);
  md.push(table(HEAD, comparisonRows(r).map((row) => [row.kind === "diff" ? `**${row.label}**` : row.label, ...row.values.map((v) => (row.kind === "diff" && Math.abs(v) > EPS ? `🔴 ${signed(v)}` : v))])));
  md.push(`## أسباب الفروقات (${r.explanations.length})`);
  for (const e of r.explanations) {
    md.push(`### ${e.item} — ${ROW_TITLES[e.row]}: ERPNext ${fmt(e.erp)} / الإكسيل ${fmt(e.excel)} / الفرق ${signed(e.diff)}`);
    md.push(e.reasons.map((reason) => [`- ${reason.text}`, ...reason.entries.map((m) => `  - ${movementLine(m)}`)].join("\n")).join("\n"));
  }
  md.push(`## الحركات (${r.movements.length})`);
  md.push(table(MOVEMENT_HEAD, r.movements.map(movementCells)));
  return md.join("\n\n") + "\n";
}

// ============================================================
// Excel
// ============================================================

const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const COLORS = { head: "FFFF7A00", label: "FFFFF1E0", red: "FFFFC7CE", redFont: "FF9C0006", green: "FFE6F4EA", gray: "FFF2F2F2" };
const qtyFormat = (n: number) => (Number.isInteger(n) ? "#,##0" : "#,##0.0##");

async function writeExcel(file: string, r: Report) {
  const book = new ExcelJS.Workbook();
  book.creator = FACTORY_NAME;

  const styleHead = (row: ExcelJS.Row) => {
    row.height = 34;
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = solid(COLORS.head);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
  };
  const sheet = (name: string, head: string[], widths: number[], filter = true) => {
    const ws = book.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 1 }] });
    ws.columns = head.map((header, i) => ({ header, width: widths[i] ?? widths[widths.length - 1] }));
    styleHead(ws.getRow(1));
    if (filter) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };
    return ws;
  };
  const addRow = (ws: ExcelJS.Worksheet, values: (string | number)[]) => {
    const row = ws.addRow(values);
    row.eachCell((c, col) => {
      if (typeof c.value === "number") c.numFmt = qtyFormat(c.value);
      c.alignment = { horizontal: col === 1 ? "right" : "center", vertical: "middle" };
    });
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = solid(COLORS.label);
    return row;
  };
  const widths = [26, ...ITEMS.map(() => 12), 13];

  const balance = sheet("الرصيد", HEAD, widths, false);
  for (const row of balanceRows(r)) addRow(balance, row);
  balance.addRow([]);
  balance.addRow([`${r.warehouse} — من ${r.from} لحد ${r.to}`]).font = { italic: true };

  const breakdown = sheet("تفصيل المنصرف", HEAD, widths, false);
  for (const row of breakdownRows(r)) addRow(breakdown, row);

  const compare = sheet("المقارنة مع الإكسيل", HEAD, widths, false);
  for (const row of comparisonRows(r)) {
    const added = addRow(compare, [row.label, ...row.values]);
    if (row.kind === "diff")
      added.eachCell((c, col) => {
        if (col === 1) return;
        const bad = typeof c.value === "number" && Math.abs(c.value) > EPS;
        c.fill = solid(bad ? COLORS.red : COLORS.green);
        c.font = { bold: true, color: { argb: bad ? COLORS.redFont : "FF1A7F37" } };
      });
    if (row.kind === "diff") added.border = { bottom: { style: "medium", color: { argb: "FF999999" } } };
  }

  const match = sheet("مطابقة التاريخ", ["اليوم", "أرقام مطابقة", "مجموع الفروقات", "إجمالي رصيد آخر"], [14, 14, 16, 18]);
  for (const m of r.matches) {
    const row = addRow(match, [m.day, `${m.exact} / ${ITEMS.length * 3}`, round(m.gap), m.closing]);
    if (m.day === r.best.day) row.eachCell((c) => (c.fill = solid(COLORS.green)));
  }

  const moves = sheet("الحركات", MOVEMENT_HEAD, [11, 7, 30, 21, 20, 9, 9, 12, 18, 28, 28, 17]);
  for (const m of r.movements) {
    const row = moves.addRow(movementCells(m));
    row.eachCell((c) => {
      if (typeof c.value === "number") c.numFmt = qtyFormat(c.value);
    });
    if (m.category !== "toVehicles" && m.category !== "production") row.eachCell((c) => (c.fill = solid(COLORS.gray)));
  }
  moves.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];

  const reasons = sheet("أسباب الفروقات", ["الصنف", "الصف", "ERPNext", "الإكسيل", "الفرق", "السبب المحتمل", "الحركة"], [20, 11, 11, 11, 10, 70, 110]);
  for (const e of r.explanations)
    for (const reason of e.reasons)
      for (const m of reason.entries.length ? reason.entries : [null]) {
        const row = reasons.addRow([e.item, ROW_TITLES[e.row], e.erp, e.excel, e.diff, reason.text, m ? movementLine(m) : ""]);
        row.eachCell((c) => {
          if (typeof c.value === "number") c.numFmt = qtyFormat(c.value);
          c.alignment = { vertical: "top", wrapText: true };
        });
        row.getCell(5).font = { bold: true, color: { argb: COLORS.redFont } };
      }
  reasons.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];

  await book.xlsx.writeFile(file);
}

// ============================================================
// PDF: صفحة HTML بتتطبع بـ Edge أو Chrome اللي على الجهاز (زي production-audit)
// an HTML page printed by the installed Edge or Chrome (like production-audit)
// ============================================================

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ltr = (text: string) => `<bdi dir="ltr">${esc(text)}</bdi>`;

function cairoFontCss() {
  const dir = path.join(process.cwd(), "node_modules", "@fontsource-variable", "cairo");
  return fs
    .readFileSync(path.join(dir, "index.css"), "utf8")
    .replace(/url\(\.\/files\/([^)]+)\)/g, (_, name: string) =>
      `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, "files", name)).toString("base64")})`
    );
}

const PDF_CSS = `
* { box-sizing: border-box; }
body { font-family: "Cairo Variable", sans-serif; color: #1f2328; font-size: 10px; margin: 0; }
h1 { font-size: 20px; margin: 0 0 2px; color: #c25a00; }
h2 { font-size: 15px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #FF7A00; break-after: avoid; }
h3 { font-size: 11px; margin: 9px 0 3px; break-after: avoid; }
.meta { color: #57606a; margin-bottom: 8px; }
.best { background: #e6f4ea; border-right: 4px solid #1a7f37; padding: 5px 10px; margin: 6px 0; font-size: 11px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #FF7A00; color: #fff; font-weight: 700; padding: 4px 3px; border: 1px solid #e06a00; font-size: 9px; }
td { padding: 3px 4px; border: 1px solid #d0d7de; text-align: center; font-variant-numeric: tabular-nums; }
td:first-child { background: #fff1e0; font-weight: 700; text-align: right; white-space: nowrap; }
td:not(:first-child) { direction: ltr; } /* علامة السالب تفضل قبل الرقم - keep the minus sign before the number */
td.bad { background: #ffc7ce; color: #9c0006; font-weight: 700; }
td.ok { background: #e6f4ea; color: #1a7f37; }
tr.excel td { color: #57606a; }
tr.diff td { border-bottom: 2px solid #999; }
tr.best td { background: #e6f4ea; }
.reason { break-inside: avoid; margin-bottom: 6px; }
.reason ul { margin: 0; padding-right: 16px; }
.reason li { margin: 1px 0; }
.reason li ul { font-size: 9px; color: #444; list-style: circle; }
.diffbadge { color: #9c0006; font-weight: 700; }
.page-break { break-before: page; }
`;

function htmlTable(head: string[], rows: { cells: string[]; classes?: string[]; className?: string }[]) {
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr${row.className ? ` class="${row.className}"` : ""}>${row.cells
          .map((c, i) => `<td${row.classes?.[i] ? ` class="${row.classes[i]}"` : ""}>${esc(c)}</td>`)
          .join("")}</tr>`
    )
    .join("")}</tbody></table>`;
}

function renderHtml(r: Report) {
  const plain = (rows: (string | number)[][]) => rows.map((row) => ({ cells: row.map(cellText) }));
  const comparison = comparisonRows(r).map((row) => ({
    cells: [row.label, ...row.values.map((v) => (row.kind === "diff" ? signed(v) : fmt(v)))],
    classes: row.kind === "diff" ? ["", ...row.values.map((v) => (Math.abs(v) > EPS ? "bad" : "ok"))] : undefined,
    className: row.kind,
  }));
  const reasons = r.explanations
    .map(
      (e) =>
        `<div class="reason"><h3>${esc(e.item)} — ${esc(ROW_TITLES[e.row])}: ERPNext ${fmt(e.erp)} / الإكسيل ${fmt(e.excel)} / <span class="diffbadge">الفرق ${ltr(signed(e.diff))}</span></h3><ul>${e.reasons
          .map((reason) => `<li>${esc(reason.text)}${reason.entries.length ? `<ul>${reason.entries.map((m) => `<li>${esc(movementLine(m))}</li>`).join("")}</ul>` : ""}</li>`)
          .join("")}</ul></div>`
    )
    .join("");
  const matchRows = r.matches.map((m) => ({
    cells: [m.day, `${m.exact} / ${ITEMS.length * 3}`, fmt(m.gap), fmt(m.closing)],
    className: m.day === r.best.day ? "best" : undefined,
  }));

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${cairoFontCss()}${PDF_CSS}</style></head><body>
<h1>رصيد مخزن المنتج التام — ${esc(FACTORY_NAME)}</h1>
<div class="meta">المخزن: <b>${esc(r.warehouse)}</b> — الفترة من <b>${ltr(r.from)}</b> لحد <b>${ltr(r.to)}</b> — اتعمل ${ltr(r.generated)} (بتوقيت مصر) من Stock Ledger Entry.</div>
<div class="best">أقرب يوم للإكسيل: <b>${ltr(r.best.day)}</b> — ${r.best.exact} من ${ITEMS.length * 3} رقم (الإنتاج / المنصرف / رصيد آخر) مطابق بالظبط.</div>
<h2>الرصيد من ERPNext (نفس شكل الإكسيل)</h2>
${htmlTable(HEAD, plain(balanceRows(r)))}
<h2>تفصيل المنصرف</h2>
${htmlTable(HEAD, plain(breakdownRows(r)))}
<h2 class="page-break">المقارنة مع الإكسيل</h2>
${htmlTable(HEAD, comparison)}
<h3>أنهي يوم أقرب للإكسيل</h3>
${htmlTable(["اليوم", "أرقام مطابقة", "مجموع الفروقات", "إجمالي رصيد آخر في ERPNext"], matchRows)}
<h2 class="page-break">أسباب الفروقات (${r.explanations.length})</h2>
${reasons || "<p>مفيش فروقات ✅</p>"}
</body></html>`;
}

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

async function writePdf(file: string, r: Report) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml(r), { waitUntil: "load" });
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
      headerTemplate: `<div style="${band}"><span>${esc(FACTORY_NAME)} — رصيد مخزن المنتج التام</span><span>الفترة: ${ltr(r.from)} ← ${ltr(r.to)}</span></div>`,
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
