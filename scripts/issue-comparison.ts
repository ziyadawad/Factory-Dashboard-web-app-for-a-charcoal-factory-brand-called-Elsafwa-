// مقارنة المنصرف يوم بيوم وعربية بعربية: إكسيل أذونات الصرف والإضافة + تقرير تحميل العربيات مقابل ERPNext
// Day-by-day, vehicle-by-vehicle comparison: our issue/receipt Excel + the daily loading report vs ERPNext
// قراية بس من ERPNext (مش بيغير حاجة) - read-only on ERPNext
//
// بيشتغل من لقطة ERPNext (scripts/erp-snapshot.ts) - works from an ERPNext snapshot (the period comes from it)
// التشغيل - run:  npm run audit:snapshot -- --from 2026-10-01 --to 2026-10-25   (لقطة جديدة + التقريرين)
//                 npm run audit:issues [-- --snapshot reports/snapshot-….json]   (من آخر لقطة - from the latest snapshot)
//   --azon / --tahmeel: مسار ملفات الإكسيل (الافتراضي reports/input/azon.xlsx و reports/input/tahmeel.xlsx)
// الناتج - output: reports/issue-comparison.md / .xlsx / .pdf — فولدر reports/ مينفعش يترفع (الريبو public)
//
// بنقارن على مستوى التاريخ × العربية × الصنف - compared at DATE × VEHICLE × ITEM:
//   اذن الصرف ↔ تحويلات ERPNext للعربيات، اذن الاضافة (جرد) ↔ المرتجع من العربيات، اذن الاضافة (انتاج) ↔ Manufacture،
//   الصرف لقطاعي + تحميل خارجي ↔ Sales Invoice / Delivery Note. تقرير التحميل (الحموله الجديده / الجرد) بيقول مين الصح.

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { chromium } from "playwright-core";

// ============================================================
// الإعدادات - settings
// ============================================================

const FACTORY_NAME = "الصفوة";
const MAX_DAY_SHIFT = 3; // نفس الحركة في يوم تاني لحد 3 أيام - the same movement on another day, up to 3 days apart
const EPS = 0.001;

// الأصناف بأكواد ERPNext وبنفس ترتيب الإكسيل - items by ERPNext code, in our Excel's order
const ITEMS = [
  "باكت ربع",
  "باكت نص",
  "باكت كيلو",
  "باكت 2 كيلو",
  "كرتونة 1 كيلو",
  "كرتونة 2 كيلو",
  "كيس 3 كيلو جازورينا",
  "كارتونة فحم مضغوط",
  "باكت ربع كامل",
  "باكت نص كامل",
];

// أسماء الإكسيل ← كود ERPNext (المفتاح بعد normalize) - Excel names -> ERPNext code (keys are normalized)
const ITEM_NAMES: Record<string, string> = {
  "باكت ربع": "باكت ربع",
  "باكت ريع": "باكت ربع",
  "باكت الربع": "باكت ربع",
  "باكت نص": "باكت نص",
  "باكت النص": "باكت نص",
  "باكت نصف": "باكت نص",
  "باكت نصف كيلو": "باكت نص",
  "باكت نص كيلو": "باكت نص",
  "باكت كيلو": "باكت كيلو",
  "باكت الكيلو": "باكت كيلو",
  "باكت 2 كيلو": "باكت 2 كيلو",
  "باكت 2ك": "باكت 2 كيلو",
  "كرتونه 1 كيلو": "كرتونة 1 كيلو",
  "كرتونه 1 ك": "كرتونة 1 كيلو",
  "كرتونه1ك": "كرتونة 1 كيلو",
  "كرتونه 2 كيلو": "كرتونة 2 كيلو",
  "كرتونه 2 ك": "كرتونة 2 كيلو",
  "كرتونه2ك": "كرتونة 2 كيلو",
  "كيس 3 كيلو": "كيس 3 كيلو جازورينا",
  "كيس 3 كيلو جازورينا": "كيس 3 كيلو جازورينا",
  "كبس 3 كيلو جازورينا": "كيس 3 كيلو جازورينا",
  "كبس 3 كيلو": "كيس 3 كيلو جازورينا",
  "فحم مضغوط": "كارتونة فحم مضغوط",
  "كرتونه مضغوط": "كارتونة فحم مضغوط",
  "كرتونه فحم مضغوط": "كارتونة فحم مضغوط",
  "كارتونه فحم مضغوط": "كارتونة فحم مضغوط",
  "كارتون فحم مضغوط": "كارتونة فحم مضغوط",
  "كرتونه بركت": "كارتونة فحم مضغوط",
  "باكت ربع كامل": "باكت ربع كامل",
  "باكت نص كامل": "باكت نص كامل",
};

// أصناف شبه بعض (صنف غلط) - look-alike items (a wrong item)
const SIBLINGS: string[][] = [
  ["باكت ربع", "باكت ربع كامل"],
  ["باكت نص", "باكت نص كامل"],
  ["باكت كيلو", "كرتونة 1 كيلو"],
  ["باكت 2 كيلو", "كرتونة 2 كيلو"],
];

const DIRECT = "قطاعي"; // البيع المباشر من المخزن (مش عربية) - direct sales from the store (not a vehicle)

// ============================================================
// الأشكال - shapes
// ============================================================

type Stream = "out" | "in" | "production" | "sales";
const STREAMS: Stream[] = ["out", "in", "production", "sales"];
const STREAM_TITLES: Record<Stream, string> = {
  out: "صرف للعربيات",
  in: "جرد / مرتجع من العربيات",
  production: "الإنتاج",
  sales: "مبيعات مباشرة (قطاعي)",
};

type ExcelLine = { stream: Stream; date: string; vehicle: string; item: string; qty: number; voucher: string; sheet: string; row: number };
type LoadLine = { date: string; vehicle: string; item: string; newLoad: number; returned: number; sheet: string; row: number };
type ErpLine = {
  stream: Stream | "other";
  date: string;
  vehicle: string;
  item: string;
  qty: number; // موجب دايمًا - always positive
  voucher: string;
  owner: string;
  created: string;
  cancelled: boolean;
};
type Issue = { kind: string; where: string; detail: string };

type Cause = "missingErp" | "missingExcel" | "wrongQty" | "otherDay" | "wrongVehicle" | "wrongItem" | "wrongType" | "cancelled";
const CAUSE_TITLES: Record<Cause, string> = {
  missingErp: "ناقص في ERPNext",
  missingExcel: "ناقص في الإكسيل",
  wrongQty: "كمية غلط",
  otherDay: "اتسجل في يوم تاني",
  wrongVehicle: "على عربية غلط",
  wrongItem: "صنف غلط",
  wrongType: "فاتورة بيع بدل تحويل",
  cancelled: "اتلغى واتعمل تاني",
};

type Mismatch = {
  id: number;
  stream: Stream;
  date: string;
  vehicle: string;
  item: string;
  excel: number;
  erp: number;
  load: number | null; // تقرير التحميل (null = مفيش تقرير) - the loading report (null = none)
  diff: number; // ERPNext − الإكسيل
  cause: Cause;
  pairedWith: number | null;
  detail: string;
  action: string;
  excelVouchers: string[];
  erpVouchers: ErpLine[];
};

// ============================================================
// أدوات - helpers
// ============================================================

