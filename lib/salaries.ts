// المرتبات لقسم حضور: بتتسأل بس لما زرار "💰 المرتب" يتداس في لوحة الحضور (عمرها ما بتظهر على الشاشة الرئيسية)
// Salaries of an attendance section: requested only when the "💰 المرتب" button is pressed (never on the main screen)
// قراية بس من ERPNext. ممنوع تسجيل أي مبلغ في اللوج - read-only; never log any amount
import { dashboardConfig } from "@/config/dashboard.config";
import { addDays, attendanceDetails, cashWeekOf, cashWeekStarts, rangeStartOf, weekStartOf } from "./attendance-details";
import { AttendanceSectionKey, outsideMode } from "./data-source";
import { ErpError, erpPost } from "./erp";
import { DailyWeek, EmployeeDay, EmployeeSalary, OvertimeEntry, OvertimeSummary, OvertimeWeek, SalaryAdjustment, SectionSalaries } from "./types";

const config = dashboardConfig.salaries;

const money = (value: number) => Math.round(value * 100) / 100;

async function list<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", {
    doctype,
    limit_page_length: 0,
    ...body,
  });
  return message;
}

type Assignment = { employee: string; salary_structure: string; from_date: string; base: number | null; custom_allowance: number | null };
type Additional = { employee: string; salary_component: string; type: string | null; amount: number | null; payroll_date: string };
type Component = { name: string; type: string };
type LoanGl = {
  party: string;
  voucher_no: string;
  voucher_type: string;
  against_voucher: string | null;
  debit: number | null;
  credit: number | null;
  posting_date: string;
};
type EmployeeAdvance = { name: string; employee: string; paid_amount: number | null; posting_date: string };
// DocType مخصوص "Salary Adjustment" - the custom Salary Adjustment DocType (reason is read only if the field exists)
type Adjustment = {
  employee: string;
  adjustment_type: string;
  date: string;
  hours?: number | null;
  hour_rate?: number | null;
  deduction_type?: string | null;
  days?: number | null;
  total_amount?: number | null;
  monthly_installment?: number | null;
  amount?: number | null;
  paid?: number | null; // اتصرف (للإضافي) - overtime paid in cash
  reason?: string | null;
};
type EmployeePay = { name: string; ctc: number | null; date_of_joining: string | null } & Record<string, unknown>;

// لو اليوزر مالوش صلاحية على الـ doctype (403) بنكمل من غيره ونكتب في اللوج مرة واحدة (من غير أرقام)
// When the API user may not read a doctype (403) we carry on without it, logging once (never amounts)
const warned = new Set<string>();
async function listIfAllowed<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  try {
    return await list<T>(doctype, body);
  } catch (error) {
    if (error instanceof ErpError && /HTTP 403|PermissionError/.test(error.message)) {
      if (!warned.has(doctype)) console.warn(`[erp] salaries: no read permission on ${doctype} (skipped)`);
      warned.add(doctype);
      return [];
    }
    throw error;
  }
}

// عدد الشهور من "2026-09" لـ "2026-11" = 2 - months between two "YYYY-MM"
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// أنواع الخصم بالأيام (لو حقل days فاضي) - deduction types in days (when days is empty)
const DEDUCTION_DAYS: Record<string, number> = { "ربع يوم": 0.25, "نص يوم": 0.5, "يوم": 1, "يومين": 2 };


function lastDayOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

