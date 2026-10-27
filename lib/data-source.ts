import {
  BatchCounts,
  Batches,
  Charity,
  CharityFund,
  CharityOperation,
  ConfigErpBatches,
  ConfigKiln,
  ConfigPackagedProduct,
  ConfigPackagingItem,
  ConfigSack,
  ConfigVariant,
  ConfigWoodSubType,
  ConfigWoodType,
  ConfigErpStockItem,
  ConfigWorker,
  KilnStatus,
  Attendance,
  DashboardData,
  FloorWorkers,
  WorkerGroup,
} from "./types";
import { dashboardConfig } from "@/config/dashboard.config";
import { ErpError, erpCall, erpGet, erpPost, erpToday } from "./erp";

// كل رقم بييجي من الكونفج، إلا اللي source بتاعه "erp" في dashboardConfig.erp
// Every number comes from the config, except those set to source "erp" in dashboardConfig.erp
// { label, quantity, minimum } من الكونفج -> شكل الـ API - config variant to the API shape
function toVariant(variant: ConfigVariant) {
  return { label: variant.label, quantity: variant.quantity, minimumThreshold: variant.minimum };
}

// مفتاح الشخص: ID الموظف، ولو مفيش الاسم - a person's key: employee ID, else the name
const personKey = (worker: ConfigWorker) => worker.employeeId || worker.name.replace(/\s+/g, " ").trim();

// كل شخص مرة واحدة (لو اتكرر يبقى حاضر لو أي نسخة منه حاضرة) - each person once (present if any copy is)
function uniqueWorkers(workers: ConfigWorker[]): ConfigWorker[] {
  const byKey = new Map<string, ConfigWorker>();
  for (const worker of workers) {
    const key = personKey(worker);
    const seen = byKey.get(key);
    byKey.set(key, seen ? { ...seen, present: seen.present || worker.present } : worker);
  }
  return Array.from(byKey.values());
}

function toWorkerGroup(label: string, members: ConfigWorker[]): WorkerGroup {
  const people = uniqueWorkers(members);
  return {
    label,
    total: people.length,
    presentNames: people.filter((p) => p.present).map((p) => p.name.trim()),
  };
}

function countPeople(members: ConfigWorker[]) {
  const people = uniqueWorkers(members);
  return { present: people.filter((p) => p.present).length, total: people.length };
}

// حضور النهارده من ERPNext: active = IDs الموظفين Active، recorded = فيه أي تسجيل في الشركة، present = IDs الحاضرين
// Today's attendance from ERPNext: active = Active employee IDs, recorded = anything recorded company-wide,
// present = present employee IDs
type TodayAttendance = { active: string[]; recorded: boolean; present: string[] };

// ERPNext عمره ما رد: محدش بيظهر (الكونفج مش بديل للأشخاص) - ERPNext never answered: nobody shows (no config fallback)
const NO_ATTENDANCE: TodayAttendance = { active: [], recorded: true, present: [] };

const PRESENT_STATUSES = ["Present", "Half Day", "Work From Home"];

// حاضر = Attendance (Draft أو Submitted) حاضر أو أي Checkin النهارده - present = a present Attendance or any check-in
async function loadTodayAttendance(): Promise<TodayAttendance> {
  const today = erpToday();
  const [employees, attendance, checkins] = await Promise.all([
    erpGet<{ data: { name: string }[] }>("/api/resource/Employee", {
      filters: JSON.stringify([["status", "=", "Active"]]),
      fields: JSON.stringify(["name"]),
      limit_page_length: 0,
    }),
    erpGet<{ data: { employee: string; status: string }[] }>("/api/resource/Attendance", {
      filters: JSON.stringify([["attendance_date", "=", today], ["docstatus", "<", 2]]),
      fields: JSON.stringify(["employee", "status"]),
      limit_page_length: 0,
    }),
    erpGet<{ data: { employee: string }[] }>("/api/resource/Employee Checkin", {
      filters: JSON.stringify([["time", ">=", `${today} 00:00:00`], ["time", "<=", `${today} 23:59:59`]]),
      fields: JSON.stringify(["employee"]),
      limit_page_length: 0,
    }),
  ]);
  const present = new Set(checkins.data.map((checkin) => checkin.employee));
  for (const record of attendance.data) if (PRESENT_STATUSES.includes(record.status)) present.add(record.employee);
  return {
    active: employees.data.map((employee) => employee.name),
    recorded: attendance.data.length + checkins.data.length > 0,
    present: Array.from(present),
  };
}

