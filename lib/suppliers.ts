// الموردين (الصفحة 7): موردين الخشب والبلاستيك من ERPNext، قراية بس - السيرفر بس، كاش suppliers.cacheSeconds
// - الرصيد = GL على suppliers.payableAccounts: دائن − مدين من الأول (من غير الملغي). موجب = ليه عندنا، سالب = لينا عنده
// - التوريد = فواتير المشتريات المعتمدة (فيها المخزون)، والدفعات = قيود المدين على نفس الحساب (سند صرف أو قيد يومية)
// - التصنيف: suppliers.overrides ← بلاستيك (اسم / مجموعة) ← خشب (مجموعة / ورّد أصناف خشب) ← مستخبي
// Suppliers (page 7), read-only, server only, cached suppliers.cacheSeconds. Balance = GL on the payable account(s):
// credit − debit, all time, not cancelled (positive = we owe them). Supplies = submitted Purchase Invoices; payments =
// debits on the same account. Classification: overrides → plastic (name / group) → wood (group / wood items) → hidden

import { dashboardConfig } from "@/config/dashboard.config";
import { erpGet, erpToday } from "./erp";
import {
  QtyByUnit,
  StatementLine,
  SupplierCard,
  SupplierCategory,
  SupplierDetails,
  SupplierPayment,
  SuppliersData,
  SupplyDoc,
  SupplyItem,
} from "./types";

const cfg = dashboardConfig.suppliers;
type Row = Record<string, unknown>;

async function list(doctype: string, fields: string[], filters: unknown[], orderBy?: string): Promise<Row[]> {
  const { data } = await erpGet<{ data: Row[] }>(`/api/resource/${encodeURIComponent(doctype)}`, {
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: 0,
    ...(orderBy ? { order_by: orderBy } : {}),
  });
  return data;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const round = (n: number) => Math.round(n * 100) / 100;
const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "");

// "1119 - كاش زياد عوض - AC" ← "كاش زياد عوض" - an account's short name
export const shortAccount = (account: string) => account.replace(/^\s*\d+\s*-\s*/, "").replace(/\s*-\s*[A-Z]{1,6}\s*$/, "").trim();

// أصناف الخشب ونوعها من erp.stock.wood - wood item codes and their type, from erp.stock.wood
const WOOD_TYPE = new Map<string, string>();
for (const [label, entry] of Object.entries(dashboardConfig.erp.stock.wood as Record<string, unknown>)) {
  const codes = (entry as { itemCodes?: string[] })?.itemCodes;
  if (Array.isArray(codes)) codes.forEach((c) => WOOD_TYPE.set(c, label));
}
const isWoodItem = (code: string) => WOOD_TYPE.has(code) || (!!cfg.categories.wood.woodItemPrefix && code.startsWith(cfg.categories.wood.woodItemPrefix));
const woodTypeOf = (code: string) => WOOD_TYPE.get(code) ?? (isWoodItem(code) ? code.replace(/^خشب\s*/, "") || code : null);

function categoryOf(name: string, group: string | null, suppliedWood: boolean): SupplierCategory | null {
  const override = (cfg.overrides as Record<string, string>)[name];
  if (override) return override === "hidden" ? null : (override as SupplierCategory);
  const n = norm(name);
  const plastic = cfg.categories.plastic;
  if (plastic.nameKeywords.some((k) => n.includes(norm(k))) || (group && plastic.groups.includes(group))) return "plastic";
  if ((group && cfg.categories.wood.groups.includes(group)) || suppliedWood) return "wood";
  return null;
}

// كميات بالوحدة (الأكبر الأول) - quantities per unit (biggest first)
function addQty(map: Map<string, number>, unit: string, qty: number) {
  map.set(unit || "وحدة", (map.get(unit || "وحدة") ?? 0) + qty);
}
const qtyList = (map: Map<string, number>): QtyByUnit[] =>
  Array.from(map, ([unit, qty]) => ({ unit, qty: round(qty) }))
    .filter((q) => Math.abs(q.qty) > 0.0001)
    .sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty));

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const PI_ITEM = (f: string) => `\`tabPurchase Invoice Item\`.${f}`;

