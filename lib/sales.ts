// المبيعات: صفحة مبيعات المناديب وصفحة الموزعين - sales: the reps page and the distributors page
// قراية بس من ERPNext (Sales Invoice المعتمدة) - read-only from ERPNext (submitted Sales Invoices)
import { dashboardConfig } from "@/config/dashboard.config";
import { erpDocUrl, erpPost, erpToday } from "./erp";
import {
  DebtCustomer,
  DebtInvoice,
  DistributorSales,
  Distributors,
  ProductPackets,
  RepDay,
  RepDebt,
  RepDebtSummary,
  RepDetails,
  RepInvoice,
  RepSales,
  SalesReps,
} from "./types";

const sales = dashboardConfig.sales;

// ===== التواريخ - dates (YYYY-MM-DD, Cairo) =====

const pad = (n: number) => String(n).padStart(2, "0");

// أول يوم في الشهر ده وفي الشهر اللي فات - first day of this month and of last month
function monthBounds(today: string) {
  const [year, month] = today.split("-").map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return {
    month: today.slice(0, 7),
    monthStart: `${today.slice(0, 7)}-01`,
    prevMonth: `${prevYear}-${pad(prevMonth)}`,
    prevMonthStart: `${prevYear}-${pad(prevMonth)}-01`,
  };
}

// عدد الأيام بين تاريخين - whole days between two dates
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// ===== الأصناف ← المنتج - item code -> product =====

// كل صنف معبأ ← رقم المنتج في sales.products (الأكواد من erp.stock.packaged) - item code -> product index
function productOfItem(): Map<string, number> {
  const map = new Map<string, number>();
  sales.products.forEach((product, index) => {
    const variants = dashboardConfig.erp.stock.packaged[product.stockName] ?? {};
    for (const field of Object.values(variants)) {
      if (field.source === "erp") for (const code of field.itemCodes) map.set(code, index);
    }
  });
  return map;
}

// كل صنف كرتونة ← رقمه في sales.cartons (النوع "كامل") - carton item code -> index in sales.cartons
function cartonOfItem(): Map<string, number> {
  const map = new Map<string, number>();
  sales.cartons.forEach((carton, index) => {
    const field = dashboardConfig.erp.stock.packaged[carton.stockName]?.["كامل"];
    if (field?.source === "erp") for (const code of field.itemCodes) map.set(code, index);
  });
  return map;
}

const packetsOf = (itemCode: string, stockQty: number) => stockQty * (sales.packetsPerUnit[itemCode] ?? 1);

const emptyProducts = (): ProductPackets[] => sales.products.map((p) => ({ label: p.label, packets: 0 }));

const round = (value: number) => Math.round(value);
const money = (value: number) => Math.round(value * 100) / 100;

// get_list بـ POST (القوايم أطول من الـ URL) - get_list over POST (the lists are too long for a URL)
async function getList<T>(body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", {
    doctype: "Sales Invoice",
    limit_page_length: 0,
    ...body,
  });
  return message;
}

// ===== المناديب - reps =====

type RepRow = { posting_date: string; warehouse: string; item_code: string; qty: number };

// طلب واحد متجمع: باكتات كل يوم × مخزن عربية × صنف من أول الشهر اللي فات لحد النهارده
// (stock_qty في المرتجع بالسالب فبيتطرح لوحده)
// One grouped request: stock qty per day × van warehouse × item from last month's start to today
// (return lines have a negative stock_qty, so they subtract by themselves)
async function loadRepRows(today: string): Promise<RepRow[]> {
  const { prevMonthStart } = monthBounds(today);
  const child = "`tabSales Invoice Item`";
  return getList<RepRow>({
    filters: [
      ["docstatus", "=", 1],
      ["posting_date", ">=", prevMonthStart],
      ["posting_date", "<=", today],
      ["Sales Invoice Item", "warehouse", "in", sales.reps.map((r) => r.warehouse)],
      ["Sales Invoice Item", "item_code", "in", Array.from(productOfItem().keys())],
    ],
    fields: [
      "posting_date",
      `${child}.warehouse as warehouse`,
      `${child}.item_code as item_code`,
      `sum(${child}.stock_qty) as qty`,
    ],
    group_by: `posting_date, ${child}.warehouse, ${child}.item_code`,
  });
}