// لقطة ERPNext (scripts/erp-snapshot.ts): الحركات بتاريخ لحد to بس - the ERPNext snapshot: entries dated up to to only
type Snapshot = {
  fetchedAt: string;
  from: string;
  to: string;
  warehouse: string;
  warehouses: { name: string }[];
  ledger: LedgerRow[];
  backdated: LedgerRow[];
  stockEntries: { name: string; purpose: string }[];
  stockEntryDetails: { name: string; s_warehouse: string | null; t_warehouse: string | null }[];
};
// لو الملف مفتوح (Excel / قارئ PDF) بنكتب نسخة باسم فيه وقت السحب - if the file is open (Excel / a PDF reader),
// write a copy named with the fetch time instead
function writable(file: string, fetchedAt: string) {
  try {
    if (fs.existsSync(file)) fs.closeSync(fs.openSync(file, "r+"));
    return file;
  } catch {
    const copy = file.replace(/(\.\w+)$/, `-${fetchedAt.replace(/\D/g, "").slice(0, 12)}$1`);
    console.log(`⚠️ ${path.basename(file)} مفتوح في برنامج تاني — اتكتب بدله ${path.basename(copy)}`);
    return copy;
  }
}

// --snapshot ملف معين، أو آخر لقطة في reports/ - a given file, or the latest snapshot in reports/
function loadSnapshot(arg: string | undefined) {
  const dir = path.join(process.cwd(), "reports");
  const latest = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^snapshot-.*\.json$/.test(f)).sort().map((f) => path.join(dir, f)).pop()
    : undefined;
  const file = arg ?? latest;
  if (!file || !fs.existsSync(file)) throw new Error("مفيش لقطة من ERPNext — شغّل الأول: npm run audit:snapshot");
  return { file, snapshot: JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => round(n).toLocaleString("en");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const same = (a: number, b: number) => Math.abs(a - b) < EPS;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// توحيد الكتابة العربي: ة→ه، ى→ي، أ/إ/آ→ا، مسافات - normalize Arabic spelling and spaces
const normalize = (text: string) =>
  text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
const itemCode = (name: string) => ITEM_NAMES[normalize(name)] ?? ITEM_NAMES[normalize(name).replace(/\s/g, "")];
// عربية: سوزوكي/سيزوكي/السزوكى N أو الدبابة - vehicle: Suzuki N or الدبابة
function vehicleName(text: string): string | undefined {
  const t = normalize(text).replace(/\s/g, "");
  const n = t.match(/(سوزوك|سيزوك|سزوك)ي?(\d)/);
  if (n) return `سوزوكي ${n[2]}`;
  if (t.includes("دباب")) return "الدبابة";
  if (t.includes("قطاع")) return DIRECT;
  return undefined;
}

// قيمة الخلية: تاريخ / رقم / نص، والمعادلات بنتيجتها - a cell value: date / number / text, formulas by their result
type Cell = string | number | Date | null;
function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return null;
  if ("result" in value) {
    const result = value.result;
    return result instanceof Date || typeof result === "number" || typeof result === "string" ? result : null;
  }
  if ("richText" in value) return value.richText.map((t) => t.text).join("");
  if ("text" in value) return String(value.text);
  return null;
}
const text = (cell: Cell) => (cell === null ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const number = (cell: Cell) => (typeof cell === "number" ? cell : typeof cell === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(cell) ? Number(cell) : null);
function dateOf(cell: Cell): string | null {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "number" && cell > 40000 && cell < 60000) return new Date(Date.UTC(1899, 11, 30) + cell * 86400000).toISOString().slice(0, 10);
  if (typeof cell === "string" && /^\d{4}-\d{2}-\d{2}/.test(cell.trim())) return cell.trim().slice(0, 10);
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  // الفترة والمخزن من اللقطة نفسها - the period and warehouse come from the snapshot itself
  const { file, snapshot } = loadSnapshot(value("--snapshot"));
  const input = path.join(process.cwd(), "reports", "input");
  return {
    file,
    snapshot,
    from: snapshot.from,
    to: snapshot.to,
    warehouse: snapshot.warehouse,
    azon: value("--azon") ?? path.join(input, "azon.xlsx"),
    tahmeel: value("--tahmeel") ?? path.join(input, "tahmeel.xlsx"),
  };
}

// ============================================================
// الإكسيل: أذونات الصرف والإضافة - the Excel: issue and receipt vouchers
// ============================================================

async function readAzon(file: string, from: string, to: string, issues: Issue[], names: Map<string, string>) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  const lines: ExcelLine[] = [];
  const sheetTotals: { sheet: string; total: number | null; parsed: number }[] = [];
  const sheets = [
    { title: "اذن الصرف", receipt: false },
    { title: "اذن الاضافة", receipt: true },
  ];
  for (const ws of book.worksheets)
    if (!sheets.some((s) => normalize(s.title) === normalize(ws.name)))
      issues.push({ kind: "شيت متجاهَل", where: `azon / ${ws.name}`, detail: "مش من شيتات الأذونات (داتا قديمة) — اتجاهل" });

  for (const { title, receipt } of sheets) {
    const ws = book.worksheets.find((w) => normalize(w.name) === normalize(title));
    if (!ws) {
      issues.push({ kind: "شيت ناقص", where: `azon / ${title}`, detail: "الشيت مش موجود" });
      continue;
    }
    let total: number | null = null;
    let parsed = 0;
    const skipped: Record<string, number[]> = {};
    const skip = (reason: string, row: number) => (skipped[reason] ??= []).push(row);
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const c = (i: number) => cellValue(row.getCell(i).value);
      const first = text(c(1));
      if (r <= 2) {
        if (number(c(5)) !== null) total = number(c(5));
        return;
      }
      if (normalize(first) === "التاريخ" || first.startsWith("اذن")) {
        if (r > 3) skip("عنوان في النص", r);
        return;
      }
      const date = dateOf(c(1));
      const qty = number(c(5));
      if (!date) return skip(qty ? "تاريخ فاضي (والكمية موجودة!)" : "تاريخ فاضي", r);
      if (qty === null) return skip(text(c(5)) ? `الكمية مش رقم ("${text(c(5))}")` : "الكمية فاضية", r);
      if (date < from || date > to) return skip("برا الفترة", r);
      const rawItem = text(c(4));
      const item = itemCode(rawItem);
      if (!item) {
        issues.push({ kind: "صنف مش معروف", where: `azon / ${title} صف ${r}`, detail: `"${rawItem}" الكمية ${qty} — اتجاهل` });
        return;
      }
      names.set(`إذن: ${rawItem.trim()}`, item);
      let stream: Stream;
      let vehicle: string | undefined;
      if (receipt) {
        const kind = normalize(text(c(9)));
        if (kind.includes("انتاج")) {
          stream = "production";
          vehicle = "-";
        } else {
          stream = "in";
          vehicle = vehicleName(text(c(10)));
          if (!kind.includes("جرد")) issues.push({ kind: "بيان غريب", where: `azon / ${title} صف ${r}`, detail: `البيان "${text(c(9))}" — اتحسب جرد` });
        }
      } else {
        vehicle = vehicleName(text(c(3)));
        stream = vehicle === DIRECT ? "sales" : "out";
      }
      if (!vehicle) {
        issues.push({ kind: "عربية مش معروفة", where: `azon / ${title} صف ${r}`, detail: `"${text(receipt ? c(10) : c(3))}" — ${item} ${qty} — اتجاهل` });
        return;
      }
      parsed += qty;
      lines.push({ stream, date, vehicle, item, qty, voucher: text(c(2)), sheet: title, row: r });
    });
    for (const reason of Object.keys(skipped)) {
      const rows = skipped[reason];
      issues.push({
        kind: "صفوف متشالة",
        where: `azon / ${title}`,
        detail: `${rows.length} صف — ${reason}: ${rows.slice(0, 15).join("، ")}${rows.length > 15 ? " …" : ""}`,
      });
    }
    sheetTotals.push({ sheet: title, total, parsed });
    if (total !== null && !same(total, parsed))
      issues.push({ kind: "إجمالي الشيت", where: `azon / ${title}`, detail: `إجمالي الشيت ${fmt(total)} والمقروء ${fmt(parsed)} (فرق ${signed(parsed - total)})` });
  }
  return { lines, sheetTotals };
}

// ============================================================
// تقرير تحميل العربيات: شيت لكل يوم - the daily loading report: one sheet per day
// ============================================================