// حالة النهارده على الأعضاء: null = يدوي. غير كده بيفضل بس اللي employeeId بتاعه Active في ERPNext،
// والحضور من ERPNext بس (لو مفيش تسجيل خالص محدش حاضر)
// Apply today's status: null = manual. Otherwise only members whose employeeId is Active in ERPNext stay,
// and presence comes from ERPNext only (nothing recorded = nobody present)
function withToday(members: ConfigWorker[], today: TodayAttendance | null): ConfigWorker[] {
  if (!today) return members;
  const active = new Set(today.active);
  return members
    .filter((member) => member.employeeId && active.has(member.employeeId))
    .map((member) => ({ ...member, present: today.recorded && today.present.includes(member.employeeId!) }));
}

// حضور الإدارة - management attendance
function managementAttendance(today: TodayAttendance | null): Attendance {
  const people = uniqueWorkers(withToday(dashboardConfig.data.attendance.members, today));
  const present = people.filter((p) => p.present).length;
  const notRecorded = !!today && !today.recorded;
  return {
    present,
    absent: notRecorded ? 0 : people.length - present,
    total: people.length,
    presentNames: notRecorded ? [] : people.filter((p) => p.present).map((p) => p.name.trim()),
    absentNames: notRecorded ? [] : people.filter((p) => !p.present).map((p) => p.name.trim()),
    allNames: people.map((p) => p.name.trim()),
    notRecorded,
  };
}

// عمال الأرضية - floor workers (each list gets today's status first)
function floorWorkers(today: TodayAttendance | null): FloorWorkers {
  const workers = dashboardConfig.data.workers;
  const factory = workers.productionFactory;
  const production = withToday(factory.groups.production.members, today);
  const workshop = withToday(factory.groups.workshop.members, today);
  const operators = withToday(factory.groups.operators.members, today);
  const packing = withToday(workers.packing.members, today);
  const saw = withToday(workers.saw.members, today);
  const drivers = withToday(workers.drivers.members, today);
  const factoryMembers = [...production, ...workshop, ...operators];
  const allMembers = [...factoryMembers, ...packing, ...saw, ...drivers];
  return {
    productionFactory: {
      label: factory.label,
      groups: {
        production: toWorkerGroup(factory.groups.production.label, production),
        workshop: toWorkerGroup(factory.groups.workshop.label, workshop),
        operators: toWorkerGroup(factory.groups.operators.label, operators),
      },
      ...countPeople(factoryMembers),
    },
    packing: toWorkerGroup(workers.packing.label, packing),
    saw: toWorkerGroup(workers.saw.label, saw),
    drivers: toWorkerGroup(workers.drivers.label, drivers),
    daily: toWorkerGroup(workers.daily.label, allMembers.filter((worker) => worker.daily)),
    ...countPeople(allMembers),
    notRecorded: !!today && !today.recorded,
  };
}

type BatchesMapping = Extract<ConfigErpBatches, { source: "erp" }>;

// charcoal_type في Kiln Exit ← نوع الطرحة (بنقبل كذا طريقة كتابة) - charcoal_type -> type (a few spellings)
const CHARCOAL_TYPES: Record<string, keyof BatchCounts> = {
  برتقال: "orange",
  مانجا: "mango",
  مانجو: "mango",
  جازورينا: "casuarina",
  كازوارينا: "casuarina",
  كازورينا: "casuarina",
};

type KilnExitRow = { name: string; charcoal_type: string | null; kiln: string | null; exit_time: string | null };

