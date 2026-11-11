// كشوف المرتبات Excel (على السيرفر، من نفس الأرقام اللي على الشاشة) - ممنوع تسجيل أي مبلغ في اللوج
// Salary sheets as Excel (server side, from the same numbers shown on screen) - never log any amount
// الشكل: شريط علوي كحلي باللوجوهات، خط برتقالي→دهبي، كروت معلومات، جدول بصفوف متبادلة، إجمالي كحلي، وتوقيعات
// Look: a navy header band with the logos, an orange→gold accent line, info cards, a zebra table, a navy totals
// row and signature boxes
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { dashboardConfig } from "@/config/dashboard.config";
import { addDays, attendanceDetails, cashWeekOf } from "./attendance-details";
import { AttendanceSectionKey } from "./data-source";
import { sectionSalaries } from "./salaries";
import { EmployeeAttendance, EmployeeSalary } from "./types";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAY_NAMES = ["الأحد", "الاتنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const COMPANY = "مصنع الصفوة للفحم";

// ===== ألوان البراند (من اللوجوهات) - brand colours (from the logos) =====
const C = {
  orange: "FFF07A12", // برتقالي اللهب - flame orange
  deepOrange: "FFC9500A", // برتقالي غامق - deep orange
  gold: "FFF5A623", // دهبي - gold
  amber: "FFF0A81C", // هيدر كشف اليومية - the daily sheet header
  blue: "FF1E5FD9",
  navy: "FF1D2230", // كحلي غامق - dark navy
  white: "FFFFFFFF",
  zebra: "FFF7F8FA",
  line: "FFE6E1DA",
  infoFill: "FFFFF4E8",
  red: "FFB3261E", // الخصومات - deductions
  green: "FF1E7B34", // الإضافي والمكافآت - overtime and bonuses
  finalFill: "FFE8F7EE",
  badFill: "FFFDECEA",
  gray: "FF8A8F98",
  text: "FF1D2230",
};
// Cairo مش متسطب على أجهزة ويندوز عادة، فـ Arial (بيعرض العربي كويس في Excel) - Cairo is rarely installed: Arial
const FONT = "Arial";

// "2026-11-07" -> "7/11"
const dm = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
const round = (v: number) => Math.round(v * 100) / 100;
// من غير كسور لو الرقم صحيح - no decimals when the number is whole
const numFmt = (v: number) => (Number.isInteger(round(v)) ? "#,##0" : "#,##0.00");

// ===== اللوجوهات (public/brand) - the logos =====
type Logo = { buffer: Buffer; width: number; height: number };
function readLogo(file: string): Logo | null {
  try {
    const buffer = fs.readFileSync(path.join(process.cwd(), "public", "brand", file));
    // مقاس الـ PNG من الـ IHDR - the PNG size from its IHDR chunk
    return { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } catch {
    return null; // من غير لوجو لو الملف مش موجود - no logo when the file is missing
  }
}

// ===== شيت بالشكل الجديد - one styled sheet =====
type Kind = "index" | "text" | "name" | "code" | "money" | "count" | "deduct" | "plus" | "final" | "grand" | "sign" | "mark";
type Col = { header: string; kind: Kind };
type Cell = string | number | null;
type SheetSpec = {
  name: string;
  title: string;
  subtitle: string;
  info: [string, string][]; // 3 كروت معلومات - 3 info cards
  headerFill: string;
  headerText: string;
  cols: Col[];
  rows: Cell[][];
  totals: Cell[];
  dataBarCol?: number; // عمود عليه data bars (1-based) - a column with data bars
};

const thin = (argb: string): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });
const box = (argb: string): Partial<ExcelJS.Borders> => ({ top: thin(argb), bottom: thin(argb), left: thin(argb), right: thin(argb) });
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// عرض الأعمدة على قد المحتوى (والاسم أعرض) - column widths fitted to the content (the name wider)
function fitWidths(spec: SheetSpec): number[] {
  return spec.cols.map((col, i) => {
    if (col.kind === "sign") return 22;
    const texts = [...spec.rows, spec.totals].map((r) => {
      const v = r[i];
      return typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v ?? "");
    });
    const longestWord = Math.max(...col.header.split(" ").map((w) => w.length));
    const content = Math.max(longestWord + 2, ...texts.map((t) => t.length));
    if (col.kind === "name") return Math.max(26, content + 6);
    if (col.kind === "index") return 6;
    if (col.kind === "mark") return Math.max(10, content + 2);
    return Math.min(22, Math.max(11, content + 4));
  });
}

