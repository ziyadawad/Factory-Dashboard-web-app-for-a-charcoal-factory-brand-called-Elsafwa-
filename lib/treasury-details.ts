// تفاصيل الخزنة: حركات GL Entry على حساب الخزنة (نفس حساب الكارت) - بتتجاب بس لما اللوحة تتفتح، كاش 30 ثانية
// Treasury details: GL Entries of the treasury account (same account as the card) - fetched only when the panel opens, 30 s cache
// قراية بس من ERPNext - read-only from ERPNext
import { dashboardConfig } from "@/config/dashboard.config";
import { erpCall, erpGet, erpToday } from "./erp";
import { TreasuryDetails, TreasuryMove } from "./types";

const CACHE_MS = 30_000;
const LOOKBACK_DAYS = 15; // آخر 15 يوم (النهارده منهم) - last 15 days including today

type GlRow = {
  name: string;
  posting_date: string;
  creation: string;
  debit: number | null;
  credit: number | null;
  party: string | null;
  against: string | null;
  remarks: string | null;
  voucher_type: string;
  voucher_no: string;
  owner: string;
};

async function list<T>(doctype: string, params: Record<string, unknown>): Promise<T[]> {
  const query: Record<string, string | number> = { limit_page_length: 0 };
  for (const [name, value] of Object.entries(params)) query[name] = typeof value === "string" ? value : JSON.stringify(value);
  return (await erpGet<{ data: T[] }>(`/api/resource/${encodeURIComponent(doctype)}`, query)).data;
}

const money = (value: number | null | undefined) => Math.round((Number(value) || 0) * 100) / 100;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// "2026-11-07 14:45:24.84" بتوقيت مصر ← epoch ms (مصر فيها توقيت صيفي فبنحسب الفرق من Intl)
// Cairo local time -> epoch ms (Egypt has DST, so the offset comes from Intl)
const cairoParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
function cairoEpoch(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return Date.parse(text) || 0;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const p = Object.fromEntries(cairoParts.formatToParts(new Date(asUtc)).map((x) => [x.type, x.value]));
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - asUtc;
  return asUtc - offset;
}

// إيميل ← الاسم الكامل (User.full_name)، ولو مش متاح الإيميل نفسه - email -> full name, or the email itself
async function fullNames(owners: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (owners.length === 0) return names;
  try {
    const users = await list<{ name: string; full_name: string | null }>("User", {
      filters: [["name", "in", owners]],
      fields: ["name", "full_name"],
    });
    for (const user of users) if (user.full_name?.trim()) names.set(user.name, user.full_name.trim());
  } catch (error) {
    console.warn("[erp] User full names not readable:", error instanceof Error ? error.message : error);
  }
  return names;
}

async function load(today: string): Promise<TreasuryDetails> {
  const field = dashboardConfig.erp.treasury.balance;
  if (field.source !== "erp") throw new Error("treasury balance is not from ERPNext");
  const account = field.account;
  const monthStart = `${today.slice(0, 7)}-01`;
  const lookback = addDays(today, -(LOOKBACK_DAYS - 1));
  const from = monthStart < lookback ? monthStart : lookback;
  const fields = ["name", "posting_date", "creation", "debit", "credit", "party", "against", "remarks", "voucher_type", "voucher_no", "owner"];

  const [rows, lastRows, balance, opening] = await Promise.all([
    list<GlRow>("GL Entry", {
      filters: [
        ["account", "=", account],
        ["is_cancelled", "=", 0],
        ["posting_date", ">=", from],
        ["posting_date", "<=", today],
      ],
      fields,
      order_by: "posting_date asc, creation asc",
    }),
    // آخر تسجيل فعلي (بالـ creation) حتى لو تاريخه قديم - the latest real entry (by creation), whatever its date
    erpGet<{ data: GlRow[] }>(`/api/resource/${encodeURIComponent("GL Entry")}`, {
      filters: JSON.stringify([["account", "=", account], ["is_cancelled", "=", 0]]),
      fields: JSON.stringify(fields),
      order_by: "creation desc",
      limit_page_length: 1,
    }).then((r) => r.data),
    erpCall<number>("erpnext.accounts.utils.get_balance_on", { account, date: today }),
    erpCall<number>("erpnext.accounts.utils.get_balance_on", { account, date: addDays(from, -1) }),
  ]);
  if (typeof balance !== "number" || typeof opening !== "number") throw new Error(`${account}: balance is not a number`);

  const names = await fullNames(Array.from(new Set([...rows, ...lastRows].map((r) => r.owner).filter(Boolean))));
  const nameOf = (owner: string) => names.get(owner) ?? owner;

  // ترتيب ERPNext (التاريخ ثم وقت التسجيل) للرصيد بعد كل حركة - ERPNext order (date, then creation) for the running balance
  rows.sort((a, b) => a.posting_date.localeCompare(b.posting_date) || a.creation.localeCompare(b.creation));
  let running = money(opening);
  const moves: TreasuryMove[] = rows.map((row) => {
    const debit = money(row.debit);
    const credit = money(row.credit);
    running = money(running + debit - credit);
    const postingDate = String(row.posting_date).slice(0, 10);
    return {
      id: row.name,
      postingDate,
      creation: String(row.creation).slice(0, 16),
      createdAt: cairoEpoch(row.creation),
      lateDays: Math.max(0, dayDiff(postingDate, String(row.creation).slice(0, 10))),
      debit,
      credit,
      balanceAfter: running,
      party: (row.party || row.against || "").trim(),
      remarks: (row.remarks || "").trim(),
      voucherType: row.voucher_type,
      voucherNo: row.voucher_no,
      owner: nameOf(row.owner),
    };
  });
  if (Math.abs(running - money(balance)) > 0.01) {
    console.warn(`[erp] treasury details: running balance ${running} != get_balance_on ${balance}`);
  }

  const todays = moves.filter((m) => m.postingDate === today);
  const last = lastRows[0];
  return {
    account,
    today,
    from,
    monthStart,
    balance: money(balance),
    openingBalance: money(opening),
    incomingToday: money(todays.reduce((sum, m) => sum + m.debit, 0)),
    outgoingToday: money(todays.reduce((sum, m) => sum + m.credit, 0)),
    movesToday: todays.length,
    lastEntry: last
      ? { creation: String(last.creation).slice(0, 16), createdAt: cairoEpoch(last.creation), owner: nameOf(last.owner) }
      : null,
    erpUrl: (process.env.FACTORY_API_URL ?? "").replace(/\/+$/, ""),
    moves: moves.reverse(),
  };
}

// طلب واحد كل 30 ثانية بالكتير - at most one ERPNext round per 30 s
let cached: { at: number; data: TreasuryDetails } | null = null;
let pending: Promise<TreasuryDetails> | null = null;

export async function treasuryDetails(): Promise<TreasuryDetails> {
  const today = erpToday();
  if (cached && cached.data.today === today && Date.now() - cached.at < CACHE_MS) return cached.data;
  if (!pending) {
    pending = load(today)
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
