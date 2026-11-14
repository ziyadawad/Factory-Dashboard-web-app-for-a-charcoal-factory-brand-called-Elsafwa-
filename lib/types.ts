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
  outside: AttendanceGroup; // خارج البصمة - not on the biometric
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

// حركة واحدة على حساب (الخزنة أو محفظة) - one movement on an account (treasury or a wallet), a GL Entry
export interface AccountMove {
  id: string; // GL Entry name
  postingDate: string; // YYYY-MM-DD
  creation: string; // "YYYY-MM-DD HH:MM" بتوقيت ERPNext (مصر) - ERPNext time (Cairo)
  createdAt: number; // epoch ms
  lateDays: number; // أيام بين التاريخ والتسجيل الفعلي - days between posting date and the real entry
  debit: number; // وارد
  credit: number; // منصرف
  balanceAfter: number; // الرصيد بعد الحركة
  party: string; // الطرف (party أو against)
  remarks: string;
  voucherType: string;
  voucherNo: string;
  owner: string; // اسم اللي سجّلها - full name of who entered it
  out: MoveOut | null; // المنصرف: لمين وليه - an outgoing move: for whom and why
}

// منصرف: لمين وليه (من الطرف التاني في نفس المستند) - an outgoing move: who it was for and why (the voucher's other side)
export interface MoveOut {
  category: "employee" | "supplier" | "expense" | "other"; // تشيبس الفلتر - the filter chips
  kind: string; // "سلفة" / "مرتب" / "يومية" / "إضافي" / "عهدة" / "مصروف" / "صرف لموظف" / "مورد" / "عميل"
  employee: string | null; // ID الموظف - the employee ID
  name: string; // اسم الموظف أو الطرف - the employee or party name
  account: string; // الحساب (أو الحسابات) - the account(s)
  // سلفة: مربوطة بإيه (Loan بيتخصم من المرتب، تسوية مرتب، Employee Advance) - what an advance is tied to
  link: "loan" | "adjustment" | "employee_advance" | null;
  warn: boolean; // ⚠ سلفة مش متسجلة على المرتب - an advance not recorded against the salary
}

// سلف الشهر لكل موظف (من منصرف الحساب) - this month's advances per employee (from the account's outgoing moves)
export interface AdvanceSummary {
  total: number;
  people: { employee: string; name: string; amount: number; count: number }[];
}

// شهر فيه حركات - a month that has movements
export interface AccountMonth {
  month: string; // YYYY-MM
  count: number;
}

// تفاصيل حساب (لوحة الضغط على كارت الخزنة أو محفظة) - account details (treasury / wallet card click panel)
export interface AccountDetails {
  accountNumber: string;
  account: string; // الاسم الكامل في ERPNext - full ERPNext account name
  today: string;
  from: string; // أول يوم في الحركات اللي اتجابت - first fetched day
  to: string; // آخر يوم (آخر الشهر أو النهارده) - last fetched day (month end or today)
  month: string | null; // YYYY-MM في وضع الشهور - in month mode
  monthStart: string;
  months: AccountMonth[]; // وضع الشهور بس، الأحدث الأول - month mode only, newest first
  balance: number; // الرصيد الحالي (زي الكارت) - current balance (same as the card)
  openingBalance: number; // الرصيد قبل from - balance before from
  closingBalance: number; // الرصيد آخر يوم to - balance at the end of to
  totalIn: number; // وارد from..to
  totalOut: number; // منصرف from..to
  incomingToday: number;
  outgoingToday: number;
  movesToday: number;
  lastEntry: { creation: string; createdAt: number; owner: string } | null; // آخر تسجيل (بالـ creation)
  erpUrl: string; // عشان لينك "افتح في ERPNext" - for the "open in ERPNext" link
  moves: AccountMove[]; // الأحدث الأول - newest first
  advances: AdvanceSummary; // سلف الشهر (monthStart → to) - this month's advances
}