function styledSheet(workbook: ExcelJS.Workbook, logos: { round: number | null; ar: number | null; arSize: Logo | null }, spec: SheetSpec, issued: string) {
  const n = spec.cols.length;
  const HEADER_ROW = 10;
  const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
    views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: HEADER_ROW, xSplit: 0 }],
    properties: { defaultRowHeight: 20 },
  });
  const widths = fitWidths(spec);
  sheet.columns = widths.map((width) => ({ width }));
  // مكان اللوجو بالبكسل من يمين الشيت (في الشيت RTL الإزاحة بتتحسب من يمين العمود): العمود والإزاحة جواه
  // exceljs بيحوّل الكسور غلط (عرض × 10000 EMU)، فبنحط الإزاحة بالـ EMU بنفسنا (1px = 9525 EMU)
  // A logo position in px from the sheet's right edge (in an RTL sheet the offset counts from the column's right).
  // exceljs converts fractional columns wrongly (width × 10000 EMU), so the offset is set in EMU here (1px = 9525)
  const EMU = 9525;
  const colPx = widths.map((w) => Math.round(w * 7 + 5));
  const anchorAt = (fromRight: number, topPx: number) => {
    let acc = 0;
    let col = colPx.length - 1;
    for (let i = 0; i < colPx.length; i++) {
      if (acc + colPx[i] > fromRight) {
        col = i;
        break;
      }
      acc += colPx[i];
    }
    const off = Math.max(0, Math.min(colPx[col] - 1, fromRight - acc));
    return { nativeCol: col, nativeColOff: off * EMU, nativeRow: 0, nativeRowOff: topPx * EMU } as unknown as ExcelJS.Anchor;
  };
  const sheetPx = colPx.reduce((a, b) => a + b, 0);
  const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 11, color: { argb: C.text }, ...extra });

  // 1) الشريط العلوي (صفوف 1–5): كحلي، العنوان أبيض والعنوان الفرعي دهبي
  //    Header band (rows 1–5): navy, white title, gold subtitle
  for (let r = 1; r <= 5; r++) {
    sheet.getRow(r).height = 18;
    for (let c = 1; c <= n; c++) sheet.getCell(r, c).fill = solid(C.navy);
  }
  sheet.mergeCells(1, 1, 3, n);
  const title = sheet.getCell(1, 1);
  title.value = spec.title;
  title.font = font({ size: 22, bold: true, color: { argb: C.white } });
  title.alignment = { horizontal: "center", vertical: "bottom", readingOrder: "rtl" };
  sheet.mergeCells(4, 1, 5, n);
  const subtitle = sheet.getCell(4, 1);
  subtitle.value = spec.subtitle;
  subtitle.font = font({ size: 12, bold: true, color: { argb: C.gold } });
  subtitle.alignment = { horizontal: "center", vertical: "top", readingOrder: "rtl" };
  // اللوجوهات (~70px): المدوّر يمين، العربي شمال (الشيت من اليمين للشمال) - round logo right, Arabic logo left (RTL sheet)
  const LOGO_H = 70;
  const EDGE = 16; // المسافة من حرف الشيت - the gap from the sheet edge (px)
  const TOP = 22; // من فوق جوه الشريط (الشريط 5 × 24px) - from the top inside the band (5 × 24px)
  if (logos.round !== null) {
    sheet.addImage(logos.round, { tl: anchorAt(EDGE, TOP), ext: { width: LOGO_H, height: LOGO_H }, editAs: "oneCell" });
  }
  if (logos.ar !== null && logos.arSize) {
    const width = Math.round((LOGO_H * logos.arSize.width) / logos.arSize.height);
    sheet.addImage(logos.ar, { tl: anchorAt(sheetPx - EDGE - width, TOP), ext: { width, height: LOGO_H }, editAs: "oneCell" });
  }
  // خط برتقالي→دهبي تحت الشريط - the orange→gold accent line
  sheet.mergeCells(6, 1, 6, n);
  sheet.getRow(6).height = 5;
  sheet.getCell(6, 1).fill = {
    type: "gradient",
    gradient: "angle",
    degree: 0,
    stops: [
      { position: 0, color: { argb: C.orange } },
      { position: 1, color: { argb: C.gold } },
    ],
  };
  sheet.getRow(7).height = 8;

  // 2) كروت المعلومات (3 كروت بمسافات بينها) - the info cards (3 cards with gaps)
  sheet.getRow(8).height = 28;
  const span = Math.max(1, Math.floor((n - 2) / 3));
  spec.info.slice(0, 3).forEach(([label, value], i) => {
    const from = 1 + i * (span + 1);
    const to = Math.min(n, from + span - 1);
    for (let c = from; c <= to; c++) {
      const cell = sheet.getCell(8, c);
      cell.fill = solid(C.infoFill);
      cell.border = box(C.orange);
    }
    if (to > from) sheet.mergeCells(8, from, 8, to);
    const cell = sheet.getCell(8, from);
    cell.value = {
      richText: [
        { text: `${label}:  `, font: font({ size: 10, color: { argb: C.gray } }) },
        { text: value, font: font({ size: 12, bold: true, color: { argb: C.deepOrange } }) },
      ],
    };
    cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  });
  sheet.getRow(9).height = 8;

  // 3) هيدر الجدول - the table header
  const header = sheet.getRow(HEADER_ROW);
  header.height = 32;
  spec.cols.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.fill = solid(spec.headerFill);
    cell.font = font({ bold: true, color: { argb: spec.headerText } });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, readingOrder: "rtl" };
    cell.border = box(C.white);
  });

  // 4) الصفوف: متبادلة، والألوان حسب نوع العمود - rows: zebra, colours by column kind
  const first = HEADER_ROW + 1;
  spec.rows.forEach((values, r) => {
    const row = sheet.getRow(first + r);
    row.height = 24;
    const zebra = r % 2 === 1 ? C.zebra : C.white;
    spec.cols.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      const v = values[i];
      cell.value = v ?? "";
      cell.border = box(C.line);
      cell.fill = solid(col.kind === "final" ? C.finalFill : zebra);
      cell.alignment = { horizontal: col.kind === "name" || col.kind === "text" ? "right" : "center", vertical: "middle", readingOrder: "rtl" };
      if (typeof v === "number") cell.numFmt = col.kind === "code" ? "0" : numFmt(v);
      const red = col.kind === "deduct" && typeof v === "number" && v > 0;
      const green = col.kind === "plus" && typeof v === "number" && v > 0;
      cell.font = font({
        bold: col.kind === "final" || col.kind === "grand" || col.kind === "name",
        color: { argb: red ? C.red : green ? C.green : col.kind === "index" ? C.gray : C.text },
      });
      // ✓ أخضر و✗ أحمر (كشف اليومية) - green ticks, red crosses (daily sheet)
      if (col.kind === "mark" && (v === "✓" || v === "½")) {
        cell.font = font({ bold: true, size: 13, color: { argb: v === "✓" ? C.green : C.deepOrange } });
        cell.fill = solid(C.finalFill);
      }
      if (col.kind === "mark" && v === "✗") {
        cell.font = font({ bold: true, size: 13, color: { argb: C.red } });
        cell.fill = solid(C.badFill);
      }
      if (col.kind === "mark" && v === "إجازة") cell.font = font({ size: 9, color: { argb: C.gray } });
    });
  });

  // 5) الإجمالي: كحلي، أبيض عريض، وخط دهبي فوقه - totals: navy, white bold, a gold top border
  const totalRow = sheet.getRow(first + spec.rows.length);
  totalRow.height = 28;
  spec.cols.forEach((col, i) => {
    const cell = totalRow.getCell(i + 1);
    const v = spec.totals[i];
    cell.value = v ?? "";
    cell.fill = solid(C.navy);
    cell.font = font({ bold: true, size: 12, color: { argb: col.kind === "final" ? C.gold : C.white } });
    cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    cell.border = { top: { style: "medium", color: { argb: C.gold } }, bottom: thin(C.navy), left: thin(C.navy), right: thin(C.navy) };
    if (typeof v === "number") cell.numFmt = numFmt(v);
  });
  const lastData = first + spec.rows.length - 1;
  if (spec.dataBarCol && spec.rows.length > 0) {
    const letter = sheet.getColumn(spec.dataBarCol).letter;
    sheet.addConditionalFormatting({
      ref: `${letter}${first}:${letter}${lastData}`,
      rules: [
        {
          type: "dataBar",
          priority: 1,
          minLength: 0,
          maxLength: 100,
          gradient: true,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: C.orange },
        } as unknown as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }

  // 6) التوقيعات بعد سطر فاضي، وسطر رمادي صغير بوقت الإنشاء - signatures after a blank row, then a tiny gray line
  const sigLabel = first + spec.rows.length + 2;
  const sigSpan = Math.max(2, Math.min(4, Math.floor(n / 3)));
  const boxes: [number, number, string][] = [
    [2, 1 + sigSpan, "توقيع المحاسب"],
    [n - sigSpan, n - 1, "اعتماد المدير العام"],
  ];
  sheet.getRow(sigLabel).height = 22;
  sheet.getRow(sigLabel + 1).height = 34;
  for (const [from, to, label] of boxes) {
    if (to > from) {
      sheet.mergeCells(sigLabel, from, sigLabel, to);
      sheet.mergeCells(sigLabel + 1, from, sigLabel + 1, to);
    }
    const head = sheet.getCell(sigLabel, from);
    head.value = label;
    head.font = font({ bold: true, color: { argb: C.navy } });
    head.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = from; c <= to; c++) sheet.getCell(sigLabel + 1, c).border = { bottom: { style: "mediumDashed", color: { argb: C.gray } } };
  }
  const stamp = sigLabel + 3;
  sheet.mergeCells(stamp, 1, stamp, n);
  const stampCell = sheet.getCell(stamp, 1);
  stampCell.value = `تم الإنشاء من لوحة متابعة الصفوة — ${issued}`;
  stampCell.font = font({ size: 8, color: { argb: C.gray } });
  stampCell.alignment = { horizontal: "center" };

  // 7) الطباعة: A4 بالعرض، صفحة واحدة بالعرض، هيدر الجدول بيتكرر، هوامش ضيقة
  //    Print: A4 landscape, one page wide, the table header repeats, narrow margins
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
  };
  return sheet;
}

