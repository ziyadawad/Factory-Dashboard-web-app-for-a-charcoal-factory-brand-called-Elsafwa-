"use client";

// "فاتورة جديدة": العميل (بحث، عملاء المندوب الأول، عميل جديد)، الأصناف كروت كبيرة (+/− وكميات سريعة، مش أكتر من رصيد
// العربية)، الدفع (كاش / آجل / جزء)، خصم لو مسموح، والملخص. كله بالضغط، والكتابة في البحث بس
// "فاتورة جديدة": customer (search, the rep's recent first, new customer), big item cards (+/− and quick quantities,
// never above the van stock), payment (cash / credit / part), a discount when allowed, and the summary. All taps; typing
// only in the search
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import Keypad from "../operator/Keypad";
import { RepCustomer, RepOptions, RepPayMethod, RepPayTarget, RepProduct, RepProductGroup } from "@/lib/rep-types";
import { money } from "./api";
import NewCustomer from "./NewCustomer";

export type Cart = Record<string, number>; // item code → qty
// الدفع: كاش / فودافون كاش / انستاباي (كله) / آجل / جزء (مبلغ + طريقة، والباقي آجل)
// Payment: cash / Vodafone Cash / InstaPay (all of it) / credit / part (an amount + a method; the rest is credit)
export type PayMode = RepPayMethod | "credit" | "part";
export type Draft = {
  customer: RepCustomer | null;
  cart: Cart;
  pay: PayMode;
  partMethod: RepPayMethod; // طريقة الجزء المدفوع - how the part is paid
  target: string | null; // المحفظة / الحساب (فودافون كاش / انستاباي) - the wallet / account
  payRef: string; // رقم العملية (اختياري) - the transaction number (optional)
  partPaid: string;
  // الخصم: مبلغ ج.م أو نسبة %، والسبب (زرار + كلام)، ورقم المدير لو أكبر من المسموح
  // The discount: an EGP amount or a %, the reason (chip + text), and the manager PIN when above the limit
  discountMode: "amount" | "percent";
  discount: string;
  discountReason: string;
  discountNote: string;
  managerPin: string;
};
export const emptyDraft = (): Draft => ({
  customer: null, cart: {}, pay: "cash", partMethod: "cash", target: null, payRef: "", partPaid: "",
  discountMode: "amount", discount: "", discountReason: "", discountNote: "", managerPin: "",
});

// سبب الخصم مكتوب سطر واحد - the discount reason on one line
export const reasonOf = (d: Draft) => [d.discountReason, d.discountNote.trim()].filter(Boolean).join(" — ").slice(0, 120);

export const METHOD_LABEL: Record<RepPayMethod, string> = { cash: "كاش", vodafone: "فودافون كاش", instapay: "انستاباي" };
// المحافظ / الحسابات بتاعة الطريقة دي - the wallets / accounts for a method
export const targetsFor = (options: RepOptions, method: RepPayMethod): RepPayTarget[] =>
  method === "cash" ? [options.payTargets.cash] : options.payTargets[method];

// "فودافون كاش — كاش كريم عوض · رقم 123" للفاتورة - for the receipt
export function methodText(options: RepOptions, method: RepPayMethod | null, target: string | null, ref: string): string | null {
  if (!method) return null;
  const t = method === "cash" ? null : targetsFor(options, method).find((x) => x.id === target);
  return [method === "cash" ? METHOD_LABEL.cash : `${METHOD_LABEL[method]}${t ? ` — ${t.label}` : ""}`, ref.trim() && `رقم ${ref.trim()}`].filter(Boolean).join(" · ");
}

const GROUPS: { id: RepProductGroup; label: string }[] = [
  { id: "packets", label: "باكتات عادي" },
  { id: "cartons", label: "كامل (كراتين)" },
  { id: "sacks", label: "شكاير" },
];

