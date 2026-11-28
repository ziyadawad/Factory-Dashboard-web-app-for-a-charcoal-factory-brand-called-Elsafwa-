// صفحة العملاء (/customers): الأنواع اللي بتتبعت للمتصفح - the customers page: types sent to the browser

export type Totals = { packets: number; amount: number; invoices: number };
// جملة / قطاعي - wholesale / retail
export type Segment = "جملة" | "قطاعي";

export type CustomerNote = { text: string; tags: string[]; updatedAt: string };

export type CustomerRow = {
  id: string; // كود العميل في ERPNext - the ERPNext customer id
  name: string;
  mobile: string | null;
  area: string | null; // المنطقة (Territory أو مدينة العنوان) - territory or address city
  areaKey: string; // المنطقة بعد التوحيد (للتجميع) - normalized area (grouping key), "" = none
  address: string | null;
  gps: { lat: number; lng: number } | null;
  group: string | null; // مجموعة العميل في ERPNext - the ERPNext customer group
  segment: Segment;
  segmentSource: "override" | "group" | "rule"; // بالإيد / من المجموعة / من متوسط الفاتورة - by hand / group / average order
  avgPackets: number; // متوسط الباكت في الفاتورة (من الأول) - average packets per invoice (all time)
  isDistributor: boolean; // موزع (customers.distributors) - a distributor
  monthProducts: number[]; // باكتات الشهر لكل منتج (بترتيب products) - this month's packets per product
  type: string | null; // نوع العميل - customer type (from the rep app details, else the group)
  repId: string | null; // المندوب اللي بيخدمه - the rep who serves him
  repFromOverride: boolean;
  reps: string[]; // كل المناديب اللي باعوله آخر repLookbackDays يوم - every rep who sold to him lately
  // كل مندوب باعله (من الأول): فواتير آخر 90 يوم، كل الفواتير، وآخر شرا منه - every rep who ever sold to him
  repHistory: { id: string; invoices90: number; invoicesAll: number; last: string }[];
  created: string | null; // تاريخ إضافته - creation date
  firstDate: string | null; // أول شرا - first purchase
  lastDate: string | null; // آخر شرا - last purchase
  daysSince: number | null;
  month: Totals;
  lastMonth: Totals; // الشهر اللي فات كله - the whole previous month
  lastMonthToDate: Totals; // الشهر اللي فات لحد نفس اليوم (للمقارنة العادلة) - previous month up to the same day
  three: Totals; // آخر 3 شهور (90 يوم) - last 3 months (90 days)
  all: Totals;
  avgOrder: number;
  favorites: string[]; // أكتر المنتجات - top products
  debt: number;
  oldestUnpaid: { date: string; days: number } | null;
  isNew: boolean; // أول شرا الشهر ده (أو اتضاف الشهر ده ولسه) - first purchase this month (or added this month)
  activeMonth: boolean; // اشترى الشهر ده - bought this month
  inactive: boolean; // أكتر من inactiveDays من غير شرا - more than inactiveDays without buying
};

export type CustomersRep = { id: string; name: string; van: string; color: string };
// خط = مندوب بعربيته، بالترتيب واسم الخط من customers.routes - a route = a rep with his van, order and name from customers.routes
export type CustomersRoute = { repId: string; name: string };

export type CustomersData = {
  today: string;
  month: string;
  inactiveDays: number;
  reps: CustomersRep[];
  routes: CustomersRoute[];
  tags: string[];
  products: string[]; // أسامي المنتجات (ربع / نص / كيلو...) - product labels
  segmentMinAvgPackets: number;
  customers: CustomerRow[];
  notes: Record<string, CustomerNote>;
  notesEnabled: boolean;
  updatedAt: string;
};

export type CustomerInvoice = {
  name: string;
  date: string;
  time: string | null;
  packets: number;
  amount: number;
  paid: number;
  outstanding: number;
  isReturn: boolean;
  repId: string | null;
  url: string;
};

export type CustomerPayment = { name: string; date: string; amount: number; mode: string | null; kind: "in" | "out"; url: string };

export type CustomerDetails = {
  id: string;
  months: { month: string; packets: number; amount: number }[]; // آخر 12 شهر - last 12 months
  products: { label: string; packets: number }[];
  invoices: CustomerInvoice[];
  payments: CustomerPayment[] | null; // null = ERPNext مردش - ERPNext failed
  aging: { label: string; amount: number; invoices: number }[];
  unlinkedCredit: number; // دفعات / مرتجعات مش متربطة اتخصمت - unlinked payments / credit notes deducted
  erpUrl: string;
};
