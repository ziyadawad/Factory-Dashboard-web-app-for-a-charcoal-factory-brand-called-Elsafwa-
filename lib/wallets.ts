// الخزن والمحافظ (الصفحة 5) - cash wallets / Fawry (page 5)
// قراية بس من ERPNext: رصيد الحساب (get_balance_on) وقيود GL Entry - read-only: account balance and GL entries
import { dashboardConfig } from "@/config/dashboard.config";
import { erpCall, erpPost, erpToday } from "./erp";
import { WalletCard, WalletNumbers, Wallets } from "./types";

const config = dashboardConfig.wallets;

const money = (value: number) => Math.round(value * 100) / 100;

type GlRow = { account: string; posting_date: string; debit: number | null; credit: number | null };

async function glList<T>(body: Record<string, unknown>): Promise<T[]> {
  const { message } = await erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", {
    doctype: "GL Entry",
    ...body,
  });
  return message;
}

// وارد ومنصرف النهارده لكل الحسابات في طلب واحد - today's debit / credit for every account, one request
async function todayTotals(accounts: string[], today: string) {
  const rows = await glList<GlRow>({
    filters: [
      ["account", "in", accounts],
      ["posting_date", "=", today],
      ["is_cancelled", "=", 0],
    ],
    fields: ["account", "sum(debit) as debit", "sum(credit) as credit"],
    group_by: "account",
    limit_page_length: 0,
  });
  return new Map(rows.map((row) => [row.account, { debit: row.debit ?? 0, credit: row.credit ?? 0 }]));
}

// آخر قيد على الحساب لحد النهارده - the latest GL entry of the account up to today
async function lastMove(account: string, today: string): Promise<WalletNumbers["lastMove"]> {
  const [row] = await glList<GlRow>({
    filters: [
      ["account", "=", account],
      ["posting_date", "<=", today],
      ["is_cancelled", "=", 0],
    ],
    fields: ["account", "posting_date", "debit", "credit"],
    order_by: "posting_date desc, creation desc",
    limit_page_length: 1,
  });
  if (!row) return null;
  const net = (row.debit ?? 0) - (row.credit ?? 0);
  return { date: String(row.posting_date).slice(0, 10), amount: money(Math.abs(net)), direction: net >= 0 ? "in" : "out" };
}

async function loadWallet(account: string, today: string, totals: Promise<Map<string, { debit: number; credit: number }>>) {
  const [balance, todayMap, last] = await Promise.all([
    erpCall<number>("erpnext.accounts.utils.get_balance_on", { account, date: today }),
    totals,
    lastMove(account, today),
  ]);
  if (typeof balance !== "number" || !Number.isFinite(balance)) throw new Error(`${account}: balance is not a number`);
  const flow = todayMap.get(account) ?? { debit: 0, credit: 0 };
  return {
    balance: money(balance),
    incomingToday: money(flow.debit),
    outgoingToday: money(flow.credit),
    lastMove: last,
  } satisfies WalletNumbers;
}

// آخر أرقام نجحت لكل حساب (في ذاكرة السيرفر) - last good numbers per account (server memory)
const lastGood = new Map<string, { day: string; numbers: WalletNumbers }>();
let cached: { at: number; value: Wallets } | null = null;
let inFlight: Promise<{ value: Wallets; errors: string[] }> | null = null;

async function load(): Promise<{ value: Wallets; errors: string[] }> {
  const today = erpToday();
  const accounts = config.accounts.map((a) => a.account).filter(Boolean);
  const totals = accounts.length > 0 ? todayTotals(accounts, today) : Promise.resolve(new Map());
  totals.catch(() => undefined); // الغلط بيتسجل مع كل كارت - the error is reported per card
  const errors: string[] = [];

  const list = await Promise.all(
    config.accounts.map(async ({ name, account, kind }): Promise<WalletCard> => {
      if (!account) return { name, kind, linked: false, offline: false, numbers: null };
      try {
        const numbers = await loadWallet(account, today, totals);
        lastGood.set(account, { day: today, numbers });
        return { name, kind, linked: true, offline: false, numbers };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        // آخر أرقام نجحت النهارده بس (وارد/منصرف اليوم بيتصفروا كل يوم) - only today's last good numbers
        const fallback = lastGood.get(account);
        const numbers = fallback?.day === today ? fallback.numbers : null;
        console.error(`[erp] wallet ${account} failed, showing ${numbers ? "last good value" : '"غير متصل"'}:`, message);
        return { name, kind, linked: true, offline: true, numbers };
      }
    })
  );
  return { value: { list }, errors };
}

// كاش wallets.cacheSeconds: ERPNext بيتسأل مرة كل 10 ثواني بالكتير - ERPNext is asked at most once per cacheSeconds
export async function walletsSection(results: { fromErp: boolean; failed: boolean; error?: string }[]): Promise<Wallets> {
  if (cached && Date.now() - cached.at < config.cacheSeconds * 1000) return cached.value;
  inFlight ??= load().finally(() => (inFlight = null));
  const { value, errors } = await inFlight;
  for (const card of value.list) if (card.linked) results.push({ fromErp: true, failed: card.offline });
  // رسايل الغلط بس (من غير ما تتعد رقم تاني) - error messages only, not counted as extra numbers
  for (const error of Array.from(new Set(errors))) results.push({ fromErp: false, failed: true, error });
  // النتيجة اللي فيها فشل مش بتتكيّش عشان المحاولة الجاية تبقى على طول - failed results are not cached
  if (errors.length === 0) cached = { at: Date.now(), value };
  return value;
}