// ===== الصفحة: كل الموردين - the page: every supplier =====
async function loadOverview(): Promise<SuppliersData> {
  const today = erpToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const activeFrom = addDays(today, -cfg.activeDays);
  const [suppliers, items, gl] = await Promise.all([
    list("Supplier", ["name", "supplier_group", "disabled"], []),
    list(
      "Purchase Invoice",
      ["name", "supplier", "posting_date", "grand_total", PI_ITEM("item_code"), PI_ITEM("qty"), PI_ITEM("uom"), PI_ITEM("amount")],
      [["company", "=", cfg.company], ["docstatus", "=", 1]]
    ),
    list(
      "GL Entry",
      ["party", "posting_date", "creation", "voucher_type", "voucher_no", "debit", "credit"],
      [["company", "=", cfg.company], ["party_type", "=", "Supplier"], ["account", "in", cfg.payableAccounts], ["is_cancelled", "=", 0]]
    ),
  ]);

  // التوريد لكل مورد - supplies per supplier
  type Supply = { wood: boolean; last: { date: string; doc: string; total: number; qty: Map<string, number> } | null; month: Map<string, number>; monthAmount: number; lastDate: string };
  const supply = new Map<string, Supply>();
  const docSeen = new Set<string>();
  for (const r of items) {
    const supplier = str(r.supplier);
    const s = supply.get(supplier) ?? { wood: false, last: null, month: new Map(), monthAmount: 0, lastDate: "" };
    const code = str(r.item_code);
    const date = str(r.posting_date);
    if (isWoodItem(code)) s.wood = true;
    if (!s.last || date > s.last.date || (date === s.last.date && str(r.name) > s.last.doc)) s.last = { date, doc: str(r.name), total: num(r.grand_total), qty: new Map() };
    if (s.last.doc === str(r.name)) addQty(s.last.qty, str(r.uom), num(r.qty));
    if (date >= monthStart) {
      addQty(s.month, str(r.uom), num(r.qty));
      s.monthAmount += num(r.amount);
    }
    if (date > s.lastDate) s.lastDate = date;
    docSeen.add(str(r.name));
    supply.set(supplier, s);
  }

  // الرصيد وآخر دفعة - balance and the last payment
  const balance = new Map<string, number>();
  const payments = new Map<string, Map<string, { date: string; created: string; amount: number }>>();
  // خريطة: الاسم الموحد ← الاسم الأصلي من GL - map: normalized name ← original GL name
  const normalizedPartyMap = new Map<string, string>();
  for (const g of gl) {
    const party = str(g.party);
    const normalizedParty = norm(party);
    normalizedPartyMap.set(normalizedParty, party);
    balance.set(normalizedParty, (balance.get(normalizedParty) ?? 0) + num(g.credit) - num(g.debit));
    if (num(g.debit) > 0 && str(g.voucher_type) !== "Purchase Invoice") {
      const byVoucher = payments.get(normalizedParty) ?? new Map();
      const v = byVoucher.get(str(g.voucher_no)) ?? { date: str(g.posting_date), created: str(g.creation), amount: 0 };
      v.amount += num(g.debit);
      byVoucher.set(str(g.voucher_no), v);
      payments.set(normalizedParty, byVoucher);
    }
  }

  const cards: SupplierCard[] = [];
  let hiddenCount = 0;
  for (const s of suppliers) {
    const name = str(s.name);
    const normalized = norm(name);
    const group = str(s.supplier_group) || null;
    const sup = supply.get(name);
    const category = categoryOf(name, group, !!sup?.wood);
    // البحث عن الرصيد بالاسم الموحد أو بالاسم الأصلي - search balance by normalized name or original name
    const bal = round(balance.get(normalized) ?? balance.get(name) ?? 0);
    // مستخبي: مش خشب ولا بلاستيك، أو رصيده صفر ومورّدش من activeDays يوم - hidden: other, or zero balance and inactive
    if (!category || (Math.abs(bal) < 0.5 && !(sup && sup.lastDate >= activeFrom))) {
      hiddenCount++;
      continue;
    }
    // البحث عن الدفعات بالاسم الموحد أو بالاسم الأصلي - search payments by normalized name or original name
    const payMap = payments.get(normalized) ?? payments.get(name);
    const lastPay = Array.from(payMap?.values() ?? []).sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created))[0];
    cards.push({
      name,
      group,
      category,
      balance: bal,
      lastSupply: sup?.last ? { date: sup.last.date, doc: sup.last.doc, qty: qtyList(sup.last.qty), amount: round(sup.last.total) } : null,
      lastPayment: lastPay ? { date: lastPay.date, amount: round(lastPay.amount) } : null,
      month: { qty: sup ? qtyList(sup.month) : [], amount: round(sup?.monthAmount ?? 0) },
    });
  }
  cards.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  return { today, monthStart, suppliers: cards, hiddenCount, updatedAt: new Date().toISOString() };
}

