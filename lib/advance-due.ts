// ميعاد استحقاق السلف والقروض (قراية بس من ERPNext)
// Due dates of advances and loans (read-only from ERPNext)
//
// - قرض (Loan): لو اليوزر يقدر يقرا Loan و Loan Repayment Schedule → الجدول الحقيقي (القسط الجاي، الباقي، المتأخر).
//   لو 403 → من GL Entry على حساب السلف (المصروف − المسدد) + قاعدة المرتب، ومن غير "متأخر" (مش معروف من غير الجدول).
// - Employee Advance / سلفة على حساب السلف / تسوية مرتب "سلفة": مفيش جدول → قاعدة المرتب زي ما هي:
//   الشهري بتتخصم من مرتب شهر تاريخها، واليومية من قبض السبت بعد أسبوعها.
// - A Loan: when the API user may read Loan and Loan Repayment Schedule → the real schedule (next, remaining, overdue).
//   On 403 → GL Entries on the advances account (disbursed − repaid) + the salary rule, never "overdue" (unknown).
// - Employee Advance / an advance on the advances account / a Salary Adjustment "سلفة": no schedule → the salary rule:
//   monthly staff from the salary of the month of its date, daily workers from the Saturday pay after its week.
import { dashboardConfig } from "@/config/dashboard.config";
import { ErpError, erpDocUrl, erpGet, erpPost, erpToday } from "./erp";
import { AdvanceDue } from "./types";

