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

// One half of a sack card (fine / coarse)
export interface SackLevel {
  quantity: number;
  minimumThreshold: number;
}

export interface SackItem {
  id: string;
  name: string;
  unit: string;
  icon?: string;
  fine: SackLevel; // ناعم
  coarse: SackLevel; // خشن
}

export interface Stock {
  // quarter, half, kilo, 2kg, 3kg - in display order
  products: StockItem[];
  // orange, mango, casuarina - in display order
  sacks: SackItem[];
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

export interface WorkerGroup {
  label: string;
  total: number;
  presentNames: string[];
}

// مصنع الإنتاج: 3 مجموعات - production factory with 3 sub-groups (its total = their sum)
export interface ProductionFactory {
  label: string;
  groups: {
    production: WorkerGroup; // عمال إنتاج
    workshop: WorkerGroup; // ورشة
    operators: WorkerGroup; // أوبريتر
  };
}

export interface FloorWorkers {
  productionFactory: ProductionFactory;
  packing: WorkerGroup;
  saw: WorkerGroup;
  drivers: WorkerGroup;
}

// تغيير اليوم = incomingToday - outgoingToday (calculated in the UI)
export interface Treasury {
  balance: number;
  incomingToday: number; // وارد اليوم
  outgoingToday: number; // منصرف اليوم
}

// طرحة واحدة من فرن - one kiln batch; totals are calculated in the UI
export interface Batch {
  kiln: string; // must match a Kiln.name for the status color
  type: string;
  weight: number;
  time: string; // "HH:MM" 24h
}

export interface Batches {
  unit: string;
  list: Batch[];
}

export interface DashboardData {
  attendance: Attendance;
  stock: Stock;
  kilns: Kilns;
  floorWorkers: FloorWorkers;
  treasury: Treasury;
  batches: Batches;
  updatedAt: string;
}
