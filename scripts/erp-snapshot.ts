// لقطة واحدة من ERPNext لتقارير مراجعة الشهر (قراية بس) - one ERPNext snapshot for the month audit reports (read-only)
//
// التشغيل - run:  npm run audit:snapshot -- --from 2026-10-01 --to 2026-10-25
//   --to: الافتراضي امبارح بتوقيت مصر - defaults to yesterday (Africa/Cairo)
//   --warehouse: الافتراضي "مخزن منتج تام - تعبئة - AC"
//   --no-reports: اسحب اللقطة بس من غير ما تطلع التقارير - only take the snapshot, don't build the reports
//
// بيسحب الحركات اللي تاريخها (posting_date) لحد --to بس، أي حركة بتاريخ بعده (زي النهارده) مش موجودة في اللقطة خالص.
// Only entries with posting_date up to --to are fetched; anything dated later (like today) is not in the snapshot at all.
// بيحفظ reports/snapshot-<وقت السحب>.json وبعدين يطلع stock-reconciliation و issue-comparison من نفس الملف
// Saves reports/snapshot-<fetch time>.json, then builds stock-reconciliation and issue-comparison from that same file

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_WAREHOUSE = "مخزن منتج تام - تعبئة - AC";
const LOOKBACK_DAYS = 14; // أسبوعين قبل --from عشان الرصيد والمقارنة - two weeks before --from for balances and pairing
const TIMEOUT_MS = 30000;

type LedgerRow = {
  item_code: string;
  warehouse: string;
  posting_date: string;
  posting_time: string;
  posting_datetime: string;
  creation: string;
  owner: string;
  voucher_type: string;
  voucher_no: string;
  voucher_detail_no: string;
  actual_qty: number;
  qty_after_transaction: number;
  is_cancelled: number;
};
const LEDGER_FIELDS = [
  "item_code", "warehouse", "posting_date", "posting_time", "posting_datetime", "creation", "owner",
  "voucher_type", "voucher_no", "voucher_detail_no", "actual_qty", "qty_after_transaction", "is_cancelled",
];
const LEDGER_ORDER = "posting_datetime asc, creation asc";

function settings() {
  const url = process.env.FACTORY_API_URL;
  const key = process.env.FACTORY_API_KEY;
  const secret = process.env.FACTORY_API_SECRET;
  if (!url || !key || !secret) throw new Error("FACTORY_API_URL / FACTORY_API_KEY / FACTORY_API_SECRET مش موجودين في .env.local");
  return { baseUrl: url.replace(/\/+$/, ""), auth: `token ${key}:${secret}` };
}
async function getList<T>(body: Record<string, unknown>): Promise<T[]> {
  const { baseUrl, auth } = settings();
  const response = await fetch(`${baseUrl}/api/method/frappe.client.get_list`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ limit_page_length: 0, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ERPNext ${body.doctype}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return (JSON.parse(text) as { message: T[] }).message;
}

const cairo = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", ...options }).format(date);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const today = cairo(new Date(), {});
  const raw = value("--to") ?? "yesterday";
  const to = raw === "yesterday" ? addDays(today, -1) : raw === "today" ? today : raw;
  const from = value("--from") ?? `${to.slice(0, 8)}01`;
  for (const [flag, date] of [["--from", from], ["--to", to]])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`تاريخ غلط في ${flag}: ${date} (اكتبه YYYY-MM-DD أو yesterday)`);
  if (from > to) throw new Error(`--from (${from}) بعد --to (${to})`);
  return { from, to, warehouse: value("--warehouse") ?? DEFAULT_WAREHOUSE, reports: !args.includes("--no-reports") };
}

