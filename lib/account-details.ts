// تفاصيل حساب (الخزنة في الرئيسية، والمحافظ في صفحة الخزن والمحافظ): حركات GL Entry على الحساب برقمه
// Account details (the treasury on the main page, the wallets on the wallets page): GL Entries of the account by its number
// بتتجاب بس لما اللوحة تتفتح، كاش 30 ثانية، قراية بس من ERPNext
// Fetched only when a panel opens, 30 s cache, read-only from ERPNext
import { dashboardConfig } from "@/config/dashboard.config";
import { erpBalanceOn, erpPost, erpToday } from "./erp";
import { AccountDetails, AccountMonth, AccountMove } from "./types";

const CACHE_MS = 30_000;
const LOOKBACK_DAYS = 15; // وضع الخزنة: آخر 15 يوم (النهارده منهم) - treasury mode: last 15 days including today

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

const GL_FIELDS = ["name", "posting_date", "creation", "debit", "credit", "party", "against", "remarks", "voucher_type", "voucher_no", "owner"];

async function getList<T>(doctype: string, body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", {
    doctype,
    limit_page_length: 0,
    ...body,
  });
  return message;
}

const money = (value: number | null | undefined) => Math.round((Number(value) || 0) * 100) / 100;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// آخر يوم في الشهر - the month's last day ("2026-11" -> "2026-11-30")
function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
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

// رقم الحساب ← اسمه الكامل في ERPNext (شركة wallets.company) - account number -> full ERPNext name
const resolved = new Map<string, string>();
async function accountName(accountNumber: string): Promise<string> {
  const known = resolved.get(accountNumber);
  if (known) return known;
  const rows = await getList<{ name: string }>("Account", {
    filters: [
      ["account_number", "=", accountNumber],
      ["company", "=", dashboardConfig.wallets.company],
      ["is_group", "=", 0],
    ],
    fields: ["name"],
  });
  if (!rows[0]) throw new UnknownAccountError(`Account ${accountNumber} not found`);
  resolved.set(accountNumber, rows[0].name);
  return rows[0].name;
}

export class UnknownAccountError extends Error {}

// إيميل ← الاسم الكامل (User.full_name)، ولو مش متاح الإيميل نفسه - email -> full name, or the email itself
export async function fullNames(owners: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (owners.length === 0) return names;
  try {
    const users = await getList<{ name: string; full_name: string | null }>("User", {
      filters: [["name", "in", owners]],
      fields: ["name", "full_name"],
    });
    for (const user of users) if (user.full_name?.trim()) names.set(user.name, user.full_name.trim());
  } catch (error) {
    console.warn("[erp] User full names not readable:", error instanceof Error ? error.message : error);
  }
  return names;
}

// الشهور اللي فيها حركات (الأحدث الأول) - months that have movements, newest first
async function monthsOf(account: string, today: string): Promise<AccountMonth[]> {
  const rows = await getList<{ y: number; m: number; n: number }>("GL Entry", {
    filters: [
      ["account", "=", account],
      ["is_cancelled", "=", 0],
      ["posting_date", "<=", today],
    ],
    fields: ["year(posting_date) as y", "month(posting_date) as m", "count(name) as n"],
    group_by: "year(posting_date), month(posting_date)",
    order_by: "y desc, m desc",
  });
  return rows.map((r) => ({ month: `${r.y}-${String(r.m).padStart(2, "0")}`, count: Number(r.n) || 0 }));
}

// month = "YYYY-MM" (وضع الشهور للمحافظ)، أو من غيره (وضع الخزنة: آخر 15 يوم أو الشهر ده أيهم أطول)
// month = "YYYY-MM" (month mode, wallets); without it treasury mode: the last 15 days or this month, whichever is longer
async function load(accountNumber: string, month: string | null, today: string): Promise<AccountDetails> {
  const account = await accountName(accountNumber);
  const monthStart = `${(month ?? today).slice(0, 7)}-01`;
  const lookback = addDays(today, -(LOOKBACK_DAYS - 1));
  const from = month ? monthStart : monthStart < lookback ? monthStart : lookback;
  const to = month && monthEnd(month) < today ? monthEnd(month) : today;

  const [rows, lastRows, balance, opening, months] = await Promise.all([
    from > to
      ? Promise.resolve([] as GlRow[])
      : getList<GlRow>("GL Entry", {
          filters: [
            ["account", "=", account],
            ["is_cancelled", "=", 0],
            ["posting_date", ">=", from],
            ["posting_date", "<=", to],
          ],
          fields: GL_FIELDS,
          order_by: "posting_date asc, creation asc",
        }),
    // آخر تسجيل فعلي (بالـ creation) حتى لو تاريخه قديم - the latest real entry (by creation), whatever its date
    getList<GlRow>("GL Entry", {
      filters: [
        ["account", "=", account],
        ["is_cancelled", "=", 0],
      ],
      fields: GL_FIELDS,
      order_by: "creation desc",
      limit_page_length: 1,
    }),
    erpBalanceOn(account, today),
    // الرصيد قبل أول يوم - the balance before the first day
    erpBalanceOn(account, addDays(from, -1)),
    month ? monthsOf(account, today) : Promise.resolve([] as AccountMonth[]),
  ]);
  if (typeof balance !== "number" || typeof opening !== "number") throw new Error(`${account}: balance is not a number`);

  const names = await fullNames(Array.from(new Set([...rows, ...lastRows].map((r) => r.owner).filter(Boolean))));
  const nameOf = (owner: string) => names.get(owner) ?? owner;

  // ترتيب ERPNext (التاريخ ثم وقت التسجيل) للرصيد بعد كل حركة - ERPNext order (date, then creation) for the running balance
  rows.sort((a, b) => a.posting_date.localeCompare(b.posting_date) || a.creation.localeCompare(b.creation));
  let running = money(opening);
  const moves: AccountMove[] = rows.map((row) => {
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
  if (to === today && Math.abs(running - money(balance)) > 0.01) {
    console.warn(`[erp] account details ${accountNumber}: running balance ${running} != GL balance ${balance}`);
  }

  const todays = moves.filter((m) => m.postingDate === today);
  const last = lastRows[0];
  return {
    accountNumber,
    account,
    today,
    from,
    to,
    month: month ?? null,
    monthStart,
    months,
    balance: money(balance),
    openingBalance: money(opening),
    closingBalance: running,
    totalIn: money(moves.reduce((sum, m) => sum + m.debit, 0)),
    totalOut: money(moves.reduce((sum, m) => sum + m.credit, 0)),
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

// كاش 30 ثانية لكل (حساب، شهر) - 30 s cache per (account, month)
const cache = new Map<string, { at: number; data: AccountDetails }>();
const pending = new Map<string, Promise<AccountDetails>>();

export async function accountDetails(accountNumber: string, month: string | null): Promise<AccountDetails> {
  const today = erpToday();
  const key = `${accountNumber}|${month ?? "recent"}|${today}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  let request = pending.get(key);
  if (!request) {
    request = load(accountNumber, month, today)
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
