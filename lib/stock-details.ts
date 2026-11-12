// تفاصيل صنف في أرصدة المخازن (الصفحة 2): الرصيد في كل مخزن، الحركة (Stock Ledger Entry) بالشهر، وملخص الشهر
// Stock item details (page 2): balance per warehouse, the month's movements (Stock Ledger Entry) and a month summary
// بتتجاب بس لما اللوحة تتفتح، كاش 60 ثانية، قراية بس من ERPNext
// Fetched only when a panel opens, 60 s cache, read-only from ERPNext
import { dashboardConfig } from "@/config/dashboard.config";
import { erpPost, erpToday } from "./erp";
import { fullNames } from "./account-details";
import { ConfigErpStockItem, StockCategory, StockDetails, StockGroup, StockMove } from "./types";

const CACHE_MS = 60_000;

type StockMapping = Extract<ConfigErpStockItem, { source: "erp" }>;

type SleRow = {
  name: string;
  item_code: string;
  warehouse: string;
  posting_date: string;
  posting_time: string | null;
  posting_datetime: string;
  creation: string;
  actual_qty: number | null;
  qty_after_transaction: number | null;
  voucher_type: string;
  voucher_no: string;
  owner: string;
  stock_uom: string;
};

export class UnknownStockItemError extends Error {}

async function getList<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", {
    doctype,
    limit_page_length: 0,
    ...body,
  });
  return message;
}

// تقريب يشيل كسور الـ float - rounding that drops float noise
const round = (value: number, decimals = 6) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

