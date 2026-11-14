// شيت Excel بشكل البراند + إعداد الطباعة (صفحة A4 بالعرض مليانة) - من غير imports بـ @/ عشان يتجرّب لوحده
// A brand-styled Excel sheet + its print setup (a full A4 landscape page) - no "@/" imports so it can be tested alone
// الشكل: شريط علوي كحلي باللوجوهات، خط برتقالي→دهبي، كروت معلومات، جدول بصفوف متبادلة، إجمالي كحلي، وتوقيعات
// Look: a navy header band with the logos, an orange→gold accent line, info cards, a zebra table, a navy totals
// row and signature boxes
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

// ===== ألوان البراند (من اللوجوهات) - brand colours (from the logos) =====
export const C = {
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

export const round = (v: number) => Math.round(v * 100) / 100;
// من غير كسور لو الرقم صحيح - no decimals when the number is whole
const numFmt = (v: number) => (Number.isInteger(round(v)) ? "#,##0" : "#,##0.00");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
export type Logos = { round: number | null; ar: number | null; arSize: Logo | null };

// ===== شيت بالشكل الجديد - one styled sheet =====
type Kind = "index" | "text" | "name" | "code" | "money" | "count" | "deduct" | "plus" | "final" | "grand" | "sign" | "mark";
export type Col = { header: string; kind: Kind };
export type Cell = string | number | null;
export type SheetSpec = {
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

// ===== مقاس الصفحة - the page =====
// A4 بالعرض 11.69" × 8.27"، هوامش 0.25" يمين وشمال و0.3" فوق وتحت - A4 landscape, 0.25" side / 0.3" top-bottom margins
const MARGINS = { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0, footer: 0 };
// العرض المتاح بالبكسل (96dpi) ناقص هامش أمان صغير - printable width in px (96 dpi) minus a small safety margin
const PAGE_W_PX = (11.69 - MARGINS.left - MARGINS.right) * 96 - 4;
// الارتفاع المتاح بالنقط - printable height in points
const PAGE_H_PT = (8.27 - MARGINS.top - MARGINS.bottom) * 72 - 6;
const ROW_MIN = 22;
const ROW_MAX = 48;
const FONT_MIN = 11;
const FONT_MAX = 18;
const READABLE = 10; // أقل خط مقبول بعد تصغير الطباعة - the smallest font allowed after print scaling

// عرض النص بوحدات عرض العمود (≈7px) بخط Arial 11: الحرف العربي أضيق من الرقم
// A text's width in column-width units (≈7px) at Arial 11: Arabic letters are narrower than digits
const textUnits = (s: string) => Array.from(s).reduce((sum, ch) => sum + (/[؀-ۿ]/.test(ch) ? 0.72 : ch === " " ? 0.45 : 0.95), 0);
// الرقم زي ما Excel هيعرضه (#,##0 أو #,##0.00) - a number as Excel will show it (#,##0 or #,##0.00)
const shown = (v: Cell) => {
  if (typeof v !== "number") return String(v ?? "");
  const whole = Number.isInteger(round(v));
  return v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
};

// كل عمود: عرض المحتوى بخط 11 (بيكبر مع الخط) + حشو ثابت - الاسم أعرض، أعمدة الأيام متساوية
// Each column: its content width at 11pt (grows with the font) + a fixed padding - the name widest, day columns equal
type Need = { content: number; head: number; pad: number; min?: number };
// خط هيدر الجدول ثابت 11 عريض (بيلف على سطرين) عشان عرض الصفحة يروح لخط البيانات
// The table header font stays 11pt bold (it wraps) so the page width goes to the data font
const HEAD_MAX = 11;
const headFont = (font: number) => Math.min(HEAD_MAX, font);
function columnNeeds(spec: SheetSpec): Need[] {
  const needs = spec.cols.map((col, i) => {
    // الإجمالي أعرض: خط أكبر بنقطة وعريض - the totals are wider: 1pt bigger and bold
    const content = Math.max(0, ...spec.rows.map((r) => textUnits(shown(r[i]))), textUnits(shown(spec.totals[i])) * 1.18);
    // الهيدر بيلف على سطرين، فأطول كلمة بس (والحروف العربية بتتفاوت فهامش 25%) - the header wraps, so only its longest
    // word counts (Arabic letter widths vary, hence a 25% margin)
    const head = Math.max(...col.header.split(" ").map(textUnits)) * 1.25;
    if (col.kind === "sign") return { content: 0, head, pad: 1.5, min: 10 }; // مكان الإمضا ثابت - fixed room to sign
    if (col.kind === "name") return { content: Math.max(14, content * 1.1), head, pad: 3 }; // عريض - bold
    if (col.kind === "index") return { content: 2, head, pad: 1.5 };
    if (col.kind === "mark") return { content: Math.max(3, content), head, pad: 1.5 };
    return { content: Math.min(13, Math.max(3.5, content)), head, pad: 1.8 };
  });
  const marks = needs.filter((_, i) => spec.cols[i].kind === "mark").map((x) => x.content);
  const markC = marks.length ? Math.max(...marks) : 0;
  const markH = Math.max(0, ...needs.filter((_, i) => spec.cols[i].kind === "mark").map((x) => x.head));
  return needs.map((x, i) => (spec.cols[i].kind === "mark" ? { ...x, content: markC, head: markH } : x));
}
// عرض كل عمود بخط معيّن - each column's width at a given font
function widthsAt(needs: Need[], font: number): number[] {
  return needs.map((x) => Math.max(x.min ?? 0, Math.max((x.content * font) / FONT_MIN, (x.head * headFont(font)) / FONT_MIN) + x.pad));
}

// المقاسات كلها حسب عدد الصفوف عشان الجدول يملا الصفحة - every size from the row count so the table fills the page
function layoutFor(spec: SheetSpec) {
  const n = spec.cols.length;
  const needs = columnNeeds(spec);
  // عرض العمود w حرف = w×7+5 بكسل - a column of width w is w×7+5 px
  const units = (PAGE_W_PX - 5 * n) / 7;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  // أكبر خط العرض يشيله (بخطوات 0.5) - the biggest font the page width can hold (0.5pt steps)
  let fontCap = FONT_MIN;
  while (fontCap < FONT_MAX && sum(widthsAt(needs, fontCap + 0.5)) <= units) fontCap += 0.5;
  // لو المحتوى بخط 11 أعرض من الصفحة، الطباعة هتصغّر بالنسبة دي - when even 11pt is wider than the page, print scales by this
  const scaleW = Math.min(1, units / sum(widthsAt(needs, FONT_MIN)));
  const rows = Math.max(1, spec.rows.length);

  const fontOf = (rowH: number) => Math.min(fontCap, clamp(FONT_MIN + ((rowH - ROW_MIN) * (FONT_MAX - FONT_MIN)) / (ROW_MAX - ROW_MIN), FONT_MIN, FONT_MAX));
  const heights = (font: number) => {
    const headerFont = headFont(font);
    return {
      band: 18, // × 5 صفوف - × 5 rows
      accent: 5,
      gap: 6,
      info: Math.max(30, font * 1.9),
      header: Math.max(34, headerFont * 2 * 1.3 + 8),
      sigGap: 8,
      sigLabel: Math.max(22, font * 1.6),
      sigSpace: 52,
      stamp: 14,
      headerFont,
    };
  };
  const fixedOf = (h: ReturnType<typeof heights>) => h.band * 5 + h.accent + h.gap * 2 + h.info + h.header + h.sigGap + h.sigLabel + h.sigSpace + h.stamp;

  // مرتين: الارتفاع → الخط → الهيدر → الارتفاع - two passes: row height → font → header height → row height
  let font = FONT_MAX;
  let rowH = ROW_MAX;
  for (let pass = 0; pass < 2; pass++) {
    const h = heights(font);
    // الإجمالي صف زيادة بـ 4 نقط أعلى - the totals count as one more row, 4pt taller
    rowH = clamp((PAGE_H_PT - fixedOf(h) - 4) / (rows + 1), ROW_MIN, ROW_MAX);
    font = fontOf(rowH);
  }
  const h = heights(font);
  // العرض على قد الخط، والباقي بيتوزع بالنسبة لحد عرض الصفحة - widths for the font, the rest shared proportionally
  const need = widthsAt(needs, font);
  const widths = need.map((w) => w * Math.max(1, units / sum(need)));
  const totalH = fixedOf(h) + rowH * (rows + 1) + 4;
  const titleSize = clamp(24 + ((font - FONT_MIN) * 6) / (FONT_MAX - FONT_MIN), 24, 30);
  // لو صفحة واحدة هتصغّر الخط تحت 10 → صفحة واحدة بالعرض وصفحات بالطول - if one page shrinks the font below 10pt →
  // one page wide, several tall
  const onePage = font * Math.min(scaleW, PAGE_H_PT / totalH) >= READABLE;
  return { widths, font, rowH, h, titleSize, onePage };
}

export function styledSheet(workbook: ExcelJS.Workbook, logos: Logos, spec: SheetSpec, issued: string) {
  const n = spec.cols.length;
  const HEADER_ROW = 10;
  const { widths, font: dataSize, rowH, h, titleSize, onePage } = layoutFor(spec);
  const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
    views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: HEADER_ROW, xSplit: 0 }],
    properties: { defaultRowHeight: 20 },
  });
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
  const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: dataSize, color: { argb: C.text }, ...extra });

  // 1) الشريط العلوي (صفوف 1–5): كحلي، العنوان أبيض والعنوان الفرعي دهبي
  //    Header band (rows 1–5): navy, white title, gold subtitle
  for (let r = 1; r <= 5; r++) {
    sheet.getRow(r).height = h.band;
    for (let c = 1; c <= n; c++) sheet.getCell(r, c).fill = solid(C.navy);
  }
  sheet.mergeCells(1, 1, 3, n);
  const title = sheet.getCell(1, 1);
  title.value = spec.title;
  title.font = font({ size: titleSize, bold: true, color: { argb: C.white } });
  title.alignment = { horizontal: "center", vertical: "bottom", readingOrder: "rtl" };
  sheet.mergeCells(4, 1, 5, n);
  const subtitle = sheet.getCell(4, 1);
  subtitle.value = spec.subtitle;
  subtitle.font = font({ size: clamp(dataSize, 12, 15), bold: true, color: { argb: C.gold } });
  subtitle.alignment = { horizontal: "center", vertical: "top", readingOrder: "rtl" };
  // اللوجوهات (~70px): المدوّر يمين، العربي شمال (الشيت من اليمين للشمال) - round logo right, Arabic logo left (RTL sheet)
  const LOGO_H = 70;
  const EDGE = 16; // المسافة من حرف الشيت - the gap from the sheet edge (px)
  const TOP = 24; // من فوق جوه الشريط (الشريط 5 × 24px) - from the top inside the band (5 × 24px)
  if (logos.round !== null) {
    sheet.addImage(logos.round, { tl: anchorAt(EDGE, TOP), ext: { width: LOGO_H, height: LOGO_H }, editAs: "oneCell" });
  }
  if (logos.ar !== null && logos.arSize) {
    const width = Math.round((LOGO_H * logos.arSize.width) / logos.arSize.height);
    sheet.addImage(logos.ar, { tl: anchorAt(sheetPx - EDGE - width, TOP), ext: { width, height: LOGO_H }, editAs: "oneCell" });
  }
  // خط برتقالي→دهبي تحت الشريط - the orange→gold accent line
  sheet.mergeCells(6, 1, 6, n);
  sheet.getRow(6).height = h.accent;
  sheet.getCell(6, 1).fill = {
    type: "gradient",
    gradient: "angle",
    degree: 0,
    stops: [
      { position: 0, color: { argb: C.orange } },
      { position: 1, color: { argb: C.gold } },
    ],
  };
  sheet.getRow(7).height = h.gap;

  // 2) كروت المعلومات (3 كروت بمسافات بينها) - the info cards (3 cards with gaps)
  sheet.getRow(8).height = h.info;
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
        { text: `${label}:  `, font: font({ size: clamp(dataSize - 2, 10, 13), color: { argb: C.gray } }) },
        { text: value, font: font({ size: clamp(dataSize, 12, 16), bold: true, color: { argb: C.deepOrange } }) },
      ],
    };
    cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  });
  sheet.getRow(9).height = h.gap;

  // 3) هيدر الجدول - the table header
  const header = sheet.getRow(HEADER_ROW);
  header.height = h.header;
  spec.cols.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.fill = solid(spec.headerFill);
    cell.font = font({ size: h.headerFont, bold: true, color: { argb: spec.headerText } });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, readingOrder: "rtl" };
    cell.border = box(C.white);
  });

  // 4) الصفوف: متبادلة، والألوان حسب نوع العمود - rows: zebra, colours by column kind
  const first = HEADER_ROW + 1;
  spec.rows.forEach((values, r) => {
    const row = sheet.getRow(first + r);
    row.height = rowH;
    const zebra = r % 2 === 1 ? C.zebra : C.white;
    spec.cols.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      const v = values[i];
      cell.value = v ?? "";
      cell.border = box(C.line);
      cell.fill = solid(col.kind === "final" ? C.finalFill : zebra);
      cell.alignment = {
        horizontal: col.kind === "name" || col.kind === "text" ? "right" : "center",
        vertical: "middle",
        readingOrder: "rtl",
        indent: col.kind === "name" ? 1 : 0,
      };
      if (typeof v === "number") cell.numFmt = col.kind === "code" ? "0" : numFmt(v);
      const red = col.kind === "deduct" && typeof v === "number" && v > 0;
      const green = col.kind === "plus" && typeof v === "number" && v > 0;
      cell.font = font({
        bold: col.kind === "final" || col.kind === "grand" || col.kind === "name",
        color: { argb: red ? C.red : green ? C.green : col.kind === "index" ? C.gray : C.text },
      });
      // ✓ أخضر و✗ أحمر (كشف اليومية) - green ticks, red crosses (daily sheet)
      if (col.kind === "mark" && (v === "✓" || v === "½")) {
        cell.font = font({ bold: true, size: dataSize + 2, color: { argb: v === "✓" ? C.green : C.deepOrange } });
        cell.fill = solid(C.finalFill);
      }
      if (col.kind === "mark" && v === "✗") {
        cell.font = font({ bold: true, size: dataSize + 2, color: { argb: C.red } });
        cell.fill = solid(C.badFill);
      }
      if (col.kind === "mark" && (v === "إجازة" || v === "النهارده")) cell.font = font({ size: Math.max(9, dataSize - 3), color: { argb: C.gray } });
    });
  });

  // 5) الإجمالي: كحلي، أبيض عريض، وخط دهبي فوقه - totals: navy, white bold, a gold top border
  const totalRow = sheet.getRow(first + spec.rows.length);
  totalRow.height = rowH + 4;
  spec.cols.forEach((col, i) => {
    const cell = totalRow.getCell(i + 1);
    const v = spec.totals[i];
    cell.value = v ?? "";
    cell.fill = solid(C.navy);
    cell.font = font({ bold: true, size: Math.min(FONT_MAX, dataSize + 1), color: { argb: col.kind === "final" ? C.gold : C.white } });
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

  // 6) التوقيعات تحت الجدول على طول (سطر صغير فاضي)، مكان كفاية للإمضا، وبعدها سطر رمادي بوقت الإنشاء
  //    Signatures right under the table (a small gap), room for a real signature, then a tiny gray line
  const sigGap = first + spec.rows.length + 1;
  sheet.getRow(sigGap).height = h.sigGap;
  const sigLabel = sigGap + 1;
  const sigSpan = Math.max(2, Math.min(4, Math.floor(n / 3)));
  const boxes: [number, number, string][] = [
    [2, 1 + sigSpan, "توقيع المحاسب"],
    [n - sigSpan, n - 1, "اعتماد المدير العام"],
  ];
  sheet.getRow(sigLabel).height = h.sigLabel;
  sheet.getRow(sigLabel + 1).height = h.sigSpace;
  for (const [from, to, label] of boxes) {
    if (to > from) {
      sheet.mergeCells(sigLabel, from, sigLabel, to);
      sheet.mergeCells(sigLabel + 1, from, sigLabel + 1, to);
    }
    const head = sheet.getCell(sigLabel, from);
    head.value = label;
    head.font = font({ bold: true, size: clamp(dataSize, 12, 15), color: { argb: C.navy } });
    head.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = from; c <= to; c++) sheet.getCell(sigLabel + 1, c).border = { bottom: { style: "mediumDashed", color: { argb: C.gray } } };
  }
  const stamp = sigLabel + 2;
  sheet.getRow(stamp).height = h.stamp;
  sheet.mergeCells(stamp, 1, stamp, n);
  const stampCell = sheet.getCell(stamp, 1);
  stampCell.value = `تم الإنشاء من لوحة متابعة الصفوة — ${issued}`;
  stampCell.font = font({ size: 8, color: { argb: C.gray } });
  stampCell.alignment = { horizontal: "center", vertical: "bottom" };

  // 7) الطباعة: A4 بالعرض، صفحة واحدة (أو صفحة بالعرض وصفحات بالطول لو الصفوف كتير)، هيدر الجدول بيتكرر،
  //    هوامش ضيقة، ومنطقة الطباعة على قد الشيت بالظبط
  //    Print: A4 landscape, one page (or one page wide, several tall when there are many rows), the table header
  //    repeats, narrow margins, and the print area is exactly the used range
  const lastCol = sheet.getColumn(n).letter;
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: onePage ? 1 : 0,
    horizontalCentered: true,
    verticalCentered: false,
    margins: MARGINS,
    printArea: `A1:${lastCol}${stamp}`,
    printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
  };
  return sheet;
}

// تاريخ ووقت الإصدار بتوقيت القاهرة - the issue date and time (Cairo)
export function issuedAt(): { date: string; dateTime: string } {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" });
  const time = now.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });
  return { date, dateTime: `${date} ${time}` };
}

export function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elsafwa Dashboard";
  workbook.created = new Date();
  const roundLogo = readLogo("logo-round.png");
  const arLogo = readLogo("logo-ar.png");
  // exceljs بيقبل Buffer بتاع Node - exceljs takes a Node Buffer
  const add = (logo: Logo | null) => (logo ? workbook.addImage({ buffer: logo.buffer as unknown as ExcelJS.Buffer, extension: "png" }) : null);
  return { workbook, logos: { round: add(roundLogo), ar: add(arLogo), arSize: arLogo } as Logos };
}
