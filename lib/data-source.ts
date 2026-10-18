import { DashboardData } from "./types";
import { dashboardConfig } from "@/config/dashboard.config";

// Replace this function with the real factory system call
// If FACTORY_API_URL is set in environment variables, fetch from the real system
// Otherwise, return data from config file
// The API must return floorWorkers as { production, packing, saw, drivers },
// each { label, total, presentNames } - present count is presentNames.length
// stock.products must be in display order: quarter, half, kilo, 2kg, 3kg
// stock.sacks must be in display order: orange, mango, casuarina,
// each { id, name, unit, icon?, fine: { quantity, minimumThreshold }, coarse: { quantity, minimumThreshold } }
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

      return await response.json();
    } catch (error) {
      console.error("Error fetching from factory API:", error);
      // Fall back to config data if API fails
    }
  }

  // Return data from config file
  const config = dashboardConfig.data;

  // Calculate kiln counts from the list
  const workingCount = config.kilns.filter((k) => k.status === "working").length;
  const maintenanceCount = config.kilns.filter((k) => k.status === "maintenance").length;
  const stoppedCount = config.kilns.filter((k) => k.status === "stopped").length;

  return {
    attendance: {
      present: config.attendance.present,
      absent: config.attendance.absent,
      total: config.attendance.present + config.attendance.absent,
      absentNames: config.attendance.absentNames,
    },
    stock: {
      products: config.stock.products.map((product, index) => ({
        id: ["quarter", "half", "kilo", "2kg", "3kg"][index],
        name: product.name,
        quantity: product.quantity,
        unit: product.unit,
        minimumThreshold: product.minimum,
        image: product.image,
      })),
      sacks: (["orange", "mango", "casuarina"] as const).map((id, index) => {
        const sack = config.stock.sacks[id];
        return {
          id,
          name: sack.name,
          unit: sack.unit,
          fine: { quantity: sack.fine.quantity, minimumThreshold: sack.fine.minimum },
          coarse: { quantity: sack.coarse.quantity, minimumThreshold: sack.coarse.minimum },
          icon: ["�", "🥭", "🌲"][index],
        };
      }),
    },
    kilns: {
      working: workingCount,
      maintenance: maintenanceCount,
      stopped: stoppedCount,
      total: config.kilns.length,
      kilns: config.kilns.map((kiln, index) => ({
        id: `kiln-${index + 1}`,
        name: kiln.name,
        status: kiln.status,
      })),
    },
    floorWorkers: {
      production: { ...config.workers.production },
      packing: { ...config.workers.packing },
      saw: { ...config.workers.saw },
      drivers: { ...config.workers.drivers },
    },
    treasury: {
      balance: config.treasury.balance,
      todayChange: config.treasury.todayChange,
    },
    updatedAt: new Date().toISOString(),
  };
}