export function repsFrom(rows: RepRow[], today: string, debts: Map<string, RepDebt> | null = null): Omit<SalesReps, "offline"> {
  const { month, prevMonth } = monthBounds(today);
  const products = productOfItem();
  const cartonIndex = cartonOfItem();
  const reps: RepSales[] = sales.reps.map((rep) => {
    const own = rows.filter((row) => row.warehouse === rep.warehouse);
    const breakdown = emptyProducts();
    // الإجمالي بالباكت زي الأول (الكراتين جواه)، والصف الأول من غير الكراتين - packet total as before (cartons included); row 1 without cartons
    const regular = emptyProducts();
    const cartons: ProductPackets[] = sales.cartons.map((c) => ({ label: c.label, packets: 0 }));
    const byDay = new Map<string, number>();
    let lastMonthPackets = 0;
    for (const row of own) {
      const index = products.get(row.item_code);
      if (index === undefined) continue;
      const packets = packetsOf(row.item_code, row.qty ?? 0);
      const date = String(row.posting_date).slice(0, 10);
      if (date.startsWith(prevMonth)) lastMonthPackets += packets;
      if (!date.startsWith(month)) continue;
      breakdown[index].packets += packets;
      const carton = cartonIndex.get(row.item_code);
      if (carton === undefined) regular[index].packets += packets;
      else cartons[carton].packets += row.qty ?? 0;
      byDay.set(date, (byDay.get(date) ?? 0) + packets);
    }
    const sellingDays = Array.from(byDay.entries()).filter(([, packets]) => packets > 0);
    const last = sellingDays.sort(([a], [b]) => b.localeCompare(a))[0];
    const monthPackets = round(breakdown.reduce((sum, p) => sum + p.packets, 0));
    return {
      name: rep.name,
      van: rep.van,
      target: rep.target ?? sales.monthlyTarget,
      monthPackets,
      products: regular.map((p) => ({ ...p, packets: round(p.packets) })),
      cartons: cartons.map((c) => ({ ...c, packets: round(c.packets) })),
      lastDay: last ? { date: last[0], packets: round(last[1]) } : null,
      sellingDays: sellingDays.length,
      lastMonthPackets: round(lastMonthPackets),
      isTop: false,
      debt: debts ? debtSummary(debts.get(rep.warehouse)) : null,
    };
  });
  const best = Math.max(0, ...reps.map((r) => r.monthPackets));
  for (const rep of reps) rep.isTop = best > 0 && rep.monthPackets === best;
  return {
    month,
    reps,
    totalPackets: reps.reduce((sum, r) => sum + r.monthPackets, 0),
    totalTarget: reps.reduce((sum, r) => sum + r.target, 0),
    totalDebt: debts ? money(reps.reduce((sum, r) => sum + (r.debt?.amount ?? 0), 0)) : null,
  };
}

// ===== المديونية برّه - outstanding debt =====
// كل الفواتير المعتمدة اللي لسه عليها فلوس (أي تاريخ)، متقسمة على المناديب بمخزن العربية زي الكروت.
// المرتجعات (Credit Note) اللي لسه مخصومتش outstanding بتاعها بالسالب فبتطرح لوحدها.
// الدفعات اللي مش متربطة بفواتير (Payment Entry فيها unallocated_amount) بتتخصم من مديونية العميل:
// بتتوزع على أقدم فواتيره المفتوحة الأول (من أي مخزن) زي ما Payment Reconciliation في ERPNext بيعمل.
// Every submitted invoice with money still due (any date), split by van warehouse like the cards.
// Unallocated credit notes have a negative outstanding, so they subtract by themselves.
// Payments not linked to invoices (Payment Entry unallocated_amount) are deducted per customer, applied to
// the customer's oldest open invoices first (any warehouse), the way ERPNext Payment Reconciliation would.

type DebtRow = {
  name: string;
  customer: string;
  customer_name: string | null;
  posting_date: string;
  is_return: number;
  grand_total: number;
  rounded_total: number | null;
  outstanding_amount: number;
  warehouse: string | null;
};

type UnlinkedRow = { party: string; payment_type: string; amount: number };