// الطرحات: سجلات Kiln Exit اللي exit_time بتاعها النهارده (فبتتصفر لوحدها كل يوم)
// exit_time بتوقيت سيرفر ERPNext (القاهرة) زي باقي التواريخ
// Batches: Kiln Exit records whose exit_time is today (so they reset daily).
// exit_time is in the ERPNext server time zone (Cairo) like every other date
async function loadBatches(mapping: BatchesMapping): Promise<Batches> {
  const today = erpToday();
  // "Kiln Exit" -> "Kiln%20Exit"، والـ params بتتعمل encode في erpGet - the params are encoded by erpGet
  const { data: rows } = await erpGet<{ data: KilnExitRow[] }>(
    `/api/resource/${encodeURIComponent(mapping.exitsDoctype)}`,
    {
      fields: JSON.stringify(["name", "charcoal_type", "kiln", "exit_time"]),
      filters: JSON.stringify([
        ["exit_time", ">=", `${today} 00:00:00`],
        ["exit_time", "<=", `${today} 23:59:59`],
        ["docstatus", "!=", 2], // الملغي مش بيتعد - cancelled records don't count
      ]),
      limit_page_length: 0,
      order_by: "exit_time desc",
    }
  );

  const out: BatchCounts = { orange: 0, mango: 0, casuarina: 0 };
  const exits = rows.map((row) => {
    const typeLabel = (row.charcoal_type ?? "").trim();
    const type = CHARCOAL_TYPES[typeLabel] ?? null;
    if (type) out[type] += 1;
    else console.error(`[erp] batches: ${row.name} has an unknown charcoal_type ${JSON.stringify(row.charcoal_type)}`);
    return {
      id: row.name,
      time: String(row.exit_time ?? "").slice(11, 16), // "2026-10-27 10:45:12" -> "10:45"
      kiln: (row.kiln ?? "").trim(),
      type,
      typeLabel,
    };
  });
  return { out, exits, offline: false };
}

// آخر نتيجة نجحت للطرحات ويومها - last good batches result and the day it was loaded
let lastGoodBatches: { day: string; value: Batches } | null = null;

// الطرحات من ERPNext، ولو فشل آخر نتيجة نجحت النهارده مع offline، ولو مفيش null (الكارت يكتب "غير متصل")
// نتيجة امبارح مش بتتعرض عشان خروج طرحات بيتصفر كل يوم
// Batches from ERPNext; on failure today's last good result marked offline, else null ("غير متصل" on the card).
// Yesterday's result is never shown because the exits reset daily
async function batchesSection(results: ErpStatus[]): Promise<Batches | null> {
  const mapping = dashboardConfig.erp.batches;
  if (mapping.source !== "erp") return { ...dashboardConfig.data.batches, exits: [], offline: false };
  try {
    const value = await loadBatches(mapping as BatchesMapping);
    lastGoodBatches = { day: erpToday(), value };
    results.push({ fromErp: true, failed: false });
    return value;
  } catch (error) {
    const fallback = lastGoodBatches?.day === erpToday() ? lastGoodBatches.value : null;
    console.error(
      `[erp] batches failed, showing ${fallback ? "last good value" : '"غير متصل"'}:`,
      error instanceof Error ? error.message : error
    );
    results.push({ fromErp: true, failed: true });
    return fallback && { ...fallback, offline: true };
  }
}

type CharityRow = {
  name: string | number; // ممكن يبقى رقم (naming = autoincrement) - may be a number (autoincrement naming)
  fund: string | null;
  txn_type: string | null;
  amount: number | null;
  txn_date: string | null;
  beneficiary: string | null;
  details: string | null;
};

// txn_type في Charity Transaction ← نوع العملية - txn_type -> operation type
const CHARITY_TYPES: Record<string, CharityOperation["type"]> = { صرف: "out", إيداع: "in", "رصيد افتتاحي": "opening" };

// مبلغ متقرب لقرشين - amount rounded to 2 decimals
const money = (value: number) => Math.round(value * 100) / 100;

// كل عمليات الصدقات (كل الصناديق في طلب واحد)، الأحدث الأول - every charity operation in one request, newest first
async function loadCharityRows(doctype: string): Promise<CharityRow[]> {
  const { data } = await erpGet<{ data: CharityRow[] }>(`/api/resource/${encodeURIComponent(doctype)}`, {
    fields: JSON.stringify(["name", "fund", "txn_type", "amount", "txn_date", "beneficiary", "details"]),
    limit_page_length: 0,
    order_by: "txn_date desc, creation desc",
  });
  return data;
}

