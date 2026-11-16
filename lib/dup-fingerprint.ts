// مقارنة صارمة لمستندين قبل ما نقول إنهم مكررين: كل الخانات المهمة + كل سطور الجداول (بعد توحيد الكتابة)
// A strict comparison of two documents before calling them duplicates: every key field + every child row (normalized)
// نفس القواعد في سكريبتات ERPNext (reports/erpnext-scripts) - the same rules as the ERPNext client scripts

type Doc = Record<string, unknown>;
export type FieldSpec = [label: string, key: string];
export interface DocSpec {
  fields: FieldSpec[];
  rows?: { label: string; table: string; cols: string[] };
}

// الأرقام بتتقارن بعد تقريب 3 أرقام عشرية، والتواريخ أول 10 حروف - numbers rounded to 3 decimals, dates to 10 chars
const NUMERIC = new Set([
  "paid_amount", "total_debit", "grand_total", "total_claimed_amount", "amount", "hours", "hour_rate", "days", "total_amount", "monthly_installment",
  "qty", "rate", "allocated_amount", "debit_in_account_currency", "credit_in_account_currency", "weight_kg", "is_return",
]);
const DATES = new Set(["posting_date", "reference_date", "cheque_date", "bill_date", "txn_date", "date", "expense_date"]);
// ملاحظات فاضية بيكتبها ERPNext لوحده - empty remarks ERPNext fills in by itself
const EMPTY_REMARKS = new Set(["no remarks", "لا ملاحظات", "لا توجد ملاحظات"]);

// توحيد الكتابة: مسافات، حروف عربي (أ إ آ ← ا، ة ← ه، ى ← ي، تشكيل)، أرقام هندي ← عربي، HTML - normalize text
export function normalizeText(value: unknown): string {
  let s = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (EMPTY_REMARKS.has(s)) s = "";
  return s;
}

export function normalizeValue(key: string, value: unknown): string {
  if (NUMERIC.has(key)) return String(Math.round((Number(value) || 0) * 1000) / 1000);
  if (DATES.has(key)) return String(value ?? "").slice(0, 10);
  return normalizeText(value);
}

// نص للعرض (من غير توحيد) - a display string (not normalized)
const display = (value: unknown) => {
  const s = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return s === "" || s === "0" ? "—" : s;
};

export const SPECS: Record<string, DocSpec> = {
  "Payment Entry": {
    fields: [
      ["النوع", "payment_type"], ["الطرف", "party"], ["المبلغ", "paid_amount"], ["التاريخ", "posting_date"], ["طريقة الدفع", "mode_of_payment"],
      ["من حساب", "paid_from"], ["إلى حساب", "paid_to"], ["رقم المرجع", "reference_no"], ["تاريخ المرجع", "reference_date"], ["البيان", "remarks"],
    ],
    rows: { label: "مربوطة بـ", table: "references", cols: ["reference_doctype", "reference_name", "allocated_amount"] },
  },
  "Journal Entry": {
    fields: [
      ["نوع القيد", "voucher_type"], ["التاريخ", "posting_date"], ["الإجمالي", "total_debit"], ["البيان", "user_remark"], ["رقم الشيك / المرجع", "cheque_no"], ["تاريخ المرجع", "cheque_date"],
    ],
    rows: { label: "سطور القيد", table: "accounts", cols: ["account", "party", "debit_in_account_currency", "credit_in_account_currency", "user_remark"] },
  },
  "Sales Invoice": {
    fields: [["العميل", "customer"], ["التاريخ", "posting_date"], ["مرتجع", "is_return"], ["الإجمالي", "grand_total"], ["البيان", "remarks"]],
    rows: { label: "الأصناف", table: "items", cols: ["item_code", "qty", "rate", "warehouse", "description"] },
  },
  "Purchase Invoice": {
    fields: [
      ["المورد", "supplier"], ["رقم فاتورة المورد", "bill_no"], ["تاريخ فاتورة المورد", "bill_date"], ["التاريخ", "posting_date"], ["مرتجع", "is_return"],
      ["الإجمالي", "grand_total"], ["البيان", "remarks"],
    ],
    rows: { label: "الأصناف", table: "items", cols: ["item_code", "qty", "rate", "warehouse", "description"] },
  },
  "Stock Entry": {
    fields: [["نوع الإذن", "stock_entry_type"], ["التاريخ", "posting_date"], ["البيان", "remarks"]],
    rows: { label: "الأصناف", table: "items", cols: ["item_code", "qty", "s_warehouse", "t_warehouse", "batch_no"] },
  },
  "Expense Claim": {
    fields: [["الموظف", "employee"], ["التاريخ", "posting_date"], ["الإجمالي", "total_claimed_amount"], ["البيان", "remark"]],
    rows: { label: "البنود", table: "expenses", cols: ["expense_date", "expense_type", "amount", "description"] },
  },
  "Charity Transaction": {
    fields: [["الخزينة", "fund"], ["النوع", "txn_type"], ["المبلغ", "amount"], ["التاريخ", "txn_date"], ["لمين", "beneficiary"], ["التفاصيل", "details"]],
  },
  "Kiln Exit": {
    fields: [["الفرن", "kiln"], ["النوع", "charcoal_type"], ["الوزن", "weight_kg"]],
  },
  // تسوية المرتب: المبلغ بيتقارن بس عمره ما بيظهر - the amount is compared but never displayed
  "Salary Adjustment": {
    fields: [
      ["الموظف", "employee"], ["النوع", "adjustment_type"], ["التاريخ", "date"], ["المبلغ", "amount"], ["الساعات", "hours"], ["سعر الساعة", "hour_rate"],
      ["نوع الخصم", "deduction_type"], ["الأيام", "days"], ["السبب", "reason"], ["إجمالي القسط", "total_amount"], ["القسط الشهري", "monthly_installment"],
    ],
  },
};
// خانات مش بتظهر (سرية) - fields never displayed (private)
const HIDDEN: Record<string, Set<string>> = { "Salary Adjustment": new Set(["amount", "hour_rate", "total_amount", "monthly_installment"]) };

