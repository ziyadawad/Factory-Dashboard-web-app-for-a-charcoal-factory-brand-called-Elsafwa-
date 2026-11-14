// تفاصيل حدث من "اللي بيحصل دلوقتي": المستند كامل بيتجاب بس لما اللوحة تتفتح (قراية بس، كاش 30 ثانية)
// والرد متجهز كنصوص (خانات وجداول) فاللوحة بتعرضه زي ما هو. تسوية المرتب: مفيش أي مبلغ بيطلع من السيرفر
// An activity event's details: the full document is fetched only when the panel opens (read-only, 30 s cache).
// The answer is ready-made text (fields and tables) the panel shows as is. Salary adjustments: no amount ever
// leaves the server.

import { erpDocUrl, erpGet, erpPost } from "./erp";
import { fullNames, shortAccount } from "./account-details";
import { packetsOf, productOfItem } from "./sales";
import { ActivityDetails, ActivityDetailsTable } from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

type Doc = Record<string, unknown> & { name: string; owner?: string; creation?: string };
type Row = Record<string, unknown>;

const CACHE_MS = 30_000;
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const n = (value: unknown) => num.format(Number(value) || 0);
const egp = (value: unknown) => `${n(value)} ج.م`;
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const stamp = (value: unknown) => str(value).slice(0, 19);

// المستندات اللي ممكن تتفتح من الأحداث - the documents an event may open
const MONEY_DOCTYPES = new Set([
  "Payment Entry",
  "Journal Entry",
  "Purchase Invoice",
  "Expense Claim",
  "Employee Advance",
  "Loan Disbursement",
  "Loan Repayment",
  "Salary Slip",
  "Payroll Entry",
  "Purchase Receipt",
]);
export const DETAIL_DOCTYPES = new Set([
  ...Array.from(MONEY_DOCTYPES),
  "Sales Invoice",
  "Stock Entry",
  "Salary Adjustment",
  dashboardConfig.erp.batches.source === "erp" ? dashboardConfig.erp.batches.exitsDoctype : "Kiln Exit",
  dashboardConfig.erp.charity.doctype,
]);

async function getList<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", { doctype, limit_page_length: 0, ...body });
  return message;
}

// المستند كامل (بالجداول اللي جواه)، ولو مفيش صلاحية null - the full document (with its child tables); null without permission
async function getDoc(doctype: string, name: string): Promise<Doc | null> {
  try {
    const { data } = await erpGet<{ data: Doc }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/HTTP 403/.test(message)) return null;
    throw error;
  }
}

async function employeeNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await getList<{ name: string; employee_name: string | null }>("Employee", {
    filters: [["name", "in", ids]],
    fields: ["name", "employee_name"],
  }).catch(() => []);
  return new Map(rows.map((r) => [r.name, (r.employee_name || r.name).trim()]));
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

type Body = { postingDate: string | null; postingTime: string | null; fields: ActivityDetails["fields"]; tables: ActivityDetailsTable[] };
type Header = { owner: string; creation: string };

// ===== وارد / منصرف: القيد من GL Entry (دايما متاح) + بيانات المستند لو متاحة =====
// Money moves: the voucher's GL lines (always readable) + the document's own data when readable
type GlLine = { account: string; party_type: string | null; party: string | null; debit: number | null; credit: number | null; posting_date: string; creation: string; owner: string; remarks: string | null };

