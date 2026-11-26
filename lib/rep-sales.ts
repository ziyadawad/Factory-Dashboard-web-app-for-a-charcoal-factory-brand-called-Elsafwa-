// تطبيق المناديب على السيرفر: الأصناف والأسعار ورصيد العربية والعملاء، وعمل فاتورة البيع + الدفعة في ERPNext
// القراية بيوزر الداشبورد (FACTORY_API_*)، والكتابة بيوزر المبيعات (SALES_API_*). السعر دايما من قايمة الأسعار هنا
// (الموبايل بيبعت الصنف والكمية بس)، والكمية مش بتعدي رصيد العربية
// The rep app, server side: items, prices, van stock and customers; creating the Sales Invoice + payment in ERPNext.
// Reads use the dashboard user (FACTORY_API_*), writes the sales user (SALES_API_*). Rates always come from the price
// list here (the phone sends item + qty only), and a qty never exceeds the van stock
import { dashboardConfig } from "@/config/dashboard.config";
import { ErpError, ErpUnavailableError, erpPost, erpPostAs, erpToday, salesErpAuth } from "./erp";
import { redis, redisSettings } from "./redis";
import { RepConfig } from "./rep-auth";
import {
  RepCustomer, RepInvoiceRequest, RepOptions, RepPayMethod, RepPayTarget, RepPayTargets, RepProduct, RepProductGroup, RepReceipt, RepToday,
} from "./rep-types";

const sales = dashboardConfig.sales;
const app = sales.repApp;
const CANCEL_TAG = "طلب إلغاء من تطبيق المناديب";

