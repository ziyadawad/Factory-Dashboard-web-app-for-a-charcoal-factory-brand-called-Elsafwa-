// صفحة العملاء (/customers) على السيرفر: قراية بس من ERPNext (Customer + Address + Sales Invoice المعتمدة + الدفعات)
// والملاحظات بس في Redis. كاش customers.cacheMinutes في الذاكرة، وبيتجاب بس لما الصفحة تتفتح
// The customers page, server side: read-only from ERPNext (Customer + Address + submitted Sales Invoices + payments);
// only the notes live in Redis. In-memory cache of customers.cacheMinutes, loaded only when the page is open
import { dashboardConfig } from "@/config/dashboard.config";
import { erpDocUrl, erpPost, erpToday } from "./erp";
import { redis, redisSettings } from "./redis";
import { loadUnlinkedPayments, packetsOf, productOfItem } from "./sales";
import { normalizeArabic } from "./arabic";
import type { Segment } from "./customer-types";
import type { CustomerDetails, CustomerInvoice, CustomerNote, CustomerPayment, CustomerRow, CustomersData, Totals } from "./customer-types";

const cfg = dashboardConfig.customers;
const sales = dashboardConfig.sales;
const NOTES_KEY = "elsafwa:customer-notes";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n: number) => Math.round(n * 100) / 100;
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function list<T>(body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", { limit_page_length: 0, ...body });
  return message ?? [];
}

// ===== التحميل - loading =====
type CustomerDoc = {
  name: string;
  customer_name: string | null;
  mobile_no: string | null;
  territory: string | null;
  customer_group: string | null;
  customer_details: string | null;
  customer_primary_address: string | null;
  creation: string | null;
};
type AddressDoc = { name: string; address_line1: string | null; address_line2: string | null; city: string | null; phone: string | null; customer: string };
type InvoiceDoc = {
  name: string;
  customer: string;
  posting_date: string;
  posting_time: string | null;
  grand_total: number;
  rounded_total: number | null;
  outstanding_amount: number;
  is_return: number;
};
type LineDoc = { name: string; item_code: string; warehouse: string | null; qty: number };

type Invoice = {
  name: string;
  customer: string;
  date: string;
  time: string | null;
  total: number;
  outstanding: number; // بعد الدفعات / المرتجعات المش متربطة - after unlinked payments / credit notes
  rawOutstanding: number;
  isReturn: boolean;
  packets: number;
  products: number[]; // باكتات كل منتج (sales.products) - packets per product
  van: string | null; // مخزن العربية - the van warehouse
};

type Model = {
  data: Omit<CustomersData, "notes" | "notesEnabled">;
  invoicesBy: Map<string, Invoice[]>; // الأقدم الأول - oldest first
  unlinked: Map<string, number>;
};

const GENERIC_TERRITORY = new Set(["All Territories", "Egypt", "Rest Of The World", "مصر"]);