// ===== لوحة المورد - the supplier panel =====
async function loadDetails(name: string): Promise<SupplierDetails> {
  const today = erpToday();
  const [suppliers, invoices, gl, pes] = await Promise.all([
    list("Supplier", ["name", "supplier_group"], [["name", "=", name]]),
    list(
      "Purchase Invoice",
      [
        "name", "posting_date", "is_return", "bill_no", "remarks", "grand_total", "outstanding_amount",
        PI_ITEM("item_code"), PI_ITEM("item_name"), PI_ITEM("qty"), PI_ITEM("uom"), PI_ITEM("rate"), PI_ITEM("amount"), PI_ITEM("idx"),
      ],
      [["company", "=", cfg.company], ["docstatus", "=", 1], ["supplier", "=", name]],
      "posting_date desc, name desc"
    ),
    list(
      "GL Entry",
      ["posting_date", "creation", "voucher_type", "voucher_no", "debit", "credit", "against", "remarks"],
      [["company", "=", cfg.company], ["party_type", "=", "Supplier"], ["party", "=", name], ["account", "in", cfg.payableAccounts], ["is_cancelled", "=", 0]],
      "posting_date asc, creation asc"
    ),
    list("Payment Entry", ["name", "reference_no", "mode_of_payment", "paid_from"], [["party_type", "=", "Supplier"], ["party", "=", name], ["docstatus", "=", 1]]),
  ]);
  if (suppliers.length === 0) throw new Error("supplier not found");
  const group = str(suppliers[0].supplier_group) || null;

  // الفواتير بأصنافها - invoices with their items
  const docs = new Map<string, SupplyDoc>();
  for (const r of invoices) {
    const doc = str(r.name);
    const d =
      docs.get(doc) ??
      ({
        doc,
        doctype: "Purchase Invoice",
        date: str(r.posting_date),
        isReturn: num(r.is_return) === 1,
        billNo: str(r.bill_no) || null,
        remarks: str(r.remarks) && str(r.remarks) !== "No Remarks" ? str(r.remarks) : null,
        total: round(num(r.grand_total)),
        outstanding: round(num(r.outstanding_amount)),
        items: [],
      } as SupplyDoc);
    const code = str(r.item_code);
    if (code) {
      const item: SupplyItem & { idx: number } = {
        itemCode: code,
        itemName: str(r.item_name) || code,
        woodType: woodTypeOf(code),
        qty: round(num(r.qty)),
        unit: str(r.uom),
        rate: round(num(r.rate)),
        amount: round(num(r.amount)),
        idx: num(r.idx),
      };
      d.items.push(item);
    }
    docs.set(doc, d);
  }
  const supplies = Array.from(docs.values()).map((d) => ({
    ...d,
    items: (d.items as (SupplyItem & { idx: number })[]).sort((a, b) => a.idx - b.idx).map(({ idx, ...rest }) => (void idx, rest)),
  }));
  const suppliedWood = supplies.some((d) => d.items.some((i) => i.woodType));

  // الدفعات: قيود المدين (مش فواتير) مجمّعة بالمستند - payments: debit entries (not invoices) grouped by voucher
  const peInfo = new Map(pes.map((p) => [str(p.name), p]));
  const payMap = new Map<string, SupplierPayment>();
  for (const g of gl) {
    if (num(g.debit) <= 0 || str(g.voucher_type) === "Purchase Invoice") continue;
    const voucher = str(g.voucher_no);
    const pe = peInfo.get(voucher);
    const p =
      payMap.get(voucher) ??
      ({
        voucher,
        voucherType: str(g.voucher_type),
        date: str(g.posting_date),
        createdAt: str(g.creation).slice(0, 16),
        amount: 0,
        from: shortAccount(str(pe?.paid_from) || str(g.against).split(",")[0] || ""),
        // رقم مرجع حقيقي بس (مش "0" / "00") - a real reference number only (not "0" / "00")
        reference: (() => {
          const ref = str(pe?.reference_no);
          return ref && !/^0+$/.test(ref) ? ref : null;
        })(),
      } as SupplierPayment);
    p.amount = round(p.amount + num(g.debit));
    payMap.set(voucher, p);
  }
  const payments = Array.from(payMap.values()).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

  // كشف الحساب: سطر لكل مستند (سند الصرف متقسم على فواتير = سطر واحد) - the statement: one line per document
  const lines = new Map<string, Omit<StatementLine, "balance">>();
  for (const g of gl) {
    const key = `${str(g.voucher_type)}|${str(g.voucher_no)}|${str(g.posting_date)}`;
    const type = str(g.voucher_type);
    const voucher = str(g.voucher_no);
    const line =
      lines.get(key) ??
      ({
        date: str(g.posting_date),
        createdAt: str(g.creation).slice(0, 16),
        voucherType: type,
        voucher,
        description: "",
        debit: 0,
        credit: 0,
      } as Omit<StatementLine, "balance">);
    line.debit = round(line.debit + num(g.debit));
    line.credit = round(line.credit + num(g.credit));
    if (!line.description) {
      if (type === "Purchase Invoice") {
        const d = docs.get(voucher);
        const summary = d?.items
          .slice(0, 3)
          .map((i) => `${i.itemName} ${i.qty} ${i.unit}`)
          .join("، ");
        line.description = `${d?.isReturn ? "مرتجع مشتريات" : "فاتورة مشتريات"}${summary ? ` — ${summary}` : ""}`;
      } else if (type === "Payment Entry") {
        line.description = `دفعة${payMap.get(voucher)?.from ? ` من ${payMap.get(voucher)!.from}` : ""}`;
      } else {
        const remark = str(g.remarks).split("\n")[0];
        line.description = `قيد يومية${remark && remark !== "No Remarks" ? ` — ${remark.slice(0, 80)}` : ""}`;
      }
    }
    lines.set(key, line);
  }
  let running = 0;
  const statement: StatementLine[] = Array.from(lines.values()).map((l) => {
    running = round(running + l.credit - l.debit);
    return { ...l, balance: running };
  });

  // أقدم فاتورة مش مدفوعة - the oldest unpaid invoice
  const unpaid = supplies.filter((d) => !d.isReturn && d.outstanding > 0.5).sort((a, b) => a.date.localeCompare(b.date))[0];
  const days = (from: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  return {
    name,
    group,
    category: categoryOf(name, group, suppliedWood),
    balance: running,
    supplies,
    payments,
    statement,
    oldestUnpaid: unpaid ? { doc: unpaid.doc, date: unpaid.date, days: days(unpaid.date), outstanding: unpaid.outstanding } : null,
    erpUrl: (process.env.FACTORY_API_URL ?? "").replace(/\/+$/, ""),
    today,
  };
}

// ===== الكاش: طلب واحد في نفس الوقت، cacheSeconds - cache: one request at a time, cacheSeconds =====
const TTL = cfg.cacheSeconds * 1000;
let overview: { at: number; data: SuppliersData } | null = null;
let overviewFlight: Promise<SuppliersData> | null = null;
export function suppliersData(): Promise<SuppliersData> {
  if (overview && Date.now() - overview.at < TTL) return Promise.resolve(overview.data);
  overviewFlight ??= loadOverview()
    .then((data) => {
      overview = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      overviewFlight = null;
    });
  return overviewFlight;
}

const details = new Map<string, { at: number; data: SupplierDetails }>();
const detailFlights = new Map<string, Promise<SupplierDetails>>();
export function supplierDetails(name: string): Promise<SupplierDetails> {
  const hit = details.get(name);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  let flight = detailFlights.get(name);
  if (!flight) {
    flight = loadDetails(name)
      .then((data) => {
        details.set(name, { at: Date.now(), data });
        if (details.size > 50) details.delete(details.keys().next().value as string);
        return data;
      })
      .finally(() => detailFlights.delete(name));
    detailFlights.set(name, flight);
  }
  return flight;
}