async function readTahmeel(file: string, from: string, to: string, issues: Issue[], names: Map<string, string>) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  type SheetData = { name: string; date: string; loads: LoadLine[]; external: ExcelLine[] };
  const sheets: SheetData[] = [];

  for (const ws of book.worksheets) {
    let date: string | null = null;
    const loads: LoadLine[] = [];
    const external: ExcelLine[] = [];
    let block = "";
    let inTable = false;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const c = (i: number) => cellValue(row.getCell(i).value);
      const label = text(c(1));
      if (label && normalize(label) !== normalize(block)) {
        block = label;
        inTable = false;
      }
      const b = text(c(2));
      const m = b.match(/الموافق\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
      if (m && !date && !normalize(block).includes("خارج"))
        date = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      if (normalize(b) === "الصنف") {
        inTable = true;
        return;
      }
      if (!inTable || !b || b === "0" || normalize(b).startsWith("الاجمال")) {
        if (normalize(b).startsWith("الاجمال")) inTable = false;
        return;
      }
      const vehicle = vehicleName(block);
      const isExternal = normalize(block).includes("خارج");
      if (!vehicle && !isExternal) return; // اجمالى تحميل - the totals block
      const item = itemCode(b);
      if (!item) {
        issues.push({ kind: "صنف مش معروف", where: `tahmeel / ${ws.name} صف ${r}`, detail: `"${b}"` });
        return;
      }
      names.set(`تحميل: ${b.trim()}`, item);
      if (isExternal) {
        const qty = number(c(4));
        if (qty) external.push({ stream: "sales", date: "", vehicle: DIRECT, item, qty, voucher: [text(c(3)), text(c(5))].filter(Boolean).join(" / "), sheet: ws.name, row: r });
        return;
      }
      loads.push({ date: "", vehicle: vehicle!, item, newLoad: number(c(6)) ?? 0, returned: number(c(5)) ?? 0, sheet: ws.name, row: r });
    });
    // التاريخ بيتحط بعد ما الشيت كله يتقري - the date is set once the whole sheet is read
    if (!date) {
      issues.push({ kind: "شيت من غير تاريخ", where: `tahmeel / ${ws.name}`, detail: "مفيش \"الموافق …\" في العنوان — اتجاهل" });
      continue;
    }
    const day = date as string;
    if (Number(ws.name.match(/^\d+/)?.[0]) !== Number(day.slice(8, 10)))
      issues.push({ kind: "اسم الشيت والتاريخ", where: `tahmeel / ${ws.name}`, detail: `اسم الشيت مش زي اليوم اللي في العنوان (${day})` });
    for (const line of loads) line.date = day;
    for (const line of external) line.date = day;
    sheets.push({ name: ws.name, date: day, loads, external });
  }

  // شيتات متكررة لنفس اليوم: بنستخدم اللي اسمه من غير "(2)" - duplicate sheets for a day: use the one without "(2)"
  const used: SheetData[] = [];
  for (const sheet of sheets) {
    const twin = used.find((s) => s.date === sheet.date);
    if (!twin) {
      used.push(sheet);
      continue;
    }
    const [keep, drop] = /\(/.test(sheet.name) ? [twin, sheet] : [sheet, twin];
    used[used.indexOf(twin)] = keep;
    const key = (l: LoadLine) => `${l.vehicle}|${l.item}|${l.newLoad}|${l.returned}`;
    const differs = keep.loads.map(key).sort().join() !== drop.loads.map(key).sort().join();
    issues.push({
      kind: "شيت متكرر",
      where: `tahmeel / ${drop.name}`,
      detail: `نسخة تانية من يوم ${drop.date} (اتستخدم "${keep.name}")${differs ? " — والحموله الجديده أو الجرد مختلفين بينهم!" : " — الحموله الجديده والجرد زي بعض (الفرق في الحموله السابقة بس لو فيه)"}`,
    });
  }
  const days = used.map((s) => s.date).filter((d) => d >= from && d <= to);
  return {
    loads: used.flatMap((s) => s.loads).filter((l) => l.date >= from && l.date <= to),
    external: used.flatMap((s) => s.external).filter((l) => l.date >= from && l.date <= to),
    days,
  };
}

// ============================================================
// ERPNext
// ============================================================

type LedgerRow = {
  item_code: string;
  posting_date: string;
  creation: string;
  owner: string;
  voucher_type: string;
  voucher_no: string;
  voucher_detail_no: string;
  actual_qty: number;
  is_cancelled: number;
};

function readErp(snapshot: Snapshot) {
  const vehicleOf = new Map<string, string>();
  for (const w of snapshot.warehouses) {
    const v = vehicleName(w.name.replace(/مخزن/, ""));
    if (v && v !== DIRECT) vehicleOf.set(w.name, v);
  }
  // من 3 أيام قبل from (للحركات اللي في يوم تاني) لحد to — مفيش حاجة بعد to في اللقطة أصلًا
  // from 3 days before from (to pair other-day entries) up to to — the snapshot has nothing after to
  const rows = snapshot.ledger.filter((r) => r.posting_date >= addDays(snapshot.from, -MAX_DAY_SHIFT) && r.posting_date <= snapshot.to);
  const purposeOf = new Map(snapshot.stockEntries.map((t) => [t.name, t.purpose]));
  const detailOf = new Map(snapshot.stockEntryDetails.map((d) => [d.name, d]));

  // الإلغاء بيعلّم السطر الأصلي وسطر العكس: نسيب الأصلي بس - cancelling flags the original and its reversal: keep the original
  const live = rows.filter((r) => !r.is_cancelled);
  const gone = rows.filter((r) => r.is_cancelled && !rows.some((o) => o.is_cancelled && o.voucher_no === r.voucher_no && o.item_code === r.item_code && o.creation < r.creation));

  const toLine = (r: LedgerRow): ErpLine => {
    let stream: Stream | "other" = "other";
    let vehicle = "-";
    if (r.voucher_type === "Stock Entry") {
      const purpose = purposeOf.get(r.voucher_no);
      const line = detailOf.get(r.voucher_detail_no);
      const other = r.actual_qty < 0 ? line?.t_warehouse : line?.s_warehouse;
      if (purpose === "Manufacture" && r.actual_qty > 0) stream = "production";
      else if (purpose === "Material Transfer" && other && vehicleOf.has(other)) {
        stream = r.actual_qty < 0 ? "out" : "in";
        vehicle = vehicleOf.get(other)!;
      } else vehicle = other ?? "-";
    } else if ((r.voucher_type === "Sales Invoice" || r.voucher_type === "Delivery Note") && r.actual_qty < 0) {
      stream = "sales";
      vehicle = DIRECT;
    }
    return {
      stream,
      date: r.posting_date,
      vehicle,
      item: r.item_code,
      qty: Math.abs(r.actual_qty),
      voucher: r.voucher_no,
      owner: r.owner.replace(/@.*/, ""),
      created: r.creation.slice(0, 16),
      cancelled: !!r.is_cancelled,
    };
  };
  const lines = [...live, ...gone].map(toLine);
  return { lines, toLine, vehicles: Array.from(new Set(Array.from(vehicleOf.values()))).sort() };
}

// ============================================================
// المقارنة - the comparison
// ============================================================

