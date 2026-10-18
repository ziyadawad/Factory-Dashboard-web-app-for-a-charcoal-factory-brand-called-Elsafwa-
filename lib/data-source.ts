import { DashboardData, KilnStatus } from "./types";

// Replace this function with the real factory system call
// If FACTORY_API_URL is set in environment variables, fetch from the real system
// Otherwise, return mock data for development
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
      // Fall back to mock data if API fails
    }
  }

  // Mock data with slight random variations for testing live refresh
  const randomVariation = (base: number, variance: number): number => {
    return Math.floor(base + (Math.random() - 0.5) * variance);
  };

  const absentNamesPool = [
    "أحمد محمد",
    "محمد علي",
    "عمر حسن",
    "خالد يوسف",
    "محمود عبدالله",
    "إبراهيم سعيد",
    "سامي كمال",
    "طارق عادل",
  ];

  const shuffleAndPick = (array: string[], count: number): string[] => {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  const presentCount = randomVariation(12, 2);
  const absentCount = randomVariation(3, 2);

  const kilnStatuses: KilnStatus[] = ["working", "working", "working", "maintenance", "stopped"];
  const shuffledKilns = kilnStatuses.sort(() => Math.random() - 0.5);

  return {
    attendance: {
      present: presentCount,
      absent: absentCount,
      total: presentCount + absentCount,
      absentNames: shuffleAndPick(absentNamesPool, absentCount),
    },
    stock: {
      products: [
        {
          id: "quarter",
          name: "ربع كيلو",
          quantity: randomVariation(1500, 100),
          unit: "باكت",
          minimumThreshold: 500,
          image: "/products/quarter.png",
        },
        {
          id: "half",
          name: "نص كيلو",
          quantity: randomVariation(1200, 80),
          unit: "باكت",
          minimumThreshold: 400,
          image: "/products/half.png",
        },
        {
          id: "kilo",
          name: "كيلو",
          quantity: randomVariation(800, 60),
          unit: "باكت",
          minimumThreshold: 300,
          image: "/products/kilo.png",
        },
        {
          id: "3kg",
          name: "3 كيلو",
          quantity: randomVariation(450, 40),
          unit: "باكت",
          minimumThreshold: 150,
          image: "/products/3kg.png",
        },
      ],
      sacks: [
        {
          id: "orange",
          name: "شكاير برتقال",
          quantity: randomVariation(2000, 150),
          unit: "شكارة",
          minimumThreshold: 500,
          icon: "🌳",
        },
        {
          id: "mango",
          name: "شكاير مانجو",
          quantity: randomVariation(1800, 120),
          unit: "شكارة",
          minimumThreshold: 400,
          icon: "🥭",
        },
        {
          id: "casuarina",
          name: "شكاير كازوارينا",
          quantity: randomVariation(1500, 100),
          unit: "شكارة",
          minimumThreshold: 300,
          icon: "🌲",
        },
      ],
    },
    kilns: {
      working: shuffledKilns.filter((s) => s === "working").length,
      maintenance: shuffledKilns.filter((s) => s === "maintenance").length,
      stopped: shuffledKilns.filter((s) => s === "stopped").length,
      total: 5,
      kilns: shuffledKilns.map((status, index) => ({
        id: `kiln-${index + 1}`,
        name: `فرن ${index + 1}`,
        status,
      })),
    },
    floorWorkers: {
      present: randomVariation(85, 10),
      total: 100,
    },
    treasury: {
      balance: randomVariation(1250000, 50000),
      todayChange: randomVariation(15000, 10000),
    },
    updatedAt: new Date().toISOString(),
  };
}