async function load(key: AttendanceSectionKey): Promise<SectionSalaries> {
  const attendance = await attendanceDetails(key);
  const { today, month } = attendance;
  const monthStart = `${month}-01`;
  const ids = attendance.people.map((p) => p.id);
  // أسابيع القبض الكاش (السبت → الجمعة، نفس الدالة لليومية والإضافي) - cash-pay weeks (one helper for both)
  const thisWeekStart = weekStartOf(today);
  const cashWeek = cashWeekOf(today);
  const shownStart = cashWeek.start;
  const weekStarts = cashWeekStarts(today);
  const rangeStart = rangeStartOf(today);
  const dailyPay = { week: { start: cashWeek.start, end: cashWeek.end }, paidToday: cashWeek.paidToday };
  if (ids.length === 0) {
    return {
      month, today, daysPerMonth: config.daysPerMonth, people: [], dailyPay,
      totals: { total: 0, absence: 0, bonuses: 0, deductions: 0, overtime: 0, overtimeHours: 0, dailyWeek: 0, dailyMonth: 0, overtimeWeek: 0, overtimeWeekHours: 0, advances: 0, totalWithOvertime: 0, installments: 0, fridayDays: 0, fridayPay: 0, earned: 0, expectedNet: 0, monthly: 0, daily: 0 },
    };
  }

  const monthEnd = lastDayOf(month);
  const extras = config.additionalSalary;
  const [assignments, additional, salaryAdjustments, componentList, loanGl, employeeAdvances, employees] = await Promise.all([
    // الأحدث الأول، فأول واحد لكل موظف هو الساري النهارده - newest first: the first per employee is in force today
    list<Assignment>("Salary Structure Assignment", {
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["from_date", "<=", today]],
      fields: ["employee", "salary_structure", "from_date", "base", "custom_allowance"],
      order_by: "from_date desc, creation desc",
    }),
    list<Additional>("Additional Salary", {
      // كل المكونات (submitted) اللي الـ payroll_date بتاعها في الشهر ده - every submitted one dated this month
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["payroll_date", ">=", monthStart], ["payroll_date", "<=", monthEnd]],
      fields: ["employee", "salary_component", "type", "amount", "payroll_date"],
      order_by: "payroll_date asc, creation asc",
    }),
    // Salary Adjustment (submitted): إضافي / مكافأة / خصم الشهر ده، والأقساط اللي بدأت لحد آخر الشهر
    // (fields "*" عشان حقل السبب لو مش موجود ميوقعش الطلب - "*" so a missing reason field never breaks the request)
    // Salary Adjustment (submitted): this month's إضافي / مكافأة / خصم, plus every installment started by month end
    // (من أول أسبوع اليومية اللي فات، عشان أسابيع اليومية - from the first daily-pay week, for the weekly pay)
    listIfAllowed<Adjustment>("Salary Adjustment", {
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["date", "<=", monthEnd]],
      or_filters: [["adjustment_type", "=", "قسط"], ["date", ">=", rangeStart]],
      fields: ["*"],
      order_by: "date asc, creation asc",
    }),
    // نوع كل مكون (Earning / Deduction) لو السطر نفسه مفيهوش type - each component's type, when a row lacks it
    listIfAllowed<Component>("Salary Component", { fields: ["name", "type"] }),
    // السلف (Loan Disbursement) وأقساطها (Loan Repayment) على حساب السلف من أول أسابيع اليومية (الشهريين: الشهر ده بس)
    // Advances and repayments on the advances account since the first daily-pay week (monthly staff: this month only)
    list<LoanGl>("GL Entry", {
      filters: [
        ["account", "=", config.advancesAccount],
        ["party_type", "=", "Employee"],
        ["party", "in", ids],
        ["voucher_type", "in", ["Loan Disbursement", "Loan Repayment"]],
        ["posting_date", ">=", rangeStart],
        ["posting_date", "<=", monthEnd],
        ["is_cancelled", "=", 0],
      ],
      fields: ["party", "voucher_no", "voucher_type", "against_voucher", "debit", "credit", "posting_date"],
    }),
    // Employee Advance المدفوعة (لو اليوزر يقدر يقراها) من أول أسابيع اليومية - paid Employee Advances (when readable)
    listIfAllowed<EmployeeAdvance>("Employee Advance", {
      filters: [
        ["employee", "in", ids],
        ["docstatus", "=", 1],
        ["posting_date", ">=", rangeStart],
        ["posting_date", "<=", today],
        ["paid_amount", ">", 0],
      ],
      fields: ["name", "employee", "paid_amount", "posting_date"],
    }),
    // Cost to Company من ملف الموظف (البديل لو مفيش هيكل مرتب) واليومية - Employee ctc (fallback) and the daily rate
    list<EmployeePay>("Employee", {
      filters: [["name", "in", ids]],
      fields: ["name", "ctc", "date_of_joining", config.dailyRateField],
    }),
  ]);

  const employeeOf = new Map(employees.map((e) => [e.name, e]));
  const assignmentOf = new Map<string, Assignment>();
  for (const a of assignments) if (!assignmentOf.has(a.employee)) assignmentOf.set(a.employee, a);
  const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);
  // السلف: اللي اتصرف لحد النهارده + Employee Advance - advances: disbursed so far + Employee Advances
  const advancesOf = new Map<string, number>();
  const disbursedThisMonth = new Set<string>();
  const dateOf = (v: string) => String(v).slice(0, 10);
  // الشهريين: الشهر ده بس - monthly staff: this month only
  const monthLoanGl = loanGl.filter((g) => dateOf(g.posting_date) >= monthStart);
  for (const g of monthLoanGl) {
    if (g.voucher_type !== "Loan Disbursement") continue;
    if (g.against_voucher) disbursedThisMonth.add(g.against_voucher);
    if (dateOf(g.posting_date) <= today) add(advancesOf, g.party, g.debit ?? 0);
  }
  for (const a of employeeAdvances) if (dateOf(a.posting_date) >= monthStart) add(advancesOf, a.employee, a.paid_amount ?? 0);
  // القسط: سداد سلف اتصرفت قبل الشهر ده بس (سلفة الشهر نفسه اتخصمت فوق، فمتتخصمش مرتين)
  // Installments: repayments of loans disbursed before this month only (this month's advances are already deducted)
  const loanOf = new Map<string, number>();
  for (const g of monthLoanGl) {
    if (g.voucher_type === "Loan Repayment" && !(g.against_voucher && disbursedThisMonth.has(g.against_voucher))) {
      add(loanOf, g.party, (g.credit ?? 0) - (g.debit ?? 0));
    }
  }
  const typeOf = new Map(componentList.map((c) => [c.name, c.type]));
  const hourComponents = new Set(extras.hourComponents);
  const skipComponents = new Set(extras.skipComponents);

  // الإضافي (اتصرف ولا لأ، حقل paid مش بيتقري): الشهر كله، وأسبوع بأسبوع (بيتقبض كاش السبت)
  // Overtime (paid or not; the paid field is ignored): the whole month, and week by week (paid in cash on Saturday)
  const overtimeEntry = (a: Adjustment): OvertimeEntry => {
    const hours = a.hours ?? 0;
    const rate = a.hour_rate ?? 0;
    return { date: String(a.date).slice(0, 10), hours, rate, amount: money(a.amount || hours * rate) };
  };
  const overtimeOf = (id: string): OvertimeSummary => {
    const all = salaryAdjustments
      .filter((a) => a.employee === id && a.adjustment_type === "إضافي")
      .map(overtimeEntry)
      .filter((e) => e.amount > 0);
    const totalOf = (list: OvertimeEntry[]) => money(list.reduce((s, e) => s + e.amount, 0));
    const hoursOf = (list: OvertimeEntry[]) => money(list.reduce((s, e) => s + e.hours, 0));
    const entries = all.filter((e) => e.date >= monthStart);
    const weeks: OvertimeWeek[] = weekStarts.map((start) => {
      const end = addDays(start, 6);
      const inWeek = all.filter((e) => e.date >= start && e.date <= end);
      return { start, end, entries: inWeek, total: totalOf(inWeek), hours: hoursOf(inWeek), shown: start === shownStart, current: start === thisWeekStart };
    });
    const shown = weeks.find((w) => w.shown);
    return {
      entries, total: totalOf(entries), hours: hoursOf(entries),
      week: shown?.total ?? 0, weekHours: shown?.hours ?? 0, weeks,
    };
  };

  const daily = new Set(config.dailyStructures);
  // يوم شغل لعامل اليومية: 1 / نص يوم 0.5 / الجمعة أو الإجازة الرسمية بس لو بصم - a daily worker's worked day
  const workedOf = (d: EmployeeDay) =>
    d.status === "present" ? (d.half ? 0.5 : 1) : (d.status === "off" || d.status === "holiday") && d.firstPunch ? 1 : 0;
  const perDay = config.daysPerMonth;

  const people: EmployeeSalary[] = attendance.people.map((person) => {
    const assignment = assignmentOf.get(person.id);
    const employee = employeeOf.get(person.id);
    const ctc = money(employee?.ctc ?? 0);
    const structureTotal = assignment ? money((assignment.base ?? 0) + (assignment.custom_allowance ?? 0)) : 0;
    // الأولوية: هيكل المرتب، وبعدين ctc من ملف الموظف - priority: the assignment, then Employee.ctc
    // عامل يومية: اليومية > 0 ومالوش مرتب شهري، أو هيكله يومية، أو في قسم عمال يومية من غير مرتب
    // A daily worker: a daily rate and no monthly salary, a daily structure, or in the daily section with no salary
    const dailyRate = money(Number(employee?.[config.dailyRateField] ?? 0) || 0);
    const dailyStructure = !!assignment && daily.has(assignment.salary_structure);
    const hasMonthly = !dailyStructure && (structureTotal > 0 || ctc > 0);
    const isDaily = !hasMonthly && (dailyRate > 0 || dailyStructure || key === "daily");
    const source: EmployeeSalary["source"] = isDaily ? null : structureTotal > 0 ? "structure" : ctc > 0 ? "employee" : null;
    const kind: EmployeeSalary["kind"] = isDaily ? "daily" : source ? "monthly" : "none";
    const total = source === "structure" ? structureTotal : source === "employee" ? ctc : 0;
    const mismatch = !isDaily && structureTotal > 0 && ctc > 0 && ctc !== structureTotal ? { ctc, structure: structureTotal } : null;
    // أيام الحضور: نفس قواعد لوحة الحضور (بصمة أو Attendance Present)، نص اليوم = 0.5، والجمعة / الإجازة لو بصم فعلا
    // Present days: same rules as the attendance panel, half day = 0.5, a Friday / holiday only when he punched
    const presentDates = person.days.filter((d) => workedOf(d) > 0).map((d) => ({ date: d.date, half: workedOf(d) === 0.5 }));
    const presentDays = presentDates.reduce((s, d) => s + (d.half ? 0.5 : 1), 0);

    // نفس عدّ لوحة الحضور، نص اليوم = 0.5، والإجازة (مش جمعة) = غياب - same counting, half day = 0.5, leave = absent
    // خارج البصمة "fixed": عمره ما بيتخصم منه غياب - outside the biometric "fixed": never an absence deduction
    const mode = outsideMode(person.id);
    const absentDays =
      mode === "fixed"
        ? 0
        : person.days.filter((d) => d.status === "absent" || d.status === "leave").length + person.days.filter((d) => d.half).length * 0.5;
    // الأيام اللي عدّت: من أول الشهر (أو التعيين لو بعده) لحد النهارده، بالجمعة - days so far incl. Fridays
    const joined = employee?.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : "";
    const from = joined > monthStart ? joined : monthStart;
    const daysPassed = from > today ? 0 : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

    // الإضافي (لكل الموظفين، شهري ويومية) مش داخل في المرتب النهائي - overtime is never part of the final salary
    const overtime = overtimeOf(person.id);

    const zero = { value: 0, manual: true };
    const common = {
      id: person.id, kind, source, daysPassed, absentDays, dailyRate: isDaily ? dailyRate : 0, presentDays, presentDates, overtime,
      weeks: [] as DailyWeek[], outsideMode: mode, friday: { days: 0, rate: 0, amount: 0, dates: [] as { date: string; half: boolean }[] },
    };
    if (kind === "none" || (kind === "daily" && dailyRate <= 0)) {
      return {
        ...common, total: 0, mismatch: null, perDay: 0, earned: 0, absence: 0,
        advances: zero, loan: zero, insurance: zero, adjustments: [], bonuses: 0, extraDeductions: 0, deductions: 0,
        installments: 0, advanceTotal: 0, expectedNet: 0, totalWithOvertime: 0,
      };
    }
    if (kind === "daily") {
      // عامل يومية: أيام الحضور × اليومية − خصم + مكافأة (Salary Adjustment الشهر ده)
      // Daily worker: present days × rate − خصم + مكافأة (Salary Adjustment this month)
      // كل البنود من أول أسابيع اليومية (الإضافي في الأسابيع بس، وفي الشهر من overtime)
      // Every item since the first daily-pay week (overtime goes to the weeks; the month uses overtime above)
      const adjustments: SalaryAdjustment[] = [];
      const weekOvertime: { date: string; amount: number; hours: number }[] = [];
      for (const a of salaryAdjustments) {
        if (a.employee !== person.id || String(a.date).slice(0, 10) < rangeStart) continue;
        const date = String(a.date).slice(0, 10);
        if (a.adjustment_type === "إضافي") {
          const e = overtimeEntry(a);
          if (e.amount > 0) weekOvertime.push({ date, amount: e.amount, hours: e.hours });
          continue;
        }
        const reason = a.reason ? String(a.reason).trim() || null : null;
        const line = { source: "salary_adjustment" as const, component: a.adjustment_type, date, units: null, reason, remaining: null, detail: null };
        if (a.adjustment_type === "مكافأة") {
          const amount = money(a.amount ?? 0);
          if (amount > 0) adjustments.push({ ...line, kind: "addition", label: "مكافأة", sign: 1, amount });
        } else if (a.adjustment_type === "خصم") {
          const type = a.deduction_type ?? "";
          const days = a.days || DEDUCTION_DAYS[type] || 0;
          const amount = money(a.amount || (type === "مبلغ ثابت" ? 0 : dailyRate * days));
          const label = type && type !== "مبلغ ثابت" ? `خصم ${type}` : "خصم";
          if (amount > 0) adjustments.push({ ...line, kind: "deduction", label, sign: -1, amount });
        } else if (a.adjustment_type === "سلفة") {
          // سلفة (Salary Adjustment) - an advance recorded as a Salary Adjustment
          const amount = money(a.amount ?? 0);
          if (amount > 0) adjustments.push({ ...line, kind: "advance", label: "سلفة", sign: -1, amount });
        }
      }
      // السلف المصروفة (Loan Disbursement على حساب السلف + Employee Advance): كل واحدة بتتخصم من الأسبوع اللي فيه تاريخها
      // Paid advances (Loan Disbursement on the advances account + Employee Advance): each one comes off the week of its date
      const advanceLine = (source: SalaryAdjustment["source"], date: string, amount: number, detail: string) =>
        adjustments.push({
          source, kind: "advance", label: "سلفة", component: "سلفة", sign: -1, amount: money(amount), date,
          units: null, reason: null, remaining: null, detail,
        });
      for (const g of loanGl) {
        const date = dateOf(g.posting_date);
        if (g.party !== person.id || g.voucher_type !== "Loan Disbursement" || date < rangeStart || date > today) continue;
        if ((g.debit ?? 0) > 0) advanceLine("loan", date, g.debit ?? 0, g.voucher_no);
      }
      for (const a of employeeAdvances) {
        const date = dateOf(a.posting_date);
        if (a.employee === person.id && (a.paid_amount ?? 0) > 0) advanceLine("employee_advance", date, a.paid_amount ?? 0, a.name);
      }
      adjustments.sort((x, y) => x.date.localeCompare(y.date));
      const sumIn = (list: { date: string; amount: number }[], from: string, to: string) =>
        money(list.filter((x) => x.date >= from && x.date <= to).reduce((s, x) => s + x.amount, 0));
      const monthAdjustments = adjustments.filter((a) => a.date >= monthStart);
      const sumOf = (k: SalaryAdjustment["kind"]) => money(monthAdjustments.filter((a) => a.kind === k).reduce((s, a) => s + a.amount, 0));
      const bonuses = sumOf("addition");
      const advanceTotal = sumOf("advance");
      const deductions = money(sumOf("deduction") + advanceTotal); // الخصومات + السلف - deductions incl. advances
      const earned = money(presentDays * dailyRate - deductions + bonuses);

      // الأسابيع (السبت → الجمعة) من أول أسبوع فيه أيام من الشهر (أو الأسبوع اللي فات) لحد الأسبوع ده
      // The weeks (Saturday → Friday) from the first one touching this month (or the last full week) to this week
      const dayOf = new Map([...person.leadDays, ...person.days].map((d) => [d.date, d]));
      const additions = adjustments.filter((a) => a.kind === "addition");
      const cuts = adjustments.filter((a) => a.kind === "deduction");
      const advanceCuts = adjustments.filter((a) => a.kind === "advance");
      const weeks: DailyWeek[] = [];
      for (const start of weekStarts) {
        const end = addDays(start, 6);
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = addDays(start, i);
          const d = dayOf.get(date);
          return { date, status: d?.status ?? (date > today ? "future" : "none"), worked: d ? workedOf(d) : 0 } as const;
        });
        const presentInWeek = days.reduce((s, d) => s + d.worked, 0);
        const pay = money(presentInWeek * dailyRate);
        const weekOt = sumIn(weekOvertime, start, end);
        const weekOtHours = money(weekOvertime.filter((x) => x.date >= start && x.date <= end).reduce((s, x) => s + x.hours, 0));
        const weekCuts = sumIn(cuts, start, end);
        const weekAdvances = sumIn(advanceCuts, start, end);
        const weekAdds = sumIn(additions, start, end);
        weeks.push({
          start, end, days, presentDays: presentInWeek, pay, overtime: weekOt, overtimeHours: weekOtHours, deductions: weekCuts,
          advances: weekAdvances, bonuses: weekAdds, total: money(pay + weekOt + weekAdds - weekCuts - weekAdvances),
          items: adjustments.filter((a) => a.date >= start && a.date <= end),
          shown: start === shownStart, current: start === thisWeekStart,
        });
      }
      return {
        ...common, weeks, total: 0, mismatch: null, perDay: dailyRate, earned, absence: 0,
        advances: zero, loan: zero, insurance: zero, adjustments: monthAdjustments, bonuses, extraDeductions: deductions, deductions,
        installments: 0, advanceTotal, expectedNet: earned, totalWithOvertime: money(earned + overtime.total),
      };
    }
    // التأخير على الأساسي (ولو المصدر ctc يبقى الأساسي = ctc) - late uses base (ctc when that is the source)
    const base = source === "structure" ? assignment?.base ?? 0 : total;
    const dayRate = total / perDay;
    const absence = money(dayRate * absentDays);

    // بدل الجمعة: كل جمعة اشتغلها (بصمة / Attendance حاضر) يوم زيادة = الشامل ÷ fridayDayRateDivisor (نص اليوم 0.5)
    // Friday pay: every worked Friday is an extra day = salary ÷ fridayDayRateDivisor (half day 0.5)
    const fridayDates = config.fridayWorkPay && mode !== "fixed"
      ? person.days.filter((d) => d.fridayWork).map((d) => ({ date: d.date, half: d.fridayWork === 0.5 }))
      : [];
    const fridayDays = fridayDates.reduce((s, d) => s + (d.half ? 0.5 : 1), 0);
    const fridayRate = money(total / config.fridayDayRateDivisor);
    const friday = { days: fridayDays, rate: fridayRate, amount: money((total / config.fridayDayRateDivisor) * fridayDays), dates: fridayDates };

    // Additional Salary: الأيام والساعات بتتحول لفلوس بنفس معادلات ERPNext (الشامل ÷ 30 × الأيام، الأساسي ÷ 30 ÷ 8 × الساعات)
    // Additional Salary: days / hours become money with the ERPNext formulas; the sign comes from the component type
    const adjustments: SalaryAdjustment[] = [];
    for (const a of additional) {
      if (a.employee !== person.id || skipComponents.has(a.salary_component)) continue;
      const type = a.type || typeOf.get(a.salary_component);
      if (type !== "Earning" && type !== "Deduction") continue;
      const count = a.amount ?? 0;
      const dayDivisor = extras.dayComponents[a.salary_component];
      const isDays = dayDivisor > 0;
      const isHours = hourComponents.has(a.salary_component);
      const amount = money(isDays ? (total / dayDivisor) * count : isHours ? (base / perDay / 8) * count : count);
      if (amount === 0) continue;
      const sign = type === "Earning" ? 1 : -1;
      adjustments.push({
        source: "additional_salary",
        kind: sign > 0 ? "addition" : "deduction",
        label: extras.labels[a.salary_component] ?? a.salary_component,
        component: a.salary_component,
        sign,
        amount: Math.abs(amount),
        date: String(a.payroll_date).slice(0, 10),
        units: isDays || isHours ? { count, unit: isDays ? "day" : "hour" } : null,
        detail: null,
        reason: null,
        remaining: null,
      });
    }

    // Salary Adjustment: مكافأة بتتزود، خصم بيتخصم (الشهر ده)، والقسط بيتخصم كل شهر من شهر تاريخه لحد ما
    // total_amount يخلص (آخر شهر الباقي بس). الإضافي مش هنا: بيتصرف كاش (فوق في overtime)
    // Salary Adjustment: مكافأة added, خصم subtracted (this month); قسط subtracted every month from the month of its
    // date until total_amount is paid (the last month only the remainder). إضافي is not here: it is paid in cash
    for (const a of salaryAdjustments) {
      if (a.employee !== person.id) continue;
      const date = String(a.date).slice(0, 10);
      if (a.adjustment_type !== "قسط" && date < monthStart) continue; // أيام قبل الشهر (لأسابيع اليومية بس)
      const reason = a.reason ? String(a.reason).trim() || null : null;
      const line = { source: "salary_adjustment" as const, component: a.adjustment_type, date, units: null, reason, remaining: null };
      if (a.adjustment_type === "قسط") {
        const totalAmount = a.total_amount ?? 0;
        const installment = a.monthly_installment ?? 0;
        const elapsed = monthsBetween(date.slice(0, 7), month);
        if (totalAmount <= 0 || installment <= 0 || elapsed < 0) continue;
        const paidBefore = Math.min(totalAmount, installment * elapsed);
        const thisMonth = money(Math.min(installment, totalAmount - paidBefore));
        if (thisMonth <= 0) continue; // القسط خلص - fully paid
        const left = money(totalAmount - paidBefore - thisMonth);
        adjustments.push({
          ...line, kind: "installment", label: "قسط", sign: -1, amount: thisMonth, detail: null,
          remaining: { amount: left, months: Math.ceil(left / installment - 1e-9) },
        });
      } else if (a.adjustment_type === "مكافأة") {
        const amount = money(a.amount ?? 0);
        if (amount <= 0) continue;
        adjustments.push({ ...line, kind: "addition", label: a.adjustment_type, sign: 1, amount, detail: null });
      } else if (a.adjustment_type === "خصم") {
        // المبلغ من ERPNext، ولو فاضي: الأيام × يومية الشامل - amount from ERPNext, else days × the day rate
        const type = a.deduction_type ?? "";
        const days = a.days || DEDUCTION_DAYS[type] || 0;
        const amount = money(a.amount || (type === "مبلغ ثابت" ? 0 : dayRate * days));
        if (amount <= 0) continue;
        const label = type && type !== "مبلغ ثابت" ? `خصم ${type}` : "خصم";
        adjustments.push({ ...line, kind: "deduction", label, sign: -1, amount, detail: null });
      } else if (a.adjustment_type === "سلفة") {
        // سلفة (Salary Adjustment): بتتخصم في عمود "سلف" - an advance, deducted in the "سلف" column
        const amount = money(a.amount ?? 0);
        if (amount <= 0) continue;
        adjustments.push({ ...line, kind: "advance", label: "سلفة", sign: -1, amount, detail: null });
      }
    }

    const sumOf = (kind: SalaryAdjustment["kind"]) => money(adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amount, 0));
    const bonuses = sumOf("addition");
    const extraDeductions = sumOf("deduction");
    const adjustmentInstallments = sumOf("installment");

    const advancesValue = { value: money(advancesOf.get(person.id) ?? 0), manual: false };
    const loan = { value: money(loanOf.get(person.id) ?? 0), manual: false };
    const insurance = { value: 0, manual: true };
    // الخصومات = خصم Salary Adjustment + خصومات Additional Salary؛ السلف لوحدها = سلف الشهر (Loan) + سلفة (Salary Adjustment)
    // Deductions = Salary Adjustment خصم + Additional Salary deductions; advances apart = loan advances + سلفة
    const deductions = extraDeductions;
    const advanceTotal = money(advancesValue.value + sumOf("advance"));
    const installments = money(adjustmentInstallments + loan.value); // قسط الشهر - this month's installments
    // لحد النهارده = (الشامل ÷ 30 × الأيام اللي عدّت) − خصم الغياب − الخصومات − قسط الشهر + المكافآت (الإضافي لأ)
    // الصافي المتوقع = الشامل − خصم الغياب − الخصومات − قسط الشهر + المكافآت (الإضافي لأ)
    // Earned so far = Ts / 30 × days passed − absence − deductions − installments + bonuses (never overtime)
    // Expected net = Ts − absence − deductions − installments + bonuses (never overtime)
    // + بدل الجمعة - plus the Friday pay
    const earned = money(dayRate * daysPassed - absence - deductions - advanceTotal - installments + bonuses + friday.amount);
    const expectedNet = money(total - absence - deductions - advanceTotal - installments + bonuses + friday.amount - insurance.value);
    return {
      ...common, friday, total: money(total), mismatch, perDay: money(dayRate), earned, absence,
      advances: advancesValue, loan, insurance, adjustments, bonuses, extraDeductions, deductions, installments, advanceTotal, expectedNet,
      // المرتب النهائي (لحد النهارده) + الإضافي الشهر ده - salary earned so far + this month's overtime
      totalWithOvertime: money(earned + overtime.total),
    };
  });

  const monthly = people.filter((p) => p.kind === "monthly");
  const dailyPaid = people.filter((p) => p.kind === "daily" && p.dailyRate > 0);
  const sumIn = (list: EmployeeSalary[], pick: (p: EmployeeSalary) => number) => money(list.reduce((s, p) => s + pick(p), 0));
  const sum = (pick: (p: EmployeeSalary) => number) => sumIn(monthly, pick);
  const shownTotal = (p: EmployeeSalary) => p.weeks.find((w) => w.shown)?.total ?? 0;
  return {
    month,
    today,
    daysPerMonth: perDay,
    people,
    dailyPay,
    totals: {
      total: sumIn(monthly, (p) => p.total),
      absence: sumIn(monthly, (p) => p.absence),
      bonuses: sum((p) => p.bonuses),
      deductions: sum((p) => p.deductions),
      advances: sum((p) => p.advanceTotal),
      // إضافي الجدول الشهري (الشهريين واللي مالهمش مرتب) - overtime of the monthly table (everyone but daily workers)
      overtime: sumIn(people.filter((p) => p.kind !== "daily"), (p) => p.overtime.total),
      overtimeHours: sumIn(people.filter((p) => p.kind !== "daily"), (p) => p.overtime.hours),
      overtimeWeek: sumIn(people.filter((p) => p.kind !== "daily"), (p) => p.overtime.week),
      overtimeWeekHours: sumIn(people.filter((p) => p.kind !== "daily"), (p) => p.overtime.weekHours),
      // عمال اليومية: مستحق هذا الأسبوع، والشهر - daily workers: this week, the month
      dailyWeek: sumIn(dailyPaid, shownTotal),
      dailyMonth: sumIn(dailyPaid, (p) => p.totalWithOvertime),
      totalWithOvertime: sum((p) => p.totalWithOvertime),
      installments: sum((p) => p.installments),
      fridayDays: sum((p) => p.friday.days),
      fridayPay: sum((p) => p.friday.amount),
      earned: sum((p) => p.earned),
      expectedNet: sum((p) => p.expectedNet),
      monthly: monthly.length,
      daily: dailyPaid.length,
    },
  };
}

// كاش في ذاكرة السيرفر بس لكل قسم - server memory cache per section (never the CDN)
const cache = new Map<string, { at: number; value: SectionSalaries }>();

export async function sectionSalaries(key: AttendanceSectionKey): Promise<SectionSalaries> {
  const hit = cache.get(key);
  if (config.cacheSeconds > 0 && hit && Date.now() - hit.at < config.cacheSeconds * 1000) return hit.value;
  const value = await load(key);
  cache.set(key, { at: Date.now(), value });
  return value;
}