// الصناديق من العمليات: الرصيد من الأول، والصرف بتوقيت القاهرة (اليوم = today، الشهر = أول 7 حروف)
// Funds from the operations: all-time balance; spending by Cairo date (month = first 7 chars of today)
function charityFrom(rows: CharityRow[], funds: string[], today: string): Omit<Charity, "offline"> {
  const month = today.slice(0, 7);
  const byFund = new Map<string, CharityFund>(
    funds.map((name) => [name, { name, balance: 0, monthOut: 0, opening: null, lastOut: null, recent: [] }])
  );
  let todayOut = 0;
  for (const row of rows) {
    const fund = byFund.get((row.fund ?? "").trim());
    const type = CHARITY_TYPES[(row.txn_type ?? "").trim()];
    if (!fund || !type) {
      console.error(`[erp] charity: ${row.name} skipped (fund ${JSON.stringify(row.fund)}, txn_type ${JSON.stringify(row.txn_type)})`);
      continue;
    }
    const operation: CharityOperation = {
      id: String(row.name),
      date: String(row.txn_date ?? "").slice(0, 10),
      type,
      amount: row.amount ?? 0,
      beneficiary: (row.beneficiary ?? "").trim(),
      details: (row.details ?? "").trim(),
    };
    // الصفوف جاية الأحدث الأول، فأول صرف = آخر صرف - rows come newest first, so the first spending is the latest
    if (fund.recent.length < 3) fund.recent.push(operation);
    // الرصيد الافتتاحي بيزود الرصيد بس (مش صرف ولا إيداع) - the opening balance only adds to the balance
    if (type === "opening") {
      fund.balance += operation.amount;
      fund.opening = fund.opening
        ? { amount: fund.opening.amount + operation.amount, date: fund.opening.date }
        : { amount: operation.amount, date: operation.date };
      continue;
    }
    if (type === "in") {
      fund.balance += operation.amount;
      continue;
    }
    fund.balance -= operation.amount;
    fund.lastOut ??= operation;
    if (operation.date.startsWith(month)) fund.monthOut += operation.amount;
    if (operation.date === today) todayOut += operation.amount;
  }
  const list = Array.from(byFund.values()).map((fund) => ({
    ...fund,
    balance: money(fund.balance),
    monthOut: money(fund.monthOut),
    opening: fund.opening && { ...fund.opening, amount: money(fund.opening.amount) },
  }));
  return {
    funds: list,
    totalBalance: money(list.reduce((sum, fund) => sum + fund.balance, 0)),
    todayOut: money(todayOut),
    monthOut: money(list.reduce((sum, fund) => sum + fund.monthOut, 0)),
  };
}

// آخر عمليات نجحت للصدقات - last good charity rows (the balances never reset, so any day's rows are valid)
let lastGoodCharityRows: CharityRow[] | null = null;

// الصدقات من ERPNext، ولو فشل آخر عمليات نجحت (بيتحسب صرف اليوم/الشهر من جديد) مع offline، ولو مفيش null
// Charity from ERPNext; on failure the last good rows (today / month recomputed) marked offline, else null
async function charitySection(results: ErpStatus[]): Promise<Charity | null> {
  const { doctype, funds } = dashboardConfig.erp.charity;
  const today = erpToday();
  try {
    const rows = await loadCharityRows(doctype);
    lastGoodCharityRows = rows;
    results.push({ fromErp: true, failed: false });
    return { ...charityFrom(rows, funds, today), offline: false };
  } catch (error) {
    console.error(
      `[erp] charity failed, showing ${lastGoodCharityRows ? "last good value" : '"غير متصل"'}:`,
      error instanceof Error ? error.message : error
    );
    results.push({ fromErp: true, failed: true });
    return lastGoodCharityRows && { ...charityFrom(lastGoodCharityRows, funds, today), offline: true };
  }
}

// حالة الـ Workstation في ERPNext ← حالة الفرن (أي حاجة تانية = متوقفة)
// ERPNext Workstation status -> kiln status (anything else = stopped)
const KILN_STATUSES: Record<string, KilnStatus> = {
  Production: "working",
  Maintenance: "maintenance",
  Problem: "maintenance",
};

