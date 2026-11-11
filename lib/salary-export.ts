// كشوف المرتبات Excel (على السيرفر، من نفس الأرقام اللي على الشاشة) - ممنوع تسجيل أي مبلغ في اللوج
// Salary sheets as Excel (server side, from the same numbers shown on screen) - never log any amount
import ExcelJS from "exceljs";
import { dashboardConfig } from "@/config/dashboard.config";
import { addDays, attendanceDetails, cashWeekOf } from "./attendance-details";
import { AttendanceSectionKey } from "./data-source";
import { sectionSalaries } from "./salaries";
import { EmployeeAttendance, EmployeeSalary } from "./types";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAY_NAMES = ["الأحد", "الاتنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONEY = "#,##0.00";
const FONT = "Cairo";

// "2026-11-07" -> "7/11"
const dm = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
const round = (v: number) => Math.round(v * 100) / 100;

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

const MONTHLY_COLUMNS: { header: string; width: number; pick?: (p: Row) => number | string; money?: boolean }[] = [
  { header: "م", width: 5 },
  { header: "الاسم", width: 30, pick: (r) => r.person.name },
  { header: "كود البصمة", width: 11, pick: (r) => r.person.code ?? "" },
  { header: "القسم", width: 14, pick: (r) => r.person.section },
  { header: "الأجر الشامل", width: 13, pick: (r) => r.salary.total, money: true },
  { header: "أيام الغياب", width: 10, pick: (r) => r.salary.absentDays },
  { header: "خصم الغياب", width: 12, pick: (r) => r.salary.absence, money: true },
  { header: "خصومات", width: 12, pick: (r) => r.salary.deductions, money: true },
  { header: "سلف", width: 12, pick: (r) => r.salary.advanceTotal, money: true },
  { header: "أقساط", width: 12, pick: (r) => r.salary.installments, money: true },
  { header: "مكافآت", width: 12, pick: (r) => r.salary.bonuses, money: true },
  { header: "إضافي الشهر", width: 12, pick: (r) => r.salary.overtime.total, money: true },
  { header: "المرتب النهائي", width: 14, pick: (r) => r.salary.earned, money: true },
  { header: "الإجمالي مع الإضافي", width: 16, pick: (r) => r.salary.totalWithOvertime, money: true },
  { header: "توقيع", width: 22 },
];
// الأعمدة اللي ليها إجمالي - columns with a total
const TOTALED = new Set(["الأجر الشامل", "أيام الغياب", "خصم الغياب", "خصومات", "سلف", "أقساط", "مكافآت", "إضافي الشهر", "المرتب النهائي", "الإجمالي مع الإضافي"]);

type Row = { person: EmployeeAttendance; salary: EmployeeSalary };

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBDBDBD" } },
  bottom: { style: "thin", color: { argb: "FFBDBDBD" } },
  left: { style: "thin", color: { argb: "FFBDBDBD" } },
  right: { style: "thin", color: { argb: "FFBDBDBD" } },
};

function newSheet(workbook: ExcelJS.Workbook, name: string, title: string, widths: number[]) {
  const sheet = workbook.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }] });
  sheet.columns = widths.map((width) => ({ width }));
  sheet.mergeCells(1, 1, 1, widths.length);
  const cell = sheet.getCell(1, 1);
  cell.value = title;
  cell.font = { name: FONT, bold: true, size: 14 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;
  return sheet;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((c) => {
    c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = BORDER;
  });
}

function styleBody(row: ExcelJS.Row, moneyCols: number[], total = false) {
  row.height = total ? 24 : 22;
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.font = { name: FONT, bold: total };
    c.alignment = { horizontal: col === 2 && !total ? "right" : "center", vertical: "middle" };
    c.border = BORDER;
    if (moneyCols.includes(col)) c.numFmt = MONEY;
    if (total) c.fill = TOTAL_FILL;
  });
}