// تاريخ ووقت الإصدار بتوقيت القاهرة - the issue date and time (Cairo)
function issuedAt(): { date: string; dateTime: string } {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" });
  const time = now.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });
  return { date, dateTime: `${date} ${time}` };
}

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elsafwa Dashboard";
  workbook.created = new Date();
  const roundLogo = readLogo("logo-round.png");
  const arLogo = readLogo("logo-ar.png");
  // exceljs بيقبل Buffer بتاع Node - exceljs takes a Node Buffer
  const add = (logo: Logo | null) => (logo ? workbook.addImage({ buffer: logo.buffer as unknown as ExcelJS.Buffer, extension: "png" }) : null);
  return { workbook, logos: { round: add(roundLogo), ar: add(arLogo), arSize: arLogo } };
}

const money = (v: number) => `${round(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.م`;

// ===== كشف المرتبات - the monthly salary sheet =====

// شيتات كشف المرتبات: مصنع الإنتاج شيت واحد بأقسامه التلاتة - sheets: the production factory is one sheet
const SHEETS: { title: string; keys: AttendanceSectionKey[] }[] = [
  { title: "الإدارة", keys: ["management"] },
  { title: dashboardConfig.attendance.factoryLabel, keys: ["production", "workshop", "operators"] },
  { title: "عمال تعبئة", keys: ["packing"] },
  { title: "عمال يومية (شهري)", keys: ["daily"] },
  { title: "سواقين", keys: ["drivers"] },
  { title: "مناديب", keys: ["reps"] },
  { title: "غفر", keys: ["guards"] },
  { title: "خارج البصمة", keys: ["outside"] },
];