// رقم الفرن من اسمه (أرقام عربي أو إنجليزي) - the kiln number from its name (Arabic-Indic or Latin digits)
function kilnNumber(name: string): number {
  const digits = name.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).match(/\d+/);
  return digits ? Number(digits[0]) : Number.MAX_SAFE_INTEGER;
}

// الأفران: كل Workstation اسمه بيبدأ بـ "فرن"، مترتبين بالرقم - every Workstation named "فرن…", sorted by number
async function loadKilns(): Promise<ConfigKiln[]> {
  const { data } = await erpGet<{ data: { name: string; status: string | null }[] }>("/api/resource/Workstation", {
    filters: JSON.stringify([["name", "like", "فرن%"]]),
    fields: JSON.stringify(["name", "status"]),
    limit_page_length: 0,
  });
  return data
    .filter((row) => row.name.trim().startsWith("فرن"))
    .sort((a, b) => kilnNumber(a.name) - kilnNumber(b.name) || a.name.localeCompare(b.name, "ar"))
    .map((row) => ({ name: row.name.trim(), status: KILN_STATUSES[row.status ?? ""] ?? "stopped" }));
}

// آخر نتيجة نجحت لكل قسم (حضور، أفران) - last good result per section (attendance, kilns)
const lastGoodSection = new Map<string, unknown>();

// قسم كامل من ERPNext، ولو فشل آخر نتيجة نجحت، ولو مفيش null (يعني يدوي)
// A whole section from ERPNext; on failure the last good result, else null (= manual)
async function erpSection<T>(
  key: string,
  enabled: boolean,
  load: () => Promise<T>,
  results: ErpStatus[]
): Promise<T | null> {
  if (!enabled) return null;
  try {
    const value = await load();
    lastGoodSection.set(key, value);
    results.push({ fromErp: true, failed: false });
    return value;
  } catch (error) {
    const fallback = lastGoodSection.get(key) as T | undefined;
    console.error(
      `[erp] ${key} failed, showing ${fallback !== undefined ? "last good" : "config"} value:`,
      error instanceof Error ? error.message : error
    );
    results.push({ fromErp: true, failed: true });
    return fallback ?? null;
  }
}

// آخر قيمة نجحت من ERPNext (في ذاكرة السيرفر) - last successful ERPNext value per number (server memory)
const lastGood = new Map<string, number>();

// fromErp = الرقم المفروض من ERPNext، failed = الطلب فشل - used to decide the "غير متصل" badge
type ErpStatus = { fromErp: boolean; failed: boolean };
type ErpResult = ErpStatus & { value: number };

// رقم واحد: من ERPNext لو source = "erp"، ولو فشل آخر قيمة نجحت، ولو مفيش رقم الكونفج
// One number: from ERPNext when source is "erp"; on failure the last good value, else the config value
async function erpNumber<F extends { source: "erp" }>(
  key: string,
  field: F | { source: "manual" },
  manual: number,
  load: (field: F) => Promise<unknown>
): Promise<ErpResult> {
  if (field.source !== "erp") return { value: manual, fromErp: false, failed: false };
  try {
    const value = await load(field as F);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`expected a number, got ${JSON.stringify(value)}`);
    }
    lastGood.set(key, value);
    return { value, fromErp: true, failed: false };
  } catch (error) {
    const fallback = lastGood.get(key);
    console.error(
      `[erp] ${key} failed, showing ${fallback !== undefined ? "last good" : "config"} value:`,
      error instanceof Error ? error.message : error
    );
    return { value: fallback ?? manual, fromErp: true, failed: true };
  }
}

// رصيد الحساب النهارده - account balance as of today
const balanceOn = (account: string) =>
  erpCall("erpnext.accounts.utils.get_balance_on", { account, date: erpToday() });

type GlTotals = { data: { debit: number | null; credit: number | null }[] };

// وارد (debit) ومنصرف (credit) الحساب النهارده من GL Entry - طلب واحد للاتنين في كل تحديث
// Today's debit / credit of an account from GL Entry - one request per account per refresh
function todayTotals() {
  const requests = new Map<string, Promise<{ debit: number; credit: number }>>();
  return (account: string) => {
    let request = requests.get(account);
    if (!request) {
      request = erpGet<GlTotals>("/api/resource/GL Entry", {
        filters: JSON.stringify([
          ["account", "=", account],
          ["posting_date", "=", erpToday()],
          ["is_cancelled", "=", 0],
        ]),
        fields: JSON.stringify(["sum(debit) as debit", "sum(credit) as credit"]),
      }).then(({ data }) => ({ debit: data[0]?.debit ?? 0, credit: data[0]?.credit ?? 0 }));
      requests.set(account, request);
    }
    return request;
  };
}