async function main() {
  const { file: snapshotFile, snapshot, from, to, warehouse, azon, tahmeel } = parseArgs();
  for (const file of [azon, tahmeel]) if (!fs.existsSync(file)) throw new Error(`الملف مش موجود: ${file}`);
  console.log(`مقارنة المنصرف — ${warehouse} — الفترة: ${shortDate(from)} → ${shortDate(to)} — وقت سحب البيانات: ${snapshot.fetchedAt}`);

  const issues: Issue[] = [];
  const names = new Map<string, string>();
  const [azonData, loadData] = await Promise.all([readAzon(azon, from, to, issues, names), readTahmeel(tahmeel, from, to, issues, names)]);
  const erpData = readErp(snapshot);

  // حركات بتاريخ لحد to بس اتسجلت بعده: محسوبة، ومعروضة للعلم - entries dated up to to but entered after it: counted, listed
  const seen = new Set<string>();
  const late = [...snapshot.backdated, ...snapshot.ledger]
    .filter((r) => !r.is_cancelled && r.posting_date <= to && r.creation.slice(0, 10) > to)
    .filter((r) => {
      const key = `${r.voucher_detail_no}|${r.item_code}|${r.creation}`;
      return !seen.has(key) && !!seen.add(key);
    })
    .sort((a, b) => a.creation.localeCompare(b.creation));
  const excelLines = [...azonData.lines];
  const erpAll = erpData.lines;
  const erpLive = erpAll.filter((l) => !l.cancelled && l.date >= from && l.date <= to);

  console.log("\nأسماء الأصناف (الإكسيل ← ERPNext):");
  for (const [k, v] of Array.from(names).sort()) console.log(`  ${k}  ←  ${v}`);
  console.log(`العربيات في ERPNext: ${erpData.vehicles.join("، ")}`);

  // تجميع على التاريخ × العربية × الصنف - grouping by date × vehicle × item
  const keyOf = (date: string, vehicle: string, item: string) => `${date}|${vehicle}|${item}`;
  type Cell = { excel: number; erp: number; excelVouchers: string[]; erpLines: ErpLine[] };
  const cells: Record<Stream, Map<string, Cell>> = { out: new Map(), in: new Map(), production: new Map(), sales: new Map() };
  const cellAt = (stream: Stream, key: string) => {
    let c = cells[stream].get(key);
    if (!c) cells[stream].set(key, (c = { excel: 0, erp: 0, excelVouchers: [], erpLines: [] }));
    return c;
  };
  for (const l of excelLines) {
    const c = cellAt(l.stream, keyOf(l.date, l.vehicle, l.item));
    c.excel += l.qty;
    if (l.voucher && !c.excelVouchers.includes(l.voucher)) c.excelVouchers.push(l.voucher);
  }
  for (const l of erpLive) {
    if (l.stream === "other") continue;
    const c = cellAt(l.stream, keyOf(l.date, l.vehicle, l.item));
    c.erp += l.qty;
    c.erpLines.push(l);
  }
  // تقرير التحميل: الحموله الجديده ↔ صرف، الجرد ↔ مرتجع - loading report: new load ↔ out, الجرد ↔ in
  const loadDays = new Set(loadData.days);
  const loadAt = (stream: Stream, date: string, vehicle: string, item: string): number | null => {
    if (stream === "out" || stream === "in") {
      if (!loadDays.has(date)) return null;
      const field = stream === "out" ? "newLoad" : "returned";
      return sum(loadData.loads.filter((l) => l.date === date && l.vehicle === vehicle && l.item === item).map((l) => l[field]));
    }
    if (stream === "sales") return loadDays.has(date) ? sum(loadData.external.filter((l) => l.date === date && l.item === item).map((l) => l.qty)) : null;
    return null;
  };

  // كل فرق - every mismatch
  const mismatches: Mismatch[] = [];
  for (const stream of STREAMS)
    for (const [key, c] of Array.from(cells[stream])) {
      const diff = round(c.erp - c.excel);
      if (Math.abs(diff) < EPS) continue;
      const [date, vehicle, item] = key.split("|");
      mismatches.push({
        id: mismatches.length + 1,
        stream,
        date,
        vehicle,
        item,
        excel: c.excel,
        erp: c.erp,
        load: loadAt(stream, date, vehicle, item),
        diff,
        cause: c.erp === 0 ? "missingErp" : c.excel === 0 ? "missingExcel" : "wrongQty",
        pairedWith: null,
        detail: "",
        action: "",
        excelVouchers: c.excelVouchers,
        erpVouchers: c.erpLines,
      });
    }

  // نجوّز الفروقات اللي بتلغي بعض (نفس الحركة اتسجلت غلط) - pair mismatches that cancel out (one movement recorded wrongly)
  const pair = (a: Mismatch, b: Mismatch, cause: Cause) => {
    a.cause = b.cause = cause;
    a.pairedWith = b.id;
    b.pairedWith = a.id;
  };
  const open = (m: Mismatch) => m.pairedWith === null;
  const passes: { cause: Cause; match: (a: Mismatch, b: Mismatch) => boolean; rank: (a: Mismatch, b: Mismatch) => number }[] = [
    {
      cause: "otherDay",
      match: (a, b) => a.vehicle === b.vehicle && a.item === b.item && a.date !== b.date && Math.abs(dayDiff(a.date, b.date)) <= MAX_DAY_SHIFT,
      rank: (a, b) => Math.abs(dayDiff(a.date, b.date)),
    },
    { cause: "wrongVehicle", match: (a, b) => a.date === b.date && a.item === b.item && a.vehicle !== b.vehicle, rank: () => 0 },
    {
      cause: "wrongItem",
      match: (a, b) =>
        a.date === b.date &&
        a.vehicle === b.vehicle &&
        a.item !== b.item &&
        (SIBLINGS.some((s) => s.includes(a.item) && s.includes(b.item)) || [a, b].some((m) => m.erpVouchers.some((l) => /-\d+$/.test(l.voucher)))),
      rank: (a, b) => (SIBLINGS.some((s) => s.includes(a.item) && s.includes(b.item)) ? 0 : 1),
    },
  ];
  for (const pass of passes)
    for (const a of mismatches) {
      if (!open(a)) continue;
      const candidates = mismatches
        .filter((b) => b !== a && open(b) && b.stream === a.stream && same(b.diff, -a.diff) && pass.match(a, b))
        .sort((x, y) => pass.rank(a, x) - pass.rank(a, y));
      if (candidates.length) pair(a, candidates[0], pass.cause);
    }
  // تحويل لعربية في ناحية وفاتورة بيع من المخزن في التانية (نفس اليوم والصنف) - a vehicle transfer on one side and a
  // sales invoice from the store on the other (same day and item)
  for (const a of mismatches) {
    if (!open(a) || a.stream !== "out") continue;
    const b = mismatches.find((x) => open(x) && x.stream === "sales" && x.date === a.date && x.item === a.item && same(x.diff, -a.diff));
    if (b) pair(a, b, "wrongType");
  }

  // اتلغت واتعملت تاني (أو اتلغت بس) - cancelled and re-posted (or just cancelled)
  for (const m of mismatches) {
    if (!open(m) || m.diff > 0) continue; // ERPNext ناقص - ERPNext is short
    const gone = erpAll.filter(
      (l) => l.cancelled && l.stream === m.stream && l.vehicle === m.vehicle && l.item === m.item && Math.abs(dayDiff(l.date, m.date)) <= MAX_DAY_SHIFT && same(l.qty, -m.diff)
    );
    if (gone.length) {
      m.cause = "cancelled";
      m.erpVouchers = [...m.erpVouchers, ...gone];
      const amended = erpLive.filter((l) => l.voucher.startsWith(`${gone[0].voucher}-`) && l.item === m.item);
      m.detail = `${gone[0].voucher} (${shortDate(gone[0].date)}) اتلغى` + (amended.length ? ` واتعمل تاني ${amended[0].voucher} بكمية ${fmt(sum(amended.map((l) => l.qty)))} على ${amended[0].vehicle}` : " ومتعملش تاني");
    }
  }

  // التفاصيل والإجراء - details and the action to take
  const byId = new Map(mismatches.map((m) => [m.id, m]));
  const vouchers = (m: Mismatch) => m.erpVouchers.filter((l) => !l.cancelled).map((l) => l.voucher);
  const loadSays = (m: Mismatch, date = m.date, vehicle = m.vehicle, item = m.item) => loadAt(m.stream, date, vehicle, item);
  for (const m of mismatches) {
    const partner = m.pairedWith ? byId.get(m.pairedWith)! : null;
    const v = vouchers(m).join("، ");
    if (partner && m.cause === "otherDay") {
      const excelSide = m.excel > m.erp ? m : partner;
      const erpSide = excelSide === m ? partner : m;
      m.detail = `الإكسيل يوم ${shortDate(excelSide.date)} و ERPNext يوم ${shortDate(erpSide.date)} (${fmt(Math.abs(m.diff))})`;
      const onExcelDay = loadSays(m, excelSide.date);
      const onErpDay = loadSays(m, erpSide.date);
      const qtyExcelDay = excelSide.excel;
      m.action =
        onExcelDay !== null && same(onExcelDay, qtyExcelDay) && !(onErpDay !== null && same(onErpDay, erpSide.erp))
          ? `التحميل بيأكد يوم ${shortDate(excelSide.date)}: غيّر تاريخ ${vouchers(erpSide).join("، ")} في ERPNext لـ ${excelSide.date}`
          : onErpDay !== null && same(onErpDay, erpSide.erp)
            ? `التحميل بيأكد يوم ${shortDate(erpSide.date)}: صحّح تاريخ الإذن في الإكسيل`
            : "نفس الحركة بتاريخين مختلفين — مش محسوبة غلطتين، راجع التاريخ الصح";
    } else if (partner && m.cause === "wrongVehicle") {
      const excelSide = m.excel > m.erp ? m : partner;
      const erpSide = excelSide === m ? partner : m;
      m.detail = `الإكسيل على ${excelSide.vehicle} و ERPNext على ${erpSide.vehicle} (${fmt(Math.abs(m.diff))})`;
      const loadExcel = loadSays(m, m.date, excelSide.vehicle);
      m.action =
        loadExcel !== null && same(loadExcel, excelSide.excel)
          ? `التحميل بيأكد ${excelSide.vehicle}: غيّر عربية ${vouchers(erpSide).join("، ")} في ERPNext`
          : `التحميل بيأكد ${erpSide.vehicle}: صحّح العربية في الإكسيل`;
    } else if (partner && m.cause === "wrongItem") {
      const excelSide = m.excel > m.erp ? m : partner;
      const erpSide = excelSide === m ? partner : m;
      const amended = vouchers(erpSide).find((v) => /-\d+$/.test(v));
      m.detail = `الإكسيل ${excelSide.item} و ERPNext ${erpSide.item} (${fmt(Math.abs(m.diff))})` + (amended ? ` — ${amended} نسخة معدّلة من مستند اتلغى` : "");
      const loadExcel = loadSays(m, m.date, m.vehicle, excelSide.item);
      m.action =
        loadExcel !== null && same(loadExcel, excelSide.excel)
          ? `التحميل بيأكد ${excelSide.item}: صحّح الصنف في ${vouchers(erpSide).join("، ")} في ERPNext`
          : `راجع الصنف الصح في ${vouchers(erpSide).join("، ")} والإذن ${excelSide.excelVouchers.join("، ")}`;
    } else if (partner && m.cause === "wrongType") {
      const transfer = m.stream === "out" ? m : partner;
      const sale = transfer === m ? partner : m;
      m.detail = `الإكسيل تحويل لـ ${transfer.vehicle} (إذن ${transfer.excelVouchers.join("، ") || "-"}) و ERPNext فاتورة بيع من المخزن ${vouchers(sale).join("، ")} (${fmt(Math.abs(m.diff))})`;
      const load = loadSays(transfer);
      m.action =
        (load !== null && same(load, transfer.excel) ? `التحميل بيأكد إنها اتحملت على ${transfer.vehicle}: ` : "") +
        `رصيد المخزن مش بيتأثر، بس الأصح تتسجل تحويل لـ ${transfer.vehicle} والفاتورة تطلع من مخزن العربية`;
    } else if (m.cause === "cancelled") {
      m.action = m.load !== null && same(m.load, m.excel) ? "التحميل بيأكد الإكسيل: الحركة لازم ترجع في ERPNext" : "راجع الإلغاء";
    } else {
      const confirms = (q: number) => m.load !== null && same(m.load, q);
      if (m.cause === "missingErp")
        m.action = confirms(m.excel) ? `التحميل بيأكد الإكسيل: ضيف ${fmt(m.excel)} في ERPNext` : confirms(0) ? "التحميل مفيهوش حاجة: الإذن في الإكسيل زيادة" : "ضيف في ERPNext لو الإذن صح";
      else if (m.cause === "missingExcel")
        m.action = confirms(m.erp) ? `التحميل بيأكد ERPNext: ضيف إذن في الإكسيل` : confirms(0) ? `التحميل مفيهوش حاجة: راجع/الغي ${v} في ERPNext` : `ضيف إذن في الإكسيل لو ${v} صح`;
      else
        m.action = confirms(m.excel)
          ? `التحميل بيأكد الإكسيل: عدّل ${v} في ERPNext لـ ${fmt(m.excel)}`
          : confirms(m.erp)
            ? `التحميل بيأكد ERPNext: صحّح الإذن في الإكسيل لـ ${fmt(m.erp)}`
            : `راجع الكمية (الإكسيل ${fmt(m.excel)} / ERPNext ${fmt(m.erp)})`;
    }
    if (m.load !== null && !m.action.startsWith("التحميل")) m.action += ` — تقرير التحميل: ${fmt(m.load)}`;
  }
  mismatches.sort((a, b) => a.date.localeCompare(b.date) || a.vehicle.localeCompare(b.vehicle) || ITEMS.indexOf(a.item) - ITEMS.indexOf(b.item));

  // ============================================================
  // الإجماليات لكل صنف - per-item totals
  // ============================================================

  const totalOf = (stream: Stream, item: string, side: "excel" | "erp") =>
    sum(Array.from(cells[stream].entries()).filter(([k]) => k.endsWith(`|${item}`)).map(([, c]) => c[side]));
  const summary = ITEMS.map((item) => {
    const t = (stream: Stream) => ({ excel: totalOf(stream, item, "excel"), erp: totalOf(stream, item, "erp") });
    const out = t("out");
    const sales = t("sales");
    const back = t("in");
    const production = t("production");
    const issueExcel = out.excel + sales.excel;
    const issueErp = out.erp + sales.erp;
    const netDiff = round(issueErp - back.erp - (issueExcel - back.excel));
    // الفروقات اللي بتفسر الصافي: اللي مش متجوزة (المتجوزة بتلغي بعض) - unpaired mismatches explain the net
    const explaining = mismatches.filter((m) => m.item === item && m.stream !== "production" && (m.pairedWith === null || m.cause !== "otherDay"));
    const explained = round(sum(explaining.map((m) => (m.stream === "in" ? -m.diff : m.diff))));
    return {
      item,
      issue: { excel: issueExcel, erp: issueErp },
      back,
      production,
      net: { excel: issueExcel - back.excel, erp: issueErp - back.erp, diff: netDiff },
      explained,
      explaining: explaining.filter((m) => m.pairedWith === null || m.id < m.pairedWith!),
    };
  });

  // يوم بيوم: الصرف (عربيات + قطاعي) لكل صنف - day by day: issues (vehicles + direct) per item
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const dayIssue = (day: string, item: string, side: "excel" | "erp") =>
    sum((["out", "sales"] as Stream[]).flatMap((s) => Array.from(cells[s].entries()).filter(([k]) => k.startsWith(`${day}|`) && k.endsWith(`|${item}`)).map(([, c]) => c[side])));
  const byDay = days.map((day) => ({ day, values: ITEMS.map((item) => ({ excel: dayIssue(day, item, "excel"), erp: dayIssue(day, item, "erp") })) }));

  // عربية بعربية: كل تاريخ × عربية × صنف فيه حاجة - vehicle by vehicle: every date × vehicle × item with anything
  const vehicleKeys = Array.from(new Set([...Array.from(cells.out.keys()), ...Array.from(cells.in.keys()), ...loadData.loads.filter((l) => l.newLoad || l.returned).map((l) => keyOf(l.date, l.vehicle, l.item))]))
    .filter((k) => k.split("|")[0] >= from && k.split("|")[0] <= to)
    .sort();
  const byVehicle = vehicleKeys.map((k) => {
    const [date, vehicle, item] = k.split("|");
    const o = cells.out.get(k);
    const i = cells.in.get(k);
    return {
      date,
      vehicle,
      item,
      out: { excel: o?.excel ?? 0, load: loadAt("out", date, vehicle, item), erp: o?.erp ?? 0 },
      in: { excel: i?.excel ?? 0, load: loadAt("in", date, vehicle, item), erp: i?.erp ?? 0 },
    };
  });

  // الخلاصة - the conclusion
  const real = mismatches.filter((m) => m.pairedWith === null || m.id < m.pairedWith!);
  const countBy = (key: (m: Mismatch) => string) => {
    const counts = new Map<string, { n: number; qty: number }>();
    for (const m of real) {
      const c = counts.get(key(m)) ?? { n: 0, qty: 0 };
      c.n++;
      c.qty += Math.abs(m.diff);
      counts.set(key(m), c);
    }
    return Array.from(counts).sort((a, b) => b[1].n - a[1].n || b[1].qty - a[1].qty);
  };
  const conclusion = {
    total: real.length,
    byCause: countBy((m) => CAUSE_TITLES[m.cause]),
    byDay: countBy((m) => m.date).slice(0, 6),
    byVehicle: countBy((m) => m.vehicle),
    byItem: countBy((m) => m.item),
    erpFixes: real.filter((m) => /ERPNext|ضيف .* في ERPNext/.test(m.action) && !m.action.startsWith("التحميل بيأكد ERPNext")),
  };

  const report: Report = {
    from,
    to,
    warehouse,
    fetchedAt: snapshot.fetchedAt,
    snapshotFile: path.relative(process.cwd(), snapshotFile),
    late: late.map((r) => ({ ...erpData.toLine(r), signedQty: r.actual_qty, voucherType: r.voucher_type })),
    names: Array.from(names).sort(),
    issues,
    sheetTotals: azonData.sheetTotals,
    summary,
    byDay,
    byVehicle,
    mismatches,
    conclusion,
    loadDays: loadData.days.length,
  };

  const dir = path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });
  const out = (name: string) => writable(path.join(dir, name), snapshot.fetchedAt);
  fs.writeFileSync(out("issue-comparison.md"), renderMarkdown(report), "utf8");
  await writeExcel(out("issue-comparison.xlsx"), report);
  await writePdf(out("issue-comparison.pdf"), report);

  console.log(`\nالفروقات: ${mismatches.length} سطر (${real.length} غلطة بعد ما جوّزنا اللي بيلغوا بعض)`);
  for (const [cause, c] of conclusion.byCause) console.log(`  ${c.n} — ${cause} (${fmt(c.qty)})`);
  for (const s of summary)
    if (Math.abs(s.net.diff) > EPS) console.log(`  ${s.item}: صافي المنصرف الإكسيل ${fmt(s.net.excel)} / ERPNext ${fmt(s.net.erp)} / فرق ${signed(s.net.diff)} — متفسر ${signed(s.explained)}`);
  console.log(`مشاكل في الإكسيل: ${issues.length}`);
  console.log("الملفات في reports/: issue-comparison.md / .xlsx / .pdf");
}