// الإنتاج والأفران (الصفحة 2) - production and kilns (page 2)
// نوع فحم (من خيارات charcoal_type في Kiln Exit) ولونه - a charcoal type (Kiln Exit charcoal_type options) and its color
export interface ProductionType {
  label: string; // "برتقال"
  color: string; // "#FF7A00"
}

// طرحة خرجت (سجل Kiln Exit) - one batch out of a kiln (a Kiln Exit record)
export interface ProductionExit {
  id: string;
  date: string; // "2026-11-14" بتوقيت القاهرة - Cairo time
  time: string; // "10:45"
  kiln: string; // "فرن 3"
  type: string; // اسم النوع (زي ProductionType.label)، "" = فاضي - the type label, "" = empty
  kg: number | null; // الوزن بالكيلو، null = بدون وزن (سجل قديم) - weight in kg, null = no weight (old record)
}

// exits = من monthStart (أو امبارح لو النهارده أول الشهر) لحد النهارده، الأحدث الأول
// weightField = حقل الوزن موجود في الـ DocType، offline = ERPNext فشل ودي آخر نتيجة نجحت
// exits = from monthStart (or yesterday on the 1st) to today, newest first; weightField = the DocType has the
// weight field; offline = ERPNext failed and this is the last good result
export interface ProductionData {
  today: string;
  yesterday: string;
  monthStart: string;
  weightField: boolean;
  types: ProductionType[];
  kilns: { name: string; status: KilnStatus }[];
  exits: ProductionExit[];
  updatedAt: string;
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

// باكتات منتج واحد (ربع / نص / كيلو / 2 كيلو / 3 كيلو) - packets of one product
export interface ProductPackets {
  label: string;
  packets: number;
}

// مندوب: الأرقام كلها للشهر ده (صافي بعد المرتجعات) - a rep; every number is this month, net of returns
export interface RepSales {
  name: string;
  van: string;
  target: number;
  monthPackets: number;
  products: ProductPackets[]; // الصف الأول: الأصناف العادي بالباكت - row 1: regular items in packets
  cartons: ProductPackets[]; // الصف التاني: الكراتين بعددها (packets = عدد الكراتين) - row 2: carton count (packets = cartons)
  lastDay: { date: string; packets: number } | null; // آخر يوم فيه بيع الشهر ده - latest selling day this month
  sellingDays: number; // عدد الأيام اللي فيها بيع - days with sales
  lastMonthPackets: number; // الشهر اللي فات - last month
  isTop: boolean; // الأول في المبيعات - most packets this month
  debt: RepDebtSummary | null; // المديونية برّه (كل الفواتير المفتوحة، أي تاريخ) - outstanding debt (all open invoices, any date)
}

// مديونية المندوب على الكارت - a rep's outstanding debt on the card
export interface RepDebtSummary {
  amount: number; // صافي المديونية (الفواتير المفتوحة ناقص المرتجعات) ج.م - net outstanding, EGP
  customers: number; // عدد العملاء اللي عليهم فلوس - customers who owe money
  overdue: boolean; // فيه فاتورة مفتوحة أقدم من sales.debtWarningDays - an unpaid invoice older than debtWarningDays
}

// صفحة مبيعات المناديب - reps sales page; offline = ERPNext failed and this is the last good data
export interface SalesReps {
  month: string; // "2026-11"
  reps: RepSales[];
  totalPackets: number;
  totalTarget: number;
  totalDebt: number | null; // إجمالي مديونية المناديب - all reps' outstanding debt
  offline: boolean;
}

// تفاصيل الحضور (لوحة الضغط على كارت حضور) - attendance details (the panel opened from an attendance card)
// present / absent / leave = يوم شغل، off = الإجازة الأسبوعية، holiday = من Holiday List،
// none = قبل التعيين أو قبل البصمة، future = لسه - none = before joining / before the biometric
export type DayStatus = "present" | "absent" | "leave" | "off" | "holiday" | "none" | "future";

export interface EmployeeDay {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  firstPunch: string | null; // "08:12" أول بصمة في اليوم (حتى لو يوم إجازة) - first punch that day
  half?: true; // نص يوم (حاضر بس بيتخصم نص يوم في المرتب) - half day (present, half a day off the salary)
  // جمعة اشتغلها (بصمة أو Attendance حاضر يوم الإجازة الأسبوعية): 1 أو نص يوم 0.5 - "fixed" مالهمش
  // A worked Friday (a punch or a Present Attendance on the weekly day off): 1, or 0.5 for half - never "fixed"
  fridayWork?: 1 | 0.5;
}

export interface EmployeeAttendance {
  id: string; // Employee ID
  code: string | null; // كود البصمة - attendance_device_id
  name: string; // الاسم الكامل (أو اسم العرض من الكونفج) - full name (or the config display name)
  erpName?: string; // اسم ERPNext لو اسم العرض مختلف - the ERPNext name when a display name overrides it
  section: string; // اسم القسم - section label
  today: PersonStatus; // نفس حالة الكارت - same status as the card
  todayFirstPunch: string | null;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  absentDates: string[];
  days: EmployeeDay[]; // كل أيام الشهر - every day of the month
  // أيام قبل أول الشهر تبع أسابيع اليومية (السبت → الجمعة) - days before the month that belong to the daily-pay weeks
  leadDays: EmployeeDay[];
}

export interface AttendanceDetails {
  month: string; // "2026-11"
  today: string;
  section: { key: string; label: string; present: number; absent: number; leave: number };
  trackingStartDate: string;
  weeklyOff: string[];
  holidayListsRead: boolean; // false = مفيش صلاحية على Holiday List (الإجازة الأسبوعية من الكونفج بس)
  // مبصمش النهارده: Active من غير بصمة ولا Attendance النهارده (فاضية يوم الجمعة/الإجازة الرسمية)
  // No punch today: Active employees with no checkin and no Attendance today (empty on a day off / holiday)
  notPunchedToday: { id: string; code: string | null; name: string }[];
  todayOff: boolean;
  erpUrl: string | null; // أصل ERPNext للينك "سجّل حضور" - ERPNext origin for the "mark attendance" link
  people: EmployeeAttendance[]; // الغايب النهارده الأول وبعدين بالاسم - absent today first, then by name
}

// تفاصيل المندوب يوم بيوم (لوحة التفاصيل) - a rep's daily details (the details panel)
// columns = القيم بنفس ترتيب RepDetails.columns (الأصناف بالباكت ثم الكراتين بعددها) - values in RepDetails.columns order
export interface RepInvoice {
  id: string;
  customer: string;
  isReturn: boolean;
  columns: number[];
  packets: number;
  amount: number;
}

export interface RepDay {
  date: string; // YYYY-MM-DD
  columns: number[];
  packets: number;
  amount: number;
  customers: number;
  invoices: RepInvoice[];
}

export interface RepDetails {
  month: string;
  name: string;
  van: string;
  target: number;
  columns: string[];
  days: RepDay[]; // الأحدث فوق - newest first
  total: { columns: number[]; packets: number; amount: number; customers: number };
  debt: RepDebt | null; // null = طلب المديونية فشل - the debt request failed
}

// فاتورة مفتوحة (أو مرتجع لسه مخصومش) - an unpaid invoice (or an unallocated credit note)
export interface DebtInvoice {
  id: string;
  date: string; // YYYY-MM-DD
  daysAgo: number;
  isReturn: boolean;
  total: number;
  paid: number; // المدفوع كله (متربط + دفعات مش متربطة اتخصمت منها) - all paid, linked + unlinked applied
  unlinked: number; // من دفعات أو مرتجعات مش متربطة بالفاتورة في ERPNext - from payments or credit notes not linked to the invoice in ERPNext
  outstanding: number;
  url: string; // الفاتورة في ERPNext - the invoice in ERPNext
}

export interface DebtCustomer {
  customer: string;
  amount: number; // صافي مديونية العميل - net outstanding
  openInvoices: number; // الفواتير اللي عليها فلوس - invoices with money still due
  oldest: { date: string; daysAgo: number } | null; // أقدم فاتورة مفتوحة - oldest unpaid invoice
  unlinkedApplied: number; // دفعات مش متربطة اتخصمت من فواتير العربية دي - unlinked payments deducted from this van's invoices
  invoices: DebtInvoice[]; // الأقدم الأول - oldest first
}

// مديونية المندوب في لوحة التفاصيل - a rep's debt in the details panel
export interface RepDebt {
  amount: number;
  customers: number;
  unlinkedApplied: number; // دفعات العملاء اللي مش متربطة بفواتير واتخصمت - unlinked customer payments deducted
  warningDays: number;
  aging: { label: string; amount: number; invoices: number }[]; // 0–7 / 8–30 / أكتر من 30
  list: DebtCustomer[]; // الأكبر الأول - biggest first
}

// موزع: سحب الشهر ده (صافي بعد المرتجعات) - a distributor, this month net of returns
export interface DistributorSales {
  name: string;
  linked: boolean; // false = مفيش Customer ID في الكونفج - no Customer ID in the config
  featured: boolean;
  fullHeight: boolean; // عمود لوحده بطول الصفحة - its own full-height column
  monthPackets: number;
  monthAmount: number; // ج.م
  products: ProductPackets[];
  invoiceCount: number; // عدد الطلبيات (من غير المرتجعات) - invoices this month (returns excluded)
  // آخر طلبية (كل فواتير آخر يوم مع بعض) - the latest order day (all invoices of that day together)
  lastOrder: { date: string; packets: number; amount: number; daysAgo: number } | null;
  lastMonthPackets: number;
}

export interface Distributors {
  month: string;
  list: DistributorSales[];
  totalPackets: number;
  offline: boolean;
}

// محفظة / خزنة (الصفحة 5) - one cash wallet / Fawry account (page 5)
export interface WalletNumbers {
  balance: number; // ج.م، رصيد النهارده - balance as of today
  incomingToday: number; // مدين النهارده - today's debit
  outgoingToday: number; // دائن النهارده - today's credit
  // آخر قيد على الحساب - the latest GL entry
  lastMove: { date: string; amount: number; direction: "in" | "out" } | null;
}

export interface WalletCard {
  name: string;
  accountNumber: string; // رقم الحساب (للوحة التفاصيل) - account number (for the details panel)
  kind: "cash" | "fawry";
  linked: boolean; // false = مفيش حساب في الكونفج - no account in the config
  offline: boolean; // true = ERPNext فشل ودي آخر أرقام نجحت (أو مفيش أرقام) - failed: last good numbers (or none)
  numbers: WalletNumbers | null; // null = فشل ومفيش أرقام قديمة - failed with no last good numbers
}

export interface Wallets {
  list: WalletCard[];
}

export interface DashboardData {
  attendance: Attendance;
  wallets: Wallets;
  sales: SalesReps | null; // null = ERPNext فشل ومفيش نتيجة قديمة - ERPNext failed with no last good result
  distributors: Distributors | null; // null = ERPNext فشل ومفيش نتيجة قديمة
  stock: Stock;
  kilns: Kilns;
  treasury: Treasury;
  charity: Charity | null; // null = ERPNext فشل ومفيش نتيجة قديمة - ERPNext failed with no last good result
  updatedAt: string;
  erpOffline: boolean; // true when every ERPNext request failed on this refresh
  // حالة كل كارت: ok = جديد، stale = ERPNext فشل ودي آخر نتيجة نجحت، missing = فشل ومفيش نتيجة (الأرقام مش حقيقية)
  // Per card: ok = fresh, stale = ERPNext failed and this is the last good value, missing = failed with nothing to show
  sections: Record<SectionKey, SectionStatus>;
  erpErrors: string[]; // رسايل أخطاء ERPNext في التحديث ده (من غير مفاتيح) - this refresh's ERPNext errors (no secrets)
}

export type SectionKey = "attendance" | "treasury" | "kilns";
export type SectionStatus = "ok" | "stale" | "missing";

// مصدر كل رقم: "erp" = من ERPNext، "manual" = من أرقام الكونفج
// Where each number comes from: "erp" = ERPNext, "manual" = the config numbers
export type ConfigErpField = { source: "manual" } | { source: "erp"; account: string };

// قسم كامل من ERPNext ولا يدوي - a whole section from ERPNext or manual
export type ConfigErpSource = { source: "erp" | "manual" };

// نوع خشب معروف: الاسم، أسامي تانية بيتكتب بيها، ولونه - a known wood type: name, other spellings, color
export type ConfigBatchType = { label: string; aliases?: string[]; color: string };

// الطرحات: exitsDoctype = سجل لكل طرحة خرجت - Batches: exitsDoctype = one record per batch out
export type ConfigErpBatches = (
  | { source: "manual" }
  | {
      source: "erp";
      exitsDoctype: string;
      typeField: string; // حقل النوع (Select) - the type field (Select)
      weightField: string; // حقل الوزن بالكيلو (Float) - the weight field in kg (Float)
    }
) & { types: ConfigBatchType[]; defaultTypeColor: string; optionsCacheMinutes: number };

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
  enabled?: boolean; // false = الصفحة متوقفة (مش في التقليب ولا الأسهم ولا العداد) - false = page hidden everywhere
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

// المرتبات (لوحة الحضور بس، بعد زرار "💰 المرتب") - salaries (attendance panel only, behind the button)
// قيمة ممكن تكون مش متسجلة في ERPNext (manual = true يعني 0 ولازم تتراجع يدوي) - manual = not in ERPNext, shown as 0
export interface SalaryValue {
  value: number;
  manual: boolean;
}

export interface EmployeeSalary {
  id: string; // Employee ID
  kind: "monthly" | "daily" | "none"; // daily = عامل يومية (أيام الحضور × اليومية)، none = مش متسجل في السيستم
  // اليومية من ملف الموظف (عمال اليومية بس، 0 = مش متسجلة) - the daily rate (daily workers only, 0 = not recorded)
  dailyRate: number;
  // أيام الحضور الشهر ده لحد النهارده (نص اليوم = 0.5) وتواريخها - present days so far (half day = 0.5) and their dates
  presentDays: number;
  presentDates: { date: string; half: boolean }[];
  // عمال اليومية: كل أسبوع (السبت → الجمعة) فيه أيام من الشهر ده + الأسبوع اللي هيتقبض - daily workers: every week
  weeks: DailyWeek[];
  // بدل الجمعة (الشهريين بس): الجمع اللي اشتغلها × (الشامل ÷ 30) - Friday pay (monthly staff only)
  friday: { days: number; rate: number; amount: number; dates: { date: string; half: boolean }[] };
  total: number; // الأجر الشامل - salary (base + allowance)
  // المصدر: هيكل المرتب (Salary Structure Assignment) أو ملف الموظف (Employee.ctc) - where total came from
  source: "structure" | "employee" | null;
  // المرتب في ملف الموظف مختلف عن هيكل المرتب - Employee.ctc differs from the assignment
  mismatch: { ctc: number; structure: number } | null;
  perDay: number; // يومية = الشامل ÷ daysPerMonth
  daysPassed: number; // الأيام اللي عدّت من أول الشهر (أو التعيين) لحد النهارده، بالجمعة - days so far, Fridays included
  earned: number; // المرتب لحد النهارده = يومية × الأيام − خصم الغياب - earned so far
  absentDays: number; // أيام الغياب حتى النهارده (نص اليوم = 0.5) - absent days so far (half day = 0.5)
  absence: number; // خصم الغياب حتى النهارده - absence deduction so far
  advances: SalaryValue; // سلف الشهر
  loan: SalaryValue; // قسط القرض
  insurance: SalaryValue; // التأمينات
  // Additional Salary الشهر ده (إضافي، مكافأة، جزاء، تأخير...) - this month's Additional Salary lines
  adjustments: SalaryAdjustment[];
  bonuses: number; // مكافآت (مكافأة + Additional Salary Earning) بتدخل في المرتب - bonuses, part of the salary
  // الإضافي الشهر ده (اتصرف ولا لأ) ومش داخل في المرتب النهائي - this month's overtime, never in the final salary
  overtime: OvertimeSummary;
  extraDeductions: number; // خصومات Additional Salary + خصم Salary Adjustment - item deductions
  // عمود "خصومات": خصومات البنود + سلف الشهر - the "خصومات" column: item deductions + advances
  deductions: number;
  // عمود "أقساط": قسط Salary Adjustment + قسط القرض - the "أقساط" column: Salary Adjustment installments + loan
  installments: number;
  // عمود "سلف": سلف الشهر (Loan) + سلفة (Salary Adjustment) - the "سلف" column: loan advances + Salary Adjustment سلفة
  advanceTotal: number;
  // خارج البصمة: fixed / default_present (null = على البصمة) - outside-the-biometric mode (null = on the device)
  outsideMode: "fixed" | "default_present" | null;
  expectedNet: number; // الصافي المتوقع آخر الشهر (لو مغابش تاني) - expected net at month end (no more absences)
  // الإجمالي مع الإضافي = المرتب النهائي (earned) + الإضافي - earned so far + this month's overtime
  totalWithOvertime: number;
}

// يوم في أسبوع عامل اليومية: worked = 1 / 0.5 / 0 - one day of a daily worker's week
export interface DailyWeekDay {
  date: string;
  status: DayStatus;
  worked: number;
}

// أسبوع عامل يومية (السبت → الجمعة): total = أيام × اليومية + إضافي + مكافآت − خصومات − سلف
// A daily worker's week (Saturday → Friday): total = days × rate + overtime − deductions + bonuses
export interface DailyWeek {
  start: string;
  end: string;
  days: DailyWeekDay[];
  presentDays: number;
  pay: number; // أيام × اليومية - days × rate
  overtime: number;
  overtimeHours: number;
  deductions: number; // الخصومات بس (من غير السلف) - deductions only (advances apart)
  advances: number; // السلف اللي تاريخها في الأسبوع - advances dated in the week
  bonuses: number;
  // = pay + overtime + bonuses − deductions − advances
  total: number;
  // بنود الأسبوع بتواريخها (مكافآت، خصومات، سلف) - the week's dated items (bonuses, deductions, advances)
  items: SalaryAdjustment[];
  shown: boolean; // الأسبوع اللي في عمود "مستحق هذا الأسبوع" - the week in the "this week" column
  current: boolean; // الأسبوع اللي فيه النهارده - the week holding today
}

// إضافي (Salary Adjustment) بيتصرف كاش - one cash-paid overtime entry
export interface OvertimeEntry {
  date: string; // "2026-11-01"
  hours: number;
  rate: number; // سعر الساعة - hour rate
  amount: number;
}

// إضافي أسبوع (السبت → الجمعة) بيتصرف كاش - one week of overtime (Saturday → Friday), paid in cash
export interface OvertimeWeek {
  start: string;
  end: string;
  entries: OvertimeEntry[];
  total: number;
  hours: number;
  shown: boolean; // أسبوع "إضافي هذا الأسبوع" - the "this week" week
  current: boolean; // الأسبوع اللي فيه النهارده - the week holding today
}

// entries / total / hours = إضافي الشهر كله (اتصرف ولا لأ)، week = إضافي هذا الأسبوع (بيتقبض كاش السبت)
// entries / total / hours = the whole month (paid or not); week = this week's overtime (paid in cash on Saturday)
export interface OvertimeSummary {
  entries: OvertimeEntry[];
  total: number;
  hours: number;
  week: number;
  weekHours: number;
  weeks: OvertimeWeek[];
}

// سطر في لوحة المرتب (من Additional Salary أو Salary Adjustment) - one line (Additional Salary or Salary Adjustment)
export interface SalaryAdjustment {
  // loan = سلفة Loan Disbursement، employee_advance = Employee Advance - an advance from a loan / an Employee Advance
  source: "additional_salary" | "salary_adjustment" | "loan" | "employee_advance";
  kind: "addition" | "deduction" | "installment" | "advance"; // advance = سلفة
  label: string; // "إضافي" / "خصم نص يوم" / "قسط" / اسم المكون
  component: string; // Salary Component أو adjustment_type
  sign: 1 | -1; // إضافة = +1، خصم/قسط = −1
  amount: number; // المبلغ بالجنيه (موجب) - amount in EGP (positive)
  date: string; // "2026-11-11"
  units: { count: number; unit: "day" | "hour" } | null; // لو المكون أيام أو ساعات - when the component is days / hours
  detail: string | null; // "4 ساعات × 50"
  reason: string | null; // السبب (لو متسجل) - reason, when recorded
  // القسط: الباقي بعد قسط الشهر ده وعدد الشهور - installment: remaining after this month, and months left
  remaining: { amount: number; months: number } | null;
}

export interface SectionSalaries {
  month: string; // "2026-11"
  today: string;
  daysPerMonth: number;
  people: EmployeeSalary[];
  // أسابيع اليومية: الأسبوع اللي فات ويوم قبضه، والأسبوع ده لحد النهارده - daily-pay weeks
  // أسبوع القبض الكاش (يومية العمال + إضافي الشهريين): يوم القبض = الأسبوع اللي خلص، غير كده = الأسبوع الحالي
  // The cash-pay week (daily pay + monthly overtime): on pay day the week that ended, otherwise this week
  dailyPay: { week: { start: string; end: string }; paidToday: boolean };
  // جدول الشهريين: الشهريين بس. daily* = عمال اليومية اللي ليهم يومية
  // The monthly table: monthly staff only. daily* = daily workers with a rate
  totals: {
    total: number;
    absence: number;
    bonuses: number;
    deductions: number;
    advances: number; // سلف - advances
    overtime: number; // إضافي الشهر - this month's overtime
    overtimeHours: number;
    overtimeWeek: number; // إجمالي إضافي هذا الأسبوع (الكاش اللي يتجهز السبت) - this week's overtime cash
    overtimeWeekHours: number;
    dailyWeek: number; // إجمالي مستحق هذا الأسبوع - this week's total (the shown week)
    dailyMonth: number; // إجمالي الشهر لعمال اليومية
    totalWithOvertime: number;
    installments: number;
    fridayDays: number; // جمع اشتغلها (الشهريين) - worked Fridays (monthly staff)
    fridayPay: number; // بدل الجمعة - Friday pay
    earned: number;
    expectedNet: number;
    monthly: number;
    daily: number; // عمال اليومية اللي ليهم يومية - daily workers with a rate
  };
}

// ===== تفاصيل صنف في أرصدة المخازن (الضغط على كارت في الصفحة 2) - stock item details (click a page 2 card) =====
export type StockGroup = "packaged" | "sacks" | "wood" | "packaging";
export type StockCategory = "إنتاج" | "بيع" | "تحويل" | "تسوية" | "شراء";

// حركة مخزن واحدة (Stock Ledger Entry) - one stock movement
export interface StockMove {
  id: string;
  postingDate: string; // "2026-11-07"
  postingTime: string; // "14:45"
  creation: string; // "2026-11-08 09:12" وقت التسجيل - when it was entered
  lateDays: number; // اتسجلت بعد تاريخها بكام يوم - days entered after its posting date
  itemCode: string;
  warehouse: string;
  qty: number; // + وارد / − منصرف (فرق الرصيد في المخزن ده) - + in / − out (the warehouse balance change)
  balanceAfter: number | null; // رصيد الكارت بعدها (null = مخزن مش داخل في الرصيد) - card balance after (null = excluded warehouse)
  inScope: boolean;
  category: StockCategory;
  voucherType: string;
  voucherNo: string;
  voucherLabel: string; // الغرض / نوع الحركة (Manufacture، بيع الي شركه التعبئة...) - purpose / entry type
  party: string; // العميل / المورد - customer / supplier
  van: string; // العربية (من مخزنها) - the van (from its warehouse)
  owner: string; // اسم اللي سجّلها - who entered it
  remarks: string;
}

export interface StockDetails {
  group: StockGroup;
  name: string;
  variant: string | null;
  variants: string[]; // الأنواع جوه الكارت - the card's variants
  itemCodes: string[];
  unit: string;
  decimals: number; // تقريب رقم الكارت - the card number's rounding
  today: string;
  month: string; // "2026-11"
  from: string;
  to: string;
  months: { month: string; count: number }[]; // الشهور اللي فيها حركات (الأحدث الأول) - months with movements
  balance: number; // الرصيد الحالي (نفس رقم الكارت) - current balance (same as the card)
  warehouses: { warehouse: string; qty: number; excluded: boolean }[];
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  byCategory: { category: StockCategory; in: number; out: number }[];
  daily: { date: string; in: number; out: number }[];
  // المبيعات (المنتجات والشكاير) - sales (packaged products and sacks)
  sales: { total: number; byRep: { name: string; qty: number }[]; byCustomer: { name: string; qty: number }[] } | null;
  // الخامات (خشب ومواد تعبئة): الاستهلاك والوارد بالمورد - raw materials: consumption and receipts by supplier
  raw: { consumption: number; purchasesTotal: number; bySupplier: { name: string; qty: number }[] } | null;
  moves: StockMove[]; // الأحدث الأول - newest first
  erpUrl: string;
}

// اللي بيحصل دلوقتي (كارت الرئيسية) - the live activity feed (main page card)
// in / out = وارد / منصرف خزنة أو محفظة، kiln = طرحة، sale / return = فاتورة بيع / مرتجع،
// stock = إذن مخزن، charity = صدقات، salary = تسوية مرتب (من غير مبلغ)
export type ActivityKind = "in" | "out" | "kiln" | "sale" | "return" | "stock" | "charity" | "salary";

export interface ActivityEvent {
  id: string; // "gl:ACC-GLE-…" - فريد لكل حدث - unique per event
  kind: ActivityKind;
  at: string; // "2026-11-14 13:43:09" بتوقيت القاهرة - Cairo time
  title: string; // "وارد — الخزنة"
  details: string; // "الهدى" / "فرن 3 · برتقال"
  amount: number | null; // ج.م (null = مفيش مبلغ، زي تسوية المرتب) - EGP (null = no amount, e.g. salary adjustments)
  extra: string | null; // "2,819 كجم" / "107 باكت" / "20 باكت ربع"
  badge: string | null; // سلفة / مرتب / مورد / مصروف ...
  doctype: string; // المستند اللي بيتفتح لما تدوس على الحدث - the document opened on click
  docname: string;
}

// تفاصيل حدث (لوحة بتتفتح لما تدوس عليه): كله متجهز على السيرفر كنصوص - event details, all formatted on the server
export interface ActivityDetailsTable {
  title: string;
  columns: { label: string; num?: boolean }[];
  rows: string[][];
  footer?: string[] | null;
}
export interface ActivityDetails {
  doctype: string;
  name: string;
  postingDate: string | null; // "2026-11-14"
  postingTime: string | null; // "13:55"
  owner: string; // اسم اللي سجّلها - who recorded it (full name)
  creation: string; // "2026-11-14 13:55:00"
  lateDays: number; // اتسجلت بعد تاريخها بكام يوم - days between the posting date and the creation
  erpUrl: string;
  fields: { label: string; value: string; tone?: "in" | "out" | "accent" }[];
  tables: ActivityDetailsTable[];
}

// events = الأحدث الأول، now = وقت السيرفر بتوقيت القاهرة (الواجهة بتبعته since في الطلب الجاي)
// events = newest first; now = server time in Cairo (sent back as since on the next request)
export interface ActivityData {
  now: string;
  events: ActivityEvent[];
  offline: boolean;
}
