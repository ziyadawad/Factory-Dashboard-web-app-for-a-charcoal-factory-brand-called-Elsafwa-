// تفاصيل صناديق الصدقات (الضغط على كارت صندوق أو "إجمالي صرف الشهر / اليوم" في صفحة الصدقات)
// Charity fund details (clicking a fund card, or the month / today spending boxes on the charity page)
// بتتجاب بس لما اللوحة تتفتح، كاش 30 ثانية، قراية بس من ERPNext
// Fetched only when a panel opens, 30 s cache, read-only from ERPNext
import { dashboardConfig } from "@/config/dashboard.config";
import { erpToday } from "./erp";
import { fullNames } from "./account-details";
import { charityDuplicates, charityRowUrl, loadCharityRaw, sourceOf, unfundedCharity } from "./charity-auto";
import { CharityDetailOp, CharityDetails, CharityDuplicatePair } from "./types";

const CACHE_MS = 30_000;

// نفس أنواع كارت الصدقات - same types as the charity cards
const TYPES: Record<string, CharityDetailOp["type"]> = { صرف: "out", إيداع: "in", "رصيد افتتاحي": "opening" };

const money = (value: number) => Math.round(value * 100) / 100;
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// "2026-11-07 14:45:24" بتوقيت مصر ← epoch ms - Cairo local time -> epoch ms (offset from Intl, Egypt has DST)
const cairoParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
function cairoEpoch(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return Date.parse(text) || 0;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const p = Object.fromEntries(cairoParts.formatToParts(new Date(asUtc)).map((x) => [x.type, x.value]));
  return asUtc - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - asUtc);
}

export class UnknownFundError extends Error {}

// كل العمليات (كل الصناديق، الأقدم الأول) بأرصدتها بعد كل عملية - every operation, oldest first, with running balances
type Loaded = { ops: CharityDetailOp[]; pairs: CharityDuplicatePair[] };
let cache: { at: number; value: Loaded } | null = null;
let inFlight: Promise<Loaded> | null = null;

async function loadAll(): Promise<Loaded> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { funds } = dashboardConfig.erp.charity;
    const rows = await loadCharityRaw("asc");
    // المتسجلة مرتين: اليدوية بتظهر بس مش بتتحسب في الرصيد - recorded twice: the manual copy shows but is not counted
    const dups = charityDuplicates(rows);
    const names = await fullNames(Array.from(new Set(rows.map((r) => r.owner ?? "").filter(Boolean))));
    const known = new Set(funds);
    const balances = new Map<string, number>();
    let total = 0;
    const ops: CharityDetailOp[] = [];
    for (const r of rows) {
      const fund = (r.fund ?? "").trim();
      const type = TYPES[(r.txn_type ?? "").trim()];
      // نفس الكارت: صندوق أو نوع مش معروف بيتساب - same as the cards: unknown fund / type is skipped
      if (!known.has(fund) || !type) continue;
      const id = String(r.name);
      // سطر مصروف مربوط بسجل صدقات: السجل بيظهر بس - a claim row linked to a record: only the record is listed
      if (dups.hidden.has(id)) continue;
      const amount = Number(r.amount) || 0;
      const uncounted = dups.skip.has(id);
      const delta = uncounted ? 0 : type === "out" ? -amount : amount;
      balances.set(fund, (balances.get(fund) ?? 0) + delta);
      total += delta;
      const date = String(r.txn_date ?? "").slice(0, 10);
      const creation = String(r.creation ?? "").slice(0, 19);
      const other = dups.partner.get(id);
      ops.push({
        id, fund, date, type, amount: money(amount),
        balanceAfter: money(balances.get(fund) ?? 0), totalAfter: money(total),
        beneficiary: (r.beneficiary ?? "").trim(), details: (r.details ?? "").trim(),
        owner: names.get(r.owner ?? "") ?? r.owner ?? "",
        creation: creation.slice(0, 16), lateDays: date ? Math.max(0, dayDiff(date, creation.slice(0, 10))) : 0,
        url: charityRowUrl(r),
        source: sourceOf(r),
        duplicate: other ? { id: other.id, url: other.url, uncounted } : null,
        linkedClaim: dups.linked.get(id) ?? null,
      });
    }
    const value = { ops, pairs: dups.pairs };
    cache = { at: Date.now(), value };
    return value;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// fund = null → كل الصناديق - all funds
export async function charityDetails(fund: string | null, month: string | null): Promise<CharityDetails> {
  if (fund !== null && !dashboardConfig.erp.charity.funds.includes(fund)) throw new UnknownFundError(`Unknown fund ${fund}`);
  const today = erpToday();
  const wanted = month ?? today.slice(0, 7);
  const [{ ops: all, pairs }, unfunded] = await Promise.all([loadAll(), fund === null ? unfundedCharity() : Promise.resolve(null)]);
  const ops = fund === null ? all : all.filter((o) => o.fund === fund);
  const after = (o: CharityDetailOp) => (fund === null ? o.totalAfter : o.balanceAfter);

  const before = ops.filter((o) => o.date.slice(0, 7) < wanted);
  const inMonth = ops.filter((o) => o.date.slice(0, 7) === wanted);
  const upTo = ops.filter((o) => o.date.slice(0, 7) <= wanted);
  // اليدوية المتكررة مش بتتحسب في الإجماليات - the manual duplicate is left out of the totals
  const sum = (type: CharityDetailOp["type"]) =>
    money(inMonth.filter((o) => o.type === type && !o.duplicate?.uncounted).reduce((s, o) => s + o.amount, 0));
  // آخر عملية = الأحدث في التسجيل (creation) - the latest by creation
  const last = ops.reduce<CharityDetailOp | null>((best, o) => (!best || o.creation > best.creation ? o : best), null);
  const months = Array.from(new Set(ops.map((o) => o.date.slice(0, 7)))).sort().reverse();

  return {
    fund,
    month: wanted,
    today,
    months,
    balance: ops.length ? after(ops[ops.length - 1]) : 0,
    openingBalance: before.length ? after(before[before.length - 1]) : 0,
    totalIn: sum("in"),
    totalOut: sum("out"),
    closingBalance: upTo.length ? after(upTo[upTo.length - 1]) : 0,
    count: inMonth.length,
    lastOp: last && { date: last.date, creation: last.creation, createdAt: cairoEpoch(`${last.creation}:00`), owner: last.owner },
    // الأحدث الأول، والرصيد بعدها حسب العرض (الصندوق أو كل الصناديق) - newest first; balance after per the view
    ops: inMonth.map((o) => ({ ...o, balanceAfter: after(o) })).reverse(),
    duplicates: fund === null ? pairs : pairs.filter((p) => p.fund === fund),
    unfunded: fund === null ? unfunded : null,
  };
}
