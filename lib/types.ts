export type KilnStatus = "working" | "maintenance" | "stopped";

export interface Attendance {
  present: number;
  absent: number;
  total: number;
  absentNames: string[];
}

// نوع واحد جوه الكارت (عادي/كامل، ناعم/خشن/مكمورة...) - one type inside a stock card
// low when minimumThreshold > 0 and quantity <= minimumThreshold
export interface StockVariant {
  label: string;
  quantity: number;
  minimumThreshold: number;
}

// منتج معبأ - packaged product; its total = sum of variants (calculated in the UI)
export interface PackagedProduct {
  id: string;
  name: string;
  unit: string;
  image?: string;
  variants: StockVariant[];
}

export interface WoodSubType {
  name: string;
  quantity: number;
  minimumThreshold: number;
}

// نوع خشب: رقم واحد أو أنواع فرعية - a wood type has either one quantity or subTypes
// (with subTypes, its quantity = their sum, calculated in the UI)
export interface WoodType {
  id: string;
  name: string;
  quantity?: number;
  minimumThreshold?: number;
  subTypes?: WoodSubType[];
}

export interface Wood {
  unit: string;
  types: WoodType[];
}

// الشكاير - sack card; its total = sum of variants (calculated in the UI)
export interface SackItem {
  id: string;
  name: string;
  unit: string;
  icon?: string;
  variants: StockVariant[];
}

export interface Stock {
  packaged: PackagedProduct[];
  wood: Wood;
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