function gpsOf(...texts: (string | null | undefined)[]): { lat: number; lng: number } | null {
  for (const text of texts) {
    const m = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(text ?? "");
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

// جملة / قطاعي: بالإيد (segmentOverrides) ← مجموعة العميل (segmentRule.groups) ← متوسط الباكت في الفاتورة
// Wholesale / retail: by hand (segmentOverrides) → the customer group (segmentRule.groups) → average packets per invoice
function segmentOf(id: string, group: string | null, avgPackets: number): { segment: Segment; source: "override" | "group" | "rule" } {
  const manual = cfg.segmentOverrides[id];
  if (manual === "جملة" || manual === "قطاعي") return { segment: manual, source: "override" };
  const byGroup = group ? cfg.segmentRule.groups[group] : undefined;
  if (byGroup === "جملة" || byGroup === "قطاعي") return { segment: byGroup, source: "group" };
  return { segment: avgPackets >= cfg.segmentRule.minAvgPackets ? "جملة" : "قطاعي", source: "rule" };
}
const DISTRIBUTOR_IDS = new Set(cfg.distributors);
const DISTRIBUTOR_GROUPS = new Set(cfg.distributorGroups);

function typeOf(c: CustomerDoc): string | null {
  const fromDetails = /نوع العميل:\s*([^\n]+)/.exec(c.customer_details ?? "")?.[1]?.trim();
  if (fromDetails) return fromDetails;
  const group = (c.customer_group ?? "").trim();
  return group && !/^all customer groups$/i.test(group) && group !== "كل مجموعات العملاء" ? group : null;
}

async function loadModel(): Promise<Model> {
  const today = erpToday();
  const month = today.slice(0, 7);
  const child = "`tabSales Invoice Item`";
  const [customers, addresses, headers, lines, unlinked] = await Promise.all([
    list<CustomerDoc>({
      doctype: "Customer",
      filters: [["disabled", "=", 0]],
      fields: ["name", "customer_name", "mobile_no", "territory", "customer_group", "customer_details", "customer_primary_address", "creation"],
      order_by: "customer_name asc",
    }),
    list<AddressDoc>({
      doctype: "Address",
      fields: ["name", "address_line1", "address_line2", "city", "phone", "`tabDynamic Link`.link_name as customer"],
      filters: [["Dynamic Link", "link_doctype", "=", "Customer"], ["disabled", "=", 0]],
      order_by: "`tabAddress`.is_primary_address desc, `tabAddress`.modified desc",
    }).catch(() => [] as AddressDoc[]),
    list<InvoiceDoc>({
      doctype: "Sales Invoice",
      filters: [["docstatus", "=", 1]],
      fields: ["name", "customer", "posting_date", "posting_time", "grand_total", "rounded_total", "outstanding_amount", "is_return"],
      order_by: "posting_date asc, name asc",
    }),
    // سطور الفواتير متجمعة (فاتورة × صنف × مخزن) - invoice lines grouped (invoice × item × warehouse)
    list<LineDoc>({
      doctype: "Sales Invoice",
      filters: [["docstatus", "=", 1]],
      fields: ["name", `${child}.item_code as item_code`, `${child}.warehouse as warehouse`, `sum(${child}.stock_qty) as qty`],
      group_by: `name, ${child}.item_code, ${child}.warehouse`,
    }),
    loadUnlinkedPayments().catch(() => new Map<string, number>()),
  ]);

  // ===== الفواتير - invoices =====
  const products = productOfItem();
  const vanToRep = new Map(sales.reps.map((r) => [r.warehouse, r.id]));
  const invoices = new Map<string, Invoice>();
  for (const h of headers) {
    invoices.set(h.name, {
      name: h.name,
      customer: h.customer,
      date: day(h.posting_date),
      time: h.posting_time ? String(h.posting_time).slice(0, 8) : null,
      total: money(num(h.rounded_total) || num(h.grand_total)),
      outstanding: money(num(h.outstanding_amount)),
      rawOutstanding: money(num(h.outstanding_amount)),
      isReturn: !!h.is_return,
      packets: 0,
      products: sales.products.map(() => 0),
      van: null,
    });
  }
  for (const l of lines) {
    const inv = invoices.get(l.name);
    if (!inv) continue;
    if (l.warehouse && vanToRep.has(l.warehouse)) inv.van ??= l.warehouse;
    const index = products.get(l.item_code);
    if (index === undefined) continue;
    const packets = packetsOf(l.item_code, num(l.qty));
    inv.packets += packets;
    inv.products[index] += packets;
  }
  const invoicesBy = new Map<string, Invoice[]>();
  for (const inv of Array.from(invoices.values())) {
    const arr = invoicesBy.get(inv.customer) ?? [];
    arr.push(inv);
    invoicesBy.set(inv.customer, arr);
  }

  // ===== المديونية: الدفعات والمرتجعات المش متربطة على أقدم الفواتير الأول (زي صفحة المناديب) =====
  // Debt: unlinked payments and credit notes go to the oldest open invoices first (same as the reps page)
  for (const [customer, arr] of Array.from(invoicesBy.entries())) {
    let credit = unlinked.get(customer) ?? 0;
    for (const inv of arr) {
      if (inv.outstanding < 0) {
        credit -= inv.outstanding;
        inv.outstanding = 0;
      }
    }
    for (const inv of arr) {
      if (credit <= 0) break;
      if (inv.outstanding <= 0) continue;
      const applied = Math.min(credit, inv.outstanding);
      inv.outstanding = money(inv.outstanding - applied);
      credit -= applied;
    }
  }

  // ===== العناوين - addresses =====
  const addrByName = new Map(addresses.map((a) => [a.name, a]));
  const addrByCustomer = new Map<string, AddressDoc>();
  for (const a of addresses) if (!addrByCustomer.has(a.customer)) addrByCustomer.set(a.customer, a);

  // ===== العملاء - customers =====
  const lookbackFrom = addDays(today, -cfg.repLookbackDays);
  const threeFrom = addDays(today, -90);
  const [ty, tm] = today.split("-").map(Number);
  const prevMonth = tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, "0")}`;
  const prevSameDay = `${prevMonth}-${today.slice(8, 10)}`;
  const repIds = new Set(sales.reps.map((r) => r.id));
  const areaSpellings = new Map<string, Map<string, number>>();
  const zero = (): Totals => ({ packets: 0, amount: 0, invoices: 0 });

  const rows: CustomerRow[] = customers.map((c) => {
    const a = (c.customer_primary_address && addrByName.get(c.customer_primary_address)) || addrByCustomer.get(c.name);
    const territory = c.territory && !GENERIC_TERRITORY.has(c.territory) ? c.territory.trim() : null;
    const area = territory || a?.city?.trim() || null;
    const areaKey = area ? normalizeArabic(area) : "";
    if (areaKey) {
      const spell = areaSpellings.get(areaKey) ?? new Map<string, number>();
      spell.set(area!, (spell.get(area!) ?? 0) + 1);
      areaSpellings.set(areaKey, spell);
    }
    const addressLine = a ? [a.address_line1, a.city].map((x) => (x ?? "").trim()).filter(Boolean).join(" — ") : "";
    const arr = invoicesBy.get(c.name) ?? [];
    const month_ = zero();
    const lastMonth = zero();
    const lastMonthToDate = zero();
    const three = zero();
    const all = zero();
    const productTotals = sales.products.map(() => 0);
    const monthProducts = sales.products.map(() => 0);
    const repCounts = new Map<string, number>();
    const history = new Map<string, { id: string; invoices90: number; invoicesAll: number; last: string }>();
    let firstDate: string | null = null;
    let lastDate: string | null = null;
    let lastRep: string | null = null;
    let debt = 0;
    let oldestUnpaid: string | null = null;
    for (const inv of arr) {
      const add = (t: Totals) => {
        t.packets += inv.packets;
        t.amount += inv.total;
        if (!inv.isReturn) t.invoices += 1;
      };
      add(all);
      if (inv.date >= threeFrom) add(three);
      if (inv.date.startsWith(month)) add(month_);
      if (inv.date.startsWith(prevMonth)) {
        add(lastMonth);
        if (inv.date <= prevSameDay) add(lastMonthToDate);
      }
      inv.products.forEach((p, i) => (productTotals[i] += p));
      if (inv.date.startsWith(month)) inv.products.forEach((p, i) => (monthProducts[i] += p));
      if (!inv.isReturn) {
        firstDate ??= inv.date;
        lastDate = inv.date;
        const rep = inv.van ? vanToRep.get(inv.van) ?? null : null;
        if (rep) {
          lastRep = rep;
          if (inv.date >= lookbackFrom) repCounts.set(rep, (repCounts.get(rep) ?? 0) + 1);
          const h = history.get(rep) ?? { id: rep, invoices90: 0, invoicesAll: 0, last: inv.date };
          h.invoicesAll += 1;
          if (inv.date >= lookbackFrom) h.invoices90 += 1;
          h.last = inv.date; // الفواتير بالترتيب فآخر واحدة = آخر شرا - invoices are in order, so the last one wins
          history.set(rep, h);
        }
      }
      if (inv.outstanding > 0) {
        debt += inv.outstanding;
        oldestUnpaid ??= inv.date;
      }
    }
    const override = cfg.repOverrides[c.name];
    const ranked = Array.from(repCounts.entries()).sort((x, y) => y[1] - x[1]);
    const repId = override && repIds.has(override) ? override : ranked[0]?.[0] ?? lastRep;
    const created = c.creation ? day(c.creation) : null;
    const daysSince = lastDate ? Math.max(0, daysBetween(lastDate, today)) : null;
    const favorites = productTotals
      .map((p, i) => ({ label: sales.products[i].label, p }))
      .filter((x) => x.p > 0)
      .sort((x, y) => y.p - x.p)
      .slice(0, 3)
      .map((x) => x.label);
    const round = (t: Totals): Totals => ({ packets: Math.round(t.packets), amount: money(t.amount), invoices: t.invoices });
    return {
      id: c.name,
      name: (c.customer_name || c.name).trim(),
      mobile: (c.mobile_no || a?.phone || "").trim() || null,
      area,
      areaKey,
      address: addressLine || null,
      gps: gpsOf(a?.address_line2, a?.address_line1),
      type: typeOf(c),
      group: c.customer_group?.trim() || null,
      ...(() => {
        const avgPackets = all.invoices > 0 ? Math.round((all.packets / all.invoices) * 10) / 10 : 0;
        const seg = segmentOf(c.name, c.customer_group?.trim() || null, avgPackets);
        return { avgPackets, segment: seg.segment, segmentSource: seg.source };
      })(),
      isDistributor: DISTRIBUTOR_IDS.has(c.name) || (!!c.customer_group && DISTRIBUTOR_GROUPS.has(c.customer_group.trim())),
      monthProducts: monthProducts.map((p) => Math.round(p)),
      repId,
      repFromOverride: !!(override && repIds.has(override)),
      reps: ranked.map(([id]) => id),
      repHistory: Array.from(history.values()).sort((x, y) => y.invoices90 - x.invoices90 || y.invoicesAll - x.invoicesAll || y.last.localeCompare(x.last)),
      created,
      firstDate,
      lastDate,
      daysSince,
      month: round(month_),
      lastMonth: round(lastMonth),
      lastMonthToDate: round(lastMonthToDate),
      three: round(three),
      all: round(all),
      avgOrder: all.invoices > 0 ? money(all.amount / all.invoices) : 0,
      favorites,
      debt: money(Math.max(0, debt)),
      oldestUnpaid: oldestUnpaid ? { date: oldestUnpaid, days: Math.max(0, daysBetween(oldestUnpaid, today)) } : null,
      isNew: firstDate ? firstDate.startsWith(month) : !!created?.startsWith(month),
      activeMonth: !!lastDate?.startsWith(month),
      inactive: daysSince === null || daysSince > cfg.inactiveDays,
    };
  });

  // المنطقة بأكتر كتابة متكررة - each area shown with its most common spelling
  const label = new Map<string, string>();
  for (const [key, spell] of Array.from(areaSpellings.entries())) {
    label.set(key, Array.from(spell.entries()).sort((x, y) => y[1] - x[1])[0][0]);
  }
  for (const row of rows) if (row.areaKey) row.area = label.get(row.areaKey) ?? row.area;

  return {
    data: {
      today,
      month,
      inactiveDays: cfg.inactiveDays,
      reps: sales.reps.map((r) => ({ id: r.id, name: r.name, van: r.van, color: cfg.repColors[r.id] ?? "#9CA3AF" })),
      // الخطوط بترتيب الكونفج (والمناديب اللي مش مكتوبين بيتضافوا في الآخر) - routes in config order (unlisted reps appended)
      routes: [
        ...cfg.routes.filter((r) => repIds.has(r.repId)),
        ...sales.reps.filter((r) => !cfg.routes.some((x) => x.repId === r.id)).map((r, i) => ({ repId: r.id, name: `خط ${cfg.routes.length + i + 1}` })),
      ],
      tags: cfg.tags,
      products: sales.products.map((p) => p.label),
      segmentMinAvgPackets: cfg.segmentRule.minAvgPackets,
      customers: rows,
      updatedAt: new Date().toISOString(),
    },
    invoicesBy,
    unlinked,
  };
}

// ===== الكاش (طلب واحد في نفس الوقت) - the cache (one load at a time) =====
let cache: { at: number; model: Model } | null = null;
let loading: Promise<Model> | null = null;
async function model(): Promise<Model> {
  if (cache && Date.now() - cache.at < cfg.cacheMinutes * 60_000) return cache.model;
  loading ??= loadModel()
    .then((m) => {
      cache = { at: Date.now(), model: m };
      return m;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// ===== الملاحظات (Redis) - notes =====
export const notesEnabled = () => redisSettings() !== null;

async function allNotes(): Promise<Record<string, CustomerNote>> {
  if (!notesEnabled()) return {};
  try {
    const flat = (await redis<string[]>(["HGETALL", NOTES_KEY])) ?? [];
    const out: Record<string, CustomerNote> = {};
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        out[flat[i]] = JSON.parse(flat[i + 1]) as CustomerNote;
      } catch {}
    }
    return out;
  } catch (error) {
    console.error("[customers] notes read failed:", error instanceof Error ? error.message : error);
    return {};
  }
}

export async function saveNote(id: string, text: string, tags: string[]): Promise<CustomerNote | null> {
  const cleanText = text.trim().slice(0, 2000);
  const cleanTags = Array.from(new Set(tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))).slice(0, 12);
  if (!cleanText && cleanTags.length === 0) {
    await redis(["HDEL", NOTES_KEY, id]);
    return null;
  }
  const note: CustomerNote = { text: cleanText, tags: cleanTags, updatedAt: new Date().toISOString() };
  await redis(["HSET", NOTES_KEY, id, JSON.stringify(note)]);
  return note;
}

// ===== اللي بيتبعت - what is served =====
export async function customersData(): Promise<CustomersData> {
  const [m, notes] = await Promise.all([model(), allNotes()]);
  return { ...m.data, notes, notesEnabled: notesEnabled() };
}

export async function customerExists(id: string): Promise<boolean> {
  return (await model()).data.customers.some((c) => c.id === id);
}

export async function customerRows(): Promise<{ rows: CustomerRow[]; data: Model["data"] }> {
  const m = await model();
  return { rows: m.data.customers, data: m.data };
}

const AGING = [
  { label: "0–7 أيام", max: 7 },
  { label: "8–30 يوم", max: 30 },
  { label: "31–60 يوم", max: 60 },
  { label: "أكتر من 60 يوم", max: Infinity },
];

export async function customerDetails(id: string): Promise<CustomerDetails | null> {
  const m = await model();
  if (!m.data.customers.some((c) => c.id === id)) return null;
  const today = m.data.today;
  const arr = m.invoicesBy.get(id) ?? [];
  const vanToRep = new Map(sales.reps.map((r) => [r.warehouse, r.id]));

  // آخر 12 شهر - the last 12 months
  const [y, mo] = today.split("-").map(Number);
  const months: CustomerDetails["months"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), packets: 0, amount: 0 });
  }
  const byMonth = new Map(months.map((x) => [x.month, x]));
  const productTotals = sales.products.map(() => 0);
  const aging = AGING.map((b) => ({ label: b.label, amount: 0, invoices: 0 }));
  for (const inv of arr) {
    const bucket = byMonth.get(inv.date.slice(0, 7));
    if (bucket) {
      bucket.packets += inv.packets;
      bucket.amount += inv.total;
    }
    inv.products.forEach((p, i) => (productTotals[i] += p));
    if (inv.outstanding > 0) {
      const days = Math.max(0, daysBetween(inv.date, today));
      const index = AGING.findIndex((b) => days <= b.max);
      aging[index].amount = money(aging[index].amount + inv.outstanding);
      aging[index].invoices += 1;
    }
  }
  for (const x of months) {
    x.packets = Math.round(x.packets);
    x.amount = money(x.amount);
  }

  const invoices: CustomerInvoice[] = arr
    .slice()
    .reverse()
    .map((inv) => ({
      name: inv.name,
      date: inv.date,
      time: inv.time,
      packets: Math.round(inv.packets),
      amount: inv.total,
      paid: money(inv.total - inv.rawOutstanding),
      outstanding: inv.outstanding,
      isReturn: inv.isReturn,
      repId: inv.van ? vanToRep.get(inv.van) ?? null : null,
      url: erpDocUrl("Sales Invoice", inv.name),
    }));

  let payments: CustomerPayment[] | null = null;
  try {
    const rows = await list<{ name: string; posting_date: string; paid_amount: number; mode_of_payment: string | null; payment_type: string }>({
      doctype: "Payment Entry",
      filters: [["docstatus", "=", 1], ["party_type", "=", "Customer"], ["party", "=", id]],
      fields: ["name", "posting_date", "paid_amount", "mode_of_payment", "payment_type"],
      order_by: "posting_date desc, creation desc",
    });
    payments = rows.map((p) => ({
      name: p.name,
      date: day(p.posting_date),
      amount: money(num(p.paid_amount)),
      mode: p.mode_of_payment,
      kind: p.payment_type === "Pay" ? "out" : "in",
      url: erpDocUrl("Payment Entry", p.name),
    }));
  } catch (error) {
    console.error("[customers] payments failed:", error instanceof Error ? error.message : error);
  }

  return {
    id,
    months,
    products: sales.products.map((p, i) => ({ label: p.label, packets: Math.round(productTotals[i]) })),
    invoices,
    payments,
    aging,
    unlinkedCredit: money(m.unlinked.get(id) ?? 0),
    erpUrl: erpDocUrl("Customer", id),
  };
}