// ============================================================
// التقرير - the report every output is written from
// ============================================================

type Pair = { excel: number; erp: number };
type Report = {
  from: string;
  to: string;
  warehouse: string;
  fetchedAt: string;
  snapshotFile: string;
  late: (ErpLine & { signedQty: number; voucherType: string })[]; // بتاريخ لحد to واتسجلت بعده - dated up to to, entered after
  names: [string, string][];
  issues: Issue[];
  sheetTotals: { sheet: string; total: number | null; parsed: number }[];
  summary: { item: string; issue: Pair; back: Pair; production: Pair; net: Pair & { diff: number }; explained: number; explaining: Mismatch[] }[];
  byDay: { day: string; values: Pair[] }[];
  byVehicle: { date: string; vehicle: string; item: string; out: Pair & { load: number | null }; in: Pair & { load: number | null } }[];
  mismatches: Mismatch[];
  conclusion: {
    total: number;
    byCause: [string, { n: number; qty: number }][];
    byDay: [string, { n: number; qty: number }][];
    byVehicle: [string, { n: number; qty: number }][];
    byItem: [string, { n: number; qty: number }][];
    erpFixes: Mismatch[];
  };
  loadDays: number;
};

// أول سطر في كل ملف - the first line of every file
const stamp = (r: Report) => `وقت سحب البيانات: ${r.fetchedAt} — الفترة: ${shortDate(r.from)} → ${shortDate(r.to)}`;
const lateTitle = (r: Report) => `حركات بتاريخ يوم ${shortDate(r.to)} أو قبله بس اتسجلت بعده`;
const LATE_NOTE = "محسوبة عادي في المقارنة (تاريخها جوه الفترة)، ومعروضة هنا للعلم بس";
const LATE_HEAD = ["التاريخ", "نوع المستند", "رقم المستند", "النوع", "العربية / المخزن", "الصنف", "الكمية", "عملها", "اتسجلت يوم"];
const lateCells = (l: Report["late"][number]): (string | number)[] => [
  l.date,
  l.voucherType,
  l.voucher,
  l.stream === "other" ? "أخرى" : STREAM_TITLES[l.stream],
  l.vehicle,
  l.item,
  l.signedQty,
  l.owner,
  l.created,
];

