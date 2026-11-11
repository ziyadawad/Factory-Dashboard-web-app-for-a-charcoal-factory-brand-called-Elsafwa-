// المرتبات لقسم حضور: بتتسأل بس لما زرار "💰 المرتب" يتداس في لوحة الحضور (عمرها ما بتظهر على الشاشة الرئيسية)
// Salaries of an attendance section: requested only when the "💰 المرتب" button is pressed (never on the main screen)
// قراية بس من ERPNext. ممنوع تسجيل أي مبلغ في اللوج - read-only; never log any amount
import { dashboardConfig } from "@/config/dashboard.config";
import { attendanceDetails } from "./attendance-details";
import { AttendanceSectionKey } from "./data-source";
import { ErpError, erpPost } from "./erp";
import { EmployeeSalary, OvertimeEntry, OvertimeSummary, SalaryAdjustment, SectionSalaries } from "./types";

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
  voucher_type: string;
  against_voucher: string | null;
  debit: number | null;
  credit: number | null;
  posting_date: string;
};
type EmployeeAdvance = { employee: string; paid_amount: number | null };
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
type EmployeePay ={ name: string; ctc: number | null; date_of_joining: string | null };

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
  if (ids.length === 0) {
    return {
      month, today, daysPerMonth: config.daysPerMonth, people: [],
      totals: { total: 0, absence: 0, bonuses: 0, deductions: 0, overtimeUnpaid: 0, overtimeHours: 0, overtimePaid: 0, totalWithOvertime: 0, installments: 0, earned: 0, expectedNet: 0, monthly: 0 },
    };
  }

  const monthEnd = lastDayOf(month);
  const extras = config.additionalSalary;
  const [assignments, additional, salaryAdjustments, unpaidOvertime, componentList, loanGl, employeeAdvances, employees] = await Promise.all([
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
    listIfAllowed<Adjustment>("Salary Adjustment", {
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["date", "<=", monthEnd]],
      or_filters: [["adjustment_type", "=", "قسط"], ["date", ">=", monthStart]],
      fields: ["*"],
      order_by: "date asc, creation asc",
    }),
    // الإضافي اللي لسه متصرفش (paid = 0) بأي تاريخ - unpaid overtime (paid = 0), any date
    listIfAllowed<Adjustment>("Salary Adjustment", {
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["adjustment_type", "=", "إضافي"], ["paid", "=", 0]],
      fields: ["*"],
      order_by: "date asc, creation asc",
    }),
    // نوع كل مكون (Earning / Deduction) لو السطر نفسه مفيهوش type - each component's type, when a row lacks it
    listIfAllowed<Component>("Salary Component", { fields: ["name", "type"] }),
    // السلف (Loan Disbursement) وأقساطها (Loan Repayment) على حساب السلف الشهر ده - advances and repayments this month
    list<LoanGl>("GL Entry", {
      filters: [
        ["account", "=", config.advancesAccount],
        ["party_type", "=", "Employee"],
        ["party", "in", ids],
        ["voucher_type", "in", ["Loan Disbursement", "Loan Repayment"]],
        ["posting_date", ">=", monthStart],
        ["posting_date", "<=", monthEnd],
        ["is_cancelled", "=", 0],
      ],
      fields: ["party", "voucher_type", "against_voucher", "debit", "credit", "posting_date"],
    }),
    // Employee Advance المدفوعة الشهر ده (لو اليوزر يقدر يقراها) - paid Employee Advances this month (when readable)
    listIfAllowed<EmployeeAdvance>("Employee Advance", {
      filters: [
        ["employee", "in", ids],
        ["docstatus", "=", 1],
        ["posting_date", ">=", monthStart],
        ["posting_date", "<=", today],
        ["paid_amount", ">", 0],
      ],
      fields: ["employee", "paid_amount"],
    }),
    // Cost to Company من ملف الموظف (البديل لو مفيش هيكل مرتب) - Employee ctc (fallback when there is no assignment)
    list<EmployeePay>("Employee", { filters: [["name", "in", ids]], fields: ["name", "ctc", "date_of_joining"] }),
  ]);

  const employeeOf = new Map(employees.map((e) => [e.name, e]));
  const assignmentOf = new Map<string, Assignment>();
  for (const a of assignments) if (!assignmentOf.has(a.employee)) assignmentOf.set(a.employee, a);
  const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);
  // السلف: اللي اتصرف لحد النهارده + Employee Advance - advances: disbursed so far + Employee Advances
  const advancesOf = new Map<string, number>();
  const disbursedThisMonth = new Set<string>();
  for (const g of loanGl) {
    if (g.voucher_type !== "Loan Disbursement") continue;
    if (g.against_voucher) disbursedThisMonth.add(g.against_voucher);
    if (String(g.posting_date).slice(0, 10) <= today) add(advancesOf, g.party, g.debit ?? 0);
  }
  for (const a of employeeAdvances) add(advancesOf, a.employee, a.paid_amount ?? 0);
  // القسط: سداد سلف اتصرفت قبل الشهر ده بس (سلفة الشهر نفسه اتخصمت فوق، فمتتخصمش مرتين)
  // Installments: repayments of loans disbursed before this month only (this month's advances are already deducted)
  const loanOf = new Map<string, number>();
  for (const g of loanGl) {
    if (g.voucher_type === "Loan Repayment" && !(g.against_voucher && disbursedThisMonth.has(g.against_voucher))) {
      add(loanOf, g.party, (g.credit ?? 0) - (g.debit ?? 0));
    }
  }
  const typeOf = new Map(componentList.map((c) => [c.name, c.type]));
  const hourComponents = new Set(extras.hourComponents);
  const skipComponents = new Set(extras.skipComponents);

  // الإضافي: اللي لسه متصرفش (أي تاريخ) + اللي اتصرف الشهر ده - overtime: unpaid (any date) + paid this month
  const overtimeEntry = (a: Adjustment): OvertimeEntry => {
    const hours = a.hours ?? 0;
    const rate = a.hour_rate ?? 0;
    return { date: String(a.date).slice(0, 10), hours, rate, amount: money(a.amount || hours * rate) };
  };
  const overtimeOf = (id: string): OvertimeSummary => {
    const unpaid = unpaidOvertime.filter((a) => a.employee === id).map(overtimeEntry).filter((e) => e.amount > 0);
    const paidThisMonth = salaryAdjustments
      .filter((a) => a.employee === id && a.adjustment_type === "إضافي" && a.paid && String(a.date).slice(0, 10) >= monthStart)
      .map(overtimeEntry)
      .filter((e) => e.amount > 0);
    return {
      unpaid,
      paidThisMonth,
      unpaidTotal: money(unpaid.reduce((s, e) => s + e.amount, 0)),
      unpaidHours: money(unpaid.reduce((s, e) => s + e.hours, 0)),
      paidTotal: money(paidThisMonth.reduce((s, e) => s + e.amount, 0)),
      paidHours: money(paidThisMonth.reduce((s, e) => s + e.hours, 0)),
    };
  };

  const daily = new Set(config.dailyStructures);
  const perDay = config.daysPerMonth;

  const people: EmployeeSalary[] = attendance.people.map((person) => {
    const assignment = assignmentOf.get(person.id);
    const employee = employeeOf.get(person.id);
    const ctc = money(employee?.ctc ?? 0);
    const structureTotal = assignment ? money((assignment.base ?? 0) + (assignment.custom_allowance ?? 0)) : 0;
    // الأولوية: هيكل المرتب، وبعدين ctc من ملف الموظف - priority: the assignment, then Employee.ctc
    const isDaily = !!assignment && daily.has(assignment.salary_structure);
    const source: EmployeeSalary["source"] = isDaily || structureTotal > 0 ? "structure" : ctc > 0 ? "employee" : null;
    const kind: EmployeeSalary["kind"] = isDaily ? "daily" : source ? "monthly" : "none";
    const total = source === "structure" ? structureTotal : source === "employee" ? ctc : 0;
    const mismatch = !isDaily && structureTotal > 0 && ctc > 0 && ctc !== structureTotal ? { ctc, structure: structureTotal } : null;

    // نفس عدّ لوحة الحضور، نص اليوم = 0.5، والإجازة (مش جمعة) = غياب - same counting, half day = 0.5, leave = absent
    const absentDays =
      person.days.filter((d) => d.status === "absent" || d.status === "leave").length + person.days.filter((d) => d.half).length * 0.5;
    // الأيام اللي عدّت: من أول الشهر (أو التعيين لو بعده) لحد النهارده، بالجمعة - days so far incl. Fridays
    const joined = employee?.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : "";
    const from = joined > monthStart ? joined : monthStart;
    const daysPassed = from > today ? 0 : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

    // الإضافي بيتصرف كاش (لكل الموظفين، شهري ويومية) ومش داخل في المرتب ولا الصافي
    // Overtime is paid in cash (every employee, monthly or daily) and is never part of the salary or the net
    const overtime = overtimeOf(person.id);

    const zero = { value: 0, manual: true };
    if (kind !== "monthly") {
      return {
        id: person.id, kind, total: 0, source, mismatch: null, perDay: 0, daysPassed, earned: 0, absentDays, absence: 0,
        advances: zero, loan: zero, insurance: zero, adjustments: [], bonuses: 0, overtime, extraDeductions: 0, deductions: 0,
        installments: 0, expectedNet: 0, totalWithOvertime: 0,
      };
    }
    // التأخير على الأساسي (ولو المصدر ctc يبقى الأساسي = ctc) - late uses base (ctc when that is the source)
    const base = source === "structure" ? assignment?.base ?? 0 : total;
    const dayRate = total / perDay;
    const absence = money(dayRate * absentDays);

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
      }
    }

    const sumOf = (kind: SalaryAdjustment["kind"]) => money(adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amount, 0));
    const bonuses = sumOf("addition");
    const extraDeductions = sumOf("deduction");
    const adjustmentInstallments = sumOf("installment");

    const advancesValue = { value: money(advancesOf.get(person.id) ?? 0), manual: false };
    const loan = { value: money(loanOf.get(person.id) ?? 0), manual: false };
    const insurance = { value: 0, manual: true };
    // الخصومات = خصم Salary Adjustment + خصومات Additional Salary + سلف الشهر - deductions incl. this month's advances
    const deductions = money(extraDeductions + advancesValue.value);
    const installments = money(adjustmentInstallments + loan.value); // قسط الشهر - this month's installments
    // لحد النهارده = (الشامل ÷ 30 × الأيام اللي عدّت) − خصم الغياب − الخصومات − قسط الشهر + المكافآت (الإضافي لأ)
    // الصافي المتوقع = الشامل − خصم الغياب − الخصومات − قسط الشهر + المكافآت (الإضافي لأ)
    // Earned so far = Ts / 30 × days passed − absence − deductions − installments + bonuses (never overtime)
    // Expected net = Ts − absence − deductions − installments + bonuses (never overtime)
    const earned = money(dayRate * daysPassed - absence - deductions - installments + bonuses);
    const expectedNet = money(total - absence - deductions - installments + bonuses - insurance.value);
    return {
      id: person.id, kind, total: money(total), source, mismatch, perDay: money(dayRate), daysPassed, earned, absentDays, absence,
      advances: advancesValue, loan, insurance, adjustments, bonuses, overtime, extraDeductions, deductions, installments, expectedNet,
      // المرتب النهائي (لحد النهارده) + الإضافي كله (اتصرف ولسه) - salary earned so far + all overtime
      totalWithOvertime: money(earned + overtime.paidTotal + overtime.unpaidTotal),
    };
  });

  const monthly = people.filter((p) => p.kind === "monthly");
  const sum = (pick: (p: EmployeeSalary) => number) => money(monthly.reduce((s, p) => s + pick(p), 0));
  return {
    month,
    today,
    daysPerMonth: perDay,
    people,
    totals: {
      total: sum((p) => p.total),
      absence: sum((p) => p.absence),
      bonuses: sum((p) => p.bonuses),
      deductions: sum((p) => p.deductions),
      // الإضافي لكل القسم (مش الشهريين بس) عشان الكاش اللي يتجهز - overtime of everyone: the cash to prepare
      overtimeUnpaid: money(people.reduce((s, p) => s + p.overtime.unpaidTotal, 0)),
      overtimeHours: money(people.reduce((s, p) => s + p.overtime.unpaidHours, 0)),
      overtimePaid: money(people.reduce((s, p) => s + p.overtime.paidTotal, 0)),
      totalWithOvertime: sum((p) => p.totalWithOvertime),
      installments: sum((p) => p.installments),
      earned: sum((p) => p.earned),
      expectedNet: sum((p) => p.expectedNet),
      monthly: monthly.length,
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