// كل الفواتير المفتوحة (أي مخزن، عشان الدفعات تتوزع على أقدم فواتير العميل كلها): صف لكل (فاتورة × مخزن)
// Every open invoice (any warehouse, so payments go to the customer's oldest invoices overall): a row per (invoice × warehouse)
async function loadDebtRows(): Promise<DebtRow[]> {
  const child = "`tabSales Invoice Item`";
  return getList<DebtRow>({
    filters: [
      ["docstatus", "=", 1],
      ["outstanding_amount", "!=", 0],
    ],
    fields: [
      "name",
      "customer",
      "customer_name",
      "posting_date",
      "is_return",
      "grand_total",
      "rounded_total",
      "outstanding_amount",
      `${child}.warehouse as warehouse`,
    ],
    group_by: `name, ${child}.warehouse`,
    order_by: "posting_date asc, name asc",
  });
}

// الدفعات اللي مش متربطة لكل عميل (Receive بيقلل المديونية، Pay = رد فلوس للعميل بيزودها)
// + قيود اليومية على العميل اللي مش متربطة بفاتورة (الدائن بيقلل المديونية، المدين بيزودها)
// Unlinked payments per customer (Receive lowers the debt, Pay = a refund to the customer raises it)
// + Journal Entry lines on the customer not linked to an invoice (credit lowers the debt, debit raises it)
async function loadUnlinkedPayments(): Promise<Map<string, number>> {
  const child = "`tabJournal Entry Account`";
  const [payments, journals] = await Promise.all([
    getList<UnlinkedRow>({
      doctype: "Payment Entry",
      filters: [
        ["docstatus", "=", 1],
        ["party_type", "=", "Customer"],
        ["unallocated_amount", "!=", 0],
      ],
      fields: ["party", "payment_type", "sum(unallocated_amount) as amount"],
      group_by: "party, payment_type",
    }),
    getList<{ party: string; amount: number }>({
      doctype: "Journal Entry",
      filters: [
        ["docstatus", "=", 1],
        ["Journal Entry Account", "party_type", "=", "Customer"],
        ["Journal Entry Account", "reference_name", "is", "not set"],
      ],
      fields: [`${child}.party as party`, `sum(${child}.credit_in_account_currency - ${child}.debit_in_account_currency) as amount`],
      group_by: `${child}.party`,
    }),
  ]);
  const credit = new Map<string, number>();
  const add = (party: string, amount: number) => credit.set(party, (credit.get(party) ?? 0) + amount);
  for (const row of payments) {
    const sign = row.payment_type === "Receive" ? 1 : row.payment_type === "Pay" ? -1 : 0;
    add(row.party, sign * (row.amount ?? 0));
  }
  for (const row of journals) if (row.party) add(row.party, row.amount ?? 0);
  return credit;
}

const AGING = [
  { label: "0–7 أيام", max: 7 },
  { label: "8–30 يوم", max: 30 },
  { label: "أكتر من 30 يوم", max: Infinity },
];

type OpenInvoice = { row: DebtRow; van: string | null; date: string; outstanding: number; unlinked: number };