async function moneyBody(doctype: string, name: string, doc: Doc | null): Promise<Body & Partial<Header>> {
  const lines = await getList<GlLine>("GL Entry", {
    filters: [
      ["voucher_type", "=", doctype],
      ["voucher_no", "=", name],
      ["is_cancelled", "=", 0],
    ],
    fields: ["account", "party_type", "party", "debit", "credit", "posting_date", "creation", "owner", "remarks"],
    order_by: "debit desc",
  });
  const employees = await employeeNames(Array.from(new Set(lines.filter((l) => l.party_type === "Employee" && l.party).map((l) => l.party as string))));
  const partyText = (l: GlLine) => (l.party ? (l.party_type === "Employee" ? employees.get(l.party) ?? l.party : l.party) : "");
  const from = Array.from(new Set(lines.filter((l) => Number(l.credit) > 0).map((l) => shortAccount(l.account))));
  const to = Array.from(new Set(lines.filter((l) => Number(l.debit) > 0).map((l) => shortAccount(l.account))));
  const total = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const parties = Array.from(new Set(lines.map(partyText).filter(Boolean)));
  const first = lines[0];

  const fields: ActivityDetails["fields"] = [
    { label: "من حساب", value: from.join("، ") || "—", tone: "out" },
    { label: "إلى حساب", value: to.join("، ") || "—", tone: "in" },
    { label: "المبلغ", value: egp(doc?.paid_amount ?? doc?.total_debit ?? total), tone: "accent" },
  ];
  if (parties.length) fields.push({ label: "الطرف / الموظف", value: parties.join("، ") });
  if (doc?.party_name && !parties.includes(str(doc.party_name))) fields.push({ label: "الطرف", value: str(doc.party_name) });
  if (doc?.pay_to_recd_from) fields.push({ label: "اتدفع لـ / استلم من", value: str(doc.pay_to_recd_from) });
  if (doc?.mode_of_payment) fields.push({ label: "طريقة الدفع", value: str(doc.mode_of_payment) });
  const reference = str(doc?.reference_no) || str(doc?.cheque_no);
  if (reference) fields.push({ label: "رقم المرجع", value: `${reference}${doc?.reference_date || doc?.cheque_date ? ` (${str(doc?.reference_date || doc?.cheque_date)})` : ""}` });
  const remarks = str(doc?.user_remark) || str(doc?.remarks) || str(doc?.remark) || str(first?.remarks);
  if (remarks) fields.push({ label: "البيان", value: remarks });

  const tables: ActivityDetailsTable[] = [
    {
      title: "القيد",
      columns: [{ label: "الحساب" }, { label: "الطرف" }, { label: "مدين", num: true }, { label: "دائن", num: true }],
      rows: lines.map((l) => [shortAccount(l.account), partyText(l) || "—", Number(l.debit) ? n(l.debit) : "", Number(l.credit) ? n(l.credit) : ""]),
    },
  ];
  // المربوط بيه: فواتير / سلف - linked invoices / advances
  const links: string[][] = [];
  for (const r of (doc?.references as Row[] | undefined) ?? []) {
    links.push([str(r.reference_doctype), str(r.reference_name), n(r.total_amount), n(r.allocated_amount), n(r.outstanding_amount)]);
  }
  for (const r of (doc?.accounts as Row[] | undefined) ?? []) {
    if (r.reference_type && r.reference_name) links.push([str(r.reference_type), str(r.reference_name), "", n(Number(r.debit) || Number(r.credit)), ""]);
  }
  if (links.length) {
    tables.push({
      title: "مربوطة بـ",
      columns: [{ label: "النوع" }, { label: "المستند" }, { label: "الإجمالي", num: true }, { label: "المخصوم منها", num: true }, { label: "الباقي", num: true }],
      rows: links,
    });
  }
  return {
    postingDate: str(doc?.posting_date) || str(first?.posting_date) || null,
    postingTime: null,
    fields,
    tables,
    ...(doc ? {} : first ? { owner: first.owner, creation: first.creation } : {}),
  };
}