async function main() {
  const { from, to, warehouse, reports } = parseArgs();
  const now = new Date();
  const fetchedAt = `${cairo(now, {})} ${cairo(now, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`;
  console.log(`سحب لقطة ERPNext — ${warehouse} — الفترة ${from} → ${to} (الحركات بتاريخ لحد ${to} بس)`);

  const lookback = addDays(from, -LOOKBACK_DAYS);
  const [warehouses, ledger, backdated, openingTimes] = await Promise.all([
    getList<{ name: string; parent_warehouse: string | null }>({ doctype: "Warehouse", fields: ["name", "parent_warehouse"] }),
    // كل حركات المخزن (والملغية) من أسبوعين قبل --from لحد --to - every entry (and cancelled) from the lookback to --to
    getList<LedgerRow>({
      doctype: "Stock Ledger Entry",
      filters: [["warehouse", "=", warehouse], ["posting_date", ">=", lookback], ["posting_date", "<=", to]],
      fields: LEDGER_FIELDS,
      order_by: LEDGER_ORDER,
    }),
    // بتاريخ قبل --from بس اتسجلت بعده - dated before --from but entered after it
    getList<LedgerRow>({
      doctype: "Stock Ledger Entry",
      filters: [["warehouse", "=", warehouse], ["is_cancelled", "=", 0], ["posting_date", "<", from], ["creation", ">=", `${from} 00:00:00`]],
      fields: LEDGER_FIELDS,
      order_by: LEDGER_ORDER,
    }),
    // وقت آخر حركة قبل --from لكل صنف (رصيد أول) - time of the last entry before --from per item (opening)
    getList<{ item_code: string; at: string }>({
      doctype: "Stock Ledger Entry",
      filters: [["warehouse", "=", warehouse], ["is_cancelled", "=", 0], ["posting_date", "<", from]],
      fields: ["item_code", "max(posting_datetime) as at"],
      group_by: "item_code",
    }),
  ]);

  const openingCandidates = openingTimes.length
    ? await getList<LedgerRow>({
        doctype: "Stock Ledger Entry",
        filters: [["warehouse", "=", warehouse], ["is_cancelled", "=", 0], ["posting_datetime", "in", Array.from(new Set(openingTimes.map((r) => r.at)))]],
        fields: LEDGER_FIELDS,
      })
    : [];
  // لو حركتين في نفس الوقت، الأحدث تسجيلًا هي الأخيرة - two entries at the same time: the later created wins
  const opening = openingTimes.map(({ item_code, at }) =>
    openingCandidates.filter((r) => r.item_code === item_code && r.posting_datetime === at).sort((a, b) => b.creation.localeCompare(a.creation))[0]
  ).filter(Boolean);

  const items = Array.from(new Set([...ledger, ...opening].map((r) => r.item_code)));
  // نفس الأصناف في مخازن تانية في الفترة (عشان "اتسجل في مخزن تاني") - the same items in other warehouses
  const elsewhere = items.length
    ? await getList<LedgerRow>({
        doctype: "Stock Ledger Entry",
        filters: [["item_code", "in", items], ["warehouse", "!=", warehouse], ["is_cancelled", "=", 0], ["posting_date", ">=", from], ["posting_date", "<=", to]],
        fields: LEDGER_FIELDS,
        order_by: LEDGER_ORDER,
      })
    : [];

  const entryRows = [...ledger, ...backdated, ...elsewhere].filter((r) => r.voucher_type === "Stock Entry");
  const names = Array.from(new Set(entryRows.map((r) => r.voucher_no)));
  const [stockEntries, stockEntryDetails] = names.length
    ? await Promise.all([
        getList<{ name: string; stock_entry_type: string; purpose: string }>({
          doctype: "Stock Entry",
          filters: [["name", "in", names]],
          fields: ["name", "stock_entry_type", "purpose"],
        }),
        getList<{ name: string; s_warehouse: string | null; t_warehouse: string | null }>({
          doctype: "Stock Entry Detail",
          parent: "Stock Entry",
          filters: [["name", "in", Array.from(new Set(entryRows.map((r) => r.voucher_detail_no)))]],
          fields: ["name", "s_warehouse", "t_warehouse"],
        }),
      ])
    : [[], []];

  const snapshot = { fetchedAt, from, to, warehouse, lookback, warehouses, opening, ledger, backdated, elsewhere, stockEntries, stockEntryDetails };
  const dir = path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `snapshot-${fetchedAt.replace(/[-: ]/g, "").replace(/^(\d{8})(\d{4})\d*$/, "$1-$2")}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot), "utf8");
  console.log(`وقت سحب البيانات: ${fetchedAt} — ${ledger.length} حركة — اتحفظت في ${path.relative(process.cwd(), file)}`);

  if (!reports) return;
  // التقريرين من نفس اللقطة - both reports from the same snapshot
  for (const script of ["stock-reconciliation.ts", "issue-comparison.ts"]) {
    console.log(`\n===== ${script}`);
    const run = spawnSync(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", path.join("scripts", script), "--snapshot", file],
      { stdio: "inherit" }
    );
    if (run.status !== 0) throw new Error(`${script} وقع (exit ${run.status})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