const SUMMARY_HEAD = [
  "الصنف",
  "صرف الإكسيل", "صرف ERPNext", "فرق الصرف",
  "جرد الإكسيل", "جرد ERPNext", "فرق الجرد",
  "إنتاج الإكسيل", "إنتاج ERPNext", "فرق الإنتاج",
  "صافي المنصرف الإكسيل", "صافي المنصرف ERPNext", "فرق الصافي", "متفسر",
];
const summaryCells = (s: Report["summary"][number]): (string | number)[] => [
  s.item,
  s.issue.excel, s.issue.erp, round(s.issue.erp - s.issue.excel),
  s.back.excel, s.back.erp, round(s.back.erp - s.back.excel),
  s.production.excel, s.production.erp, round(s.production.erp - s.production.excel),
  s.net.excel, s.net.erp, s.net.diff, s.explained,
];
const summaryTotal = (r: Report): (string | number)[] => {
  const rows = r.summary.map(summaryCells);
  return ["الإجمالي", ...SUMMARY_HEAD.slice(1).map((_, i) => round(sum(rows.map((row) => row[i + 1] as number))))];
};
const MISMATCH_HEAD = ["التاريخ", "النوع", "العربية", "الصنف", "الإكسيل", "ERPNext", "تقرير التحميل", "الفرق", "السبب", "التفاصيل", "المطلوب", "إذن الإكسيل", "مستند ERPNext", "عملها"];
const mismatchCells = (m: Mismatch): (string | number)[] => [
  m.date,
  STREAM_TITLES[m.stream],
  m.vehicle,
  m.item,
  m.excel,
  m.erp,
  m.load === null ? "-" : m.load,
  m.diff,
  CAUSE_TITLES[m.cause],
  m.detail,
  m.action,
  m.excelVouchers.join("، "),
  m.erpVouchers.map((l) => `${l.voucher}${l.cancelled ? " (ملغي)" : ""}`).join("، "),
  Array.from(new Set(m.erpVouchers.map((l) => `${l.owner} ${l.created}`))).join("، "),
];
// المطلوب في ERPNext متجمّع: نفس الإجراء لكذا صنف في سطر واحد - ERPNext fixes grouped: one line per action
const groupedFixes = (r: Report) => {
  const groups: { date: string; vehicle: string; action: string; items: string[] }[] = [];
  for (const m of r.conclusion.erpFixes) {
    const item = `${m.item} (${signed(m.diff)})`;
    const g = groups.find((x) => x.date === m.date && x.vehicle === m.vehicle && x.action === m.action);
    if (g) g.items.push(item);
    else groups.push({ date: m.date, vehicle: m.vehicle, action: m.action, items: [item] });
  }
  return groups.map((g) => `${shortDate(g.date)} ${g.vehicle} — ${g.items.join("، ")}: ${g.action}`);
};
const shortLine = (m: Mismatch) =>
  `${shortDate(m.date)} ${m.vehicle} — ${STREAM_TITLES[m.stream]} ${signed(m.stream === "in" ? -m.diff : m.diff)} (${CAUSE_TITLES[m.cause]}${m.detail ? `: ${m.detail}` : ""})`;