// ===== فاتورة بيع / مرتجع - sales invoice / return =====
async function invoiceBody(doc: Doc): Promise<Body> {
  const items = (doc.items as Row[] | undefined) ?? [];
  const repOf = new Map(dashboardConfig.sales.reps.map((r) => [r.warehouse, r]));
  const warehouses = Array.from(new Set(items.map((i) => str(i.warehouse)).filter(Boolean)));
  const rep = warehouses.map((w) => repOf.get(w)).find(Boolean);
  const packaged = productOfItem();
  let packets = 0;
  const rows = items.map((i) => {
    if (packaged.has(str(i.item_code))) packets += Math.abs(packetsOf(str(i.item_code), Number(i.stock_qty) || 0));
    return [str(i.item_name) || str(i.item_code), n(i.qty), str(i.uom), n(i.rate), n(i.amount)];
  });
  const customer = str(doc.customer);
  // مديونية العميل دلوقتي = الباقي في كل فواتيره المعتمدة - the customer's debt now = outstanding on all submitted invoices
  const debt = await getList<{ total: number | null }>("Sales Invoice", {
    filters: [
      ["customer", "=", customer],
      ["docstatus", "=", 1],
    ],
    fields: ["sum(outstanding_amount) as total"],
  }).catch(() => null);
  const isReturn = Number(doc.is_return) === 1;
  const grand = Number(doc.grand_total) || 0;
  const outstanding = Number(doc.outstanding_amount) || 0;
  const fields: ActivityDetails["fields"] = [
    { label: "العميل", value: str(doc.customer_name) || customer },
    { label: "المندوب / العربية", value: rep ? `${rep.name} — ${rep.van}` : "—" },
    { label: "المخزن", value: warehouses.join("، ") || str(doc.set_warehouse) || "—" },
    { label: isReturn ? "إجمالي المرتجع" : "الإجمالي", value: egp(grand), tone: "accent" },
    { label: "المدفوع", value: egp(Number(doc.paid_amount) || Math.max(0, grand - outstanding)), tone: "in" },
    { label: "الباقي على الفاتورة", value: egp(outstanding), tone: outstanding > 0 ? "out" : undefined },
  ];
  if (debt?.[0]) fields.push({ label: "مديونية العميل دلوقتي", value: egp(debt[0].total), tone: "out" });
  if (isReturn && doc.return_against) fields.push({ label: "مرتجع من فاتورة", value: str(doc.return_against) });
  if (doc.remarks && !["No Remarks", "لا ملاحظات"].includes(str(doc.remarks))) fields.push({ label: "ملاحظات", value: str(doc.remarks) });
  return {
    postingDate: str(doc.posting_date) || null,
    postingTime: str(doc.posting_time).slice(0, 5) || null,
    fields,
    tables: [
      {
        title: "الأصناف",
        columns: [{ label: "الصنف" }, { label: "الكمية", num: true }, { label: "الوحدة" }, { label: "السعر", num: true }, { label: "القيمة", num: true }],
        rows,
        footer: [`الإجمالي${packets > 0 ? ` — ${n(Math.round(packets))} باكت` : ""}`, n(items.reduce((s, i) => s + (Number(i.qty) || 0), 0)), "", "", n(doc.net_total ?? doc.total)],
      },
    ],
  };
}

// ===== أذون المخزن - stock entries =====
const PURPOSES: Record<string, string> = {
  "Material Issue": "إذن صرف",
  "Material Receipt": "إذن إضافة",
  "Material Transfer": "تحويل مخزني",
  "Material Transfer for Manufacture": "صرف للتصنيع",
  "Material Consumption for Manufacture": "استهلاك تصنيع",
  Manufacture: "تصنيع",
  Repack: "إعادة تعبئة",
  "Send to Subcontractor": "صرف لمقاول",
};
const shortWarehouse = (w: unknown) => str(w).replace(/\s*-\s*AC$/, "");

