// اللي بيحصل دلوقتي: كل الأحداث بتاعة النهارده من كذا مصدر في ليستة واحدة مترتبة بالوقت (الأحدث الأول)
// قراية بس من ERPNext، كاش activity.cacheSeconds. كل مصدر لوحده: لو واحد فشل الباقي بيكمل (وبيفضل آخر نتيجة نجحت ليه)
// The live activity feed: today's events from several sources merged and sorted by time (newest first).
// Read-only, cached activity.cacheSeconds. Each source on its own: one failing never stops the others
// (its last good result stays).
// الوقت: GL Entry / Kiln Exit / Charity = creation، المستندات المعتمدة (فاتورة، إذن مخزن، تسوية) = modified (وقت الاعتماد تقريبا)
// Time: GL Entry / Kiln Exit / Charity = creation; submitted documents (invoice, stock entry, adjustment) = modified (≈ submit time)

import { erpPost, erpToday } from "./erp";
import { describeOutgoing, GlRow, shortAccount } from "./account-details";
import { doctypeInfo, BatchesMapping } from "./production";
import { normalizeArabic } from "./data-source";
import { packetsOf, productOfItem } from "./sales";
import { ActivityData, ActivityEvent, MoveOut } from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

const config = dashboardConfig.activity;
const enabled = (type: (typeof config.enabledTypes)[number]) => config.enabledTypes.includes(type);

async function getList<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", { doctype, limit_page_length: 0, ...body });
  return message;
}

const money = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const stamp = (value: unknown) => String(value ?? "").slice(0, 19); // "2026-11-14 13:43:09.068071" -> "2026-11-14 13:43:09"
const qtyText = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

// "الآن" بتوقيت القاهرة بنفس شكل ERPNext - now in Cairo, in the ERPNext format
function cairoNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// ===== وارد ومنصرف الخزنة والمحافظ - treasury and wallet moves =====

// أرقام الحسابات ← اسمها الكامل واسمها على الشاشة (الخزنة + كل المحافظ) - account numbers -> full name and screen label
let accountsCache: Map<string, string> | null = null;
async function moneyAccounts(): Promise<Map<string, string>> {
  if (accountsCache) return accountsCache;
  const treasury = dashboardConfig.erp.treasury.balance;
  const labels = new Map<string, string>(dashboardConfig.wallets.accounts.map((a) => [a.accountNumber, a.label]));
  if (treasury.source === "erp") labels.set(treasury.account.split(" - ")[0].trim(), "الخزنة");
  const rows = await getList<{ name: string; account_number: string }>("Account", {
    filters: [
      ["account_number", "in", Array.from(labels.keys())],
      ["company", "=", dashboardConfig.wallets.company],
      ["is_group", "=", 0],
    ],
    fields: ["name", "account_number"],
  });
  accountsCache = new Map(rows.map((r) => [r.name, labels.get(String(r.account_number)) ?? shortAccount(r.name)]));
  return accountsCache;
}

type GlActivityRow = GlRow & { account: string; party_type: string | null };

// تصنيف المنصرف (لمين وليه) مرة واحدة لكل سطر - each outgoing row is classified once
const outCache = new Map<string, MoveOut>();

async function moneyEvents(since: string): Promise<ActivityEvent[]> {
  const accounts = await moneyAccounts();
  if (accounts.size === 0) return [];
  const rows = await getList<GlActivityRow>("GL Entry", {
    filters: [
      ["account", "in", Array.from(accounts.keys())],
      ["is_cancelled", "=", 0],
      ["creation", ">=", since],
    ],
    fields: ["name", "account", "posting_date", "creation", "debit", "credit", "party_type", "party", "against", "remarks", "voucher_type", "voucher_no", "owner"],
    order_by: "creation desc",
  });
  // المنصرف الجديد بس بيتصنف (بنفس طريقة لوحة الخزنة) - only new outgoing rows are classified (as in the treasury panel)
  const byAccount = new Map<string, GlActivityRow[]>();
  for (const row of rows) {
    if (money(row.credit) > 0 && !outCache.has(row.name)) byAccount.set(row.account, [...(byAccount.get(row.account) ?? []), row]);
  }
  await Promise.all(
    Array.from(byAccount, async ([account, list]) => {
      const described = await describeOutgoing(account, list);
      described.forEach((move, name) => outCache.set(name, move));
    })
  );

  return rows.flatMap((row): ActivityEvent[] => {
    const label = accounts.get(row.account) ?? shortAccount(row.account);
    const debit = money(row.debit);
    const credit = money(row.credit);
    if (debit <= 0 && credit <= 0) return [];
    const party = (row.party || "").trim() || shortAccount((row.against || "").split(",")[0] ?? "");
    if (debit > 0) {
      return [{
        id: `gl:${row.name}`,
        kind: "in",
        at: stamp(row.creation),
        title: `وارد — ${label}`,
        details: party || row.voucher_type,
        amount: debit,
        extra: null,
        badge: row.voucher_type === "Payment Entry" && /مستلم من/.test(row.remarks ?? "") ? "تحصيل" : null,
        doctype: row.voucher_type,
        docname: row.voucher_no,
      }];
    }
    const out = outCache.get(row.name);
    return [{
      id: `gl:${row.name}`,
      kind: "out",
      at: stamp(row.creation),
      title: `منصرف — ${label}`,
      details: out?.name || out?.account || party || row.voucher_type,
      amount: credit,
      extra: null,
      badge: out?.kind ?? null,
      doctype: row.voucher_type,
      docname: row.voucher_no,
    }];
  });
}