type Row = { person: EmployeeAttendance; salary: EmployeeSalary };

const MONTHLY_COLUMNS: (Col & { pick?: (r: Row) => number | string; total?: boolean })[] = [
  { header: "م", kind: "index" },
  { header: "الاسم", kind: "name", pick: (r) => r.person.name },
  // الكود رقم (مش نص) عشان Excel ميعلّمش عليه - the code as a number so Excel shows no "number as text" marker
  { header: "كود البصمة", kind: "code", pick: (r) => (r.person.code && /^\d+$/.test(r.person.code) ? Number(r.person.code) : r.person.code ?? "") },
  { header: "القسم", kind: "text", pick: (r) => r.person.section },
  { header: "الأجر الشامل", kind: "money", pick: (r) => r.salary.total, total: true },
  { header: "أيام الغياب", kind: "count", pick: (r) => r.salary.absentDays, total: true },
  { header: "خصم الغياب", kind: "deduct", pick: (r) => r.salary.absence, total: true },
  { header: "خصومات", kind: "deduct", pick: (r) => r.salary.deductions, total: true },
  { header: "سلف", kind: "deduct", pick: (r) => r.salary.advanceTotal, total: true },
  { header: "أقساط", kind: "deduct", pick: (r) => r.salary.installments, total: true },
  { header: "مكافآت", kind: "plus", pick: (r) => r.salary.bonuses, total: true },
  { header: "إضافي الشهر", kind: "plus", pick: (r) => r.salary.overtime.total, total: true },
  { header: "المرتب النهائي", kind: "final", pick: (r) => r.salary.earned, total: true },
  { header: "الإجمالي مع الإضافي", kind: "grand", pick: (r) => r.salary.totalWithOvertime, total: true },
  { header: "توقيع", kind: "sign" },
];

