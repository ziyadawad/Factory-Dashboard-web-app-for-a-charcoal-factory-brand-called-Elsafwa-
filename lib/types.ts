export type KilnStatus = "working" | "maintenance" | "stopped";

export interface Attendance {
  present: number;
  absent: number;
  total: number;
  presentNames: string[];
  absentNames: string[];
  allNames: string[]; // كل الإدارة (بتظهر لما الحضور لسه متسجلش) - everyone, shown while nothing is recorded
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

// مادة تعبئة (أكياس تعبئة، رولات، أكياس، بكر لاصق...) - packaging material, one quantity each
export interface PackagingItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minimumThreshold: number;
  icon?: string; // "plastic" | "roll" | "bag" | "tape"
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

// عدد الطرحات لكل نوع خشب - batch count per wood type; totals are calculated in the UI
export interface BatchCounts {
  orange: number; // برتقال
  mango: number; // مانجا
  casuarina: number; // جازورينا
}

// طرحة خرجت النهارده (سجل Kiln Exit) - one batch that left a kiln today (a Kiln Exit record)
export interface BatchExit {
  id: string;
  time: string; // "10:45" بتوقيت القاهرة - Cairo time
  kiln: string; // "فرن 3"
  type: keyof BatchCounts | null; // null = نوع مش معروف - unknown charcoal type
  typeLabel: string; // زي ما هو في ERPNext - as written in ERPNext
}

// out = خروج طرحات النهارده (من exits)، ground = طرحات على الأرض، exits = طرحات النهارده الأحدث الأول
// offline = ERPNext مش بيرد والأرقام دي آخر نتيجة نجحت
// out = today's exits per type, ground = batches on the ground, exits = today's exits newest first,
// offline = ERPNext failed and these are the last good values
export interface Batches {
  out: BatchCounts;
  ground: BatchCounts;
  exits: BatchExit[];
  offline: boolean;
}

export interface DashboardData {
  attendance: Attendance;
  stock: Stock;
  kilns: Kilns;
  floorWorkers: FloorWorkers;
  treasury: Treasury;
  batches: Batches | null; // null = ERPNext فشل ومفيش نتيجة قديمة - ERPNext failed with no last good result
  updatedAt: string;
  erpOffline: boolean; // true when an ERPNext request failed on this refresh
}

// مصدر كل رقم: "erp" = من ERPNext، "manual" = من أرقام الكونفج
// Where each number comes from: "erp" = ERPNext, "manual" = the config numbers
export type ConfigErpField = { source: "manual" } | { source: "erp"; account: string };

// قسم كامل من ERPNext ولا يدوي - a whole section from ERPNext or manual
export type ConfigErpSource = { source: "erp" | "manual" };

// الطرحات: exitsDoctype = سجل لكل طرحة خرجت، groundDoctype = الـ Single DocType اللي فيه طرحات على الأرض
// Batches: exitsDoctype = one record per batch out; groundDoctype = the Single DocType with batches on the ground
export type ConfigErpBatches =
  | { source: "manual" }
  | {
      source: "erp";
      exitsDoctype: string;
      groundDoctype: string;
    };

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
  durationSeconds: number; // مدة الصفحة في التقليب التلقائي - seconds on screen when auto rotating
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
  icon?: string; // "plastic" | "roll" | "bag" | "tape"
}
