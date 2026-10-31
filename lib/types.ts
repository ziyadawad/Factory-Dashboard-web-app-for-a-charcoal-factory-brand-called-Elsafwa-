export type KilnStatus = "working" | "maintenance" | "stopped";

// حالة الشخص النهارده - a person's status today
export type PersonStatus = "present" | "absent" | "leave";

export interface AttendancePerson {
  name: string; // أول اسمين من employee_name - first two words of employee_name
  status: PersonStatus;
}

// قسم حضور: total = كل اللي فيه، leave = إجازة (مش داخلين في النسبة)
// An attendance section: total = everyone in it, leave = on leave (left out of the percentage)
export interface AttendanceGroup {
  label: string;
  total: number;
  present: number;
  leave: number;
  people: AttendancePerson[]; // الحاضرين الأول - present first
}

// مصنع الإنتاج: 3 مجموعات - production factory with 3 sub-groups (its totals = their sum)
export interface ProductionFactory extends Omit<AttendanceGroup, "people"> {
  groups: {
    production: AttendanceGroup; // عمال إنتاج
    workshop: AttendanceGroup; // ورشة
    operators: AttendanceGroup; // أوبريتر
  };
}

// حضور عمال: مصنع إنتاج + تعبئة + يومية (السواقين والمناديب والغفر برّه)
// Workers attendance: factory + packing + daily (drivers, reps and guards are separate)
export interface WorkersAttendance {
  productionFactory: ProductionFactory;
  packing: AttendanceGroup;
  daily: AttendanceGroup;
  present: number;
  total: number;
}

// كل كروت الحضور - every attendance card
export interface Attendance {
  management: AttendanceGroup;
  workers: WorkersAttendance;
  drivers: AttendanceGroup;
  reps: AttendanceGroup;
  guards: AttendanceGroup;
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
  minimumThreshold: number; // الحد الأدنى للإجمالي (من config/stock-min.ts) - minimum for the card total
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
  minimumThreshold: number; // الحد الأدنى للإجمالي (من config/stock-min.ts) - minimum for the card total
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

// out = خروج طرحات النهارده (من exits)، exits = طرحات النهارده الأحدث الأول
// offline = ERPNext مش بيرد والأرقام دي آخر نتيجة نجحت
// out = today's exits per type, exits = today's exits newest first,
// offline = ERPNext failed and these are the last good values
export interface Batches {
  out: BatchCounts;
  exits: BatchExit[];
  offline: boolean;
}

// عملية صدقة (سجل Charity Transaction) - one charity operation (a Charity Transaction record)
export interface CharityOperation {
  id: string;
  date: string; // "2026-10-27"
  type: "out" | "in" | "opening"; // out = صرف، in = إيداع، opening = رصيد افتتاحي
  amount: number;
  beneficiary: string; // صُرفت لـ
  details: string;
}

// صندوق صدقات: balance = (الرصيد الافتتاحي + الإيداع) − الصرف من الأول، monthOut = صرف الشهر الحالي،
// opening = مجموع الرصيد الافتتاحي وتاريخ آخر سجل ليه (null = مفيش)،
// lastOut = آخر صرف (null = مفيش صرف)، recent = آخر عمليات صرف/إيداع الأحدث الأول (عددها sizes.page3.recentOpsCount، من غير الرصيد الافتتاحي)
// A charity fund: balance = all-time (opening + deposits) − spending, monthOut = this month's spending,
// opening = total opening balance and its latest record's date (null = none),
// lastOut = the latest spending (null = none), recent = the last صرف / إيداع newest first (sizes.page3.recentOpsCount of them, no opening balance)
export interface CharityFund {
  name: string;
  balance: number;
  monthOut: number;
  opening: { amount: number; date: string } | null;
  lastOut: CharityOperation | null;
  recent: CharityOperation[];
}

// الصدقات (الصفحة 3): offline = ERPNext مش بيرد ودي آخر بيانات نجحت
// Charity (page 3): offline = ERPNext failed and this is the last good data
export interface Charity {
  funds: CharityFund[];
  totalBalance: number; // إجمالي أرصدة الصدقات
  todayOut: number; // إجمالي صرف اليوم
  monthOut: number; // إجمالي صرف الشهر
  offline: boolean;
}

export interface DashboardData {
  attendance: Attendance;
  stock: Stock;
  kilns: Kilns;
  treasury: Treasury;
  batches: Batches | null; // null = ERPNext فشل ومفيش نتيجة قديمة - ERPNext failed with no last good result
  charity: Charity | null; // null = ERPNext فشل ومفيش نتيجة قديمة - ERPNext failed with no last good result
  updatedAt: string;
  erpOffline: boolean; // true when an ERPNext request failed on this refresh
}

// مصدر كل رقم: "erp" = من ERPNext، "manual" = من أرقام الكونفج
// Where each number comes from: "erp" = ERPNext, "manual" = the config numbers
export type ConfigErpField = { source: "manual" } | { source: "erp"; account: string };

// قسم كامل من ERPNext ولا يدوي - a whole section from ERPNext or manual
export type ConfigErpSource = { source: "erp" | "manual" };

// الطرحات: exitsDoctype = سجل لكل طرحة خرجت - Batches: exitsDoctype = one record per batch out
export type ConfigErpBatches =
  | { source: "manual" }
  | {
      source: "erp";
      exitsDoctype: string;
    };

// الصدقات: doctype = سجل لكل عملية، funds = الصناديق بالترتيب - Charity: one record per operation, funds in order
export type ConfigErpCharity = { doctype: string; funds: string[] };

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

// قسم حضور في الكونفج: أكواد البصمة (attendance_device_id) - رقم لوحده أو [من، لحد]
// An attendance section in the config: device codes, a single number or an inclusive [from, to] range
export interface ConfigAttendanceSection {
  label: string;
  codes: (number | [number, number])[];
}

export interface ConfigKiln {
  name: string;
  status: KilnStatus;
}

// minimum بدل minimumThreshold - config uses minimum instead of minimumThreshold
export interface ConfigVariant {
  label: string;
  quantity: number;
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
}

export interface ConfigWoodType {
  name: string;
  quantity?: number;
  subTypes?: ConfigWoodSubType[];
}

export interface ConfigPackagingItem {
  name: string;
  quantity: number;
  unit: string;
  icon?: string; // "plastic" | "roll" | "bag" | "tape"
}