function conclusionLines(r: Report) {
  const c = r.conclusion;
  const list = (rows: [string, { n: number; qty: number }][]) => rows.map(([k, v]) => `${k} (${v.n} — ${fmt(v.qty)})`).join("، ");
  return [
    `فيه ${c.total} غلطة (بعد ما الفروقات اللي بتلغي بعض اتجوزت واتحسبت غلطة واحدة).`,
    `حسب السبب: ${list(c.byCause)}.`,
    `أكتر الأيام: ${list(c.byDay)}.`,
    `حسب العربية: ${list(c.byVehicle)}.`,
    `حسب الصنف: ${list(c.byItem)}.`,
    ...r.summary
      .filter((s) => Math.abs(s.net.diff) > EPS)
      .map((s) => `${s.item}: صافي المنصرف الإكسيل ${fmt(s.net.excel)} و ERPNext ${fmt(s.net.erp)} — الفرق ${signed(s.net.diff)} بيتفسر بـ: ${s.explaining.map(shortLine).join(" + ") || "—"}`),
  ];
}

// ============================================================
// Markdown
// ============================================================

function renderMarkdown(r: Report) {
  const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const show = (v: string | number) => (typeof v === "number" ? fmt(v) : v);
  const table = (head: string[], rows: (string | number)[][]) =>
    [`| ${head.map(cell).join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map((v) => cell(show(v))).join(" | ")} |`)].join("\n");
  const md: string[] = [];
  md.push(`# مقارنة المنصرف: الإكسيل وتقرير التحميل مقابل ERPNext — ${FACTORY_NAME}`);
  md.push(`**${stamp(r)}**`);
  md.push(`المخزن: **${r.warehouse}** — ERPNext: posting_date لحد ${r.to} بس (is_cancelled = 0) — اللقطة: ${r.snapshotFile} — أيام تقرير التحميل: ${r.loadDays}.`);
  md.push(`## الخلاصة`);
  md.push(conclusionLines(r).map((l) => `- ${l}`).join("\n"));
  const fixes = groupedFixes(r);
  md.push(`### المطلوب تصحيحه في ERPNext (${fixes.length})`);
  md.push(fixes.map((l) => `- ${l}`).join("\n") || "- مفيش");
  md.push(`## ${lateTitle(r)} (${r.late.length})`);
  md.push(`${LATE_NOTE}.`);
  md.push(r.late.length ? table(LATE_HEAD, r.late.map(lateCells)) : "مفيش ✅");
  md.push(`## الملخص لكل صنف`);
  md.push(table(SUMMARY_HEAD, [...r.summary.map(summaryCells), summaryTotal(r)]));
  md.push(`## الفروقات وأسبابها (${r.mismatches.length})`);
  md.push(table(MISMATCH_HEAD, r.mismatches.map(mismatchCells)));
  md.push(`## مشاكل في الإكسيل (${r.issues.length})`);
  md.push(table(["النوع", "فين", "التفاصيل"], r.issues.map((i) => [i.kind, i.where, i.detail])));
  md.push(`## أسماء الأصناف (الإكسيل ← ERPNext)`);
  md.push(table(["الاسم في الإكسيل", "كود ERPNext"], r.names));
  md.push(`## يوم بيوم: الصرف (عربيات + قطاعي)`);
  md.push(
    table(
      ["التاريخ", ...ITEMS.map((i) => `${i}: إكسيل / ERPNext`)],
      r.byDay.map((d) => [d.day, ...d.values.map((v) => (same(v.excel, v.erp) ? (v.excel ? fmt(v.excel) : "") : `🔴 ${fmt(v.excel)} / ${fmt(v.erp)}`))])
    )
  );
  return md.join("\n\n") + "\n";
}

// ============================================================
// Excel
// ============================================================

const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const COLORS = { head: "FFFF7A00", red: "FFFFC7CE", redFont: "FF9C0006", green: "FFE6F4EA", orange: "FFFFE5CC", gray: "FFF2F2F2" };
const qtyFormat = (n: number) => (Number.isInteger(n) ? "#,##0" : "#,##0.0##");