// الإجماليات من الأسعار اللي على الموبايل (السيرفر بيحسبها تاني من قايمة الأسعار) - totals from the phone's prices
export function totalsOf(draft: Draft, products: RepProduct[]) {
  const byCode = new Map(products.map((p) => [p.code, p]));
  const lines = Object.entries(draft.cart)
    .filter(([, q]) => q > 0)
    .map(([code, qty]) => {
      const p = byCode.get(code);
      const rate = p?.rate ?? 0;
      return { code, name: p?.name ?? code, qty, rate, amount: Math.round(qty * rate * 100) / 100 };
    });
  const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  // النسبة بتتحسب من الإجمالي قبل الخصم - a percent is taken from the total before the discount
  const value = Math.max(0, Number(draft.discount) || 0);
  const discount = Math.min(subtotal, Math.round((draft.discountMode === "percent" ? (subtotal * value) / 100 : value) * 100) / 100);
  const total = Math.round((subtotal - discount) * 100) / 100;
  const paid = draft.pay === "credit" ? 0 : draft.pay === "part" ? Math.min(total, Math.max(0, Number(draft.partPaid) || 0)) : total;
  // الطريقة اللي الفلوس دخلت بيها (null = آجل كله) - how the money came in (null = all on credit)
  const method: RepPayMethod | null = paid <= 0 ? null : draft.pay === "part" ? draft.partMethod : (draft.pay as RepPayMethod);
  const percent = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  return { lines, subtotal, discount, discountValue: value, percent, total, paid, method, remaining: Math.round((total - paid) * 100) / 100 };
}

