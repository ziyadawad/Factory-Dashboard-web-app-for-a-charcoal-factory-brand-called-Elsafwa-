import {
  Batch,
  ConfigKiln,
  ConfigPackagedProduct,
  ConfigPackagingItem,
  ConfigSack,
  ConfigVariant,
  ConfigWoodSubType,
  ConfigWoodType,
  ConfigErpStockItem,
  ConfigWorker,
  DashboardData,
  FloorWorkers,
  WorkerGroup,
} from "./types";
import { dashboardConfig } from "@/config/dashboard.config";
import { erpCall, erpGet, erpToday } from "./erp";

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

// عمال الأرضية من الكونفج - floor workers from the config
function floorWorkers(): FloorWorkers {
  const workers = dashboardConfig.data.workers;
  const factory = workers.productionFactory;
  const factoryMembers = [
    ...factory.groups.production.members,
    ...factory.groups.workshop.members,
    ...factory.groups.operators.members,
  ];
  const allMembers = [...factoryMembers, ...workers.packing.members, ...workers.saw.members, ...workers.drivers.members];
  return {
    productionFactory: {
      label: factory.label,
      groups: {
        production: toWorkerGroup(factory.groups.production.label, factory.groups.production.members),
        workshop: toWorkerGroup(factory.groups.workshop.label, factory.groups.workshop.members),
        operators: toWorkerGroup(factory.groups.operators.label, factory.groups.operators.members),
      },
      ...countPeople(factoryMembers),
    },
    packing: toWorkerGroup(workers.packing.label, workers.packing.members),
    saw: toWorkerGroup(workers.saw.label, workers.saw.members),
    drivers: toWorkerGroup(workers.drivers.label, workers.drivers.members),
    daily: toWorkerGroup(workers.daily.label, allMembers.filter((worker) => worker.daily)),
    ...countPeople(allMembers),
  };
}

// آخر قيمة نجحت من ERPNext (في ذاكرة السيرفر) - last successful ERPNext value per number (server memory)
const lastGood = new Map<string, number>();

type ErpResult = { value: number; fromErp: boolean; failed: boolean };

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
type BinRow = { item_code: string; warehouse: string; actual_qty: number; stock_uom: string };

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

// أرصدة المخازن: طلب Bin واحد لكل الأصناف المربوطة في كل تحديث، وكل رقم بيجمع الصفوف بتاعته
// Stock: one Bin request for every mapped item per refresh, then each number sums its own rows
function stockLoader(results: ErpResult[]) {
  let request: Promise<BinRow[]> | undefined;
  const bins = () =>
    (request ??= erpGet<{ data: BinRow[] }>("/api/resource/Bin", {
      filters: JSON.stringify([["item_code", "in", mappedItemCodes()]]),
      fields: JSON.stringify(["item_code", "warehouse", "actual_qty", "stock_uom"]),
      limit_page_length: 0,
    }).then(({ data }) => data));
  const rowsFor = (rows: BinRow[], mapping: StockMapping) =>
    rows.filter(
      (row) =>
        mapping.itemCodes.includes(row.item_code) &&
        (mapping.warehouses.length === 0 || mapping.warehouses.includes(row.warehouse))
    );

  return {
    // الكمية متقربة: decimals = 0 للمعبأ والشكاير ومواد التعبئة، 1 للخشب
    // Quantity, rounded: decimals = 0 for packaged / sacks / packaging, 1 for wood
    async quantity(key: string, field: ConfigErpStockItem | undefined, manual: number, decimals = 0) {
      const result = await erpNumber(key, field ?? { source: "manual" }, manual, async (mapping: StockMapping) => {
        const total = rowsFor(await bins(), mapping).reduce((sum, row) => sum + row.actual_qty, 0);
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
        const uom = (await bins()).find((row) => field.itemCodes.includes(row.item_code))?.stock_uom;
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
  const results: ErpResult[] = [];
  const stock = stockLoader(results);
  const firstWood = Object.values(erp.stock.wood).find((field) => field.source === "erp");

  const [treasury, packaged, sacks, wood, packaging] = await Promise.all([
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
              erp.stock.packaged[product.name]?.[variant.label], variant.quantity),
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
  ]);
  const [balance, incomingToday, outgoingToday] = treasury;

  // "غير متصل" بس لو كل أرقام ERPNext فشلت - offline only when every ERPNext number failed
  const erpNumbers = results.filter((n) => n.fromErp);
  const erpOffline = erpNumbers.length > 0 && erpNumbers.every((n) => n.failed);

  // Calculate kiln counts from the list
  const workingCount = config.kilns.filter((k: ConfigKiln) => k.status === "working").length;
  const maintenanceCount = config.kilns.filter((k: ConfigKiln) => k.status === "maintenance").length;
  const stoppedCount = config.kilns.filter((k: ConfigKiln) => k.status === "stopped").length;

  return {
    attendance: {
      present: config.attendance.present,
      absent: config.attendance.absent,
      total: config.attendance.present + config.attendance.absent,
      absentNames: config.attendance.absentNames,
    },
    stock: { packaged, sacks, rawMaterials: { wood, packaging } },
    kilns: {
      working: workingCount,
      maintenance: maintenanceCount,
      stopped: stoppedCount,
      total: config.kilns.length,
      kilns: config.kilns.map((kiln: ConfigKiln, index: number) => ({
        id: `kiln-${index + 1}`,
        name: kiln.name,
        status: kiln.status,
      })),
    },
    floorWorkers: floorWorkers(),
    treasury: {
      balance,
      incomingToday,
      outgoingToday,
    },
    batches: {
      unit: config.batches.unit,
      list: config.batches.list.map((batch: Batch) => ({ ...batch })),
    },
    updatedAt: new Date().toISOString(),
    erpOffline,
  };
}