function stockBody(doc: Doc): Body {
  const items = (doc.items as Row[] | undefined) ?? [];
  const purpose = str(doc.purpose);
  const fields: ActivityDetails["fields"] = [
    { label: "النوع", value: `${PURPOSES[purpose] ?? purpose}${doc.stock_entry_type && doc.stock_entry_type !== purpose ? ` (${str(doc.stock_entry_type)})` : ""}`, tone: "accent" },
    { label: "من مخزن", value: shortWarehouse(doc.from_warehouse) || "—", tone: "out" },
    { label: "إلى مخزن", value: shortWarehouse(doc.to_warehouse) || "—", tone: "in" },
  ];
  if (doc.work_order) fields.push({ label: "أمر الشغل", value: str(doc.work_order) });
  if (doc.fg_completed_qty) fields.push({ label: "كمية الإنتاج", value: n(doc.fg_completed_qty) });
  if (doc.remarks) fields.push({ label: "ملاحظات", value: str(doc.remarks) });
  const row = (i: Row, warehouse: unknown) => [str(i.item_name) || str(i.item_code), n(i.qty), str(i.uom), shortWarehouse(warehouse) || "—"];
  const columns = (where: string) => [{ label: "الصنف" }, { label: "الكمية", num: true }, { label: "الوحدة" }, { label: where }];
  const manufacture = purpose === "Manufacture" || purpose === "Repack";
  const tables: ActivityDetailsTable[] = manufacture
    ? [
        { title: "اتصرف (مستهلك)", columns: columns("من مخزن"), rows: items.filter((i) => i.s_warehouse).map((i) => row(i, i.s_warehouse)) },
        {
          title: "اتنتج",
          columns: columns("إلى مخزن"),
          rows: items.filter((i) => !i.s_warehouse && i.t_warehouse).map((i) => {
            const r = row(i, i.t_warehouse);
            if (Number(i.is_scrap_item) === 1) r[0] += " (هالك)";
            return r;
          }),
        },
      ]
    : [
        {
          title: "الأصناف",
          columns: [{ label: "الصنف" }, { label: "الكمية", num: true }, { label: "الوحدة" }, { label: "من" }, { label: "إلى" }],
          rows: items.map((i) => [str(i.item_name) || str(i.item_code), n(i.qty), str(i.uom), shortWarehouse(i.s_warehouse) || "—", shortWarehouse(i.t_warehouse) || "—"]),
        },
      ];
  return { postingDate: str(doc.posting_date) || null, postingTime: str(doc.posting_time).slice(0, 5) || null, fields, tables };
}

// ===== طرحة - kiln exit =====
function kilnBody(doc: Doc): Body {
  const mapping = dashboardConfig.erp.batches;
  const typeField = mapping.source === "erp" ? mapping.typeField : "charcoal_type";
  const weightField = mapping.source === "erp" ? mapping.weightField : "weight_kg";
  const kg = Number(doc[weightField]);
  const exit = stamp(doc.exit_time);
  return {
    postingDate: exit.slice(0, 10) || null,
    postingTime: exit.slice(11, 16) || null,
    fields: [
      { label: "الفرن", value: str(doc.kiln) || "—", tone: "accent" },
      { label: "النوع", value: str(doc[typeField]) || "غير محدد" },
      { label: "الوزن", value: Number.isFinite(kg) && kg > 0 ? `${n(kg)} كجم (${(kg / 1000).toFixed(2)} طن)` : "بدون وزن" },
      { label: "وقت الخروج", value: exit || "—" },
    ],
    tables: [],
  };
}

// ===== الصدقات: والرصيد بعد العملية - charity, with the fund balance after it =====
async function charityBody(doc: Doc): Promise<Body> {
  const rows = await getList<{ name: string | number; txn_type: string | null; amount: number | null; txn_date: string; creation: string }>(
    dashboardConfig.erp.charity.doctype,
    { filters: [["fund", "=", str(doc.fund)]], fields: ["name", "txn_type", "amount", "txn_date", "creation"], order_by: "txn_date asc, creation asc" }
  );
  let balance = 0;
  let after: number | null = null;
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    const type = str(r.txn_type);
    balance += type === "صرف" ? -amount : type === "إيداع" || type === "رصيد افتتاحي" ? amount : 0;
    if (String(r.name) === String(doc.name)) after = balance;
  }
  const out = str(doc.txn_type) === "صرف";
  const fields: ActivityDetails["fields"] = [
    { label: "الصندوق", value: str(doc.fund) || "—" },
    { label: "النوع", value: str(doc.txn_type) || "—", tone: out ? "out" : "in" },
    { label: "المبلغ", value: egp(doc.amount), tone: "accent" },
  ];
  if (doc.beneficiary) fields.push({ label: out ? "اتصرفت لـ" : "من", value: str(doc.beneficiary) });
  if (doc.details) fields.push({ label: "التفاصيل", value: str(doc.details) });
  if (after !== null) fields.push({ label: "رصيد الصندوق بعدها", value: egp(after), tone: "accent" });
  return { postingDate: str(doc.txn_date) || null, postingTime: null, fields, tables: [] };
}