// كشف المرتبات: كل الشهريين (كل الأقسام + خارج البصمة، من غير عمال اليومية)، الملخص الأول وبعده شيت لكل مصنع/قسم
// The salary sheet: every monthly employee (all sections + outside the biometric, no daily workers),
// the summary first, then one sheet per factory / section
export async function monthlySalaryWorkbook(): Promise<{ buffer: ArrayBuffer; fileName: string; preview: string[][] }> {
  const keys = Array.from(new Set(SHEETS.flatMap((s) => s.keys)));
  const loaded = await Promise.all(keys.map(async (key) => [key, await Promise.all([attendanceDetails(key), sectionSalaries(key)])] as const));
  const byKey = new Map(loaded);
  const month = loaded[0]?.[1][1].month ?? "";
  const [year, m] = month.split("-").map(Number);
  const monthLabel = `${MONTHS[(m || 1) - 1]} ${year}`;
  const title = `كشف مرتبات شهر ${monthLabel}`;
  const issued = issuedAt();

  // الصفوف لكل شيت - the rows of every sheet
  const groups = SHEETS.map(({ title: sheetTitle, keys: sheetKeys }) => {
    const rows: Row[] = [];
    for (const key of sheetKeys) {
      const [details, salaries] = byKey.get(key)!;
      const salaryOf = new Map(salaries.people.map((p) => [p.id, p]));
      for (const person of [...details.people].sort((a, b) => (a.code ?? "zz").localeCompare(b.code ?? "zz", "en", { numeric: true }))) {
        const salary = salaryOf.get(person.id);
        if (salary?.kind === "monthly") rows.push({ person, salary });
      }
    }
    return { title: sheetTitle, rows };
  }).filter((g) => g.rows.length > 0);

  const sum = (rows: Row[], pick: (r: Row) => number) => round(rows.reduce((s, r) => s + pick(r), 0));
  const deductionsOf = (r: Row) => r.salary.absence + r.salary.deductions + r.salary.advanceTotal + r.salary.installments;
  const all = groups.flatMap((g) => g.rows);

  const { workbook, logos } = newWorkbook();

  // الملخص الأول: سطر لكل قسم + الإجمالي، وdata bars على المرتب النهائي
  // The summary first: one row per section + the total, with data bars on the final salary
  const summaryCols: Col[] = [
    { header: "القسم", kind: "name" },
    { header: "عدد الموظفين", kind: "count" },
    { header: "إجمالي الأجر الشامل", kind: "money" },
    { header: "إجمالي الخصومات", kind: "deduct" },
    { header: "إجمالي المرتب النهائي", kind: "final" },
    { header: "إجمالي الإضافي", kind: "plus" },
    { header: "الإجمالي مع الإضافي", kind: "grand" },
  ];
  const summaryRow = (label: string, rows: Row[]): Cell[] => [
    label,
    rows.length,
    sum(rows, (r) => r.salary.total),
    sum(rows, deductionsOf),
    sum(rows, (r) => r.salary.earned),
    sum(rows, (r) => r.salary.overtime.total),
    sum(rows, (r) => r.salary.totalWithOvertime),
  ];
  styledSheet(
    workbook,
    logos,
    {
      name: "الملخص",
      title,
      subtitle: `ملخص كل الأقسام — ${COMPANY}`,
      info: [
        ["تاريخ الإصدار", issued.date],
        ["عدد الموظفين", String(all.length)],
        ["إجمالي المرتبات", money(sum(all, (r) => r.salary.earned))],
      ],
      headerFill: C.deepOrange,
      headerText: C.white,
      cols: summaryCols,
      rows: groups.map((g) => summaryRow(g.title, g.rows)),
      totals: summaryRow("الإجمالي", all),
      dataBarCol: 5,
    },
    issued.dateTime
  );

  const preview: string[][] = [];
  for (const { title: sheetTitle, rows } of groups) {
    const values = rows.map((r, i) => MONTHLY_COLUMNS.map((c, col) => (col === 0 ? i + 1 : c.pick ? c.pick(r) : null)));
    preview.push(...values.slice(0, Math.max(0, 5 - preview.length)).map((v) => v.map((x) => String(x ?? ""))));
    const totals: Cell[] = MONTHLY_COLUMNS.map((c) => (c.total ? sum(rows, (r) => Number(c.pick!(r))) : null));
    totals[1] = `الإجمالي (${rows.length})`;
    styledSheet(
      workbook,
      logos,
      {
        name: sheetTitle,
        title,
        subtitle: `${sheetTitle} — ${COMPANY}`,
        info: [
          ["تاريخ الإصدار", issued.date],
          ["عدد الموظفين", String(rows.length)],
          ["إجمالي المرتبات", money(sum(rows, (r) => r.salary.earned))],
        ],
        headerFill: C.deepOrange,
        headerText: C.white,
        cols: MONTHLY_COLUMNS,
        rows: values,
        totals,
      },
      issued.dateTime
    );
  }

  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, fileName: `كشف-المرتبات-${MONTHS[(m || 1) - 1]}-${year}.xlsx`, preview };
}

