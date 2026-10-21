export type KilnStatus = "working" | "maintenance" | "stopped";

export interface Attendance {
  present: number;
  absent: number;
  total: number;
  absentNames: string[];
  notRecorded?: boolean; // مفيش أي تسجيل حضور النهارده في ERPNext - nothing recorded today yet
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

// مادة تعبئة (بلاستيك، رولات، أكياس...) - packaging material, one quantity each
export interface PackagingItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minimumThreshold: number;
  icon?: string; // "plastic" | "roll" | "bag"
}

// المواد الخام: الأخشاب ومواد التعبئة - raw materials: wood + packaging materials
export interface RawMaterials {
  wood: Wood;
  packaging: PackagingItem[];
}

export interface Stock {
  packaged: PackagedProduct[];
  sacks: SackItem[];
  rawMaterials: RawMaterials;
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

// مصنع الإنتاج: 3 مجموعات - production factory with 3 sub-groups
// present / total بيعدوا كل شخص مرة واحدة - present / total count each person once
export interface ProductionFactory {
  label: string;
  groups: {
    production: WorkerGroup; // عمال إنتاج
    workshop: WorkerGroup; // ورشة
    operators: WorkerGroup; // أوبريتر
  };
  present: number;
  total: number;
}

// daily = عمال اليومية (برضه موجودين في أقسامهم) - daily workers (also listed in their own group)
// present / total = إجمالي الكارت، كل شخص مرة واحدة - card totals, each person once
export interface FloorWorkers {
  productionFactory: ProductionFactory;
  packing: WorkerGroup;
  saw: WorkerGroup;
  drivers: WorkerGroup;
  daily: WorkerGroup;
  present: number;
  total: number;
  notRecorded?: boolean; // مفيش أي تسجيل حضور النهارده في ERPNext - nothing recorded today yet
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
  erpOffline: boolean; // true when an ERPNext request failed on this refresh
}

// مصدر كل رقم: "erp" = من ERPNext، "manual" = من أرقام الكونفج
// Where each number comes from: "erp" = ERPNext, "manual" = the config numbers
export type ConfigErpField = { source: "manual" } | { source: "erp"; account: string };

// قسم كامل من ERPNext ولا يدوي - a whole section from ERPNext or manual
export type ConfigErpSource = { source: "erp" | "manual" };

// الطرحات: fuelWood = أخشاب وقود مش بتحدد نوع الطرحة (بس بتدخل في الوزن)
// Batches: fuelWood = fuel wood names that never decide a batch's type (still counted in its weight)
export type ConfigErpBatches = { source: "manual" } | { source: "erp"; fuelWood: string[] };

// رقم مخزن: مجموع actual_qty لكل itemCodes في warehouses (فاضية = كل المخازن)
// A stock number: total actual_qty of every itemCode in warehouses (empty = all warehouses)
export type ConfigErpStockItem =
  | { source: "manual" }
  | { source: "erp"; itemCodes: string[]; warehouses: string[] };

// المفتاح = الاسم زي ما هو في data.stock - keyed by the name used in data.stock
export type ConfigErpStockMap = Record<string, ConfigErpStockItem>;

// ============================================================
// أشكال الكونفج - config/dashboard.config.ts shapes
// كل ليستة في الكونفج متعرفة بنوعها عشان لو فضيتها الـ build ميقعش
// Every config list is typed so leaving it empty never breaks the build
// ============================================================

export interface ConfigPage {
  id: string;
  title: string;
}

// عامل في الكونفج - a worker in the config (listed once, in their department group)
export interface ConfigWorker {
  name: string;
  employeeId?: string; // ID الموظف في ERPNext
  present: boolean;
  daily?: boolean; // عامل يومية: بيظهر كمان في خانة عمال يومية
}

export interface ConfigKiln {
  name: string;
  status: KilnStatus;
}

// minimum بدل minimumThreshold - config uses minimum instead of minimumThreshold
export interface ConfigVariant {
  label: string;
  quantity: number;
  minimum: number;
}

export interface ConfigPackagedProduct {
  name: string;
  unit: string;
  image?: string;
  variants: ConfigVariant[];
}

export interface ConfigSack {
  name: string;
  unit: string;
  variants: ConfigVariant[];
}

export interface ConfigWoodSubType {
  name: string;
  quantity: number;
  minimum: number;
}

export interface ConfigWoodType {
  name: string;
  quantity?: number;
  minimum?: number;
  subTypes?: ConfigWoodSubType[];
}

export interface ConfigPackagingItem {
  name: string;
  quantity: number;
  unit: string;
  minimum: number;
  icon?: string; // "plastic" | "roll" | "bag"
}