// ===== طرحات - kiln exits =====
async function kilnEvents(since: string): Promise<ActivityEvent[]> {
  const mapping = dashboardConfig.erp.batches;
  if (mapping.source !== "erp") return [];
  const info = await doctypeInfo(mapping as BatchesMapping);
  const fields = ["name", "creation", "kiln", mapping.typeField, ...(info.hasWeight ? [mapping.weightField] : [])];
  const rows = await getList<Record<string, string | number | null>>(mapping.exitsDoctype, {
    filters: [
      ["creation", ">=", since],
      ["docstatus", "!=", 2],
    ],
    fields,
  });
  return rows.map((row) => {
    const kg = info.hasWeight ? Number(row[mapping.weightField]) : NaN;
    return {
      id: `kiln:${row.name}`,
      kind: "kiln",
      at: stamp(row.creation),
      title: "طرحة خرجت",
      details: [String(row.kiln ?? "").trim(), String(row[mapping.typeField] ?? "").trim()].filter(Boolean).join(" · "),
      amount: null,
      extra: Number.isFinite(kg) && kg > 0 ? `${qtyText(kg)} كجم` : "بدون وزن",
      badge: null,
      doctype: mapping.exitsDoctype,
      docname: String(row.name),
    };
  });
}

// ===== فواتير البيع والمرتجعات - sales invoices and returns =====
type InvoiceRow = {
  name: string;
  modified: string;
  customer_name: string | null;
  customer: string;
  grand_total: number | null;
  is_return: number;
  item_code: string | null;
  stock_qty: number | null;
  warehouse: string | null;
};
async function saleEvents(since: string): Promise<ActivityEvent[]> {
  const child = "`tabSales Invoice Item`";
  const rows = await getList<InvoiceRow>("Sales Invoice", {
    filters: [
      ["docstatus", "=", 1],
      ["modified", ">=", since],
    ],
    fields: ["name", "modified", "customer", "customer_name", "grand_total", "is_return", `${child}.item_code as item_code`, `${child}.stock_qty as stock_qty`, `${child}.warehouse as warehouse`],
  });
  const packaged = productOfItem();
  const repOf = new Map(dashboardConfig.sales.reps.map((r) => [r.warehouse, r.name]));
  const invoices = new Map<string, { row: InvoiceRow; packets: number; rep: string | null }>();
  for (const row of rows) {
    const inv = invoices.get(row.name) ?? { row, packets: 0, rep: null };
    if (row.item_code && packaged.has(row.item_code)) inv.packets += Math.abs(packetsOf(row.item_code, Number(row.stock_qty) || 0));
    if (!inv.rep && row.warehouse) inv.rep = repOf.get(row.warehouse) ?? null;
    invoices.set(row.name, inv);
  }
  return Array.from(invoices.values()).map(({ row, packets, rep }) => {
    const customer = (row.customer_name || row.customer || "").trim();
    const isReturn = Number(row.is_return) === 1;
    return {
      id: `sale:${row.name}`,
      kind: isReturn ? "return" : "sale",
      at: stamp(row.modified),
      title: isReturn ? "مرتجع" : "فاتورة بيع",
      details: rep ? `${rep} · ${customer}` : customer,
      amount: Math.abs(money(row.grand_total)),
      extra: packets > 0 ? `${qtyText(Math.round(packets))} باكت` : null,
      badge: rep ? "مندوب" : null,
      doctype: "Sales Invoice",
      docname: row.name,
    };
  });
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
type StockRow = {
  name: string;
  modified: string;
  purpose: string;
  stock_entry_type: string | null;
  item_name: string | null;
  qty: number | null;
  uom: string | null;
  is_finished_item: number | null;
};
async function stockEvents(since: string): Promise<ActivityEvent[]> {
  const child = "`tabStock Entry Detail`";
  const rows = await getList<StockRow>("Stock Entry", {
    filters: [
      ["docstatus", "=", 1],
      ["modified", ">=", since],
    ],
    fields: ["name", "modified", "purpose", "stock_entry_type", `${child}.item_name as item_name`, `${child}.qty as qty`, `${child}.uom as uom`, `${child}.is_finished_item as is_finished_item`],
  });
  const entries = new Map<string, StockRow[]>();
  for (const row of rows) entries.set(row.name, [...(entries.get(row.name) ?? []), row]);
  return Array.from(entries.values()).map((lines) => {
    const first = lines[0];
    // الصنف الأساسي: المنتج التام في التصنيع، وإلا أكبر كمية - the main item: the finished one, else the largest qty
    const main = lines.find((l) => Number(l.is_finished_item) === 1) ?? [...lines].sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0))[0];
    const others = new Set(lines.map((l) => l.item_name)).size - 1;
    const purpose = PURPOSES[first.purpose] ?? first.stock_entry_type ?? first.purpose;
    const unit = (main.uom || "").trim();
    const item = (main.item_name || "").trim();
    return {
      id: `stock:${first.name}`,
      kind: "stock",
      at: stamp(first.modified),
      title: purpose,
      details: `${item}${others > 0 ? ` (+${others} أصناف)` : ""}`,
      amount: null,
      // "20 باكت ربع" - الوحدة لو هي نفس اسم الصنف مش بتتكرر - the unit is not repeated when it equals the item name
      extra: `${qtyText(Number(main.qty) || 0)}${unit && normalizeArabic(unit) !== normalizeArabic(item) ? ` ${unit}` : ""}`,
      badge: null,
      doctype: "Stock Entry",
      docname: first.name,
    };
  });
}