// "9:40:12.5" -> "09:40"
function hhmm(time: string | null): string {
  const [h = "0", m = "0"] = String(time ?? "").split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// وحدة ERPNext متقصرة (زي الكارت) - ERPNext unit, shortened like the card
const SHORT_UNITS: Record<string, string> = { "كيلو جرام": "كجم" };

// الكارت ← أصنافه في ERPNext (ولو variant: صنف النوع ده بس)، وأنواعه، والمخازن اللي برّه الرصيد
// A card -> its ERPNext items (only that variant's with variant), its variants and the warehouses left out
function resolveItem(group: StockGroup, name: string, variant: string | null) {
  const erp = dashboardConfig.erp.stock;
  let parts: Record<string, ConfigErpStockItem> | undefined;
  if (group === "packaged") parts = erp.packaged[name];
  else if (group === "sacks") parts = erp.sacks[name];
  else if (group === "packaging") parts = erp.packaging[name] ? { "": erp.packaging[name] } : undefined;
  else {
    // الخشب: نوع بأنواع فرعية (بلدي) أو نوع لوحده - wood: a type with sub-types (بلدي) or a single type
    const type = dashboardConfig.data.stock.rawMaterials.wood.types.find((t) => t.name === name);
    if (type?.subTypes) parts = Object.fromEntries(type.subTypes.map((sub) => [sub.name, erp.wood[sub.name] ?? { source: "manual" }]));
    else if (erp.wood[name]) parts = { "": erp.wood[name] };
  }
  if (!parts) throw new UnknownStockItemError(`unknown stock card ${group}/${name}`);
  const variants = Object.keys(parts).filter(Boolean);
  if (variant !== null && !variants.includes(variant)) throw new UnknownStockItemError(`unknown variant ${variant}`);
  const mappings = new Map<string, StockMapping>();
  for (const [label, field] of Object.entries(parts)) {
    if (field.source !== "erp" || (variant !== null && label !== variant)) continue;
    for (const code of field.itemCodes) mappings.set(code, field);
  }
  if (mappings.size === 0) throw new UnknownStockItemError(`${group}/${name} is not linked to ERPNext`);
  return {
    variants,
    mappings,
    // العربيات برّه رصيد المنتجات المعبأة بس - vehicles are left out of packaged products only
    excluded: group === "packaged" ? erp.excludedWarehouses : [],
    decimals: group === "wood" ? 1 : 0,
  };
}

// آخر حركة لكل صنف في كل مخزن لحد تاريخ (زي تقرير Stock Balance): الرصيد = qty_after_transaction بتاعها
// The last entry per item and warehouse up to a date (like the Stock Balance report): balance = its qty_after_transaction
async function lastBalances(codes: string[], op: "<" | "<=", date: string) {
  const base = [
    ["item_code", "in", codes],
    ["is_cancelled", "=", 0],
    ["posting_date", op, date],
  ];
  const latest = await getList<{ item_code: string; warehouse: string; at: string }>("Stock Ledger Entry", {
    filters: base,
    fields: ["item_code", "warehouse", "max(posting_datetime) as at"],
    group_by: "item_code, warehouse",
  });
  const result = new Map<string, { itemCode: string; warehouse: string; qty: number; uom: string }>();
  if (latest.length === 0) return result;
  const rows = await getList<{ item_code: string; warehouse: string; posting_datetime: string; creation: string; qty_after_transaction: number; stock_uom: string }>(
    "Stock Ledger Entry",
    {
      filters: [...base, ["posting_datetime", "in", Array.from(new Set(latest.map((row) => row.at)))]],
      fields: ["item_code", "warehouse", "posting_datetime", "creation", "qty_after_transaction", "stock_uom"],
    }
  );
  const wanted = new Map(latest.map((row) => [`${row.item_code}\u0000${row.warehouse}`, row.at]));
  const creation = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.item_code}\u0000${row.warehouse}`;
    if (wanted.get(key) !== row.posting_datetime) continue;
    // حركتين في نفس الوقت: الأحدث تسجيلًا هي الأخيرة - same time: the later created wins
    if ((creation.get(key) ?? "") > row.creation) continue;
    creation.set(key, row.creation);
    result.set(key, { itemCode: row.item_code, warehouse: row.warehouse, qty: Number(row.qty_after_transaction) || 0, uom: row.stock_uom });
  }
  return result;
}

// بيانات المستندات (الغرض، العميل، المورد...) - voucher info (purpose, customer, supplier...)
type VoucherInfo = { label: string; party: string; remarks: string; isSale: boolean };
const VOUCHER_FIELDS: Record<string, string[]> = {
  "Stock Entry": ["name", "purpose", "stock_entry_type", "remarks"],
  "Sales Invoice": ["name", "customer", "customer_name", "remarks"],
  "POS Invoice": ["name", "customer", "customer_name"],
  "Delivery Note": ["name", "customer", "customer_name"],
  "Purchase Invoice": ["name", "supplier", "supplier_name", "remarks"],
  "Purchase Receipt": ["name", "supplier", "supplier_name"],
  "Stock Reconciliation": ["name", "purpose"],
};
async function voucherInfo(rows: SleRow[]): Promise<Map<string, VoucherInfo>> {
  const info = new Map<string, VoucherInfo>();
  const byType = new Map<string, Set<string>>();
  for (const row of rows) byType.set(row.voucher_type, (byType.get(row.voucher_type) ?? new Set()).add(row.voucher_no));
  await Promise.all(
    Array.from(byType, async ([type, names]) => {
      const fields = VOUCHER_FIELDS[type];
      if (!fields) return;
      try {
        const docs = await getList<Record<string, string | null>>(type, { filters: [["name", "in", Array.from(names)]], fields });
        for (const doc of docs) {
          const entryType = (doc.stock_entry_type || "").trim();
          const purpose = (doc.purpose || "").trim();
          info.set(`${type}\u0000${doc.name}`, {
            label: entryType && entryType !== purpose ? entryType : purpose,
            party: (doc.customer_name || doc.customer || doc.supplier_name || doc.supplier || "").trim(),
            remarks: (doc.remarks || "").trim(),
            isSale: /بيع/.test(entryType),
          });
        }
      } catch (error) {
        console.warn(`[erp] stock details: ${type} not readable:`, error instanceof Error ? error.message : error);
      }
    })
  );
  return info;
}

// نوع الحركة للملخص - the movement category for the summary
function categoryOf(voucherType: string, info: VoucherInfo | undefined): StockCategory {
  if (["Sales Invoice", "POS Invoice", "Delivery Note"].includes(voucherType)) return "بيع";
  if (["Purchase Invoice", "Purchase Receipt"].includes(voucherType)) return "شراء";
  if (voucherType === "Stock Reconciliation") return "تسوية";
  if (voucherType === "Stock Entry") {
    if (info?.isSale) return "بيع";
    const label = info?.label ?? "";
    if (/Manufacture$|Repack/.test(label) && !/Transfer/.test(label)) return "إنتاج";
    if (/Transfer/.test(label)) return "تحويل";
    if (/Receipt|Issue/.test(label)) return "تسوية";
  }
  return "تسوية";
}

const CATEGORIES: StockCategory[] = ["إنتاج", "شراء", "بيع", "تحويل", "تسوية"];

// الشهور اللي فيها حركات للأصناف دي (الأحدث الأول) - months with movements for these items, newest first
async function monthsOf(codes: string[], today: string) {
  const rows = await getList<{ y: number; m: number; n: number }>("Stock Ledger Entry", {
    filters: [
      ["item_code", "in", codes],
      ["is_cancelled", "=", 0],
      ["posting_date", "<=", today],
    ],
    fields: ["year(posting_date) as y", "month(posting_date) as m", "count(name) as n"],
    group_by: "year(posting_date), month(posting_date)",
    order_by: "y desc, m desc",
  });
  return rows.map((r) => ({ month: `${r.y}-${String(r.m).padStart(2, "0")}`, count: Number(r.n) || 0 }));
}

async function load(group: StockGroup, name: string, variant: string | null, month: string, today: string): Promise<StockDetails> {
  const { variants, mappings, excluded, decimals } = resolveItem(group, name, variant);
  const codes = Array.from(mappings.keys());
  const inScope = (code: string, warehouse: string) => {
    const mapping = mappings.get(code);
    return !!mapping && (mapping.warehouses.length === 0 || mapping.warehouses.includes(warehouse)) && !excluded.includes(warehouse);
  };
  const from = `${month}-01`;
  const to = monthEnd(month) < today ? monthEnd(month) : today;

  const [current, opening, rows, months] = await Promise.all([
    lastBalances(codes, "<=", today),
    // الرصيد قبل أول الشهر لكل صنف ومخزن - the balance before the month per item and warehouse
    lastBalances(codes, "<", from),
    from > to
      ? Promise.resolve([] as SleRow[])
      : getList<SleRow>("Stock Ledger Entry", {
          filters: [
            ["item_code", "in", codes],
            ["is_cancelled", "=", 0],
            ["posting_date", ">=", from],
            ["posting_date", "<=", to],
          ],
          fields: [
            "name", "item_code", "warehouse", "posting_date", "posting_time", "posting_datetime", "creation",
            "actual_qty", "qty_after_transaction", "voucher_type", "voucher_no", "owner", "stock_uom",
          ],
          order_by: "posting_datetime asc, creation asc",
        }),
    monthsOf(codes, today),
  ]);
  // ترتيب ERPNext (وقت الحركة ثم وقت التسجيل) للرصيد بعد كل حركة - ERPNext order for the running balance
  rows.sort((a, b) => String(a.posting_datetime).localeCompare(String(b.posting_datetime)) || a.creation.localeCompare(b.creation));

  const [info, names] = await Promise.all([
    voucherInfo(rows),
    fullNames(Array.from(new Set(rows.map((r) => r.owner).filter(Boolean)))),
  ]);
  const vans = new Map(dashboardConfig.sales.reps.map((rep) => [rep.warehouse, rep]));

  // الرصيد الماشي: بيبدأ من رصيد أول الشهر، وكل حركة = فرق qty_after_transaction في مخزنها (التسوية بتسجل actual_qty = 0)
  // Running balance: starts at the month opening; each entry = the change of qty_after_transaction in its warehouse
  // (a Stock Reconciliation stores actual_qty = 0)
  const last = new Map<string, number>();
  let openingBalance = 0;
  for (const [key, entry] of Array.from(opening)) {
    last.set(key, entry.qty);
    if (inScope(entry.itemCode, entry.warehouse)) openingBalance += entry.qty;
  }
  openingBalance = round(openingBalance);
  let running = openingBalance;
  const moves: StockMove[] = rows.map((row) => {
    const key = `${row.item_code}\u0000${row.warehouse}`;
    const after = Number(row.qty_after_transaction) || 0;
    const qty = round(after - (last.get(key) ?? 0));
    last.set(key, after);
    const scoped = inScope(row.item_code, row.warehouse);
    if (scoped) running = round(running + qty);
    const voucher = info.get(`${row.voucher_type}\u0000${row.voucher_no}`);
    const postingDate = String(row.posting_date).slice(0, 10);
    const van = vans.get(row.warehouse);
    return {
      id: row.name,
      postingDate,
      postingTime: hhmm(row.posting_time),
      creation: String(row.creation).slice(0, 16),
      lateDays: Math.max(0, dayDiff(postingDate, String(row.creation).slice(0, 10))),
      itemCode: row.item_code,
      warehouse: row.warehouse,
      qty,
      balanceAfter: scoped ? running : null,
      inScope: scoped,
      category: categoryOf(row.voucher_type, voucher),
      voucherType: row.voucher_type,
      voucherNo: row.voucher_no,
      voucherLabel: voucher?.label ?? "",
      party: voucher?.party ?? "",
      van: van ? van.van : excluded.includes(row.warehouse) ? row.warehouse.replace(/^مخزن\s*/, "").replace(/\s*-\s*AC$/, "") : "",
      owner: names.get(row.owner) ?? row.owner,
      remarks: voucher?.remarks ?? "",
    };
  });

  // الملخص بصافي كل مستند جوه الرصيد: التحويل بين مخزنين جوه الرصيد صافيه صفر فمش بيتعد وارد ومنصرف
  // The summary nets each voucher inside the card's scope: a transfer between two counted warehouses nets to zero
  const vouchers = new Map<string, { date: string; category: StockCategory; party: string; net: number }>();
  for (const move of moves) {
    if (!move.inScope) continue;
    const key = `${move.voucherType}\u0000${move.voucherNo}`;
    const v = vouchers.get(key) ?? { date: move.postingDate, category: move.category, party: move.party, net: 0 };
    v.net = round(v.net + move.qty);
    vouchers.set(key, v);
  }
  const byCategory = CATEGORIES.map((category) => ({ category, in: 0, out: 0 }));
  const daily = new Map<string, { date: string; in: number; out: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, { date: d, in: 0, out: 0 });
  let totalIn = 0;
  let totalOut = 0;
  for (const v of Array.from(vouchers.values())) {
    const cat = byCategory.find((c) => c.category === v.category)!;
    const day = daily.get(v.date);
    if (v.net > 0) {
      totalIn += v.net;
      cat.in += v.net;
      if (day) day.in += v.net;
    } else if (v.net < 0) {
      totalOut -= v.net;
      cat.out -= v.net;
      if (day) day.out -= v.net;
    }
  }
  const closingBalance = round(running);
  if (Math.abs(round(openingBalance + totalIn - totalOut) - closingBalance) > 0.001) {
    console.warn(`[erp] stock details ${group}/${name}: opening + in - out != closing`);
  }

  // المبيعات (كل المخازن، العربيات معاهم): بالمندوب/العربية وبالعميل - sales (every warehouse incl. vans): by rep/van and customer
  let sales: StockDetails["sales"] = null;
  if (group === "packaged" || group === "sacks") {
    const byRep = new Map<string, number>();
    const byCustomer = new Map<string, number>();
    let total = 0;
    for (const move of moves) {
      if (move.category !== "بيع" || move.qty === 0) continue;
      // في التحويل بالبيع (Stock Entry) بنعد الطرف اللي خرج بس - a sale transfer: only the leg that left
      if (move.voucherType === "Stock Entry" && move.qty > 0) continue;
      const sold = -move.qty;
      total += sold;
      const rep = vans.get(move.warehouse);
      const repName = rep ? `${rep.name} (${rep.van})` : move.warehouse.replace(/\s*-\s*AC$/, "");
      byRep.set(repName, (byRep.get(repName) ?? 0) + sold);
      const customer = move.party || move.voucherLabel || "—";
      byCustomer.set(customer, (byCustomer.get(customer) ?? 0) + sold);
    }
    const sorted = (map: Map<string, number>) =>
      Array.from(map, ([name, qty]) => ({ name, qty: round(qty, 3) })).sort((a, b) => b.qty - a.qty);
    sales = { total: round(total, 3), byRep: sorted(byRep), byCustomer: sorted(byCustomer).slice(0, 10) };
  }

  // الخامات: الاستهلاك = منصرف الإنتاج، والوارد = الشراء بالمورد - raw: consumption = production out, receipts = purchases by supplier
  let raw: StockDetails["raw"] = null;
  if (group === "wood" || group === "packaging") {
    const bySupplier = new Map<string, number>();
    let consumption = 0;
    let purchasesTotal = 0;
    for (const v of Array.from(vouchers.values())) {
      if (v.category === "إنتاج" && v.net < 0) consumption -= v.net;
      if (v.category === "شراء" && v.net > 0) {
        purchasesTotal += v.net;
        bySupplier.set(v.party || "—", (bySupplier.get(v.party || "—") ?? 0) + v.net);
      }
    }
    raw = {
      consumption: round(consumption, 3),
      purchasesTotal: round(purchasesTotal, 3),
      bySupplier: Array.from(bySupplier, ([name, qty]) => ({ name, qty: round(qty, 3) })).sort((a, b) => b.qty - a.qty),
    };
  }

  // الرصيد في كل مخزن النهارده - the balance per warehouse today
  const perWarehouse = new Map<string, { warehouse: string; qty: number; excluded: boolean }>();
  let balance = 0;
  let uom = "";
  for (const entry of Array.from(current.values())) {
    uom ||= entry.uom;
    const scoped = inScope(entry.itemCode, entry.warehouse);
    if (scoped) balance += entry.qty;
    const w = perWarehouse.get(entry.warehouse) ?? { warehouse: entry.warehouse, qty: 0, excluded: !scoped };
    w.qty = round(w.qty + entry.qty);
    perWarehouse.set(entry.warehouse, w);
  }
  const factor = 10 ** decimals;

  return {
    group,
    name,
    variant,
    variants,
    itemCodes: codes,
    unit: SHORT_UNITS[uom || rows[0]?.stock_uom] ?? (uom || rows[0]?.stock_uom || ""),
    decimals,
    today,
    month,
    from,
    to,
    months,
    balance: Math.round(balance * factor) / factor,
    warehouses: Array.from(perWarehouse.values()).sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.qty - a.qty),
    openingBalance,
    closingBalance,
    totalIn: round(totalIn),
    totalOut: round(totalOut),
    byCategory: byCategory.map((c) => ({ ...c, in: round(c.in), out: round(c.out) })),
    daily: Array.from(daily.values()).map((d) => ({ ...d, in: round(d.in, 3), out: round(d.out, 3) })),
    sales,
    raw,
    moves: moves.reverse(),
    erpUrl: (process.env.FACTORY_API_URL ?? "").replace(/\/+$/, ""),
  };
}

// كاش 60 ثانية لكل (كارت، نوع، شهر) - 60 s cache per (card, variant, month)
const cache = new Map<string, { at: number; data: StockDetails }>();
const pending = new Map<string, Promise<StockDetails>>();

export async function stockDetails(group: StockGroup, name: string, variant: string | null, month: string | null): Promise<StockDetails> {
  const today = erpToday();
  const wanted = month ?? today.slice(0, 7);
  const key = `${group}|${name}|${variant ?? ""}|${wanted}|${today}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  let request = pending.get(key);
  if (!request) {
    request = load(group, name, variant, wanted, today)
      .then((data) => {
        for (const [k, v] of Array.from(cache)) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
        cache.set(key, { at: Date.now(), data });
        return data;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}