// مديونية كل مخزن عربية - each van warehouse's debt
function debtsFrom(rows: DebtRow[], unlinked: Map<string, number>, today: string): Map<string, RepDebt> {
  const warningDays = sales.debtWarningDays;
  const vans = new Set(sales.reps.map((r) => r.warehouse));

  // فاتورة واحدة لكل اسم، ومخزن العربية لو أي سطر منها من عربية - one entry per invoice, with its van if any line is from one
  const invoices = new Map<string, OpenInvoice>();
  for (const row of rows) {
    const van = row.warehouse && vans.has(row.warehouse) ? row.warehouse : null;
    const existing = invoices.get(row.name);
    if (existing) {
      existing.van ??= van;
      continue;
    }
    const outstanding = money(row.outstanding_amount ?? 0);
    invoices.set(row.name, { row, van, date: String(row.posting_date).slice(0, 10), outstanding, unlinked: 0 });
  }

  // الدفعات والمرتجعات اللي مش متربطة: على أقدم فواتير العميل المفتوحة الأول (فالمديونية عمرها ما تبقى بالسالب)
  // Unlinked payments and credit notes: oldest open invoices first (so a debt never goes negative)
  const byCustomer = new Map<string, OpenInvoice[]>();
  const credits = new Map(unlinked);
  for (const invoice of Array.from(invoices.values())) {
    const customer = invoice.row.customer;
    if (invoice.outstanding < 0) {
      credits.set(customer, (credits.get(customer) ?? 0) - invoice.outstanding);
      invoice.outstanding = 0;
      continue;
    }
    const list = byCustomer.get(customer) ?? [];
    list.push(invoice);
    byCustomer.set(customer, list);
  }
  for (const [customer, list] of Array.from(byCustomer.entries())) {
    let credit = credits.get(customer) ?? 0;
    if (credit <= 0) continue;
    list.sort((a, b) => a.date.localeCompare(b.date) || a.row.name.localeCompare(b.row.name));
    for (const invoice of list) {
      if (credit <= 0) break;
      const applied = Math.min(credit, invoice.outstanding);
      invoice.unlinked = money(applied);
      invoice.outstanding = money(invoice.outstanding - applied);
      credit -= applied;
    }
  }

  const result = new Map<string, RepDebt>();
  for (const rep of sales.reps) {
    const customers = new Map<string, DebtCustomer>();
    const aging = AGING.map((b) => ({ ...b, amount: 0, invoices: 0 }));
    for (const open of Array.from(invoices.values())) {
      if (open.van !== rep.warehouse) continue;
      const { row, date, outstanding } = open;
      let customer = customers.get(row.customer);
      if (!customer) {
        customer = { customer: row.customer_name || row.customer, amount: 0, openInvoices: 0, oldest: null, unlinkedApplied: 0, invoices: [] };
        customers.set(row.customer, customer);
      }
      customer.unlinkedApplied += open.unlinked;
      if (outstanding === 0) continue; // اتغطت بدفعة أو مرتجع مش متربط - covered by an unlinked payment or credit note
      const daysAgo = Math.max(0, daysBetween(date, today));
      const total = money(row.rounded_total || row.grand_total || 0);
      const invoice: DebtInvoice = {
        id: row.name,
        date,
        daysAgo,
        isReturn: !!row.is_return,
        total,
        paid: money(total - outstanding),
        unlinked: open.unlinked,
        outstanding,
        url: erpDocUrl("Sales Invoice", row.name),
      };
      customer.invoices.push(invoice);
      customer.amount += outstanding;
      if (outstanding > 0) {
        customer.openInvoices += 1;
        if (!customer.oldest || date < customer.oldest.date) customer.oldest = { date, daysAgo };
      }
      const bucket = aging.find((b) => daysAgo <= b.max)!;
      bucket.amount += outstanding;
      if (outstanding > 0) bucket.invoices += 1;
    }
    const list = Array.from(customers.values())
      .map((c) => ({
        ...c,
        amount: money(c.amount),
        unlinkedApplied: money(c.unlinkedApplied),
        invoices: c.invoices.sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .filter((c) => c.amount !== 0 || c.openInvoices > 0)
      .sort((a, b) => b.amount - a.amount);
    result.set(rep.warehouse, {
      amount: money(list.reduce((sum, c) => sum + c.amount, 0)),
      customers: list.filter((c) => c.amount > 0).length,
      unlinkedApplied: money(Array.from(customers.values()).reduce((sum, c) => sum + c.unlinkedApplied, 0)),
      warningDays,
      aging: aging.map(({ label, amount, invoices }) => ({ label, amount: money(amount), invoices })),
      list,
    });
  }
  return result;
}

// اللي بيظهر على الكارت - what the card shows
function debtSummary(debt: RepDebt | undefined): RepDebtSummary | null {
  if (!debt) return null;
  return {
    amount: debt.amount,
    customers: debt.customers,
    overdue: debt.list.some((c) => c.oldest !== null && c.oldest.daysAgo > debt.warningDays),
  };
}

// كاش 60 ثانية للمديونية (الكروت واللوحة بيستخدموا نفس النتيجة) - 60 s cache shared by the cards and the panel
let debtCache: { at: number; today: string; value: Map<string, RepDebt> } | null = null;
let debtInFlight: Promise<Map<string, RepDebt>> | null = null;

export async function repDebts(today: string): Promise<Map<string, RepDebt>> {
  if (debtCache && debtCache.today === today && Date.now() - debtCache.at < sales.cacheSeconds * 1000) return debtCache.value;
  debtInFlight ??= Promise.all([loadDebtRows(), loadUnlinkedPayments()])
    .then(([rows, unlinked]) => {
      const value = debtsFrom(rows, unlinked, today);
      debtCache = { at: Date.now(), today, value };
      return value;
    })
    .finally(() => (debtInFlight = null));
  return debtInFlight;
}

// المديونية لو فشلت متوقعش الصفحة: الكارت بيكتب "—" - a failed debt request never breaks the page: the card shows "—"
async function repDebtsOrNull(today: string): Promise<Map<string, RepDebt> | null> {
  try {
    return await repDebts(today);
  } catch (error) {
    console.error("[erp] sales debt failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ===== الموزعين - distributors =====

type DistributorRow = {
  name: string;
  customer: string;
  posting_date: string;
  is_return: number;
  grand_total: number;
  item_code: string | null;
  stock_qty: number | null;
};

// فواتير الموزعين بسطورها من أول الشهر اللي فات (طلب واحد) - distributors' invoices with their lines, one request
async function loadDistributorRows(today: string): Promise<DistributorRow[]> {
  const customers = sales.distributors.map((d) => d.customer).filter(Boolean);
  if (customers.length === 0) return [];
  const { prevMonthStart } = monthBounds(today);
  const child = "`tabSales Invoice Item`";
  return getList<DistributorRow>({
    filters: [
      ["docstatus", "=", 1],
      ["posting_date", ">=", prevMonthStart],
      ["posting_date", "<=", today],
      ["customer", "in", customers],
    ],
    fields: [
      "name",
      "customer",
      "posting_date",
      "is_return",
      "grand_total",
      `${child}.item_code as item_code`,
      `${child}.stock_qty as stock_qty`,
    ],
  });
}

export function distributorsFrom(rows: DistributorRow[], today: string): Omit<Distributors, "offline"> {
  const { month, prevMonth } = monthBounds(today);
  const products = productOfItem();
  const list: DistributorSales[] = sales.distributors.map((distributor) => {
    const own = distributor.customer ? rows.filter((row) => row.customer === distributor.customer) : [];
    const breakdown = emptyProducts();
    // الفاتورة الواحدة بتيجي سطر لكل صنف: المبلغ مرة واحدة لكل فاتورة - one row per line: count each invoice's total once
    const invoices = new Map<string, { date: string; isReturn: boolean; amount: number; packets: number }>();
    let lastMonthPackets = 0;
    for (const row of own) {
      const date = String(row.posting_date).slice(0, 10);
      let invoice = invoices.get(row.name);
      if (!invoice) {
        invoice = { date, isReturn: !!row.is_return, amount: row.grand_total ?? 0, packets: 0 };
        invoices.set(row.name, invoice);
      }
      const index = row.item_code ? products.get(row.item_code) : undefined;
      if (index === undefined || !row.item_code) continue;
      const packets = packetsOf(row.item_code, row.stock_qty ?? 0);
      invoice.packets += packets;
      if (date.startsWith(prevMonth)) lastMonthPackets += packets;
      if (date.startsWith(month)) breakdown[index].packets += packets;
    }
    const all = Array.from(invoices.values());
    const thisMonth = all.filter((inv) => inv.date.startsWith(month));
    // آخر طلبية = آخر يوم فيه فاتورة بيع (مش مرتجع) - the last order = latest day with a sale (not a return)
    const orders = all.filter((inv) => !inv.isReturn);
    const lastDate = orders.reduce<string | null>((latest, inv) => (!latest || inv.date > latest ? inv.date : latest), null);
    const lastDay = orders.filter((inv) => inv.date === lastDate);
    return {
      name: distributor.name,
      linked: !!distributor.customer,
      featured: !!distributor.featured,
      fullHeight: !!distributor.fullHeight,
      monthPackets: round(breakdown.reduce((sum, p) => sum + p.packets, 0)),
      monthAmount: money(thisMonth.reduce((sum, inv) => sum + inv.amount, 0)),
      products: breakdown.map((p) => ({ ...p, packets: round(p.packets) })),
      invoiceCount: thisMonth.filter((inv) => !inv.isReturn).length,
      lastOrder: lastDate
        ? {
            date: lastDate,
            packets: round(lastDay.reduce((sum, inv) => sum + inv.packets, 0)),
            amount: money(lastDay.reduce((sum, inv) => sum + inv.amount, 0)),
            daysAgo: daysBetween(lastDate, today),
          }
        : null,
      lastMonthPackets: round(lastMonthPackets),
    };
  });
  return { month, list, totalPackets: list.reduce((sum, d) => sum + d.monthPackets, 0) };
}

// ===== كاش 60 ثانية + آخر نتيجة نجحت - 60 s cache + last good result =====

type Cached<T> = { at: number; month: string; value: T };

// البيع بيتسجل مرة في اليوم: ERPNext بيتسأل مرة كل cacheSeconds بالكتير، ولو فشل آخر نتيجة نجحت
// في نفس الشهر مع offline، ولو مفيش null (الصفحة تكتب "غير متصل")
// Sales change once a day: ERPNext is asked at most once per cacheSeconds; on failure the last good
// result of the same month is returned marked offline, else null ("غير متصل")
function cachedSection<T extends { month: string }>(key: string, load: (today: string) => Promise<T>) {
  let good: Cached<T> | null = null;
  let inFlight: Promise<T> | null = null;
  return async (results: { fromErp: boolean; failed: boolean; error?: string }[]): Promise<(T & { offline: boolean }) | null> => {
    const today = erpToday();
    const month = today.slice(0, 7);
    if (good && good.month === month && Date.now() - good.at < sales.cacheSeconds * 1000) {
      return { ...good.value, offline: false };
    }
    try {
      inFlight ??= load(today).finally(() => (inFlight = null));
      const value = await inFlight;
      good = { at: Date.now(), month, value };
      results.push({ fromErp: true, failed: false });
      return { ...value, offline: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallback = good?.month === month ? good.value : null;
      console.error(`[erp] ${key} failed, showing ${fallback ? "last good value" : '"غير متصل"'}:`, message);
      results.push({ fromErp: true, failed: true, error: message });
      return fallback && { ...fallback, offline: true };
    }
  };
}

export const salesRepsSection = cachedSection("sales reps", async (today) => {
  const [rows, debts] = await Promise.all([loadRepRows(today), repDebtsOrNull(today)]);
  return repsFrom(rows, today, debts);
});
export const distributorsSection = cachedSection("distributors", async (today) =>
  distributorsFrom(await loadDistributorRows(today), today)
);

// ===== تفاصيل المندوب يوم بيوم (بتتجاب بس لما اللوحة تتفتح) - a rep's daily details (only when the panel opens) =====

type DetailRow = {
  name: string;
  customer: string;
  customer_name: string | null;
  posting_date: string;
  is_return: number;
  grand_total: number;
  item_code: string | null;
  stock_qty: number | null;
};

// سطور فواتير عربية المندوب من أول الشهر لحد النهارده (طلب واحد) - the van's invoice lines this month, one request
async function loadDetailRows(warehouse: string, today: string): Promise<DetailRow[]> {
  const { monthStart } = monthBounds(today);
  const child = "`tabSales Invoice Item`";
  return getList<DetailRow>({
    filters: [
      ["docstatus", "=", 1],
      ["posting_date", ">=", monthStart],
      ["posting_date", "<=", today],
      ["Sales Invoice Item", "warehouse", "=", warehouse],
    ],
    fields: [
      "name",
      "customer",
      "customer_name",
      "posting_date",
      "is_return",
      "grand_total",
      `${child}.item_code as item_code`,
      `${child}.stock_qty as stock_qty`,
    ],
    order_by: "posting_date desc, name asc",
  });
}

// الأعمدة: الأصناف العادي (بالباكت) وبعدها الكراتين (بعددها) زي صفين الكارت - columns: regular products, then cartons, like the card's two chip rows
export const detailColumns = (): string[] => [...sales.products.map((p) => p.label), ...sales.cartons.map((c) => c.label)];

function detailsFrom(rep: (typeof sales.reps)[number], rows: DetailRow[], today: string, debt: RepDebt | null): RepDetails {
  const { month } = monthBounds(today);
  const products = productOfItem();
  const cartonIndex = cartonOfItem();
  const width = sales.products.length + sales.cartons.length;
  const blank = () => new Array<number>(width).fill(0);

  // الفاتورة بتيجي سطر لكل صنف: المبلغ مرة واحدة لكل فاتورة - one row per line: each invoice's total counted once
  const invoices = new Map<string, RepInvoice & { date: string; touches: boolean }>();
  for (const row of rows) {
    const date = String(row.posting_date).slice(0, 10);
    let invoice = invoices.get(row.name);
    if (!invoice) {
      invoice = {
        id: row.name,
        customer: row.customer_name || row.customer,
        isReturn: !!row.is_return,
        columns: blank(),
        packets: 0,
        amount: money(row.grand_total ?? 0),
        date,
        touches: false,
      };
      invoices.set(row.name, invoice);
    }
    const index = row.item_code ? products.get(row.item_code) : undefined;
    if (index === undefined || !row.item_code) continue;
    const qty = row.stock_qty ?? 0;
    const carton = cartonIndex.get(row.item_code);
    // نفس حساب الكارت: العادي بالباكت، الكرتونة بعددها، والإجمالي بالباكت - same math as the card
    if (carton === undefined) invoice.columns[index] += packetsOf(row.item_code, qty);
    else invoice.columns[sales.products.length + carton] += qty;
    invoice.packets += packetsOf(row.item_code, qty);
    invoice.touches = true;
  }

  const days = new Map<string, RepDay>();
  for (const invoice of Array.from(invoices.values())) {
    if (!invoice.touches || !invoice.date.startsWith(month)) continue;
    let day = days.get(invoice.date);
    if (!day) {
      day = { date: invoice.date, columns: blank(), packets: 0, amount: 0, customers: 0, invoices: [] };
      days.set(invoice.date, day);
    }
    day.invoices.push({
      id: invoice.id,
      customer: invoice.customer,
      isReturn: invoice.isReturn,
      columns: invoice.columns,
      packets: invoice.packets,
      amount: invoice.amount,
    });
    invoice.columns.forEach((value, i) => (day!.columns[i] += value));
    day.packets += invoice.packets;
    day.amount += invoice.amount;
  }

  const list = Array.from(days.values())
    .map((day) => ({
      ...day,
      columns: day.columns.map(round),
      packets: round(day.packets),
      amount: money(day.amount),
      // العملاء = عدد العملاء المختلفين في فواتير البيع (من غير المرتجعات) - distinct customers on sale invoices
      customers: new Set(day.invoices.filter((inv) => !inv.isReturn).map((inv) => inv.customer)).size,
      invoices: day.invoices.map((inv) => ({ ...inv, columns: inv.columns.map(round), packets: round(inv.packets) })),
    }))
    .filter((day) => day.packets !== 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totals = blank();
  for (const day of list) day.columns.forEach((value, i) => (totals[i] += value));
  return {
    month,
    name: rep.name,
    van: rep.van,
    target: rep.target ?? sales.monthlyTarget,
    columns: detailColumns(),
    days: list,
    total: {
      columns: totals,
      packets: list.reduce((sum, d) => sum + d.packets, 0),
      amount: money(list.reduce((sum, d) => sum + d.amount, 0)),
      customers: list.reduce((sum, d) => sum + d.customers, 0),
    },
    debt,
  };
}

// كاش 60 ثانية لكل مندوب (بيتسأل بس لما حد يفتح اللوحة) - 60 s cache per rep (asked only when someone opens the panel)
const detailCache = new Map<string, { at: number; value: RepDetails }>();
const detailInFlight = new Map<string, Promise<RepDetails>>();

export async function repDetails(warehouseOrName: string): Promise<RepDetails | null> {
  const rep = sales.reps.find((r) => r.warehouse === warehouseOrName || r.name === warehouseOrName || r.van === warehouseOrName);
  if (!rep) return null;
  const today = erpToday();
  const key = `${rep.warehouse}|${today}`;
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < sales.cacheSeconds * 1000) return hit.value;
  let pending = detailInFlight.get(key);
  if (!pending) {
    pending = Promise.all([loadDetailRows(rep.warehouse, today), repDebtsOrNull(today)])
      .then(([rows, debts]) => {
        const value = detailsFrom(rep, rows, today, debts?.get(rep.warehouse) ?? null);
        detailCache.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => detailInFlight.delete(key));
    detailInFlight.set(key, pending);
  }
  return pending;
}
