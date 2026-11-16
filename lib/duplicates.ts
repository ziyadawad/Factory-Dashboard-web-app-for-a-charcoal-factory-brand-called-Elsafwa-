// فحص العمليات المكررة الموجودة فعلا في ERPNext (قراية بس، آخر 60 يوم)، بنفس قواعد سكريبتات منع التكرار
// Suspected duplicates already in ERPNext (read-only, last 60 days), same rules as the duplicate-guard client scripts
// money = الخزنة (سندات، قيود، فواتير، مطالبات، صدقات، تسويات مرتب)، stock = المخازن (أذون، فواتير مبيعات، طرحات)
import { dashboardConfig } from "@/config/dashboard.config";
import { erpDocUrl, erpPost, erpToday } from "./erp";
import { fullNames } from "./account-details";
import { doctypeInfo } from "./production";
import { DuplicatesReport, SuspectedDuplicate } from "./types";

const DAYS = 60;
const CACHE_MS = 60_000;
const KILN_WINDOW_MS = 10 * 60_000;

type Row = Record<string, string | number | null> & { name: string; owner: string; creation: string; docstatus: number };

async function getList(doctype: string, body: Record<string, unknown>): Promise<Row[]> {
  const { message } = await erpPost<{ message: Row[] }>("/api/method/frappe.client.get_list", { doctype, limit_page_length: 0, ...body });
  return message;
}

const num = (v: unknown, digits = 2) => Math.round((Number(v) || 0) * 10 ** digits) / 10 ** digits;
const str = (v: unknown) => String(v ?? "").trim();
const day = (v: unknown) => str(v).slice(0, 10);
const BASE = ["name", "owner", "creation", "docstatus"];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// صفوف فيها سطر لكل صنف ← مستند واحد بتوقيع أصنافه المترتب - one row per child line -> one doc with a sorted signature
function byParent(rows: Row[], childFields: string[]): { doc: Row; lines: string[] }[] {
  const docs = new Map<string, { doc: Row; lines: string[] }>();
  for (const r of rows) {
    const entry = docs.get(r.name) ?? { doc: r, lines: [] };
    entry.lines.push(childFields.map((f) => (f === "qty" ? String(num(r[f], 3)) : str(r[f]))).join("|"));
    docs.set(r.name, entry);
  }
  return Array.from(docs.values()).map((e) => ({ ...e, lines: e.lines.sort() }));
}

type Candidate = { key: string; doc: Row; date: string; amount: number | null; summary: string };
type Rule = { doctype: string; label: string; rule: string; scopes: ("money" | "stock")[]; load: (from: string) => Promise<Candidate[]> };