function rowsOf(spec: DocSpec, doc: Doc): string[] {
  if (!spec.rows) return [];
  const rows = (doc[spec.rows.table] as Doc[] | undefined) ?? [];
  return rows.map((r) => spec.rows!.cols.map((c) => normalizeValue(c, r[c])).join("|")).sort();
}

// البصمة: لو بصمتين زي بعض بالظبط يبقوا مكررين أكيد - the fingerprint: identical fingerprints = sure duplicates
export function fingerprint(doctype: string, doc: Doc): string {
  const spec = SPECS[doctype];
  if (!spec) return "";
  return JSON.stringify([spec.fields.map(([, k]) => normalizeValue(k, doc[k])), rowsOf(spec, doc)]);
}

// الخانات المختلفة بين مستندين (أول حاجة بتفرق) - the differing fields between two documents
export function differences(doctype: string, a: Doc, b: Doc): string[] {
  const spec = SPECS[doctype];
  if (!spec) return [];
  const out = spec.fields.filter(([, k]) => normalizeValue(k, a[k]) !== normalizeValue(k, b[k])).map(([label]) => label);
  if (spec.rows) {
    const ra = rowsOf(spec, a);
    const rb = rowsOf(spec, b);
    if (ra.join("\n") !== rb.join("\n")) {
      // أنهي عمود بيفرق في السطور - which column differs in the rows
      const cols = spec.rows.cols.filter((c, i) => ra.map((r) => r.split("|")[i]).join() !== rb.map((r) => r.split("|")[i]).join());
      out.push(`${spec.rows.label}${ra.length !== rb.length ? ` (عدد السطور ${ra.length} / ${rb.length})` : cols.length ? ` (${cols.join("، ")})` : ""}`);
    }
  }
  return out;
}

// للعرض جنب بعض - for the side-by-side view
export function compareView(doctype: string, doc: Doc): { fields: [string, string][]; rows: string[] } {
  const spec = SPECS[doctype];
  if (!spec) return { fields: [], rows: [] };
  const hidden = HIDDEN[doctype] ?? new Set<string>();
  return {
    fields: spec.fields.filter(([, k]) => !hidden.has(k)).map(([label, k]) => [label, display(doc[k])]),
    rows: spec.rows
      ? ((doc[spec.rows.table] as Doc[] | undefined) ?? []).map((r) => spec.rows!.cols.map((c) => display(r[c])).filter((v) => v !== "—").join(" · "))
      : [],
  };
}