type StockMapping = Extract<ConfigErpStockItem, { source: "erp" }>;
type BalanceRow = { item_code: string; warehouse: string; balance_qty: number; stock_uom: string };
type LedgerRow = {
  item_code: string;
  warehouse: string;
  posting_datetime: string;
  creation: string;
  qty_after_transaction: number;
  stock_uom: string;
};

// كل الأصناف المربوطة في erp.stock - every item code mapped in erp.stock
function mappedItemCodes(): string[] {
  const { packaged, sacks, wood, packaging } = dashboardConfig.erp.stock;
  const maps = [...Object.values(packaged), ...Object.values(sacks), wood, packaging];
  const codes = maps.flatMap((map) =>
    Object.values(map).flatMap((field) => (field.source === "erp" ? field.itemCodes : []))
  );
  return Array.from(new Set(codes));
}

// وحدة ERPNext متقصرة عشان تيجي في الكارت - ERPNext unit, shortened to fit the card
const SHORT_UNITS: Record<string, string> = { "كيلو جرام": "كجم" };

// آخر وحدة نجحت لكل رقم - last good unit per number
const lastUnit = new Map<string, string>();

// رصيد كل صنف في كل مخزن النهارده من Stock Ledger Entry، بنفس طريقة تقرير Stock Balance:
// الرصيد = qty_after_transaction بتاع آخر حركة لحد النهارده. مش SUM(actual_qty) لأن التسوية المخزنية
// (Stock Reconciliation) بتسجل actual_qty = 0 وبتحط الرصيد الجديد في qty_after_transaction
// Balance per item and warehouse as of today, the way the Stock Balance report computes it: the
// qty_after_transaction of the last ledger entry up to today. Not SUM(actual_qty), because Stock
// Reconciliation entries store actual_qty = 0 and put the new balance in qty_after_transaction.
async function loadStockBalances(): Promise<BalanceRow[]> {
  const today = erpToday();
  const base = [
    ["item_code", "in", mappedItemCodes()],
    ["is_cancelled", "=", 0],
    ["posting_date", "<=", today],
  ];
  // POST عشان قايمة الأصناف والأوقات أطول من إن الـ URL يشيلها - POST: the lists are too long for a URL
  const getList = <T,>(body: Record<string, unknown>) =>
    erpPost<{ message: T[] }>("/api/method/frappe.client.get_list", {
      doctype: "Stock Ledger Entry",
      limit_page_length: 0,
      ...body,
    }).then(({ message }) => message);

  // 1) وقت آخر حركة لكل صنف في كل مخزن - time of the last entry per item and warehouse
  const latest = await getList<{ item_code: string; warehouse: string; at: string }>({
    filters: base,
    fields: ["item_code", "warehouse", "max(posting_datetime) as at"],
    group_by: "item_code, warehouse",
  });
  if (latest.length === 0) return [];
  // 2) الحركات دي نفسها عشان الرصيد بعدها - those entries themselves, for the balance after them
  const rows = await getList<LedgerRow>({
    filters: [...base, ["posting_datetime", "in", Array.from(new Set(latest.map((row) => row.at)))]],
    fields: ["item_code", "warehouse", "posting_datetime", "creation", "qty_after_transaction", "stock_uom"],
  });
  // لو حركتين في نفس الوقت، الأحدث تسجيلًا هي الأخيرة - two entries at the same time: the later created wins
  const last = new Map<string, LedgerRow>();
  for (const { item_code, warehouse, at } of latest) {
    for (const row of rows) {
      if (row.item_code !== item_code || row.warehouse !== warehouse || row.posting_datetime !== at) continue;
      const key = `${item_code}\u0000${warehouse}`;
      const current = last.get(key);
      if (!current || row.creation > current.creation) last.set(key, row);
    }
  }
  if (last.size !== latest.length) throw new ErpError("Stock Ledger Entry: missing the last entry of some item");
  return Array.from(last.values(), (row) => ({
    item_code: row.item_code,
    warehouse: row.warehouse,
    balance_qty: row.qty_after_transaction,
    stock_uom: row.stock_uom,
  }));
}

