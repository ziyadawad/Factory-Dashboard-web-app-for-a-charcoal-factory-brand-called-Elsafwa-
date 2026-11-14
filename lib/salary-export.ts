// كشوف المرتبات Excel (على السيرفر، من نفس الأرقام اللي على الشاشة) - ممنوع تسجيل أي مبلغ في اللوج
// Salary sheets as Excel (server side, from the same numbers shown on screen) - never log any amount
// الشكل والطباعة في excel-sheet.ts - the look and the print setup live in excel-sheet.ts
import { dashboardConfig } from "@/config/dashboard.config";
import { C, Cell, Col, issuedAt, newWorkbook, round, styledSheet } from "./excel-sheet";
import { addDays, attendanceDetails, cashWeekOf } from "./attendance-details";
import { AttendanceSectionKey } from "./data-source";
import { sectionSalaries } from "./salaries";
import { EmployeeAttendance, EmployeeSalary } from "./types";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAY_NAMES = ["الأحد", "الاتنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const COMPANY = "مصنع الصفوة للفحم";

// "2026-11-07" -> "7/11"
const dm = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;

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