// ===== كشف اليومية - the daily workers' sheet =====

// علامة اليوم - a day's mark
function dayMark(status: string, worked: number): string {
  if (worked === 1) return "✓";
  if (worked === 0.5) return "½";
  if (status === "absent" || status === "leave") return "✗";
  if (status === "off" || status === "holiday") return "إجازة";
  return "";
}

// كشف اليومية: الأسبوع ده (السبت → الجمعة، نفس عمود "مستحق هذا الأسبوع") - the daily sheet for this cash week
export async function dailyWeekWorkbook(): Promise<{ buffer: ArrayBuffer; fileName: string; preview: string[][] }> {
  const [details, salaries] = await Promise.all([attendanceDetails("daily"), sectionSalaries("daily")]);
  const week = cashWeekOf(salaries.today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const salaryOf = new Map(salaries.people.map((p) => [p.id, p]));
  const people = details.people.filter((p) => salaryOf.get(p.id)?.kind === "daily");
  const issued = issuedAt();

  const cols: Col[] = [
    { header: "م", kind: "index" },
    { header: "الاسم", kind: "name" },
    { header: "اليومية", kind: "money" },
    ...dates.map((d): Col => ({ header: `${DAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${dm(d)}`, kind: "mark" })),
    { header: "أيام الحضور", kind: "count" },
    { header: "إضافي", kind: "plus" },
    { header: "خصومات", kind: "deduct" },
    { header: "مكافآت", kind: "plus" },
    { header: "المستحق", kind: "final" },
    { header: "توقيع", kind: "sign" },
  ];
  const sums = { days: 0, overtime: 0, deductions: 0, bonuses: 0, total: 0 };
  const rows: Cell[][] = people.map((person, i) => {
    const salary = salaryOf.get(person.id)!;
    const w = salary.weeks.find((x) => x.shown);
    const hasRate = salary.dailyRate > 0 && !!w;
    if (hasRate) {
      sums.days += w!.presentDays;
      sums.overtime += w!.overtime;
      sums.deductions += w!.deductions;
      sums.bonuses += w!.bonuses;
      sums.total += w!.total;
    }
    return [
      i + 1,
      person.name,
      hasRate ? salary.dailyRate : "مش متسجلة",
      ...dates.map((d) => {
        const day = w?.days.find((x) => x.date === d);
        return day ? dayMark(day.status, day.worked) : "";
      }),
      hasRate ? w!.presentDays : null,
      hasRate ? w!.overtime : null,
      hasRate ? w!.deductions : null,
      hasRate ? w!.bonuses : null,
      hasRate ? w!.total : null,
      null,
    ];
  });
  const totals: Cell[] = [null, `الإجمالي (${people.length})`, null, ...dates.map(() => null), round(sums.days), round(sums.overtime), round(sums.deductions), round(sums.bonuses), round(sums.total), null];

  const { workbook, logos } = newWorkbook();
  styledSheet(
    workbook,
    logos,
    {
      name: "كشف اليومية",
      title: `كشف اليومية — أسبوع ${dm(week.start)} – ${dm(week.end)}`,
      subtitle: `عمال يومية (من السبت للجمعة) — ${COMPANY}`,
      info: [
        ["تاريخ الإصدار", issued.date],
        ["عدد العمال", String(people.length)],
        ["إجمالي المستحق", money(sums.total)],
      ],
      headerFill: C.amber,
      headerText: C.navy,
      cols,
      rows,
      totals,
    },
    issued.dateTime
  );

  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, fileName: `كشف-اليومية-${week.start}-${week.end}.xlsx`, preview: rows.slice(0, 5).map((r) => r.map((x) => String(x ?? ""))) };
}