function CustomerPicker({
  options,
  onPick,
  onClose,
}: {
  options: RepOptions;
  onPick: (c: RepCustomer, warning?: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const norm = (t: string) => t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, "").toLowerCase();
  const byId = useMemo(() => new Map(options.customers.map((c) => [c.id, c])), [options.customers]);
  const recent = options.recent.map((id) => byId.get(id)).filter(Boolean) as RepCustomer[];
  // البحث بالاسم أو الموبايل أو المنطقة / العنوان - search by name, mobile or area / address
  const found = useMemo(() => {
    const key = norm(q);
    if (!key) return [];
    return options.customers
      .filter((c) => norm(c.name).includes(key) || norm(c.id).includes(key) || (c.phone ?? "").includes(q.trim()) || norm(c.address ?? c.area ?? "").includes(key))
      .slice(0, 60);
  }, [q, options.customers]);

  if (creating) {
    return <NewCustomer options={options} initialName={q.trim()} onCreated={(c, warning) => onPick(c, warning)} onBack={() => setCreating(false)} onClose={onClose} />;
  }

  const Row = ({ c }: { c: RepCustomer }) => (
    <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl border border-cardBorder bg-card/80 px-4 py-3 text-start active:bg-white/10">
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[18px] font-bold text-white">{c.name}</span>
        {/* المنطقة / العنوان تحت الاسم - the area / address under the name */}
        {(c.address || c.area) && <span className="block truncate text-[14px] text-gray-400">📍 {c.address ?? c.area}</span>}
        {c.phone && <span dir="ltr" className="block text-[14px] font-numbers text-gray-500 text-end">{c.phone}</span>}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 min-h-0 flex-col gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[22px] font-extrabold text-white">اختار العميل</h2>
          <button type="button" onClick={onClose} className="rounded-xl border border-cardBorder p-2 text-gray-300" aria-label="إغلاق">
            <X size={24} />
          </button>
        </div>
        <label className="flex h-14 items-center gap-2 rounded-2xl border border-cardBorder bg-card px-4 focus-within:border-brandOrange">
          <Search size={20} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو الموبايل أو المنطقة" className="flex-1 bg-transparent text-[18px] text-white outline-none" autoFocus />
        </label>
        <button type="button" onClick={() => setCreating(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-statusGreen/60 text-[17px] font-bold text-statusGreen">
          <UserPlus size={20} /> عميل جديد
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pb-4">
          {q.trim() ? (
            found.length ? found.map((c) => <Row key={c.id} c={c} />) : <p className="py-6 text-center text-gray-500">مفيش عميل بالاسم ده</p>
          ) : (
            <>
              {recent.length > 0 && <p className="text-[14px] font-bold text-gray-400">عملائك الأخيرين</p>}
              {recent.map((c) => (
                <Row key={c.id} c={c} />
              ))}
              <p className="pt-2 text-[14px] text-gray-500">اكتب في البحث عشان تلاقي باقي العملاء ({options.customers.length})</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ p, qty, onQty, quick }: { p: RepProduct; qty: number; onQty: (q: number) => void; quick: number[] }) {
  const max = Math.floor(p.stock);
  const disabled = p.rate === null || max <= 0;
  const set = (q: number) => onQty(Math.max(0, Math.min(max, q)));
  return (
    <div className={`rounded-2xl border p-3 flex flex-col gap-2 ${qty > 0 ? "border-brandOrange bg-brandOrange/10" : "border-cardBorder bg-card/80"} ${disabled ? "opacity-45" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image ? <img src={p.image} alt="" className="h-full w-full object-contain" /> : <span className="text-[30px]">{p.group === "sacks" ? "🛍️" : "📦"}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-extrabold text-white leading-tight">{p.name}</p>
          <p className="text-[15px] text-gray-300">
            {p.rate === null ? <span className="text-statusAmber">مفيش سعر</span> : <><b className="font-numbers text-brandOrange">{money(p.rate)}</b> ج.م</>}
            <span className="text-gray-500"> · في العربية </span>
            <b className={`font-numbers ${max > 0 ? "text-gray-100" : "text-statusRed"}`}>{max}</b>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={disabled || qty <= 0} onClick={() => set(qty - 1)} className="h-12 w-12 rounded-xl border border-cardBorder bg-background/60 flex items-center justify-center text-white disabled:opacity-40" aria-label="ناقص">
          <Minus size={22} />
        </button>
        <span className="min-w-[56px] text-center font-numbers text-[26px] font-extrabold text-white">{qty}</span>
        <button type="button" disabled={disabled || qty >= max} onClick={() => set(qty + 1)} className="h-12 w-12 rounded-xl bg-brandOrange text-white flex items-center justify-center disabled:opacity-40" aria-label="زيادة">
          <Plus size={22} />
        </button>
        <div className="ms-auto flex gap-1.5">
          {quick.map((n) => (
            <button key={n} type="button" disabled={disabled || qty >= max} onClick={() => set(qty + n)} className="h-12 min-w-[46px] rounded-xl border border-cardBorder bg-background/60 px-2 font-numbers text-[16px] font-bold text-gray-100 disabled:opacity-40">
              +{n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function InvoiceForm({
  options,
  draft,
  setDraft,
  balance,
  onSave,
  saving,
  error,
}: {
  options: RepOptions;
  draft: Draft;
  setDraft: (d: Draft) => void;
  balance: number | null | undefined; // undefined = بيتجاب - loading
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [group, setGroup] = useState<RepProductGroup>("packets");
  const [picking, setPicking] = useState(false);
  // تحذير بعد عميل جديد (زي "العنوان ما اتسجلش") - a warning after a new customer (e.g. the address didn't save)
  const [notice, setNotice] = useState<string | null>(null);
  const [pad, setPad] = useState<"part" | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  // آخر رقم اتنسخ (علامة ✓ لثانيتين) - the last copied number (a ✓ for 2 seconds)
  const [copied, setCopied] = useState<string | null>(null);
  const copyNumber = (n: string) => {
    navigator.clipboard?.writeText(n).catch(() => {});
    setCopied(n);
    setTimeout(() => setCopied((c) => (c === n ? null : c)), 2000);
  };
  const t = totalsOf(draft, options.products);
  const shown = options.products.filter((p) => p.group === group);
  // المجموعات اللي فيها أصناف بس (الشكاير مستبعدة من الكونفج) - only groups that have items (sacks are excluded in config)
  const groups = GROUPS.filter((g) => options.products.some((p) => p.group === g.id));
  const counts = (g: RepProductGroup) => options.products.filter((p) => p.group === g && (draft.cart[p.code] ?? 0) > 0).length;
  useEffect(() => {
    // مجموعة فاضية: روح لأول واحدة فيها أصناف - an empty group: jump to the first one with items
    if (!options.products.some((p) => p.group === group)) setGroup(GROUPS.find((g) => options.products.some((p) => p.group === g.id))?.id ?? "packets");
  }, [options.products, group]);

  const card = "rounded-2xl border border-cardBorder bg-card/80 p-4";
  // الطريقة لازم تبقى جاهزة: كاش = خزنة المندوب سليمة، غير كده محفظة / حساب متختار ومن غير مشكلة
  // The method must be ready: cash = the rep's cash box is fine; otherwise a chosen wallet / account with no problem
  const target = t.method && t.method !== "cash" ? targetsFor(options, t.method).find((w) => w.id === draft.target) : null;
  const payReady = !t.method || (t.method === "cash" ? !options.payTargets.cash.problem : !!target && !target.problem);
  // حدود الخصم: أكبر من المسموح = لازم رقم المدير (والسيرفر بيتأكد منه) - discount limits: above = the manager PIN needed
  const rules = options.rep.discount;
  const overLimit = t.discount > 0 && (t.discount > rules.maxAmount + 0.001 || t.percent > rules.maxPercent + 0.001);
  const discountReady = !overLimit || (rules.managerApproval && draft.managerPin.length >= 4);
  const canSave = !!draft.customer && t.lines.length > 0 && !saving && (draft.pay !== "part" || t.paid > 0) && payReady && discountReady;

  return (
    <div className="flex flex-col gap-4 pb-28">
      {/* العميل - the customer */}
      <button type="button" onClick={() => setPicking(true)} className={`${card} flex items-center gap-3 text-start active:bg-white/5`}>
        <span className="text-[28px]">👤</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] text-gray-400">العميل</span>
          <span className={`block truncate text-[20px] font-extrabold ${draft.customer ? "text-white" : "text-brandOrange"}`}>{draft.customer?.name ?? "اضغط واختار العميل"}</span>
          {(draft.customer?.address || draft.customer?.area) && <span className="block truncate text-[14px] text-gray-400">📍 {draft.customer.address ?? draft.customer.area}</span>}
          {draft.customer && (
            <span className="block text-[14px] text-gray-400">
              رصيده:{" "}
              {balance === undefined ? "…" : balance === null ? "مش معروف" : <b className={`font-numbers ${balance > 0 ? "text-statusRed" : "text-statusGreen"}`}>{money(balance)}</b>}
            </span>
          )}
        </span>
      </button>

      {notice && <p className="rounded-2xl border border-statusAmber/50 bg-statusAmber/10 px-4 py-2 text-[14px] font-bold text-statusAmber">⚠ {notice}</p>}
      {/* الأصناف - the items */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, groups.length)}, minmax(0, 1fr))` }}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={`relative h-12 rounded-xl border text-[15px] font-extrabold ${group === g.id ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-card/80 text-gray-300"}`}
          >
            {g.label}
            {counts(g.id) > 0 && <span className="absolute -top-2 -start-2 h-6 min-w-6 rounded-full bg-brandOrange px-1.5 font-numbers text-[13px] leading-6 text-white">{counts(g.id)}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {shown.length === 0 && <p className="py-6 text-center text-gray-500">مفيش أصناف هنا</p>}
        {shown.map((p) => (
          <ProductCard key={p.code} p={p} qty={draft.cart[p.code] ?? 0} quick={options.quickQty} onQty={(q) => setDraft({ ...draft, cart: { ...draft.cart, [p.code]: q } })} />
        ))}
      </div>

      {/* الدفع - payment */}
      <div className={`${card} flex flex-col gap-3`}>
        <p className="text-[17px] font-extrabold text-white">الدفع</p>
        <div className="grid grid-cols-6 gap-2">
          {(
            [
              ["cash", "💵 كاش", "col-span-2"],
              ["vodafone", "📱 فودافون كاش", "col-span-2"],
              ["instapay", "🏦 انستاباي", "col-span-2"],
              ["credit", "📒 آجل", "col-span-3"],
              ["part", "✂️ جزء", "col-span-3"],
            ] as [PayMode, string, string][]
          ).map(([id, label, span]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                // المحفظة بتتصفر لما الطريقة تتغير - the wallet resets when the method changes
                const method = id === "part" ? draft.partMethod : id;
                const keep = method !== "credit" && draft.pay !== "credit" && (draft.pay === "part" ? draft.partMethod : draft.pay) === method;
                setDraft({ ...draft, pay: id, target: keep ? draft.target : null, payRef: keep ? draft.payRef : "" });
                setPad(id === "part" ? "part" : null);
              }}
              className={`${span} h-14 rounded-xl border text-[16px] font-extrabold ${draft.pay === id ? "border-statusGreen bg-statusGreen/15 text-statusGreen" : "border-cardBorder bg-background/60 text-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.pay === "part" && (
          <>
            <button type="button" onClick={() => setPad(pad === "part" ? null : "part")} className="flex items-center justify-between rounded-xl border border-cardBorder bg-background/60 px-4 py-3">
              <span className="text-[16px] text-gray-300">المدفوع (والباقي آجل)</span>
              <span className="font-numbers text-[24px] font-extrabold text-white">{draft.partPaid || "0"}</span>
            </button>
            {pad === "part" && <Keypad compact value={draft.partPaid} maxLength={7} onChange={(v) => setDraft({ ...draft, partPaid: v })} />}
            {/* الجزء اتدفع إزاي - how the part was paid */}
            <div className="grid grid-cols-3 gap-2">
              {(["cash", "vodafone", "instapay"] as RepPayMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft({ ...draft, partMethod: m, target: m === draft.partMethod ? draft.target : null, payRef: m === draft.partMethod ? draft.payRef : "" })}
                  className={`h-12 rounded-xl border text-[15px] font-bold ${draft.partMethod === m ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/60 text-gray-300"}`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </>
        )}
        {/* فودافون كاش / انستاباي: أنهي محفظة أو حساب + رقم العملية - which wallet / account + the transaction number */}
        {t.method && t.method !== "cash" && (
          <>
            <p className="text-[15px] font-bold text-gray-300">{t.method === "vodafone" ? "أنهي محفظة؟" : "أنهي حساب؟"}</p>
            <div className="grid grid-cols-2 gap-2">
              {targetsFor(options, t.method).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  disabled={!!w.problem}
                  onClick={() => setDraft({ ...draft, target: w.id })}
                  title={w.problem ?? w.mode ?? ""}
                  className={`min-h-12 rounded-xl border px-2 py-2 text-[15px] font-bold leading-tight disabled:opacity-40 ${draft.target === w.id ? "border-statusGreen bg-statusGreen/15 text-statusGreen" : "border-cardBorder bg-background/60 text-gray-200"}`}
                >
                  {w.label}
                  {/* أرقام فودافون كاش: الضغط بينسخ الرقم (وبيختار المحفظة) - the numbers: a tap copies (and picks the wallet) */}
                  {w.numbers?.map((n) => (
                    <span
                      key={n}
                      dir="ltr"
                      onClick={() => copyNumber(n)}
                      className="mt-1 block font-numbers text-[13px] font-semibold text-gray-400 underline decoration-dotted underline-offset-2"
                    >
                      {copied === n ? "✓ اتنسخ" : n}
                    </span>
                  ))}
                  {w.problem && <span className="block text-[11px] font-normal text-statusRed">{w.problem}</span>}
                </button>
              ))}
            </div>
            <input
              value={draft.payRef}
              onChange={(e) => setDraft({ ...draft, payRef: e.target.value.slice(0, 40) })}
              placeholder="رقم العملية (اختياري)"
              inputMode="numeric"
              dir="ltr"
              className="h-12 rounded-xl border border-cardBorder bg-background/60 px-4 text-[17px] font-numbers text-white outline-none focus:border-brandOrange"
            />
          </>
        )}
        {t.method === "cash" && options.payTargets.cash.problem && <p className="text-[14px] font-bold text-statusRed">⚠ {options.payTargets.cash.problem}</p>}
      </div>

      {/* 🏷️ خصم (مقفول لحد ما يتضغط) - the discount card (collapsed until tapped) */}
      {rules.enabled && (
        <div className={`${card} flex flex-col gap-3 ${overLimit ? "border-statusRed/60" : t.discount > 0 ? "border-brandOrange/60" : ""}`}>
          <button type="button" onClick={() => setDiscountOpen(!discountOpen)} className="flex items-center gap-2 text-start">
            <span className="flex-1 text-[17px] font-extrabold text-white">🏷️ خصم</span>
            {t.discount > 0 && (
              <span className="font-numbers text-[18px] font-extrabold text-brandOrange">
                − {money(t.discount)}
                {draft.discountMode === "percent" && <span className="text-[14px] text-gray-400"> ({t.discountValue}%)</span>}
              </span>
            )}
            <ChevronDown size={20} className={`text-gray-400 transition-transform ${discountOpen ? "rotate-180" : ""}`} />
          </button>
          {discountOpen && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["amount", "مبلغ ج.م"],
                    ["percent", "نسبة %"],
                  ] as ["amount" | "percent", string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ ...draft, discountMode: m, discount: "" })}
                    className={`h-12 rounded-xl border text-[16px] font-extrabold ${draft.discountMode === m ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/60 text-gray-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex h-14 items-center gap-2 rounded-2xl border border-cardBorder bg-background/70 px-4 focus-within:border-brandOrange">
                <input
                  value={draft.discount}
                  onChange={(e) => setDraft({ ...draft, discount: e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, "").slice(0, 7) })}
                  inputMode="decimal"
                  placeholder="0"
                  dir="ltr"
                  className="flex-1 bg-transparent font-numbers text-[24px] font-extrabold text-white outline-none"
                />
                <span className="text-[18px] font-bold text-gray-400">{draft.discountMode === "percent" ? "%" : "ج.م"}</span>
              </label>
              {/* أزرار سريعة - quick buttons */}
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ["percent", 5, "5%"],
                    ["percent", 10, "10%"],
                    ["amount", 50, "50 ج.م"],
                    ["amount", 100, "100 ج.م"],
                  ] as ["amount" | "percent", number, string][]
                ).map(([m, v, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDraft({ ...draft, discountMode: m, discount: String(v) })}
                    className={`h-11 rounded-xl border font-numbers text-[15px] font-bold ${draft.discountMode === m && Number(draft.discount) === v ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/60 text-gray-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* سبب الخصم (اختياري) - the reason (optional) */}
              <p className="text-[14px] font-bold text-gray-400">سبب الخصم (اختياري)</p>
              <div className="flex flex-wrap gap-2">
                {rules.reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDraft({ ...draft, discountReason: draft.discountReason === r ? "" : r })}
                    className={`h-10 rounded-full border px-4 text-[14px] font-bold ${draft.discountReason === r ? "border-statusGreen bg-statusGreen/15 text-statusGreen" : "border-cardBorder bg-background/60 text-gray-300"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                value={draft.discountNote}
                onChange={(e) => setDraft({ ...draft, discountNote: e.target.value.slice(0, 80) })}
                placeholder="تفاصيل السبب (اختياري)"
                className="h-12 rounded-xl border border-cardBorder bg-background/60 px-4 text-[16px] text-white outline-none focus:border-brandOrange"
              />
              <p className="text-[13px] text-gray-500">
                المسموح: لحد <span className="font-numbers">{rules.maxPercent}%</span> ولحد <span className="font-numbers">{money(rules.maxAmount)}</span> ج.م
              </p>
              {/* أكبر من المسموح: الحفظ واقف إلا برقم المدير - above the limit: saving stops unless the manager PIN */}
              {overLimit && (
                <div className="flex flex-col gap-2 rounded-xl border border-statusRed/60 bg-statusRed/10 p-3">
                  <p className="text-[16px] font-extrabold text-statusRed">⚠ الخصم أكبر من المسموح</p>
                  {rules.managerApproval ? (
                    <input
                      value={draft.managerPin}
                      onChange={(e) => setDraft({ ...draft, managerPin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="رقم المدير السري للموافقة"
                      dir="ltr"
                      className="h-12 rounded-xl border border-cardBorder bg-background/80 px-4 font-numbers text-[18px] text-white outline-none focus:border-statusRed"
                    />
                  ) : (
                    <p className="text-[14px] text-gray-300">قلل الخصم عشان تقدر تحفظ</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* الملخص - summary */}
      <div className={`${card} flex flex-col gap-1.5 text-[17px]`}>
        <p className="text-[17px] font-extrabold text-white mb-1">الملخص</p>
        {t.lines.map((l) => (
          <p key={l.code} className="flex justify-between gap-2 text-gray-300">
            <span className="truncate">
              {l.name} × <span className="font-numbers">{l.qty}</span>
            </span>
            <span className="font-numbers">{money(l.amount)}</span>
          </p>
        ))}
        {t.lines.length === 0 && <p className="text-gray-500">لسه مفيش أصناف</p>}
        <hr className="my-1 border-cardBorder" />
        {t.discount > 0 && (
          <>
            <p className="flex justify-between text-gray-300">
              <span>الإجمالي قبل الخصم</span>
              <span className="font-numbers">{money(t.subtotal)}</span>
            </p>
            <p className="flex justify-between font-bold text-brandOrange">
              <span>
                الخصم{draft.discountMode === "percent" && <span className="font-numbers"> ({t.discountValue}%)</span>}
                {reasonOf(draft) && <span className="text-[14px] font-normal text-gray-400"> · {reasonOf(draft)}</span>}
              </span>
              <span className="font-numbers">− {money(t.discount)}</span>
            </p>
          </>
        )}
        <p className="flex justify-between text-[22px] font-extrabold text-white">
          <span>{t.discount > 0 ? "الإجمالي بعد الخصم" : "الإجمالي"}</span>
          <span className="font-numbers">{money(t.total)}</span>
        </p>
        <p className="flex justify-between text-statusGreen">
          <span>المدفوع{t.method && <span className="text-[14px] text-gray-400"> · {methodText(options, t.method, draft.target, "")}</span>}</span>
          <span className="font-numbers">{money(t.paid)}</span>
        </p>
        <p className="flex justify-between text-statusAmber font-bold">
          <span>الباقي</span>
          <span className="font-numbers">{money(t.remaining)}</span>
        </p>
        {typeof balance === "number" && (
          <>
            <p className="flex justify-between text-gray-400">
              <span>رصيد العميل قبل</span>
              <span className="font-numbers">{money(balance)}</span>
            </p>
            <p className="flex justify-between font-bold text-white">
              <span>رصيد العميل بعد</span>
              <span className="font-numbers">{money(Math.round((balance + t.remaining) * 100) / 100)}</span>
            </p>
          </>
        )}
      </div>

      {/* حفظ وطباعة (ثابت تحت) - save and print (fixed at the bottom) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cardBorder bg-background/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[560px] flex flex-col gap-2">
          {error && <p className="text-center text-[15px] font-bold text-statusRed">{error}</p>}
          {!error && overLimit && !discountReady && <p className="text-center text-[15px] font-bold text-statusRed">الخصم أكبر من المسموح</p>}
          <button
            type="button"
            disabled={!canSave}
            onClick={onSave}
            className="h-16 w-full rounded-2xl bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white text-[21px] font-extrabold flex items-center justify-center gap-2 shadow-[0_8px_30px_rgba(255,122,0,0.35)] disabled:opacity-45"
          >
            <Check size={24} /> {saving ? "بيسجل…" : `حفظ وطباعة · ${money(t.total)}`}
          </button>
        </div>
      </div>

      {picking && (
        <CustomerPicker
          options={options}
          onClose={() => setPicking(false)}
          onPick={(c, warning) => {
            setDraft({ ...draft, customer: c });
            setNotice(warning ?? null);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
