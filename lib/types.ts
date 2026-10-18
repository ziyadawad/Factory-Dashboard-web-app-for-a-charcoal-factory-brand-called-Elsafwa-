export type KilnStatus = "working" | "maintenance" | "stopped";

export interface Attendance {
  present: number;
  absent: number;
  total: number;
  absentNames: string[];
}

export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minimumThreshold: number;
  image?: string;
  icon?: string;
}

export interface Stock {
  products: StockItem[];
  sacks: StockItem[];
}

export interface Kiln {
  id: string;
  name: string;
  status: KilnStatus;
}

export interface Kilns {
  working: number;
  maintenance: number;
  stopped: number;
  total: number;
  kilns: Kiln[];
}

export interface FloorWorkers {
  present: number;
  total: number;
}

export interface Treasury {
  balance: number;
  todayChange?: number;
}

export interface DashboardData {
  attendance: Attendance;
  stock: Stock;
  kilns: Kilns;
  floorWorkers: FloorWorkers;
  treasury: Treasury;
  updatedAt: string;
}
