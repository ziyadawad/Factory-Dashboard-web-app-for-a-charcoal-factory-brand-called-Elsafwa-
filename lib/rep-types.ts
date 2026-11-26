// أنواع تطبيق المناديب (/rep) - المتصفح والسيرفر - rep app types (browser + server)

export type RepProductGroup = "packets" | "cartons" | "sacks";

export interface RepProduct {
  code: string; // item_code في ERPNext
  name: string; // "ربع كيلو" / "ربع كيلو كامل" / "شكاير برتقال ناعم"
  group: RepProductGroup;
  image: string | null; // من /public/products (زي صفحة المخازن) - from /public/products (like the stock page)
  rate: number | null; // سعر قايمة الأسعار، null = مفيش سعر (مينفعش يتباع) - the price list rate; null = no price
  stock: number; // رصيد عربية المندوب - the rep's van stock
  uom: string;
}

export interface RepCustomer {
  id: string; // name في ERPNext
  name: string; // customer_name
  phone: string | null;
}

export interface RepInfo {
  id: string;
  name: string;
  van: string;
  allowDiscount: boolean;
}

// طريقة دفع: كاش (خزنة المندوب) / فودافون كاش (محفظة) / انستاباي (حساب) - a payment method
export type RepPayMethod = "cash" | "vodafone" | "instapay";

// محفظة أو حساب ممكن الفلوس تدخله. problem = ليه مينفعش (مفيش Mode of Payment أو حساب افتراضي)
// A wallet / account the money can go to. problem = why it can't be used (no Mode of Payment or default account)
export interface RepPayTarget {
  id: string; // رقم الحساب (أو "rep" لخزنة المندوب) - the account number (or "rep" for the rep's cash box)
  label: string; // "كاش كريم عوض" / "انستاباي الحاج أشرف — الأساسية"
  mode: string | null; // Mode of Payment
  account: string | null; // الحساب الافتراضي للشركة - the company default account
  problem: string | null;
}

export interface RepPayTargets {
  cash: RepPayTarget;
  vodafone: RepPayTarget[];
  instapay: RepPayTarget[];
}

export interface RepOptions {
  rep: RepInfo;
  payTargets: RepPayTargets;
  today: string;
  products: RepProduct[];
  customers: RepCustomer[];
  recent: string[]; // عملاء المندوب الأخيرين (ids، الأحدث الأول) - the rep's recent customers (newest first)
  quickQty: number[];
  companyName: string;
  thanks: string;
  loadedAt: string;
}

export interface RepInvoiceRequest {
  uuid: string; // مفتاح الفاتورة من الموبايل: الإعادة (الطابور) مش بتعمل نسختين - the phone's key: a retry never duplicates
  customer: string;
  items: { code: string; qty: number }[];
  paid: number;
  payMethod?: RepPayMethod; // لو paid > 0 - when paid > 0
  payTarget?: string | null; // id المحفظة / الحساب (فودافون كاش / انستاباي) - the wallet / account id
  payRef?: string | null; // رقم العملية (اختياري) - the transaction number (optional)
  discount: number;
  confirmDuplicate?: boolean;
  createdAt: string; // ISO، وقت ما اتعملت على الموبايل - when it was made on the phone
}

export interface RepReceiptItem {
  name: string;
  qty: number;
  rate: number;
  amount: number;
}

// الفاتورة للطباعة - the receipt to print
export interface RepReceipt {
  name: string; // رقم الفاتورة (أو "مؤقتة-…") - the invoice number (or a temporary one)
  temporary: boolean; // لسه في الطابور على الموبايل - still queued on the phone
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  repName: string;
  van: string;
  customerName: string;
  items: RepReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod?: string | null; // "فودافون كاش — كاش كريم عوض · رقم 123" على الفاتورة - printed on the receipt
  previousBalance: number | null; // رصيد العميل قبل الفاتورة - before this invoice
  newBalance: number | null; // بعدها - after it
  balanceNote?: string; // "رصيد العميل الحالي" وقت إعادة الطباعة - on a reprint
  companyName: string;
  thanks: string;
  cancelled?: boolean;
  paymentError?: string | null; // الفاتورة اتسجلت والدفعة لأ - the invoice saved but the payment didn't
}

export interface RepTodayInvoice {
  name: string;
  time: string;
  customerName: string;
  total: number;
  paid: number;
  remaining: number;
  cancelled: boolean;
  cancelRequested: boolean;
}

export interface RepToday {
  invoices: RepTodayInvoice[];
  totals: { count: number; total: number; paid: number; remaining: number };
}