// ===== تسوية مرتب: خانات معروفة بس، ومفيش أي مبلغ أو سعر (المرتبات سرية) =====
// Salary adjustment: known fields only, never an amount or a rate (salaries stay private)
const SALARY_TEXT_FIELDS: [string, string][] = [
  ["deduction_type", "نوع الخصم"],
  ["hours", "عدد الساعات"],
  ["days", "عدد الأيام"],
  ["reason", "السبب"],
  ["remarks", "ملاحظات"],
  ["notes", "ملاحظات"],
  ["description", "الوصف"],
];
async function salaryBody(doc: Doc): Promise<Body> {
  const id = str(doc.employee);
  const name = str(doc.employee_name) || (await employeeNames([id])).get(id) || id;
  const fields: ActivityDetails["fields"] = [
    { label: "الموظف", value: name, tone: "accent" },
    { label: "النوع", value: str(doc.adjustment_type) || "—" },
    { label: "التاريخ", value: str(doc.date) || "—" },
  ];
  for (const [key, label] of SALARY_TEXT_FIELDS) if (str(doc[key]) && str(doc[key]) !== "0") fields.push({ label, value: str(doc[key]) });
  fields.push({ label: "المبلغ", value: "سري — مش بيظهر على الشاشة" });
  return { postingDate: str(doc.date) || null, postingTime: null, fields, tables: [] };
}

export class UnknownDocError extends Error {}

async function load(doctype: string, name: string): Promise<ActivityDetails> {
  const doc = await getDoc(doctype, name);
  if (!doc && !MONEY_DOCTYPES.has(doctype)) throw new UnknownDocError(`${doctype} ${name} not readable`);
  const kiln = dashboardConfig.erp.batches.source === "erp" ? dashboardConfig.erp.batches.exitsDoctype : "Kiln Exit";
  const body: Body & Partial<Header> =
    doctype === "Sales Invoice" && doc
      ? await invoiceBody(doc)
      : doctype === "Stock Entry" && doc
        ? stockBody(doc)
        : doctype === kiln && doc
          ? kilnBody(doc)
          : doctype === dashboardConfig.erp.charity.doctype && doc
            ? await charityBody(doc)
            : doctype === "Salary Adjustment" && doc
              ? await salaryBody(doc)
              : await moneyBody(doctype, name, doc);
  const owner = str(doc?.owner ?? body.owner);
  const creation = stamp(doc?.creation ?? body.creation);
  const names = await fullNames(owner ? [owner] : []);
  return {
    doctype,
    name,
    postingDate: body.postingDate,
    postingTime: body.postingTime,
    owner: names.get(owner) ?? owner,
    creation,
    lateDays: body.postingDate && creation ? Math.max(0, dayDiff(body.postingDate, creation)) : 0,
    erpUrl: erpDocUrl(doctype, name),
    fields: body.fields,
    tables: body.tables,
  };
}

const cache = new Map<string, { at: number; data: ActivityDetails }>();
const pending = new Map<string, Promise<ActivityDetails>>();

export async function activityDetails(doctype: string, name: string): Promise<ActivityDetails> {
  const key = `${doctype}|${name}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  let job = pending.get(key);
  if (!job) {
    job = load(doctype, name)
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        if (cache.size > 200) cache.delete(cache.keys().next().value as string);
        return data;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}
