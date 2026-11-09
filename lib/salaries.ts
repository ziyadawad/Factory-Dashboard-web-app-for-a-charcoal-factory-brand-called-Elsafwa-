// المرتبات لقسم حضور: بتتسأل بس لما زرار "💰 المرتب" يتداس في لوحة الحضور (عمرها ما بتظهر على الشاشة الرئيسية)
// Salaries of an attendance section: requested only when the "💰 المرتب" button is pressed (never on the main screen)
// قراية بس من ERPNext. ممنوع تسجيل أي مبلغ في اللوج - read-only; never log any amount
import { dashboardConfig } from "@/config/dashboard.config";
import { attendanceDetails } from "./attendance-details";
import { AttendanceSectionKey } from "./data-source";
import { erpPost } from "./erp";
import { EmployeeSalary, SalaryValue, SectionSalaries } from "./types";

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
type Additional = { employee: string; salary_component: string; amount: number | null };
type Advance = { party: string; debit: number | null };

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
    return { month, today, daysPerMonth: config.daysPerMonth, people: [], totals: { total: 0, absence: 0, expectedNet: 0, monthly: 0 } };
  }

  const components = [config.penaltyDaysComponent, config.penaltyAmountComponent, config.lateHoursComponent, config.lateAmountComponent];
  const [assignments, additional, advances] = await Promise.all([
    // الأحدث الأول، فأول واحد لكل موظف هو الساري النهارده - newest first: the first per employee is in force today
    list<Assignment>("Salary Structure Assignment", {
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["from_date", "<=", today]],
      fields: ["employee", "salary_structure", "from_date", "base", "custom_allowance"],
      order_by: "from_date desc, creation desc",
    }),
    list<Additional>("Additional Salary", {
      filters: [
        ["employee", "in", ids],
        ["docstatus", "=", 1],
        ["salary_component", "in", components],
        ["payroll_date", ">=", monthStart],
        ["payroll_date", "<=", lastDayOf(month)],
      ],
      fields: ["employee", "salary_component", "amount"],
    }),
    list<Advance>("GL Entry", {
      filters: [
        ["account", "=", config.advancesAccount],
        ["party_type", "=", "Employee"],
        ["party", "in", ids],
        ["voucher_type", "=", "Loan Disbursement"],
        ["posting_date", ">=", monthStart],
        ["posting_date", "<=", today],
        ["is_cancelled", "=", 0],
      ],
      fields: ["party", "debit"],
    }),
  ]);

  const assignmentOf = new Map<string, Assignment>();
  for (const a of assignments) if (!assignmentOf.has(a.employee)) assignmentOf.set(a.employee, a);
  const advancesOf = new Map<string, number>();
  for (const a of advances) advancesOf.set(a.party, (advancesOf.get(a.party) ?? 0) + (a.debit ?? 0));
  const extraOf = (employee: string, component: string) =>
    additional.filter((a) => a.employee === employee && a.salary_component === component).reduce((sum, a) => sum + (a.amount ?? 0), 0);

  const daily = new Set(config.dailyStructures);
  const perDay = config.daysPerMonth;
  const manual = (value: number, recorded: boolean): SalaryValue => ({ value: money(value), manual: !recorded });

  const people: EmployeeSalary[] = attendance.people.map((person) => {
    const assignment = assignmentOf.get(person.id);
    const kind = !assignment ? "none" : daily.has(assignment.salary_structure) ? "daily" : "monthly";
    // نفس عدّ لوحة الحضور، ونص اليوم = 0.5 - same counting as the attendance panel, half day = 0.5
    const absentDays = person.days.filter((d) => d.status === "absent").length + person.days.filter((d) => d.half).length * 0.5;
    const zero = { value: 0, manual: true };
    if (kind !== "monthly" || !assignment) {
      return { id: person.id, kind, total: 0, absentDays, absence: 0, advances: zero, loan: zero, insurance: zero, penalty: zero, late: zero, expectedNet: 0 };
    }
    const base = assignment.base ?? 0;
    const total = base + (assignment.custom_allowance ?? 0);
    const absence = money((total / perDay) * absentDays);

    // نفس معادلات ERPNext: الجزاء = الشامل ÷ 30 × الأيام، التأخير = (الأساسي ÷ 30) ÷ 8 × الساعات
    // Same formulas as the ERPNext structure: penalty = Ts / 30 × days, late = (base / 30) / 8 × hours
    const penaltyDays = extraOf(person.id, config.penaltyDaysComponent);
    const penaltyAmount = extraOf(person.id, config.penaltyAmountComponent);
    const lateHours = extraOf(person.id, config.lateHoursComponent);
    const lateAmount = extraOf(person.id, config.lateAmountComponent);
    const penalty = manual((total / perDay) * penaltyDays + penaltyAmount, penaltyDays !== 0 || penaltyAmount !== 0);
    const late = manual((base / perDay / 8) * lateHours + lateAmount, lateHours !== 0 || lateAmount !== 0);
    const advance = advancesOf.get(person.id) ?? 0;
    const advancesValue = { value: money(advance), manual: false };
    const loan = { value: 0, manual: true };
    const insurance = { value: 0, manual: true };
    const expectedNet = money(total - absence - advancesValue.value - loan.value - insurance.value - penalty.value - late.value);
    return { id: person.id, kind, total: money(total), absentDays, absence, advances: advancesValue, loan, insurance, penalty, late, expectedNet };
  });

  const monthly = people.filter((p) => p.kind === "monthly");
  const sum = (pick: (p: EmployeeSalary) => number) => money(monthly.reduce((s, p) => s + pick(p), 0));
  return {
    month,
    today,
    daysPerMonth: perDay,
    people,
    totals: { total: sum((p) => p.total), absence: sum((p) => p.absence), expectedNet: sum((p) => p.expectedNet), monthly: monthly.length },
  };
}

// كاش في ذاكرة السيرفر بس لكل قسم - server memory cache per section (never the CDN)
const cache = new Map<string, { at: number; value: SectionSalaries }>();

export async function sectionSalaries(key: AttendanceSectionKey): Promise<SectionSalaries> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.cacheSeconds * 1000) return hit.value;
  const value = await load(key);
  cache.set(key, { at: Date.now(), value });
  return value;
}
