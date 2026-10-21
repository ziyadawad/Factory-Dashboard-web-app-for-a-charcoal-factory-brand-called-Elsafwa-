import {
  Batch,
  ConfigKiln,
  ConfigPackagedProduct,
  ConfigPackagingItem,
  ConfigSack,
  ConfigVariant,
  ConfigWoodSubType,
  ConfigWoodType,
  ConfigErpField,
  DashboardData,
} from "./types";
import { dashboardConfig } from "@/config/dashboard.config";
import { erpCall, erpToday } from "./erp";

// كل رقم بييجي من الكونفج، إلا اللي source بتاعه "erp" في dashboardConfig.erp
// Every number comes from the config, except those set to source "erp" in dashboardConfig.erp
// { label, quantity, minimum } من الكونفج -> شكل الـ API - config variant to the API shape
function toVariant(variant: ConfigVariant) {
  return { label: variant.label, quantity: variant.quantity, minimumThreshold: variant.minimum };
}

// آخر قيمة نجحت من ERPNext (في ذاكرة السيرفر) - last successful ERPNext value per number (server memory)
const lastGood = new Map<string, number>();

// رقم واحد: من ERPNext لو source = "erp"، ولو فشل آخر قيمة نجحت، ولو مفيش رقم الكونفج
// One number: from ERPNext when source is "erp"; on failure the last good value, else the config value
async function erpNumber(
  key: string,
  field: ConfigErpField,
  manual: number,
  load: (account: string) => Promise<unknown>
): Promise<{ value: number; failed: boolean }> {
  if (field.source !== "erp") return { value: manual, failed: false };
  try {
    const value = await load(field.account);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`expected a number, got ${JSON.stringify(value)}`);
    }
    lastGood.set(key, value);
    return { value, failed: false };
  } catch (error) {
    const fallback = lastGood.get(key);
    console.error(
      `[erp] ${key} failed, showing ${fallback !== undefined ? "last good" : "config"} value:`,
      error instanceof Error ? error.message : error
    );
    return { value: fallback ?? manual, failed: true };
  }
}

// رصيد الحساب النهارده - account balance as of today
const balanceOn = (account: string) =>
  erpCall("erpnext.accounts.utils.get_balance_on", { account, date: erpToday() });

export async function getDashboardData(): Promise<DashboardData> {
  const config = dashboardConfig.data;
  const balance = await erpNumber(
    "treasury.balance",
    dashboardConfig.erp.treasury.balance,
    config.treasury.balance,
    balanceOn
  );

  const rawMaterials = config.stock.rawMaterials;

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
    stock: {
      packaged: config.stock.packaged.map((product: ConfigPackagedProduct, index: number) => ({
        id: ["quarter", "half", "kilo", "2kg", "3kg"][index] ?? `product-${index + 1}`,
        name: product.name,
        unit: product.unit,
        image: product.image,
        variants: product.variants.map(toVariant),
      })),
      sacks: config.stock.sacks.map((sack: ConfigSack, index: number) => ({
        id: ["orange", "mango", "casuarina"][index] ?? `sack-${index + 1}`,
        name: sack.name,
        unit: sack.unit,
        variants: sack.variants.map(toVariant),
        icon: ["🍊", "🥭", "🌲"][index],
      })),
      rawMaterials: {
        wood: {
          unit: rawMaterials.wood.unit,
          types: rawMaterials.wood.types.map((type: ConfigWoodType, index: number) => ({
            id: `wood-${index + 1}`,
            name: type.name,
            ...(type.subTypes
              ? {
                  subTypes: type.subTypes.map((sub: ConfigWoodSubType) => ({
                    name: sub.name,
                    quantity: sub.quantity,
                    minimumThreshold: sub.minimum,
                  })),
                }
              : { quantity: type.quantity, minimumThreshold: type.minimum }),
          })),
        },
        packaging: rawMaterials.packaging.map((item: ConfigPackagingItem, index: number) => ({
          id: `packaging-${index + 1}`,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          minimumThreshold: item.minimum,
          icon: item.icon,
        })),
      },
    },
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
    floorWorkers: {
      productionFactory: {
        label: config.workers.productionFactory.label,
        groups: {
          production: { ...config.workers.productionFactory.groups.production },
          workshop: { ...config.workers.productionFactory.groups.workshop },
          operators: { ...config.workers.productionFactory.groups.operators },
        },
      },
      packing: { ...config.workers.packing },
      saw: { ...config.workers.saw },
      drivers: { ...config.workers.drivers },
    },
    treasury: {
      balance: balance.value,
      incomingToday: config.treasury.incomingToday,
      outgoingToday: config.treasury.outgoingToday,
    },
    batches: {
      unit: config.batches.unit,
      list: config.batches.list.map((batch: Batch) => ({ ...batch })),
    },
    updatedAt: new Date().toISOString(),
    erpOffline: balance.failed,
  };
}