const config = dashboardConfig.salaries;
// (نسخة صغيرة هنا عشان مفيش import دايري مع attendance-details) - local copies to avoid an import cycle
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
function weekStartOf(date: string): string {
  const start = Math.max(0, WEEKDAYS.indexOf(config.dailyWeekStart));
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() - start + 7) % 7));
}
const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
const short = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}/${date.slice(0, 4)}`;
const monthEnd = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

async function getList<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", { doctype, limit_page_length: 0, ...body });
  return message;
}

// الـ DocTypes اللي اليوزر مالوش صلاحية عليها (عشان نقول للـ HR يدي أنهي صلاحية) - doctypes the API user may not read
// (بتتنسي كل 10 دقايق عشان لو الصلاحية اتدّت تشتغل من غير ريستارت) - forgotten every 10 min so a new permission works without a restart
export const blockedDoctypes = new Set<string>();
let blockedAt = 0;
const isDenied = (e: unknown) => {
  const denied = e instanceof ErpError && /HTTP 403|PermissionError/.test(e.message);
  if (denied) blockedAt = Date.now();
  return denied;
};
function forgetOldBlocks() {
  if (blockedDoctypes.size && Date.now() - blockedAt > 10 * 60_000) blockedDoctypes.clear();
}

async function getDocOrNull<T>(doctype: string, name: string): Promise<T | null> {
  try {
    return (await erpGet<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)).data;
  } catch (e) {
    if (isDenied(e)) {
      blockedDoctypes.add(doctype);
      return null;
    }
    throw e;
  }
}
async function listOrNull<T>(doctype: string, body: Record<string, unknown>): Promise<T[] | null> {
  try {
    return await getList<T>(doctype, body);
  } catch (e) {
    if (isDenied(e)) {
      blockedDoctypes.add(doctype);
      return null;
    }
    throw e;
  }
}

// ===== الموظف شهري ولا يومية (نفس قاعدة المرتبات) - monthly or daily worker (same rule as the salaries) =====
type EmployeePay = { name: string; employee_name: string | null; ctc: number | null } & Record<string, unknown>;
type Assignment = { employee: string; salary_structure: string; base: number | null; custom_allowance: number | null };
export async function payKinds(ids: string[]): Promise<Map<string, { daily: boolean; name: string }>> {
  const result = new Map<string, { daily: boolean; name: string }>();
  if (ids.length === 0) return result;
  const today = erpToday();
  const [employees, assignments] = await Promise.all([
    getList<EmployeePay>("Employee", { filters: [["name", "in", ids]], fields: ["name", "employee_name", "ctc", config.dailyRateField] }),
    listOrNull<Assignment>("Salary Structure Assignment", {
      filters: [["employee", "in", ids], ["docstatus", "=", 1], ["from_date", "<=", today]],
      fields: ["employee", "salary_structure", "base", "custom_allowance"],
      order_by: "from_date desc, creation desc",
    }),
  ]);
  const assignmentOf = new Map<string, Assignment>();
  for (const a of assignments ?? []) if (!assignmentOf.has(a.employee)) assignmentOf.set(a.employee, a);
  const dailyStructures = new Set(config.dailyStructures);
  for (const e of employees) {
    const a = assignmentOf.get(e.name);
    const structure = a ? money(a.base) + money(a.custom_allowance) : 0;
    const dailyStructure = !!a && dailyStructures.has(a.salary_structure);
    const hasMonthly = !dailyStructure && (structure > 0 || money(e.ctc) > 0);
    const dailyRate = money(e[config.dailyRateField]);
    result.set(e.name, { daily: !hasMonthly && (dailyRate > 0 || dailyStructure), name: (e.employee_name || e.name).trim() });
  }
  return result;
}

// قاعدة المرتب: بتتخصم إمتى - the salary rule: when it is deducted
function ruleDue(date: string, daily: boolean): { dueDate: string; text: string } {
  if (daily) {
    // أسبوع اليومية السبت → الجمعة، وبيتقبض السبت اللي بعده - the Saturday → Friday week, paid the next Saturday
    const payDay = addDays(weekStartOf(date), 7);
    return { dueDate: payDay, text: `بتتخصم من قبض أسبوعها — يوم السبت ${short(payDay)}` };
  }
  return { dueDate: monthEnd(date), text: `بتتخصم من مرتب شهر ${monthLabel(date)}` };
}

// ===== القروض - loans =====
type LoanDoc = {
  name: string;
  applicant: string;
  applicant_name: string | null;
  loan_amount: number | null;
  disbursed_amount: number | null;
  repayment_method: string | null;
  repayment_periods: number | null;
  monthly_repayment_amount: number | null;
  repayment_start_date: string | null;
  total_principal_paid: number | null;
  total_payment: number | null;
  status: string | null;
  disbursement_date: string | null;
};
type ScheduleRow = { payment_date: string; principal_amount: number | null; interest_amount: number | null; total_payment: number | null };

// القرض من جدوله (لو مسموح) - a loan from its schedule (when readable)
async function loanFromSchedule(loanName: string, today: string): Promise<Omit<AdvanceDue, "id" | "employee" | "employeeName"> | null> {
  const loan = await getDocOrNull<LoanDoc>("Loan", loanName);
  if (!loan) return null;
  const schedules = await listOrNull<{ name: string; status: string | null }>("Loan Repayment Schedule", {
    filters: [["loan", "=", loanName], ["docstatus", "=", 1]],
    fields: ["name", "status"],
    order_by: "creation desc",
  });
  if (!schedules || schedules.length === 0) return null;
  const active = schedules.find((s) => s.status === "Active") ?? schedules[0];
  const doc = await getDocOrNull<{ repayment_schedule: ScheduleRow[] }>("Loan Repayment Schedule", active.name);
  if (!doc) return null;
  // المدفوع: أصل القرض المسدد بيغطي الأقساط بالترتيب - paid principal covers the installments in order
  let paidLeft = money(loan.total_principal_paid);
  const schedule: AdvanceDue["schedule"] = (doc.repayment_schedule ?? [])
    .slice()
    .sort((a, b) => day(a.payment_date).localeCompare(day(b.payment_date)))
    .map((r) => {
      const principal = money(r.principal_amount);
      const paid = paidLeft + 0.01 >= principal && principal > 0;
      if (paid) paidLeft = money(paidLeft - principal);
      const date = day(r.payment_date);
      return { date, amount: money(r.total_payment ?? principal + money(r.interest_amount)), status: paid ? "paid" : date < today ? "overdue" : "pending" };
    });
  const open = schedule.filter((r) => r.status !== "paid");
  const next = open[0] ?? null;
  const overdue = open.filter((r) => r.status === "overdue");
  const remaining = money(open.reduce((s, r) => s + r.amount, 0));
  const date = day(loan.disbursement_date) || (schedule[0]?.date ?? today);
  return {
    kind: "loan",
    label: `قرض ${loanName}`,
    date,
    amount: money(loan.disbursed_amount || loan.loan_amount),
    source: "schedule",
    text: next ? `القسط الجاي: ${formatEgp(next.amount)} يوم ${short(next.date)}` : "القرض اتسدد كله ✓",
    dueDate: next?.date ?? null,
    dueAmount: next?.amount ?? null,
    left: open.length,
    remaining,
    monthly: money(loan.monthly_repayment_amount) || null,
    method: loan.repayment_method || null,
    periods: loan.repayment_periods || null,
    startDate: day(loan.repayment_start_date) || null,
    overdue: overdue.length > 0,
    overdueCount: overdue.length,
    overdueAmount: money(overdue.reduce((s, r) => s + r.amount, 0)),
    schedule,
    url: erpDocUrl("Loan", loanName),
    note: null,
  };
}

const formatEgp = (v: number) => `${new Intl.NumberFormat("en-US").format(Math.round(v * 100) / 100)} ج.م`;

// مرجع سلفة: قرض، Employee Advance، سلفة على حساب السلف، أو تسوية مرتب "سلفة" - an advance reference
export type AdvanceRef = {
  key: string;
  kind: AdvanceDue["kind"];
  employee: string;
  date: string;
  amount: number | null;
  loan?: string | null; // اسم القرض لو معروف - the loan name when known
  voucherType?: string;
  voucherNo?: string;
};

const PERMISSION_NOTE = "الجدول مش متاح (مفيش صلاحية قراية على Loan) — الميعاد من قاعدة المرتب";

// كل المراجع مرة واحدة (طلبات مجمعة) - all references at once (batched requests)
export async function advanceDues(refs: AdvanceRef[]): Promise<Map<string, AdvanceDue>> {
  const result = new Map<string, AdvanceDue>();
  if (refs.length === 0) return result;
  forgetOldBlocks();
  const today = erpToday();
  // Loan Disbursement من غير اسم القرض: من GL (against_voucher على حساب السلف) - the loan of a disbursement voucher, from GL
  const needLoan = refs.filter((r) => !r.loan && r.voucherType === "Loan Disbursement" && r.voucherNo);
  if (needLoan.length) {
    const rows = await getList<{ voucher_no: string; against_voucher: string | null }>("GL Entry", {
      filters: [["voucher_no", "in", Array.from(new Set(needLoan.map((r) => r.voucherNo!)))], ["account", "=", config.advancesAccount], ["is_cancelled", "=", 0]],
      fields: ["voucher_no", "against_voucher"],
    });
    const loanOf = new Map(rows.filter((r) => r.against_voucher).map((r) => [r.voucher_no, r.against_voucher as string]));
    for (const r of needLoan) r.loan = loanOf.get(r.voucherNo!) ?? null;
  }
  const kinds = await payKinds(Array.from(new Set(refs.map((r) => r.employee).filter(Boolean))));
  const loans = Array.from(new Set(refs.map((r) => r.loan).filter((x): x is string => !!x)));
  // المصروف والمسدد لكل قرض من GL (لو الجدول مش متاح) - disbursed and repaid per loan from GL (when there is no schedule)
  const gl = loans.length
    ? await getList<{ against_voucher: string; debit: number | null; credit: number | null; posting_date: string }>("GL Entry", {
        filters: [["account", "=", config.advancesAccount], ["against_voucher", "in", loans], ["is_cancelled", "=", 0]],
        fields: ["against_voucher", "debit", "credit", "posting_date"],
      })
    : [];
  const fromSchedule = new Map<string, Awaited<ReturnType<typeof loanFromSchedule>>>();
  for (const loan of loans) fromSchedule.set(loan, blockedDoctypes.has("Loan") ? null : await loanFromSchedule(loan, today));

  for (const ref of refs) {
    const who = kinds.get(ref.employee);
    const daily = who?.daily ?? false;
    const base = { id: ref.loan ?? ref.voucherNo ?? ref.key, employee: ref.employee, employeeName: who?.name ?? ref.employee };
    if (ref.loan) {
      const scheduled = fromSchedule.get(ref.loan);
      if (scheduled) {
        result.set(ref.key, { ...base, ...scheduled });
        continue;
      }
      const lines = gl.filter((g) => g.against_voucher === ref.loan);
      const disbursed = money(lines.reduce((s, g) => s + money(g.debit), 0));
      const repaid = money(lines.reduce((s, g) => s + money(g.credit), 0));
      const firstDate = lines.map((g) => day(g.posting_date)).sort()[0] ?? ref.date;
      const rule = ruleDue(firstDate, daily);
      const remaining = money(disbursed - repaid);
      // ميعاد الخصم عدّى ولسه عليها فلوس في ERPNext (مفيش Loan Repayment) = متأخرة
      // The deduction date passed and ERPNext still shows money owed (no Loan Repayment) = overdue
      const late = remaining > 0.01 && rule.dueDate < today;
      result.set(ref.key, {
        ...base,
        kind: "loan",
        label: `قرض ${ref.loan}`,
        date: firstDate,
        amount: disbursed || ref.amount,
        source: "rule",
        text:
          remaining <= 0
            ? "القرض اتسدد كله ✓"
            : late
              ? `⚠ متأخرة: كانت ${rule.text.replace("بتتخصم", "هتتخصم")} — لسه عليها ${formatEgp(remaining)} في ERPNext`
              : rule.text,
        dueDate: remaining <= 0 ? null : rule.dueDate,
        dueAmount: remaining > 0 ? remaining : null,
        left: null,
        remaining,
        monthly: null,
        method: null,
        periods: null,
        startDate: null,
        overdue: late,
        overdueCount: late ? 1 : 0,
        overdueAmount: late ? remaining : 0,
        schedule: [],
        url: erpDocUrl("Loan", ref.loan),
        note: PERMISSION_NOTE,
      });
      continue;
    }
    const rule = ruleDue(ref.date, daily);
    result.set(ref.key, {
      ...base,
      kind: ref.kind,
      label: ref.kind === "employee_advance" ? "Employee Advance" : ref.kind === "salary_adjustment" ? "سلفة (تسوية مرتب)" : "سلفة",
      date: ref.date,
      amount: ref.amount,
      source: "rule",
      text: rule.text,
      dueDate: rule.dueDate,
      dueAmount: ref.amount,
      left: null,
      remaining: null,
      monthly: null,
      method: null,
      periods: null,
      startDate: null,
      overdue: false,
      overdueCount: 0,
      overdueAmount: 0,
      schedule: [],
      url: ref.voucherType && ref.voucherNo ? erpDocUrl(ref.voucherType, ref.voucherNo) : null,
      note: null,
    });
  }
  return result;
}

// القروض المفتوحة لكل موظف (اللي لسه عليها فلوس، من GL على حساب السلف) - open loans per employee (from GL on the advances account)
export async function openLoans(ids: string[]): Promise<Map<string, AdvanceDue[]>> {
  const byEmployee = new Map<string, AdvanceDue[]>();
  if (ids.length === 0) return byEmployee;
  const rows = await getList<{ party: string; against_voucher: string | null; voucher_type: string; debit: number | null; credit: number | null; posting_date: string }>("GL Entry", {
    filters: [
      ["account", "=", config.advancesAccount],
      ["party_type", "=", "Employee"],
      ["party", "in", ids],
      ["voucher_type", "in", ["Loan Disbursement", "Loan Repayment"]],
      ["is_cancelled", "=", 0],
    ],
    fields: ["party", "against_voucher", "voucher_type", "debit", "credit", "posting_date"],
  });
  const balance = new Map<string, { employee: string; loan: string; left: number; date: string }>();
  for (const r of rows) {
    if (!r.against_voucher) continue;
    const key = `${r.party}|${r.against_voucher}`;
    const entry = balance.get(key) ?? { employee: r.party, loan: r.against_voucher, left: 0, date: day(r.posting_date) };
    entry.left = money(entry.left + money(r.debit) - money(r.credit));
    if (r.voucher_type === "Loan Disbursement" && day(r.posting_date) < entry.date) entry.date = day(r.posting_date);
    balance.set(key, entry);
  }
  const open = Array.from(balance.values()).filter((b) => b.left > 0.01);
  const dues = await advanceDues(open.map((b) => ({ key: `${b.employee}|${b.loan}`, kind: "loan", employee: b.employee, date: b.date, amount: null, loan: b.loan })));
  for (const b of open) {
    const due = dues.get(`${b.employee}|${b.loan}`);
    if (due && (due.remaining ?? 0) > 0) byEmployee.set(b.employee, [...(byEmployee.get(b.employee) ?? []), due]);
  }
  return byEmployee;
}

// صلاحيات ناقصة ورسالة للـ HR - missing permissions and the message for HR
export const PERMISSION_HELP =
  "اليوزر بتاع الداشبورد محتاج صلاحية قراية (Read بس) على: Loan، Loan Repayment Schedule، Loan Repayment، Loan Disbursement، Employee Advance. " +
  "أسهل طريقة: Role جديد (مثلا Dashboard Reader) فيه Read على الخمسة دول من Role Permissions Manager وتديه لليوزر — أو role \"Loan Manager\" (بس ده بيدي كتابة كمان).";