// كشف المرتبات: كل الشهريين (كل الأقسام + خارج البصمة، من غير عمال اليومية)، شيت لكل مصنع/قسم + ملخص
// The salary sheet: every monthly employee (all sections + outside the biometric, no daily workers),
// one sheet per factory / section + a summary
export async function monthlySalaryWorkbook(): Promise<{ buffer: ArrayBuffer; fileName: string; preview: string[][] }> {
  const keys = Array.from(new Set(SHEETS.flatMap((s) => s.keys)));
  const loaded = await Promise.all(keys.map(async (key) => [key, await Promise.all([attendanceDetails(key), sectionSalaries(key)])] as const));
  const byKey = new Map(loaded);
  const month = loaded[0]?.[1][1].month ?? "";
  const [year, m] = month.split("-").map(Number);
  const monthLabel = `${MONTHS[(m || 1) - 1]} ${year}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elsafwa Dashboard";
  const summary = newSheet(workbook, "الملخص", `ملخص كشف المرتبات — ${monthLabel}`, [22, 10, ...MONTHLY_COLUMNS.filter((c) => TOTALED.has(c.header) && c.header !== "أيام الغياب").map(() => 15)]);
  const summaryCols = MONTHLY_COLUMNS.filter((c) => TOTALED.has(c.header) && c.header !== "أيام الغياب");
  styleHeader(summary.addRow(["القسم", "عدد الموظفين", ...summaryCols.map((c) => c.header)]));
  const grand = summaryCols.map(() => 0);
  let grandCount = 0;
  const preview: string[][] = [];

  for (const { title, keys: sheetKeys } of SHEETS) {
    const rows: Row[] = [];
    for (const key of sheetKeys) {
      const [details, salaries] = byKey.get(key)!;
      const salaryOf = new Map(salaries.people.map((p) => [p.id, p]));
      for (const person of [...details.people].sort((a, b) => (a.code ?? "zz").localeCompare(b.code ?? "zz", "en", { numeric: true }))) {
        const salary = salaryOf.get(person.id);
        if (salary?.kind === "monthly") rows.push({ person, salary });
      }
    }
    if (rows.length === 0) continue;
    const sheet = newSheet(workbook, title, `كشف المرتبات — ${title} — ${monthLabel}`, MONTHLY_COLUMNS.map((c) => c.width));
    styleHeader(sheet.addRow(MONTHLY_COLUMNS.map((c) => c.header)));
    const moneyCols = MONTHLY_COLUMNS.flatMap((c, i) => (c.money ? [i + 1] : []));
    rows.forEach((r, i) => {
      const values = MONTHLY_COLUMNS.map((c, col) => (col === 0 ? i + 1 : c.pick ? c.pick(r) : ""));
      styleBody(sheet.addRow(values), moneyCols);
      if (preview.length < 5) preview.push(values.map(String));
    });
    const totals: (number | string)[] = MONTHLY_COLUMNS.map((c) => (TOTALED.has(c.header) ? round(rows.reduce((s, r) => s + Number(c.pick!(r)), 0)) : ""));
    totals[1] = `الإجمالي (${rows.length})`;
    styleBody(sheet.addRow(totals), moneyCols, true);
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

    const sums = summaryCols.map((c) => round(rows.reduce((s, r) => s + Number(c.pick!(r)), 0)));
    sums.forEach((v, i) => (grand[i] += v));
    grandCount += rows.length;
    styleBody(summary.addRow([title, rows.length, ...sums]), summaryCols.map((_, i) => i + 3));
  }
  styleBody(summary.addRow(["الإجمالي", grandCount, ...grand.map(round)]), summaryCols.map((_, i) => i + 3), true);
  summary.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, fileName: `كشف-المرتبات-${MONTHS[(m || 1) - 1]}-${year}.xlsx`, preview };
}

// علامة اليوم في كشف اليومية - a day's mark in the daily sheet
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

  const headers = [
    "م", "الاسم", "اليومية",
    ...dates.map((d) => `${DAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${dm(d)}`),
    "أيام الحضور", "إضافي", "خصومات", "مكافآت", "المستحق", "توقيع",
  ];
  const widths = [5, 28, 11, ...dates.map(() => 10), 11, 11, 11, 11, 13, 22];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elsafwa Dashboard";
  const sheet = newSheet(workbook, "كشف اليومية", `كشف اليومية — من السبت ${dm(week.start)} للجمعة ${dm(week.end)}`, widths);
  styleHeader(sheet.addRow(headers));
  const first = 3 + dates.length + 1; // أول عمود بعد الأيام (1-based) - first column after the days
  const moneyCols = [3, first + 1, first + 2, first + 3, first + 4];
  const sums = { days: 0, overtime: 0, deductions: 0, bonuses: 0, total: 0 };
  const preview: string[][] = [];
  people.forEach((person, i) => {
    const salary = salaryOf.get(person.id)!;
    const w = salary.weeks.find((x) => x.shown);
    const hasRate = salary.dailyRate > 0 && !!w;
    const values = [
      i + 1,
      person.name,
      hasRate ? salary.dailyRate : "مش متسجلة",
      ...dates.map((d) => {
        const day = w?.days.find((x) => x.date === d);
        return day ? dayMark(day.status, day.worked) : "";
      }),
      hasRate ? w!.presentDays : "",
      hasRate ? w!.overtime : "",
      hasRate ? w!.deductions : "",
      hasRate ? w!.bonuses : "",
      hasRate ? w!.total : "",
      "",
    ];
    if (hasRate) {
      sums.days += w!.presentDays;
      sums.overtime += w!.overtime;
      sums.deductions += w!.deductions;
      sums.bonuses += w!.bonuses;
      sums.total += w!.total;
    }
    const row = sheet.addRow(values);
    styleBody(row, moneyCols);
    // ✓ أخضر، ✗ أحمر - green ticks, red crosses
    dates.forEach((_, d) => {
      const c = row.getCell(4 + d);
      if (c.value === "✓" || c.value === "½") c.font = { name: FONT, bold: true, color: { argb: "FF2E7D32" } };
      if (c.value === "✗") c.font = { name: FONT, bold: true, color: { argb: "FFC62828" } };
    });
    if (preview.length < 5) preview.push(values.map(String));
  });
  const totals = ["", `الإجمالي (${people.length})`, "", ...dates.map(() => ""), round(sums.days), round(sums.overtime), round(sums.deductions), round(sums.bonuses), round(sums.total), ""];
  styleBody(sheet.addRow(totals), moneyCols, true);
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, fileName: `كشف-اليومية-${week.start}-${week.end}.xlsx`, preview };
}