// ===== الصدقات - charity =====
async function charityEvents(since: string): Promise<ActivityEvent[]> {
  const rows = await getList<{ name: string | number; creation: string; fund: string; txn_type: string; amount: number | null; beneficiary: string | null }>(
    dashboardConfig.erp.charity.doctype,
    {
      filters: [["creation", ">=", since]],
      fields: ["name", "creation", "fund", "txn_type", "amount", "beneficiary"],
    }
  );
  return rows.map((row) => ({
    id: `charity:${row.name}`,
    kind: "charity",
    at: stamp(row.creation),
    title: `صدقات — ${(row.txn_type || "").trim()}`,
    details: [row.fund, (row.beneficiary || "").trim()].filter(Boolean).join(" · "),
    amount: money(row.amount),
    extra: null,
    badge: null,
    doctype: dashboardConfig.erp.charity.doctype,
    docname: String(row.name),
  }));
}

// ===== تسويات المرتبات: النوع واسم الموظف بس، من غير مبلغ (المرتبات سرية) =====
// Salary adjustments: the type and the employee name only, never the amount (salaries stay private)
async function salaryEvents(since: string): Promise<ActivityEvent[]> {
  const rows = await getList<{ name: string; modified: string; employee: string; employee_name: string | null; adjustment_type: string | null }>(
    "Salary Adjustment",
    {
      filters: [
        ["docstatus", "=", 1],
        ["modified", ">=", since],
      ],
      fields: ["name", "modified", "employee", "employee_name", "adjustment_type"],
    }
  );
  return rows.map((row) => ({
    id: `salary:${row.name}`,
    kind: "salary",
    at: stamp(row.modified),
    title: "تسوية مرتب",
    details: (row.employee_name || row.employee || "").trim(),
    amount: null,
    extra: null,
    badge: (row.adjustment_type || "").trim() || null,
    doctype: "Salary Adjustment",
    docname: row.name,
  }));
}

const SOURCES: { type: (typeof config.enabledTypes)[number]; load: (since: string) => Promise<ActivityEvent[]> }[] = [
  { type: "money", load: moneyEvents },
  { type: "kiln", load: kilnEvents },
  { type: "sales", load: saleEvents },
  { type: "stock", load: stockEvents },
  { type: "charity", load: charityEvents },
  { type: "salary", load: salaryEvents },
];

// أحداث النهارده كلها (كاش)، وكل مصدر بآخر نتيجة نجحت لو فشل - all of today's events (cached); each source keeps its last good result
const lastGood = new Map<string, { day: string; events: ActivityEvent[] }>();
let cached: { at: number; data: ActivityData } | null = null;
let inFlight: Promise<ActivityData> | null = null;

async function loadToday(): Promise<ActivityData> {
  const today = erpToday();
  const start = `${today} 00:00:00`;
  const results = await Promise.all(
    SOURCES.filter((s) => enabled(s.type)).map(async (source) => {
      try {
        const events = (await source.load(start)).filter((e) => e.at >= start);
        lastGood.set(source.type, { day: today, events });
        return { events, failed: false };
      } catch (error) {
        console.error(`[erp] activity ${source.type} failed:`, error instanceof Error ? error.message : error);
        const fallback = lastGood.get(source.type);
        return { events: fallback?.day === today ? fallback.events : [], failed: true };
      }
    })
  );
  const events = results.flatMap((r) => r.events).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  return { now: cairoNow(), events, offline: results.length > 0 && results.every((r) => r.failed) };
}

function todayActivity(): Promise<ActivityData> {
  if (cached && Date.now() - cached.at < config.cacheSeconds * 1000) return Promise.resolve(cached.data);
  if (!inFlight) {
    inFlight = loadToday()
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// since فاضي = أول تحميل: آخر listSize + 1 حدث النهارده. since = "YYYY-MM-DD HH:MM:SS" = اللي حصل من الوقت ده
// No since = first load: today's last listSize + 1 events. With since: every event at or after that time
export async function activity(since: string | null): Promise<ActivityData> {
  const data = await todayActivity();
  const events = since ? data.events.filter((e) => e.at >= since) : data.events.slice(0, config.listSize + 1);
  return { ...data, events };
}