async function writeExcel(file: string, r: Report) {
  const book = new ExcelJS.Workbook();
  book.creator = FACTORY_NAME;
  const sheet = (name: string, head: string[], widths: number[], xSplit = 0) => {
    const ws = book.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit }] });
    ws.columns = head.map((header, i) => ({ header, width: widths[i] ?? widths[widths.length - 1] }));
    const row = ws.getRow(1);
    row.height = 36;
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = solid(COLORS.head);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };
    return ws;
  };
  const add = (ws: ExcelJS.Worksheet, values: (string | number | null)[]) => {
    const row = ws.addRow(values);
    row.eachCell((c) => {
      if (typeof c.value === "number") c.numFmt = qtyFormat(c.value);
      c.alignment = { vertical: "top", horizontal: typeof c.value === "number" ? "center" : "right", wrapText: true };
    });
    return row;
  };
  const red = (c: ExcelJS.Cell) => {
    c.fill = solid(COLORS.red);
    c.font = { bold: true, color: { argb: COLORS.redFont } };
  };

  // شيت المعلومات الأول: وقت السحب والفترة والحركات المتأخرة - info sheet first: fetch time, period, late entries
  const info = book.addWorksheet("معلومات", { views: [{ rightToLeft: true }] });
  info.columns = [12, 26, 21, 22, 16, 20, 9, 18, 17].map((width) => ({ width }));
  info.addRow([stamp(r)]).font = { bold: true, size: 13 };
  info.addRow([`المخزن: ${r.warehouse} — اللقطة: ${r.snapshotFile}`]);
  info.addRow([]);
  info.addRow([`${lateTitle(r)} (${r.late.length}) — ${LATE_NOTE}`]).font = { bold: true };
  const lateHead = info.addRow(LATE_HEAD);
  lateHead.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = solid(COLORS.head);
  });
  for (const l of r.late) add(info, lateCells(l));

  const summary = sheet("الملخص", SUMMARY_HEAD, [22, 11, 11, 10, 11, 11, 10, 11, 11, 10, 13, 13, 11, 10], 1);
  for (const values of [...r.summary.map(summaryCells), summaryTotal(r)]) {
    const row = add(summary, values);
    for (const col of [4, 7, 10, 13]) if (Math.abs(row.getCell(col).value as number) > EPS) red(row.getCell(col));
    if (values[0] === "الإجمالي") row.font = { bold: true };
  }
  summary.addRow([]);
  for (const line of conclusionLines(r)) {
    const row = summary.addRow([line]);
    summary.mergeCells(row.number, 1, row.number, SUMMARY_HEAD.length);
    row.getCell(1).alignment = { wrapText: true, horizontal: "right" };
    row.height = 32;
  }

  const dayHead = ["التاريخ", ...ITEMS.flatMap((i) => [`${i}\nإكسيل صرف`, `${i}\nERPNext صرف`, `${i}\nفرق`])];
  const daySheet = sheet("يوم بيوم", dayHead, [12, ...ITEMS.flatMap(() => [10, 10, 8])], 1);
  for (const d of r.byDay) {
    const row = add(daySheet, [d.day, ...d.values.flatMap((v) => [v.excel, v.erp, round(v.erp - v.excel)])]);
    d.values.forEach((v, i) => {
      if (!same(v.excel, v.erp)) red(row.getCell(2 + i * 3 + 2));
    });
  }

  const vehicleHead = ["التاريخ", "العربية", "الصنف", "اذن صرف (إكسيل)", "الحموله الجديده (تحميل)", "صرف ERPNext", "فرق الصرف", "اذن اضافة جرد (إكسيل)", "الجرد (تحميل)", "مرتجع ERPNext", "فرق الجرد"];
  const vehicles = sheet("عربية بعربية", vehicleHead, [12, 12, 20, 12, 13, 12, 10, 13, 11, 12, 10], 3);
  for (const v of r.byVehicle) {
    const outDiff = round(v.out.erp - v.out.excel);
    const inDiff = round(v.in.erp - v.in.excel);
    const row = add(vehicles, [v.date, v.vehicle, v.item, v.out.excel, v.out.load, v.out.erp, outDiff, v.in.excel, v.in.load, v.in.erp, inDiff]);
    if (Math.abs(outDiff) > EPS) red(row.getCell(7));
    if (Math.abs(inDiff) > EPS) red(row.getCell(11));
    if (v.out.load !== null && !same(v.out.load, v.out.erp)) row.getCell(5).fill = solid(COLORS.orange);
    if (v.in.load !== null && !same(v.in.load, v.in.erp)) row.getCell(9).fill = solid(COLORS.orange);
  }

  const diffs = sheet("الفروقات وأسبابها", MISMATCH_HEAD, [11, 16, 11, 18, 9, 9, 10, 8, 15, 34, 48, 12, 30, 30], 4);
  for (const m of r.mismatches) {
    const row = add(diffs, mismatchCells(m));
    red(row.getCell(8));
    if (m.pairedWith !== null) row.getCell(9).fill = solid(COLORS.orange);
  }

  const problems = sheet("مشاكل في الإكسيل", ["النوع", "فين", "التفاصيل"], [18, 30, 100]);
  for (const i of r.issues) add(problems, [i.kind, i.where, i.detail]);
  for (const t of r.sheetTotals) add(problems, ["إجمالي الشيت", `azon / ${t.sheet}`, `الإجمالي اللي في الشيت ${t.total === null ? "-" : fmt(t.total)} — المقروء في الفترة ${fmt(t.parsed)}`]);
  problems.addRow([]);
  const title = problems.addRow(["أسماء الأصناف (الإكسيل ← ERPNext)"]);
  title.font = { bold: true };
  for (const [k, v] of r.names) add(problems, ["اسم صنف", k, v]);

  await book.xlsx.writeFile(file);
}

// ============================================================
// PDF: صفحة HTML بتتطبع بـ Edge أو Chrome اللي على الجهاز (زي production-audit)
// ============================================================

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ltr = (t: string) => `<bdi dir="ltr">${esc(t)}</bdi>`;
function cairoFontCss() {
  const dir = path.join(process.cwd(), "node_modules", "@fontsource-variable", "cairo");
  return fs
    .readFileSync(path.join(dir, "index.css"), "utf8")
    .replace(/url\(\.\/files\/([^)]+)\)/g, (_, name: string) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, "files", name)).toString("base64")})`);
}
const PDF_CSS = `
* { box-sizing: border-box; }
body { font-family: "Cairo Variable", sans-serif; color: #1f2328; font-size: 9.5px; margin: 0; }
h1 { font-size: 19px; margin: 0 0 2px; color: #c25a00; }
h2 { font-size: 14px; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #FF7A00; break-after: avoid; }
.meta { color: #57606a; margin-bottom: 6px; }
.stamp { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
ul.conclusion { margin: 4px 0; padding-right: 18px; font-size: 10.5px; }
ul.conclusion li { margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #FF7A00; color: #fff; font-weight: 700; padding: 3px 2px; border: 1px solid #e06a00; font-size: 8.5px; }
td { padding: 2px 3px; border: 1px solid #d0d7de; text-align: center; font-variant-numeric: tabular-nums; }
td.num { direction: ltr; }
td.text { text-align: right; }
td:first-child { white-space: nowrap; }
td.bad { background: #ffc7ce; color: #9c0006; font-weight: 700; }
td.pair { background: #ffe5cc; }
tr.total td { font-weight: 700; background: #f2f2f2; }
.mismatches td { font-size: 8px; }
.page-break { break-before: page; }
`;
function renderHtml(r: Report) {
  const td = (v: string | number, cls = "") => `<td class="${typeof v === "number" ? `num ${cls}` : `text ${cls}`}">${esc(typeof v === "number" ? fmt(v) : v)}</td>`;
  const head = (cols: string[]) => `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
  const summaryRows = [...r.summary.map(summaryCells), summaryTotal(r)]
    .map((row) => `<tr${row[0] === "الإجمالي" ? ' class="total"' : ""}>${row.map((v, i) => td(v, [3, 6, 9, 12].includes(i) && Math.abs(v as number) > EPS ? "bad" : "")).join("")}</tr>`)
    .join("");
  const cols = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
  const mismatchRows = r.mismatches
    .map((m) => {
      const cells = mismatchCells(m);
      return `<tr>${cols.map((i) => td(cells[i], i === 7 ? "bad" : i === 8 && m.pairedWith !== null ? "pair" : "")).join("")}</tr>`;
    })
    .join("");
  const fixList = groupedFixes(r);
  const fixes = fixList.map((l) => `<li>${esc(l)}</li>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${cairoFontCss()}${PDF_CSS}</style></head><body>
<h1>مقارنة المنصرف: الإكسيل وتقرير التحميل مقابل ERPNext — ${esc(FACTORY_NAME)}</h1>
<div class="stamp">${esc(stamp(r))}</div>
<div class="meta">المخزن: <b>${esc(r.warehouse)}</b> — ERPNext: posting_date لحد <b>${ltr(r.to)}</b> بس — اللقطة: ${ltr(r.snapshotFile)}</div>
<h2>الخلاصة</h2>
<ul class="conclusion">${conclusionLines(r).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<h2>المطلوب تصحيحه في ERPNext (${fixList.length})</h2>
<ul class="conclusion">${fixes || "<li>مفيش</li>"}</ul>
<h2>${esc(lateTitle(r))} (${r.late.length})</h2>
<p class="meta">${esc(LATE_NOTE)}</p>
${r.late.length ? `<table>${head(LATE_HEAD)}<tbody>${r.late.map((l) => `<tr>${lateCells(l).map((v) => td(v)).join("")}</tr>`).join("")}</tbody></table>` : "<p>مفيش ✅</p>"}
<h2 class="page-break">الملخص لكل صنف</h2>
<table>${head(SUMMARY_HEAD)}<tbody>${summaryRows}</tbody></table>
<h2 class="page-break">الفروقات وأسبابها (${r.mismatches.length}) — بالتاريخ</h2>
<table class="mismatches">${head(cols.map((i) => MISMATCH_HEAD[i]))}<tbody>${mismatchRows}</tbody></table>
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
    const band = "width:100%;font-family:'Segoe UI',Tahoma,sans-serif;font-size:8px;color:#57606a;direction:rtl;padding:0 8mm;display:flex;justify-content:space-between;";
    await page.pdf({
      path: file,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "14mm", bottom: "12mm", left: "7mm", right: "7mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="${band}"><span>${esc(FACTORY_NAME)} — مقارنة المنصرف عربية بعربية</span><span>${esc(stamp(r))}</span></div>`,
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
