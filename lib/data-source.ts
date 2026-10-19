import {
  Batch,
  ConfigKiln,
  ConfigPackagedProduct,
  ConfigPackagingItem,
  ConfigSack,
  ConfigVariant,
  ConfigWoodSubType,
  ConfigWoodType,
  DashboardData,
  Stock,
  Wood,
} from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

// Replace this function with the real factory system call
// If FACTORY_API_URL is set in environment variables, fetch from the real system
// Otherwise, return data from config file
// The API must return floorWorkers as { productionFactory, packing, saw, drivers },
// where productionFactory is { label, groups: { production, workshop, operators } } and every
// group is { label, total, presentNames } - present count is presentNames.length
// treasury is { balance, incomingToday, outgoingToday } - today's change is calculated in the UI
// batches is { unit, list: [{ kiln, type, weight, time: "HH:MM" }] } - totals are calculated in the UI
// stock is { packaged, sacks, rawMaterials } (every total is calculated in the UI):
// - packaged: [{ id, name, unit, image?, variants: [{ label, quantity, minimumThreshold }] }]
// - sacks: [{ id, name, unit, icon?, variants: [{ label, quantity, minimumThreshold }] }]
// - rawMaterials: { wood, packaging }
//   - wood: { unit, types: [{ id, name, quantity, minimumThreshold } or { id, name, subTypes: [{ name, quantity, minimumThreshold }] }] }
//   - packaging: [{ id, name, unit, quantity, minimumThreshold, icon?: "plastic" | "roll" | "bag" }]
// The old shape with stock.wood (and no rawMaterials) is still accepted - see normalizeStock
// { label, quantity, minimum } من الكونفج -> شكل الـ API - config variant to the API shape
function toVariant(variant: ConfigVariant) {
  return { label: variant.label, quantity: variant.quantity, minimumThreshold: variant.minimum };
}

// الشكل القديم كان فيه stock.wood بدل rawMaterials - the old API shape had stock.wood instead of rawMaterials
function normalizeStock(stock: Stock & { wood?: Wood }): Stock {
  if (stock.rawMaterials) return stock;
  const { wood, ...rest } = stock;
  return { ...rest, rawMaterials: { wood: wood ?? { unit: "", types: [] }, packaging: [] } };
}

export async function getDashboardData(): Promise<DashboardData> {
  const factoryApiUrl = process.env.FACTORY_API_URL;
  const factoryApiKey = process.env.FACTORY_API_KEY;

  if (factoryApiUrl) {
    try {
      const response = await fetch(factoryApiUrl, {
        headers: {
          "Content-Type": "application/json",
          ...(factoryApiKey && { "Authorization": `Bearer ${factoryApiKey}` }),
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const apiData: DashboardData = await response.json();
      return { ...apiData, stock: normalizeStock(apiData.stock) };
    } catch (error) {
      console.error("Error fetching from factory API:", error);
      // Fall back to config data if API fails
    }
  }

  // Return data from config file
  const config = dashboardConfig.data;
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
      balance: config.treasury.balance,
      incomingToday: config.treasury.incomingToday,
      outgoingToday: config.treasury.outgoingToday,
    },
    batches: {
      unit: config.batches.unit,
      list: config.batches.list.map((batch: Batch) => ({ ...batch })),
    },
    updatedAt: new Date().toISOString(),
  };
}