// تجميع بالمفتاح: أي مفتاح فيه أكتر من مستند = مكرر - group by key: any key with 2+ docs is a duplicate
function groupsOf(cands: Candidate[]): Candidate[][] {
  const groups = new Map<string, Candidate[]>();
  for (const c of cands) groups.set(c.key, [...(groups.get(c.key) ?? []), c]);
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

const RULES: Rule[] = [
  {
    doctype: "Payment Entry",
    label: "سند دفع / قبض",
    rule: "نفس النوع + الطرف + المبلغ + التاريخ + طريقة الدفع",
    scopes: ["money"],
    load: async (from) => {
      const rows = await getList("Payment Entry", {
        filters: [["docstatus", "!=", 2], ["posting_date", ">=", from]],
        fields: [...BASE, "payment_type", "party", "paid_amount", "posting_date", "mode_of_payment"],
      });
      return rows.map((r) => ({
        key: [r.payment_type, str(r.party), num(r.paid_amount), day(r.posting_date), str(r.mode_of_payment)].join("¦"),
        doc: r, date: day(r.posting_date), amount: num(r.paid_amount),
        summary: [r.payment_type === "Pay" ? "دفع" : r.payment_type === "Receive" ? "قبض" : str(r.payment_type), str(r.party), str(r.mode_of_payment)].filter(Boolean).join(" · "),
      }));
    },
  },
  {
    doctype: "Journal Entry",
    label: "قيد يومية",
    rule: "نفس التاريخ + نوع القيد + إجمالي المدين + نفس الحسابات",
    scopes: ["money"],
    load: async (from) => {
      const child = "`tabJournal Entry Account`";
      const rows = await getList("Journal Entry", {
        filters: [["docstatus", "!=", 2], ["posting_date", ">=", from]],
        fields: [...BASE, "posting_date", "voucher_type", "total_debit", `${child}.account as account`],
      });
      return byParent(rows, ["account"]).map(({ doc, lines }) => {
        const accounts = Array.from(new Set(lines));
        return {
          key: [day(doc.posting_date), str(doc.voucher_type), num(doc.total_debit), accounts.join("+")].join("¦"),
          doc, date: day(doc.posting_date), amount: num(doc.total_debit),
          summary: accounts.map((a) => a.replace(/\s+-\s+[^-]+$/, "")).join(" ↔ "),
        };
      });
    },
  },
  {
    doctype: "Sales Invoice",
    label: "فاتورة مبيعات",
    rule: "نفس العميل + التاريخ + الإجمالي + نفس الأصناف والكميات",
    scopes: ["money", "stock"],
    load: async (from) => {
      const child = "`tabSales Invoice Item`";
      const rows = await getList("Sales Invoice", {
        filters: [["docstatus", "!=", 2], ["posting_date", ">=", from]],
        fields: [...BASE, "customer", "posting_date", "grand_total", "is_return", `${child}.item_code as item_code`, `${child}.qty as qty`, `${child}.warehouse as warehouse`],
      });
      return byParent(rows, ["item_code", "qty", "warehouse"]).map(({ doc, lines }) => ({
        key: [str(doc.customer), day(doc.posting_date), num(doc.grand_total), Number(doc.is_return) ? 1 : 0, lines.join("+")].join("¦"),
        doc, date: day(doc.posting_date), amount: num(doc.grand_total),
        summary: `${str(doc.customer)}${Number(doc.is_return) ? " (مرتجع)" : ""} · ${lines.length} صنف`,
      }));
    },
  },
  {
    doctype: "Purchase Invoice",
    label: "فاتورة مشتريات",
    rule: "نفس المورد + رقم فاتورة المورد (أو التاريخ + الإجمالي لو مش مكتوب)",
    scopes: ["money"],
    load: async (from) => {
      const rows = await getList("Purchase Invoice", {
        filters: [["docstatus", "!=", 2], ["posting_date", ">=", from]],
        fields: [...BASE, "supplier", "bill_no", "posting_date", "grand_total", "is_return"],
      });
      return rows.map((r) => {
        const bill = str(r.bill_no);
        return {
          key: [str(r.supplier), Number(r.is_return) ? 1 : 0, bill ? `bill:${bill}` : `${day(r.posting_date)}|${num(r.grand_total)}`].join("¦"),
          doc: r, date: day(r.posting_date), amount: num(r.grand_total),
          summary: `${str(r.supplier)}${bill ? ` · فاتورة المورد ${bill}` : ""}`,
        };
      });
    },
  },
  {
    doctype: "Stock Entry",
    label: "إذن مخزن",
    rule: "نفس نوع الإذن + التاريخ + نفس الأصناف (الصنف + الكمية + من / لمخزن)",
    scopes: ["stock"],
    load: async (from) => {
      const child = "`tabStock Entry Detail`";
      const rows = await getList("Stock Entry", {
        filters: [["docstatus", "!=", 2], ["posting_date", ">=", from]],
        fields: [...BASE, "stock_entry_type", "posting_date", `${child}.item_code as item_code`, `${child}.qty as qty`, `${child}.s_warehouse as s_warehouse`, `${child}.t_warehouse as t_warehouse`],
      });
      return byParent(rows, ["item_code", "qty", "s_warehouse", "t_warehouse"]).map(({ doc, lines }) => ({
        key: [str(doc.stock_entry_type), day(doc.posting_date), lines.join("+")].join("¦"),
        doc, date: day(doc.posting_date), amount: null,
        summary: `${str(doc.stock_entry_type)} · ${lines.map((l) => { const [item, qty] = l.split("|"); return `${item} × ${qty}`; }).slice(0, 3).join("، ")}${lines.length > 3 ? ` (+${lines.length - 3})` : ""}`,
      }));
    },
  },
  {
    doctype: "Expense Claim",
    label: "مطالبة مصروفات",
    rule: "نفس الموظف + التاريخ + إجمالي المطالبة",
    scopes: ["money"],
    load: async (from) => {
      const rows = await getList("Expense Claim", {
        filters: [["docstatus", "!=", 2], ["posting_date", ">=", from]],
        fields: [...BASE, "employee", "employee_name", "posting_date", "total_claimed_amount"],
      });
      return rows.map((r) => ({
        key: [str(r.employee), day(r.posting_date), num(r.total_claimed_amount)].join("¦"),
        doc: r, date: day(r.posting_date), amount: num(r.total_claimed_amount), summary: str(r.employee_name) || str(r.employee),
      }));
    },
  },
  {
    doctype: dashboardConfig.erp.charity.doctype,
    label: "صدقة",
    rule: "نفس الخزينة + النوع + المبلغ + التاريخ",
    scopes: ["money"],
    load: async (from) => {
      const rows = await getList(dashboardConfig.erp.charity.doctype, {
        filters: [["docstatus", "!=", 2], ["txn_date", ">=", from]],
        fields: [...BASE, "fund", "txn_type", "amount", "txn_date", "beneficiary"],
      });
      return rows.map((r) => ({
        key: [str(r.fund), str(r.txn_type), num(r.amount), day(r.txn_date)].join("¦"),
        doc: r, date: day(r.txn_date), amount: num(r.amount), summary: [str(r.txn_type), str(r.fund), str(r.beneficiary)].filter(Boolean).join(" · "),
      }));
    },
  },
  {
    doctype: "Salary Adjustment",
    label: "تسوية مرتب",
    rule: "نفس الموظف + النوع + التاريخ + المبلغ (ونفس الساعات للإضافي)",
    scopes: ["money"],
    load: async (from) => {
      const rows = await getList("Salary Adjustment", {
        filters: [["docstatus", "!=", 2], ["date", ">=", from]],
        fields: [...BASE, "employee", "employee_name", "adjustment_type", "date", "amount", "hours"],
      });
      // المبلغ بيتقارن بس عمره ما بيطلع (المرتبات سرية) - the amount is compared but never sent (salaries stay private)
      return rows.map((r) => ({
        key: [str(r.employee), str(r.adjustment_type), day(r.date), num(r.amount), r.adjustment_type === "إضافي" ? num(r.hours, 3) : ""].join("¦"),
        doc: r, date: day(r.date), amount: null, summary: `${str(r.adjustment_type)} · ${str(r.employee_name) || str(r.employee)}`,
      }));
    },
  },
];

// طرحات الفرن: نفس الفرن + النوع في خلال 10 دقايق (ونفس الوزن لو موجود) - kiln exits: same kiln + type within 10 minutes
async function kilnGroups(from: string): Promise<{ group: Candidate[] }[]> {
  const mapping = dashboardConfig.erp.batches;
  if (mapping.source !== "erp") return [];
  const info = await doctypeInfo(mapping);
  const rows = await getList(mapping.exitsDoctype, {
    filters: [["exit_time", ">=", `${from} 00:00:00`]],
    fields: [...BASE, "kiln", mapping.typeField, "exit_time", ...(info.hasWeight ? [mapping.weightField] : [])],
    order_by: "exit_time asc",
  });
  const byKey = new Map<string, Row[]>();
  for (const r of rows) {
    const weight = info.hasWeight && num(r[mapping.weightField], 3) > 0 ? num(r[mapping.weightField], 3) : "";
    const key = [str(r.kiln), str(r[mapping.typeField]), weight].join("¦");
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  const out: { group: Candidate[] }[] = [];
  const at = (r: Row) => Date.parse(str(r.exit_time).replace(" ", "T") + "Z");
  for (const list of Array.from(byKey.values())) {
    let run: Row[] = [];
    const flush = () => {
      if (run.length > 1) {
        out.push({
          group: run.map((r) => ({
            key: "", doc: r, date: day(r.exit_time), amount: null,
            summary: `${str(r.kiln) || "بدون فرن"} · ${str(r[mapping.typeField])} · ${run.map((x) => str(x.exit_time).slice(11, 16)).join("، ")}`,
          })),
        });
      }
      run = [];
    };
    for (const r of list) {
      if (run.length && at(r) - at(run[run.length - 1]) > KILN_WINDOW_MS) flush();
      run.push(r);
    }
    flush();
  }
  return out;
}

const cache = new Map<string, { at: number; value: DuplicatesReport }>();
const inFlight = new Map<string, Promise<DuplicatesReport>>();

export async function duplicatesReport(scope: "money" | "stock"): Promise<DuplicatesReport> {
  const hit = cache.get(scope);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const running = inFlight.get(scope);
  if (running) return running;
  const job = (async () => {
    const today = erpToday();
    const from = addDays(today, -DAYS);
    const skipped: string[] = [];
    const found: { rule: Pick<Rule, "doctype" | "label" | "rule">; group: Candidate[] }[] = [];
    await Promise.all(
      RULES.filter((r) => r.scopes.includes(scope)).map(async (rule) => {
        try {
          for (const group of groupsOf(await rule.load(from))) found.push({ rule, group });
        } catch (error) {
          // مفيش صلاحية أو الـ DocType مش موجود: بنكمل من غيره - no permission / no doctype: carry on without it
          console.warn(`[erp] duplicates: ${rule.doctype} skipped:`, error instanceof Error ? error.message.slice(0, 120) : "error");
          skipped.push(rule.doctype);
        }
      })
    );
    if (scope === "stock") {
      const mapping = dashboardConfig.erp.batches;
      const kilnRule = { doctype: mapping.source === "erp" ? mapping.exitsDoctype : "Kiln Exit", label: "طرحة فرن", rule: "نفس الفرن + النوع في خلال 10 دقايق (ونفس الوزن لو مكتوب)" };
      try {
        for (const { group } of await kilnGroups(from)) found.push({ rule: kilnRule, group });
      } catch (error) {
        console.warn("[erp] duplicates: Kiln Exit skipped:", error instanceof Error ? error.message.slice(0, 120) : "error");
        skipped.push(kilnRule.doctype);
      }
    }
    const names = await fullNames(Array.from(new Set(found.flatMap((f) => f.group.map((c) => c.doc.owner)).filter(Boolean))));
    const items: SuspectedDuplicate[] = found.map(({ rule, group }) => {
      const sorted = [...group].sort((a, b) => str(a.doc.creation).localeCompare(str(b.doc.creation)));
      return {
        id: `${rule.doctype}:${sorted[0].doc.name}`,
        doctype: rule.doctype,
        label: rule.label,
        rule: rule.rule,
        date: sorted[0].date,
        amount: sorted[0].amount,
        summary: sorted[0].summary,
        docs: sorted.map((c) => ({
          name: String(c.doc.name),
          url: erpDocUrl(rule.doctype, String(c.doc.name)),
          owner: names.get(c.doc.owner) ?? c.doc.owner,
          creation: str(c.doc.creation).slice(0, 16),
          docstatus: Number(c.doc.docstatus) || 0,
        })),
      };
    });
    items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const value: DuplicatesReport = { scope, from, today, items, skipped: skipped.sort() };
    cache.set(scope, { at: Date.now(), value });
    return value;
  })();
  inFlight.set(scope, job);
  try {
    return await job;
  } finally {
    inFlight.delete(scope);
  }
}