export class RepError extends Error {
  constructor(message: string, readonly status = 400, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

// ERPNext مش بيرد = الفاتورة تستنى في طابور الموبايل - ERPNext not answering = the invoice waits in the phone's queue
export function erpDown(error: unknown): boolean {
  if (error instanceof ErpUnavailableError) return true;
  if (!(error instanceof ErpError)) return false;
  return /request failed|HTTP (429|5\d\d)|not JSON|are not all set/.test(error.message);
}

const money = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function list<T>(body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", { limit_page_length: 0, ...body });
  return message ?? [];
}
async function listAs<T>(body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPostAs<{ message: T[] }>(salesErpAuth(), "/api/method/frappe.client.get_list", { limit_page_length: 0, ...body }, true);
  return message ?? [];
}

// كاش صغير في الذاكرة - a small in-memory cache
function cached<T>(ms: number) {
  const store = new Map<string, { at: number; value: T }>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = await load();
    store.set(key, { at: Date.now(), value });
    return value;
  };
}
const CACHE_MS = app.cacheMinutes * 60_000;

// ===== الأصناف (من erp.stock زي صفحة المخازن) - the items (from erp.stock, like the stock page) =====
type CatalogItem = Omit<RepProduct, "rate" | "stock" | "uom">;
export function catalog(): CatalogItem[] {
  const { packaged, sacks } = dashboardConfig.erp.stock;
  const images = new Map(dashboardConfig.data.stock.packaged.map((p) => [p.name, p.image ?? null]));
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  // المجموعات المستبعدة (sales.repApp.excludeGroups، زي الشكاير) - excluded groups (e.g. sacks)
  const excluded = new Set<RepProductGroup>(app.excludeGroups);
  const add = (code: string, name: string, group: RepProductGroup, image: string | null) => {
    if (!code || seen.has(code) || excluded.has(group)) return;
    seen.add(code);
    out.push({ code, name, group, image });
  };
  for (const [product, variants] of Object.entries(packaged)) {
    for (const [variant, map] of Object.entries(variants)) {
      const codes = "itemCodes" in map ? (map.itemCodes as string[]) : [];
      const group: RepProductGroup = variant === "كامل" ? "cartons" : "packets";
      codes.forEach((code, i) => add(code, i === 0 ? (group === "cartons" ? `${product} كامل` : product) : code, group, images.get(product) ?? null));
    }
  }
  for (const [sack, variants] of Object.entries(sacks)) {
    for (const [variant, map] of Object.entries(variants)) {
      const codes = "itemCodes" in map ? (map.itemCodes as string[]) : [];
      codes.forEach((code, i) => add(code, i === 0 ? `${sack} ${variant}` : code, "sacks", null));
    }
  }
  return out;
}

const pricesCache = cached<Map<string, { rate: number; uom: string }>>(CACHE_MS);
// يوزر الداشبورد مش بيقرا Item Price (403)، فالأسعار بيوزر المبيعات - the dashboard user can't read Item Price: sales user
async function prices(codes: string[], fresh = false): Promise<Map<string, { rate: number; uom: string }>> {
  const load = async () => {
    const rows = await listAs<{ item_code: string; price_list_rate: number; uom: string | null; valid_from: string | null }>({
      doctype: "Item Price",
      filters: [["price_list", "=", sales.priceList], ["item_code", "in", codes]],
      fields: ["item_code", "price_list_rate", "uom", "valid_from"],
      order_by: "valid_from asc",
    });
    const today = erpToday();
    const map = new Map<string, { rate: number; uom: string }>();
    // الأحدث اللي بدأ خلاص يكسب - the latest one already valid wins
    for (const r of rows) if (!r.valid_from || r.valid_from <= today) map.set(r.item_code, { rate: num(r.price_list_rate), uom: r.uom ?? "" });
    return map;
  };
  return fresh ? load() : pricesCache(codes.join("|"), load);
}

async function vanStock(warehouse: string, codes: string[]): Promise<Map<string, number>> {
  const rows = await list<{ item_code: string; actual_qty: number }>({
    doctype: "Bin",
    filters: [["warehouse", "=", warehouse], ["item_code", "in", codes]],
    fields: ["item_code", "actual_qty"],
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.item_code, (map.get(r.item_code) ?? 0) + num(r.actual_qty));
  return map;
}

const customersCache = cached<RepCustomer[]>(CACHE_MS);
let extraCustomers: RepCustomer[] = []; // اللي اتعملوا من التطبيق قبل ما الكاش يتجدد - created from the app since the last load
async function customers(): Promise<RepCustomer[]> {
  const base = await customersCache("all", async () => {
    extraCustomers = [];
    const rows = await list<{ name: string; customer_name: string | null; mobile_no: string | null }>({
      doctype: "Customer",
      filters: [["disabled", "=", 0]],
      fields: ["name", "customer_name", "mobile_no"],
      order_by: "customer_name asc",
    });
    return rows.map((r) => ({ id: r.name, name: (r.customer_name || r.name).trim(), phone: r.mobile_no || null }));
  });
  const known = new Set(base.map((c) => c.id));
  return [...extraCustomers.filter((c) => !known.has(c.id)), ...base];
}

const recentCache = cached<string[]>(CACHE_MS);
async function recentCustomers(rep: RepConfig): Promise<string[]> {
  return recentCache(rep.warehouse, async () => {
    const since = new Date(Date.parse(`${erpToday()}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
    const rows = await list<{ name: string; customer: string }>({
      doctype: "Sales Invoice",
      filters: [["docstatus", "=", 1], ["posting_date", ">=", since], ["Sales Invoice Item", "warehouse", "=", rep.warehouse]],
      fields: ["name", "customer"],
      group_by: "name",
      order_by: "posting_date desc, creation desc",
      limit_page_length: 400,
    });
    const out: string[] = [];
    for (const r of rows) if (!out.includes(r.customer)) out.push(r.customer);
    return out.slice(0, app.recentCustomers);
  });
}

export async function repOptions(rep: RepConfig): Promise<RepOptions> {
  const items = catalog();
  const codes = items.map((i) => i.code);
  const [priceMap, stock, all, recent, pay] = await Promise.all([
    prices(codes), vanStock(rep.warehouse, codes), customers(), recentCustomers(rep).catch(() => []), payTargets(rep),
  ]);
  return {
    rep: { id: rep.id, name: rep.name, van: rep.van, allowDiscount: !!rep.allowDiscount },
    payTargets: pay,
    today: erpToday(),
    products: items.map((i) => ({ ...i, rate: priceMap.get(i.code)?.rate ?? null, uom: priceMap.get(i.code)?.uom ?? "", stock: Math.max(0, stock.get(i.code) ?? 0) })),
    customers: all,
    recent,
    quickQty: app.quickQty,
    companyName: app.companyName,
    thanks: app.thanks,
    loadedAt: new Date().toISOString(),
  };
}

// رصيد العميل (مدين − دائن من GL، موجب = عليه فلوس) - the customer's balance (positive = he owes us)
export async function customerBalance(customer: string): Promise<number> {
  const rows = await list<{ debit: number | null; credit: number | null }>({
    doctype: "GL Entry",
    filters: [["party_type", "=", "Customer"], ["party", "=", customer], ["is_cancelled", "=", 0], ["company", "=", app.company]],
    fields: ["sum(debit) as debit", "sum(credit) as credit"],
  });
  return money(num(rows[0]?.debit) - num(rows[0]?.credit));
}

// عميل جديد (اسم + موبايل بس) - a new customer (name + phone only)
export async function createCustomer(nameRaw: unknown, phoneRaw: unknown): Promise<RepCustomer> {
  const name = typeof nameRaw === "string" ? nameRaw.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const phone = typeof phoneRaw === "string" ? phoneRaw.replace(/[^\d+]/g, "").slice(0, 20) : "";
  if (name.length < 2) throw new RepError("اكتب اسم العميل");
  if (phone && !/^\+?\d{8,15}$/.test(phone)) throw new RepError("رقم الموبايل مش مظبوط");
  const existing = (await customers()).find((c) => c.name === name);
  if (existing) throw new RepError(`فيه عميل بنفس الاسم: ${existing.name}`, 409, { customer: existing });
  const doc: Record<string, unknown> = { customer_name: name, customer_type: "Individual" };
  if (phone) doc.mobile_no = phone;
  if (app.customerGroup) doc.customer_group = app.customerGroup;
  if (app.territory) doc.territory = app.territory;
  const { data } = await erpPostAs<{ data: { name: string; customer_name: string } }>(salesErpAuth(), "/api/resource/Customer", doc);
  const created = { id: data.name, name: data.customer_name || name, phone: phone || null };
  extraCustomers = [created, ...extraCustomers];
  return created;
}

// ===== طرق الدفع - payment methods =====
// كل Mode of Payment شغال وحسابه الافتراضي في الشركة (كاش 10 دقايق) - every enabled Mode of Payment and its company
// default account (10 min cache)
type ModeRow = { name: string; default_account: string | null; company: string | null };
const modesCache = cached<{ modes: ModeRow[]; accounts: Map<string, string> }>(10 * 60_000);
async function paymentSetup() {
  return modesCache("all", async () => {
    const numbers = dashboardConfig.wallets.accounts.map((a) => a.accountNumber);
    const [modes, accounts] = await Promise.all([
      list<ModeRow>({
        doctype: "Mode of Payment",
        fields: ["name", "`tabMode of Payment Account`.default_account as default_account", "`tabMode of Payment Account`.company as company"],
        filters: [["enabled", "=", 1]],
      }),
      list<{ name: string; account_number: string }>({
        doctype: "Account",
        fields: ["name", "account_number"],
        filters: [["company", "=", app.company], ["account_number", "in", numbers]],
      }),
    ]);
    return { modes, accounts: new Map(accounts.map((a) => [String(a.account_number), a.name])) };
  });
}

// المحافظ والحسابات اللي المندوب يقدر يستلم عليها، وكل واحدة ليه لأ لو فيها مشكلة
// The wallets / accounts a rep can be paid into, each with why not when something is missing
export async function payTargets(rep: RepConfig): Promise<RepPayTargets> {
  const { modes, accounts } = await paymentSetup();
  const enabled = new Set(modes.map((m) => m.name));
  const accountOf = (mode: string) => modes.find((m) => m.name === mode && m.company === app.company)?.default_account ?? null;
  const modeFor = (account: string) => modes.find((m) => m.company === app.company && m.default_account === account)?.name ?? null;

  const cashMode = rep.modeOfPayment || app.modeOfPayment;
  const cashAccount = rep.cashAccount || accountOf(cashMode);
  const cash: RepPayTarget = {
    id: "rep",
    label: cashMode,
    mode: enabled.has(cashMode) ? cashMode : null,
    account: cashAccount,
    problem: !enabled.has(cashMode)
      ? `طريقة الدفع "${cashMode}" مش موجودة أو متقفلة في ERPNext`
      : !cashAccount
        ? `طريقة الدفع "${cashMode}" ملهاش Default Account لشركة ${app.company}`
        : null,
  };
  const wallet = (a: (typeof dashboardConfig.wallets.accounts)[number]): RepPayTarget => {
    const account = accounts.get(a.accountNumber) ?? null;
    const mode = account ? modeFor(account) : null;
    return {
      id: a.accountNumber,
      label: a.label,
      numbers: a.vodafoneNumbers ?? [],
      mode,
      account,
      problem: !account
        ? `الحساب ${a.accountNumber} (${a.label}) مش موجود في ERPNext`
        : !mode
          ? `مفيش Mode of Payment حسابه الافتراضي "${account}" لشركة ${app.company}`
          : null,
    };
  };
  const all = dashboardConfig.wallets.accounts;
  return { cash, vodafone: all.filter((a) => a.kind === "cash").map(wallet), instapay: all.filter((a) => a.kind === "bank").map(wallet) };
}

const METHOD_LABEL: Record<RepPayMethod, string> = { cash: "كاش", vodafone: "فودافون كاش", instapay: "انستاباي" };

// المحفظة / الحساب اللي اتختار، ولو فيه مشكلة رسالة واضحة باسمه - the chosen target, or a clear error naming it
async function chosenTarget(rep: RepConfig, methodRaw: unknown, targetRaw: unknown): Promise<{ method: RepPayMethod; target: RepPayTarget }> {
  const method: RepPayMethod = methodRaw === "vodafone" || methodRaw === "instapay" ? methodRaw : "cash";
  const targets = await payTargets(rep);
  const target = method === "cash" ? targets.cash : targets[method].find((t) => t.id === targetRaw);
  if (!target) throw new RepError(method === "vodafone" ? "اختار محفظة فودافون كاش" : "اختار حساب انستاباي");
  if (target.problem) throw new RepError(`مينفعش تستلم على "${target.label}": ${target.problem}`, 400, { payProblem: target.problem });
  return { method, target };
}

// ===== الفاتورة - the invoice =====
const REF = (uuid: string) => `[rep-app:${uuid}]`;

// الفاتورة دي اتعملت قبل كده (الطابور بعتها تاني بعد timeout)؟ - was this invoice already made (a queue retry after a timeout)?
async function invoiceByUuid(uuid: string): Promise<string | null> {
  const rows = await listAs<{ name: string }>({
    doctype: "Sales Invoice",
    filters: [["remarks", "like", `%${REF(uuid)}%`], ["docstatus", "!=", 2]],
    fields: ["name"],
    limit_page_length: 1,
  });
  return rows[0]?.name ?? null;
}

// حارس التكرار: نفس المندوب + العميل + الأصناف + الإجمالي خلال duplicateMinutes - the duplicate guard
const memoryRecent = new Map<string, { name: string; until: number }>();
const dupKey = (rep: RepConfig, customer: string, items: { code: string; qty: number }[], total: number) =>
  `elsafwa:rep:dup:${rep.id}|${customer}|${[...items].sort((a, b) => a.code.localeCompare(b.code)).map((i) => `${i.code}x${i.qty}`).join(",")}|${total}`;
async function recentDuplicate(key: string): Promise<string | null> {
  if (redisSettings()) {
    try {
      return await redis<string>(["GET", key]);
    } catch {
      // الذاكرة - memory
    }
  }
  const hit = memoryRecent.get(key);
  return hit && hit.until > Date.now() ? hit.name : null;
}
async function rememberInvoice(key: string, name: string) {
  const seconds = app.duplicateMinutes * 60;
  memoryRecent.set(key, { name, until: Date.now() + seconds * 1000 });
  if (redisSettings()) {
    try {
      await redis(["SET", key, name, "EX", seconds]);
    } catch {
      // الذاكرة كفاية - memory is enough
    }
  }
}

function cleanItems(raw: unknown): { code: string; qty: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new RepError("اختار صنف واحد على الأقل");
  const merged = new Map<string, number>();
  for (const it of raw.slice(0, 60)) {
    const code = typeof it?.code === "string" ? it.code : "";
    const qty = Number(it?.qty);
    if (!code || !Number.isInteger(qty) || qty <= 0 || qty > 100_000) throw new RepError("كمية مش مظبوطة");
    merged.set(code, (merged.get(code) ?? 0) + qty);
  }
  return Array.from(merged, ([code, qty]) => ({ code, qty }));
}

export async function createInvoice(rep: RepConfig, body: RepInvoiceRequest): Promise<{ receipt: RepReceipt; existing: boolean }> {
  const uuid = typeof body.uuid === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.uuid) ? body.uuid : "";
  if (!uuid) throw new RepError("uuid is required");
  const customer = typeof body.customer === "string" ? body.customer.trim() : "";
  if (!customer) throw new RepError("اختار العميل");
  const items = cleanItems(body.items);
  const discount = money(Math.max(0, num(body.discount)));
  const paidWanted = money(Math.max(0, num(body.paid)));
  if (discount > 0 && !rep.allowDiscount) throw new RepError("الخصم مش مسموح ليك");

  // اتعملت قبل كده؟ نرجعها زي ما هي - already made? return it as is
  const done = await invoiceByUuid(uuid);
  if (done) return { receipt: await invoiceReceipt(rep, done), existing: true };

  const known = new Map(catalog().map((c) => [c.code, c]));
  for (const it of items) if (!known.has(it.code)) throw new RepError(`صنف مش في القايمة: ${it.code}`);
  const codes = items.map((i) => i.code);
  const [priceMap, stock, previousBalance] = await Promise.all([prices(codes, true), vanStock(rep.warehouse, codes), customerBalance(customer)]);
  let subtotal = 0;
  for (const it of items) {
    const name = known.get(it.code)!.name;
    const price = priceMap.get(it.code);
    if (!price || !(price.rate > 0)) throw new RepError(`${name}: مفيش سعر في ${sales.priceList}`);
    const available = stock.get(it.code) ?? 0;
    if (it.qty > available) throw new RepError(`${name}: الموجود في العربية ${Math.max(0, available)} بس`, 409, { code: it.code, available });
    subtotal += it.qty * price.rate;
  }
  subtotal = money(subtotal);
  if (discount >= subtotal) throw new RepError("الخصم أكبر من الفاتورة");
  const total = money(subtotal - discount);
  if (paidWanted > total) throw new RepError("المدفوع أكبر من الإجمالي");
  // طريقة الدفع قبل الفاتورة: لو المحفظة ملهاش Mode of Payment / حساب، الفاتورة متتعملش خالص (مش تفشل الدفعة بسكات)
  // The payment target before the invoice: a wallet with no Mode of Payment / account stops the invoice (no silent failure)
  const pay = paidWanted > 0 ? await chosenTarget(rep, body.payMethod, body.payTarget) : null;
  const payRef = typeof body.payRef === "string" ? body.payRef.replace(new RegExp("[^\\p{L}\\p{N}\\-/ ]", "gu"), "").trim().slice(0, 40) : "";
  const methodText = pay ? [pay.method === "cash" ? METHOD_LABEL.cash : `${METHOD_LABEL[pay.method]} — ${pay.target.label}`, payRef && `رقم ${payRef}`].filter(Boolean).join(" · ") : null;

  const key = dupKey(rep, customer, items, total);
  if (!body.confirmDuplicate) {
    const dup = await recentDuplicate(key);
    if (dup) throw new RepError(`فيه فاتورة بنفس العميل والأصناف والإجمالي من شوية (${dup}) — متأكد إنها فاتورة جديدة؟`, 409, { duplicate: dup });
  }

  const now = new Date();
  const doc: Record<string, unknown> = {
    customer,
    company: app.company,
    posting_date: erpToday(),
    due_date: erpToday(),
    selling_price_list: sales.priceList,
    ignore_pricing_rule: 1,
    update_stock: 1,
    set_warehouse: rep.warehouse,
    items: items.map((it) => ({ item_code: it.code, qty: it.qty, rate: priceMap.get(it.code)!.rate, price_list_rate: priceMap.get(it.code)!.rate, warehouse: rep.warehouse })),
    remarks: `فاتورة من تطبيق المناديب — ${rep.name} (${rep.van}) ${REF(uuid)}`,
    docstatus: 1,
  };
  if (discount > 0) {
    doc.apply_discount_on = "Grand Total";
    doc.discount_amount = discount;
  }
  if (rep.salesPerson) doc.sales_team = [{ sales_person: rep.salesPerson, allocated_percentage: 100 }];

  const auth = salesErpAuth();
  const { data: inv } = await erpPostAs<{ data: Record<string, unknown> }>(auth, `/api/resource/${encodeURIComponent("Sales Invoice")}`, doc);
  const name = String(inv.name);
  await rememberInvoice(key, name);
  const grand = money(num(inv.rounded_total) || num(inv.grand_total));

  // الدفعة: Payment Entry على الفاتورة - the paid part: a Payment Entry against the invoice
  const paid = Math.min(paidWanted, grand);
  let paymentError: string | null = null;
  if (paid > 0) {
    try {
      const { message: pe } = await erpPostAs<{ message: Record<string, unknown> }>(
        auth,
        "/api/method/erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
        { dt: "Sales Invoice", dn: name, party_amount: paid }
      );
      // الـ Mode of Payment والحساب اللي اتختاروا: رصيد المحفظة في الداشبورد بيتحرك على طول (GL)
      // The chosen Mode of Payment and account: the wallet balance on the dashboard moves right away (GL)
      pe.mode_of_payment = pay!.target.mode;
      pe.paid_to = pay!.target.account;
      pe.paid_amount = paid;
      pe.received_amount = paid;
      pe.reference_no = payRef || name;
      pe.reference_date = erpToday();
      pe.remarks = `دفعة من تطبيق المناديب — ${rep.name} — ${name} — ${methodText}`;
      pe.references = ((pe.references as Record<string, unknown>[]) ?? []).map((r) => ({ ...r, allocated_amount: paid }));
      pe.docstatus = 1;
      await erpPostAs(auth, `/api/resource/${encodeURIComponent("Payment Entry")}`, pe);
    } catch (error) {
      paymentError = error instanceof Error ? error.message : String(error);
      console.error(`[rep] payment for ${name} failed:`, paymentError);
    }
  }
  const paidDone = paymentError ? 0 : paid;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const lines = (inv.items as Record<string, unknown>[] | undefined) ?? [];
  return {
    existing: false,
    receipt: {
      name,
      temporary: false,
      date: String(inv.posting_date ?? erpToday()),
      time,
      repName: rep.name,
      van: rep.van,
      customerName: String(inv.customer_name ?? customer),
      items: lines.map((l) => ({ name: String(l.item_name ?? l.item_code), qty: num(l.qty), rate: num(l.rate), amount: num(l.amount) })),
      subtotal: money(num(inv.total)),
      discount: money(num(inv.discount_amount)),
      total: grand,
      paid: paidDone,
      remaining: money(grand - paidDone),
      paymentMethod: paidDone > 0 ? methodText : null,
      paymentNumbers: paidDone > 0 ? (pay?.target.numbers ?? []) : [],
      previousBalance,
      newBalance: money(previousBalance + grand - paidDone),
      companyName: app.companyName,
      thanks: app.thanks,
      paymentError: paymentError ? "الفاتورة اتسجلت بس الدفعة ما اتسجلتش — بلّغ الحسابات" : null,
    },
  };
}

// الفاتورة للطباعة تاني (بتاعة المندوب ده بس) - an invoice to reprint (this rep's only)
export async function invoiceReceipt(rep: RepConfig, name: string): Promise<RepReceipt> {
  const { message: inv } = await erpPostAs<{ message: Record<string, unknown> }>(salesErpAuth(), "/api/method/frappe.client.get", { doctype: "Sales Invoice", name }, true);
  const lines = (inv.items as Record<string, unknown>[] | undefined) ?? [];
  if (!lines.some((l) => l.warehouse === rep.warehouse)) throw new RepError("الفاتورة دي مش من عربيتك", 403);
  const grand = money(num(inv.rounded_total) || num(inv.grand_total));
  const outstanding = money(num(inv.outstanding_amount));
  const [balance, payments] = await Promise.all([
    customerBalance(String(inv.customer)).catch(() => null),
    listAs<{ name: string; mode_of_payment: string | null; paid_to: string | null; reference_no: string | null }>({
      doctype: "Payment Entry",
      filters: [["docstatus", "=", 1], ["Payment Entry Reference", "reference_name", "=", name]],
      fields: ["name", "mode_of_payment", "paid_to", "reference_no"],
      group_by: "name",
    }).catch(() => []),
  ]);
  // اسم المحفظة زي صفحة المحافظ لو الحساب واحد منها - the wallet label (as on the wallets page) when the account is one
  const setup = payments.length ? await paymentSetup().catch(() => null) : null;
  const labelOf = (account: string | null) => {
    const number = setup && account ? Array.from(setup.accounts).find(([, n]) => n === account)?.[0] : undefined;
    const w = number ? dashboardConfig.wallets.accounts.find((a) => a.accountNumber === number) : undefined;
    return w ? `${w.kind === "bank" ? METHOD_LABEL.instapay : METHOD_LABEL.vodafone} — ${w.label}` : null;
  };
  const paymentMethod = payments
    .map((p) => [labelOf(p.paid_to) ?? p.mode_of_payment ?? "", p.reference_no && p.reference_no !== name ? `رقم ${p.reference_no}` : ""].filter(Boolean).join(" · "))
    .filter(Boolean)
    .join(" + ");
  return {
    name: String(inv.name),
    temporary: false,
    date: String(inv.posting_date),
    time: String(inv.posting_time ?? "").slice(0, 5),
    repName: rep.name,
    van: rep.van,
    customerName: String(inv.customer_name ?? inv.customer),
    items: lines.map((l) => ({ name: String(l.item_name ?? l.item_code), qty: num(l.qty), rate: num(l.rate), amount: num(l.amount) })),
    subtotal: money(num(inv.total)),
    discount: money(num(inv.discount_amount)),
    total: grand,
    paid: money(grand - outstanding),
    remaining: outstanding,
    paymentMethod: paymentMethod || null,
    // أرقام فودافون كاش للمحافظ اللي اتدفع عليها - the Vodafone Cash numbers of the wallets paid into
    paymentNumbers: payments.flatMap((p) => {
      const number = setup && p.paid_to ? Array.from(setup.accounts).find(([, n]) => n === p.paid_to)?.[0] : undefined;
      return dashboardConfig.wallets.accounts.find((a) => a.accountNumber === number)?.vodafoneNumbers ?? [];
    }),
    previousBalance: null,
    newBalance: balance,
    balanceNote: "رصيد العميل الحالي",
    companyName: app.companyName,
    thanks: app.thanks,
    cancelled: Number(inv.docstatus) === 2,
  };
}

// فواتير المندوب النهارده - the rep's invoices today
export async function repToday(rep: RepConfig): Promise<RepToday> {
  const rows = await listAs<{
    name: string; customer_name: string; grand_total: number; rounded_total: number; outstanding_amount: number; posting_time: string; docstatus: number;
  }>({
    doctype: "Sales Invoice",
    filters: [["posting_date", "=", erpToday()], ["docstatus", "in", [1, 2]], ["is_return", "=", 0], ["Sales Invoice Item", "warehouse", "=", rep.warehouse]],
    fields: ["name", "customer_name", "grand_total", "rounded_total", "outstanding_amount", "posting_time", "docstatus"],
    group_by: "name",
    order_by: "creation desc",
  });
  const names = rows.map((r) => r.name);
  const requested = new Set<string>();
  if (names.length) {
    const comments = await listAs<{ reference_name: string }>({
      doctype: "Comment",
      filters: [["reference_doctype", "=", "Sales Invoice"], ["reference_name", "in", names], ["content", "like", `%${CANCEL_TAG}%`]],
      fields: ["reference_name"],
    }).catch(() => []);
    comments.forEach((c) => requested.add(c.reference_name));
  }
  const invoices = rows.map((r) => {
    const total = money(num(r.rounded_total) || num(r.grand_total));
    const remaining = money(num(r.outstanding_amount));
    return {
      name: r.name,
      time: String(r.posting_time ?? "").slice(0, 5),
      customerName: r.customer_name,
      total,
      paid: money(total - remaining),
      remaining,
      cancelled: Number(r.docstatus) === 2,
      cancelRequested: requested.has(r.name),
    };
  });
  const live = invoices.filter((i) => !i.cancelled);
  return {
    invoices,
    totals: {
      count: live.length,
      total: money(live.reduce((s, i) => s + i.total, 0)),
      paid: money(live.reduce((s, i) => s + i.paid, 0)),
      remaining: money(live.reduce((s, i) => s + i.remaining, 0)),
    },
  };
}

// طلب إلغاء (مش إلغاء مباشر): تعليق على الفاتورة في ERPNext للحسابات - a cancel REQUEST: a comment on the invoice for accounts
export async function requestCancel(rep: RepConfig, name: string, reasonRaw: unknown): Promise<void> {
  await invoiceReceipt(rep, name); // بتاعته؟ - his?
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim().slice(0, 300) : "";
  await erpPostAs(salesErpAuth(), `/api/resource/Comment`, {
    comment_type: "Comment",
    reference_doctype: "Sales Invoice",
    reference_name: name,
    content: `${CANCEL_TAG} — ${rep.name} (${rep.van})${reason ? `: ${reason}` : ""}`,
  });
}