// أرصدة المخازن: طلب واحد لكل الأصناف المربوطة في كل تحديث، وكل رقم بيجمع الصفوف بتاعته
// Stock: one balance load for every mapped item per refresh, then each number sums its own rows
function stockLoader(results: ErpStatus[]) {
  let request: Promise<BalanceRow[]> | undefined;
  const balances = () => (request ??= loadStockBalances());
  const rowsFor = (rows: BalanceRow[], mapping: StockMapping, excluded: string[]) =>
    rows.filter(
      (row) =>
        mapping.itemCodes.includes(row.item_code) &&
        (mapping.warehouses.length === 0 || mapping.warehouses.includes(row.warehouse)) &&
        !excluded.includes(row.warehouse)
    );

  return {
    // الكمية متقربة: decimals = 0 للمعبأ والشكاير ومواد التعبئة، 1 للخشب
    // Quantity, rounded: decimals = 0 for packaged / sacks / packaging, 1 for wood
    // excluded = مخازن مش بتتحسب (عربيات المعبأ) - warehouses left out (vehicles, for packaged)
    async quantity(key: string, field: ConfigErpStockItem | undefined, manual: number, decimals = 0, excluded: string[] = []) {
      const result = await erpNumber(key, field ?? { source: "manual" }, manual, async (mapping: StockMapping) => {
        const total = rowsFor(await balances(), mapping, excluded).reduce((sum, row) => sum + row.balance_qty, 0);
        const factor = 10 ** decimals;
        return Math.round(total * factor) / factor;
      });
      results.push(result);
      return result.value;
    },
    // الوحدة من ERPNext (stock_uom)، ولو فشل آخر وحدة نجحت أو وحدة الكونفج - ERPNext unit, else last good, else config
    async unit(key: string, field: ConfigErpStockItem | undefined, manual: string) {
      if (field?.source !== "erp") return manual;
      try {
        const uom = (await balances()).find((row) => field.itemCodes.includes(row.item_code))?.stock_uom;
        if (uom) lastUnit.set(key, SHORT_UNITS[uom] ?? uom);
      } catch {
        // الغلط بيتسجل مع الكمية - the error is logged with the quantity
      }
      return lastUnit.get(key) ?? manual;
    },
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const config = dashboardConfig.data;
  const erp = dashboardConfig.erp;
  const rawMaterials = config.stock.rawMaterials;
  const totals = todayTotals();
  const results: ErpStatus[] = [];
  const stock = stockLoader(results);
  const firstWood = Object.values(erp.stock.wood).find((field) => field.source === "erp");

  // كل الطلبات مع بعض في نفس الوقت - every request runs in parallel
  const [treasury, packaged, sacks, wood, packaging, today, todayBatches, erpKilns, charity] = await Promise.all([
    Promise.all([
      erpNumber("treasury.balance", erp.treasury.balance, config.treasury.balance,
        ({ account }) => balanceOn(account)),
      erpNumber("treasury.incomingToday", erp.treasury.incomingToday, config.treasury.incomingToday,
        async ({ account }) => (await totals(account)).debit),
      erpNumber("treasury.outgoingToday", erp.treasury.outgoingToday, config.treasury.outgoingToday,
        async ({ account }) => (await totals(account)).credit),
    ]).then((numbers) => {
      results.push(...numbers);
      return numbers.map((n) => n.value);
    }),
    Promise.all(
      config.stock.packaged.map(async (product: ConfigPackagedProduct, index: number) => ({
        id: ["quarter", "half", "kilo", "2kg", "3kg"][index] ?? `product-${index + 1}`,
        name: product.name,
        unit: product.unit,
        image: product.image,
        variants: await Promise.all(
          product.variants.map(async (variant: ConfigVariant) => ({
            ...toVariant(variant),
            quantity: await stock.quantity(`packaged.${product.name}.${variant.label}`,
              erp.stock.packaged[product.name]?.[variant.label], variant.quantity, 0, erp.stock.excludedWarehouses),
          }))
        ),
      }))
    ),
    Promise.all(
      config.stock.sacks.map(async (sack: ConfigSack, index: number) => ({
        id: ["orange", "mango", "casuarina"][index] ?? `sack-${index + 1}`,
        name: sack.name,
        unit: sack.unit,
        variants: await Promise.all(
          sack.variants.map(async (variant: ConfigVariant) => ({
            ...toVariant(variant),
            quantity: await stock.quantity(`sacks.${sack.name}.${variant.label}`,
              erp.stock.sacks[sack.name]?.[variant.label], variant.quantity),
          }))
        ),
        icon: ["🍊", "🥭", "🌲"][index],
      }))
    ),
    (async () => ({
      unit: await stock.unit("wood", firstWood, rawMaterials.wood.unit),
      types: await Promise.all(
        rawMaterials.wood.types.map(async (type: ConfigWoodType, index: number) => ({
          id: `wood-${index + 1}`,
          name: type.name,
          ...(type.subTypes
            ? {
                subTypes: await Promise.all(
                  type.subTypes.map(async (sub: ConfigWoodSubType) => ({
                    name: sub.name,
                    quantity: await stock.quantity(`wood.${sub.name}`, erp.stock.wood[sub.name], sub.quantity, 1),
                    minimumThreshold: sub.minimum,
                  }))
                ),
              }
            : {
                quantity: await stock.quantity(`wood.${type.name}`, erp.stock.wood[type.name], type.quantity ?? 0, 1),
                minimumThreshold: type.minimum,
              }),
        }))
      ),
    }))(),
    Promise.all(
      rawMaterials.packaging.map(async (item: ConfigPackagingItem, index: number) => ({
        id: `packaging-${index + 1}`,
        name: item.name,
        unit: await stock.unit(`packaging.${item.name}`, erp.stock.packaging[item.name], item.unit),
        quantity: await stock.quantity(`packaging.${item.name}`, erp.stock.packaging[item.name], item.quantity),
        minimumThreshold: item.minimum,
        icon: item.icon,
      }))
    ),
    // طلب حضور واحد للإدارة والعمال - one attendance request for management and workers
    erpSection(
      "attendance",
      erp.attendance.source === "erp" || erp.workers.source === "erp",
      loadTodayAttendance,
      results
    ),
    batchesSection(results),
    erpSection("kilns", erp.kilns.source === "erp", loadKilns, results),
    charitySection(results),
  ]);
  const [balance, incomingToday, outgoingToday] = treasury;

  // "غير متصل" بس لو كل أرقام ERPNext فشلت - offline only when every ERPNext number failed
  const erpNumbers = results.filter((n) => n.fromErp);
  const erpOffline = erpNumbers.length > 0 && erpNumbers.every((n) => n.failed);

  // الأفران من ERPNext، ولو مفيش من الكونفج، والأعداد من القايمة - kilns from ERPNext (else config); counts from the list
  const kilns = erpKilns ?? config.kilns;
  const workingCount = kilns.filter((k: ConfigKiln) => k.status === "working").length;
  const maintenanceCount = kilns.filter((k: ConfigKiln) => k.status === "maintenance").length;
  const stoppedCount = kilns.filter((k: ConfigKiln) => k.status === "stopped").length;

  return {
    attendance: managementAttendance(erp.attendance.source === "erp" ? today ?? NO_ATTENDANCE : null),
    stock: { packaged, sacks, rawMaterials: { wood, packaging } },
    kilns: {
      working: workingCount,
      maintenance: maintenanceCount,
      stopped: stoppedCount,
      total: kilns.length,
      kilns: kilns.map((kiln: ConfigKiln, index: number) => ({
        id: `kiln-${index + 1}`,
        name: kiln.name,
        status: kiln.status,
      })),
    },
    floorWorkers: floorWorkers(erp.workers.source === "erp" ? today ?? NO_ATTENDANCE : null),
    treasury: {
      balance,
      incomingToday,
      outgoingToday,
    },
    batches: todayBatches,
    charity,
    updatedAt: new Date().toISOString(),
    erpOffline,
  };
}
