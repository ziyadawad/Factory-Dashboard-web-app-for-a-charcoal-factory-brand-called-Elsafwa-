"use client";

// الصفحة 7 "الموردين": عمودين جنب بعض - 🪵 موردين الخشب (نور كهرماني دافي) و🧴 موردين البلاستيك (نور تيل بارد).
// كل عمود: فوق إجمالي "لهم عندنا" (أحمر) و"لينا عندهم" (أخضر) وعدد الموردين، وتحته كارت لكل مورد (الأكبر رصيد الأول)
// بسكرول جوه العمود. الضغط على مورد بيفتح لوحة تفاصيله. البيانات بتتجاب بس والصفحة ظاهرة (كاش 60 ثانية على السيرفر)
// Page 7 "الموردين": two columns side by side - wood (warm amber glow) and plastic (cool teal glow). Each column: totals
// "لهم عندنا" (red) / "لينا عندهم" (green) and the count, then one box per supplier (biggest balance first) scrolling
// inside the column. A supplier opens its details panel. Fetched only while the page is visible (60 s server cache)

import { CSSProperties } from "react";
import { Truck, Wallet } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { formatNumber } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { QtyByUnit, SupplierCard, SupplierCategory, SuppliersData } from "@/lib/types";
import { OfflineBadge } from "./OfflineBadge";

const cats = dashboardConfig.suppliers.categories;
// رسمة رول بلاستيك (فيلم تغليف بيتفك شوية) وجنبه كيس تعبئة مطبوع صغير - مسطحة زي باقي الرسومات، تيل / أزرق
// A plastic film roll (packaging film unrolling a little) with a small printed bag next to it - flat, teal / blue
export function PlasticRollIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="inline-block shrink-0 align-[-0.18em]">
      {/* الكيس المطبوع ورا - the printed bag behind */}
      <path d="M21 9h8l1 17a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2l1-17z" fill="#0EA5E9" />
      <rect x="22.5" y="6.5" width="5" height="3" rx="1" fill="#0369A1" />
      <rect x="21" y="14" width="7" height="5" rx="1" fill="#E0F2FE" />
      <circle cx="24.5" cy="16.5" r="1.4" fill="#F97316" />
      {/* الفيلم اللي بيتفك - the unrolling film */}
      <path d="M11 20h9.5c.8 0 1.5.7 1.5 1.5v6.5l-3-1.5-3 1.5-3-1.5-3 1.5V20z" fill="#5EEAD4" opacity="0.9" />
      {/* الرول - the roll */}
      <rect x="3" y="8" width="12" height="17" rx="2" fill="#14B8A6" />
      <ellipse cx="9" cy="8" rx="6" ry="2.6" fill="#99F6E4" />
      <ellipse cx="9" cy="8" rx="2.2" ry="1" fill="#0F766E" />
      <ellipse cx="9" cy="25" rx="6" ry="2.6" fill="#0D9488" />
      <path d="M5 11v11" stroke="#CCFBF1" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <path d="M12.5 11v11" stroke="#0F766E" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// أيقونة القسم: رول البلاستيك (SVG) أو 🪵 للخشب - the category icon: the plastic roll (SVG) or 🪵 for wood
export function CategoryIcon({ category, size = 22 }: { category: SupplierCategory; size?: number }) {
  return category === "plastic" ? <PlasticRollIcon size={size} /> : <span>{cats.wood.icon}</span>;
}

// خالص = الرصيد أقل من settleThreshold في أي اتجاه (مش بيظهر خالص) - settled = |balance| under settleThreshold (never shown)
const SETTLE = dashboardConfig.suppliers.settleThreshold;
export const isSettled = (balance: number) => Math.abs(balance) < SETTLE;

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("login required");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const money = (n: number) => formatNumber(Math.round(Math.abs(n)));
// "23/11" - a short date
const short = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${d}/${m}`;
};
// "8.4 طن" (أكتر من وحدة: "8.4 طن + 2 عدد") - quantities with units
export const qtyText = (list: QtyByUnit[]) =>
  list.length === 0 ? "—" : list.map((q) => `${formatNumber(Math.round(q.qty * 100) / 100)} ${q.unit}`).join(" + ");

// الرصيد بكلامه ولونه - the balance wording and color
export function balanceLabel(balance: number): { label: string; className: string } {
  if (balance > 0.5) return { label: "ليه عندنا", className: "text-statusRed" };
  if (balance < -0.5) return { label: "لينا عنده", className: "text-statusGreen" };
  return { label: "خالص ✓", className: "text-gray-400" };
}

function SupplierBox({ s, color, onOpen }: { s: SupplierCard; color: string; onOpen: () => void }) {
  const b = balanceLabel(s.balance);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-start rounded-2xl border border-white/[0.08] bg-card/90 p-4 flex flex-col gap-2 min-w-0 hover:bg-white/[0.05] transition-colors"
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: color }}
    >
      <div className="flex items-start gap-2 min-w-0">
        <p className="flex-1 min-w-0 text-[22px] min-[1600px]:text-[24px] font-extrabold text-white leading-tight line-clamp-2">{s.name}</p>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap" style={{ color, background: `${color}22`, border: `1px solid ${color}55` }}>
          <CategoryIcon category={s.category} size={15} /> {s.category === "wood" ? "خشب" : "بلاستيك"}
        </span>
      </div>
      {/* الرصيد الكبير - the big balance */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`text-[15px] font-bold whitespace-nowrap ${b.className}`}>{b.label}</span>
        {Math.abs(s.balance) > 0.5 && (
          <span className={`font-numbers font-extrabold leading-none whitespace-nowrap text-[34px] min-[1600px]:text-[40px] ${b.className}`} dir="ltr">
            {money(s.balance)}
          </span>
        )}
        {Math.abs(s.balance) > 0.5 && <span className="text-[14px] text-gray-400">ج.م</span>}
      </div>
      {/* السطور الصغيرة - the small lines */}
      <div className="flex flex-col gap-0.5 text-[13px] min-[1600px]:text-[14px] text-gray-300 min-w-0">
        <p className="truncate">
          <Truck size={13} className="inline me-1 text-gray-500" />
          <span className="text-gray-500">آخر توريد: </span>
          {s.lastSupply ? (
            <>
              <span className="font-numbers">{short(s.lastSupply.date)}</span> · <span className="font-numbers">{qtyText(s.lastSupply.qty)}</span> ·{" "}
              <span className="font-numbers">{money(s.lastSupply.amount)}</span> ج.م
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="truncate">
          <Wallet size={13} className="inline me-1 text-gray-500" />
          <span className="text-gray-500">آخر دفعة: </span>
          {s.lastPayment ? (
            <>
              <span className="font-numbers">{short(s.lastPayment.date)}</span> · <span className="font-numbers">{money(s.lastPayment.amount)}</span> ج.م
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="truncate">
          <span className="text-gray-500">توريد الشهر ده: </span>
          {s.month.amount !== 0 || s.month.qty.length ? (
            <>
              <span className="font-numbers font-bold text-gray-100">{qtyText(s.month.qty)}</span> · <span className="font-numbers">{money(s.month.amount)}</span> ج.م
            </>
          ) : (
            <span className="text-gray-500">مفيش</span>
          )}
        </p>
      </div>
    </button>
  );
}

function SupplierColumn({ category, list: all, onOpen }: { category: SupplierCategory; list: SupplierCard[]; onOpen: (name: string) => void }) {
  const cat = cats[category];
  // الخالصين (أقل من settleThreshold) مش بيظهروا ولا بيتحسبوا في الإجمالي والعدد - settled ones are not shown or counted
  const list = all.filter((s) => !isSettled(s.balance));
  const owe = list.reduce((n, s) => n + (s.balance > 0 ? s.balance : 0), 0);
  const adv = list.reduce((n, s) => n + (s.balance < 0 ? -s.balance : 0), 0);
  return (
    <section
      className="wa-col relative min-h-0 min-w-0 flex flex-col rounded-2xl border"
      style={{ "--c": cat.color, borderColor: `${cat.color}55`, boxShadow: `0 0 30px -10px ${cat.color}99, inset 0 0 0 1px ${cat.color}14` } as CSSProperties}
    >
      <div aria-hidden className="wa-col-glow" />
      <header
        className="relative shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-t-2xl border-b px-5 py-3"
        style={{ borderColor: `${cat.color}40`, background: `linear-gradient(180deg, ${cat.color}33, ${cat.color}08)` }}
      >
        <span className="text-[24px] font-extrabold whitespace-nowrap" style={{ color: cat.color }}>
          <CategoryIcon category={category} size={26} /> {cat.title}
        </span>
        <span className="text-[15px] text-gray-300 whitespace-nowrap">
          · <span className="font-numbers font-bold">{list.length}</span> مورد
        </span>
        <span className="ms-auto flex items-center gap-4 whitespace-nowrap">
          <span className="text-[15px] text-gray-300">
            لهم عندنا: <b className="font-numbers text-[22px] text-statusRed">{money(owe)}</b> ج.م
          </span>
          <span className="text-[15px] text-gray-300">
            لينا عندهم: <b className="font-numbers text-[22px] text-statusGreen">{money(adv)}</b> ج.م
          </span>
        </span>
      </header>
      <div className="wa-col-scroll relative flex-1 min-h-0 overflow-y-auto p-3">
        {list.length === 0 ? (
          <p className="py-10 text-center text-gray-500 text-[16px]">مفيش موردين عليهم حساب</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {list.map((s) => (
              <SupplierBox key={s.name} s={s} color={cat.color} onOpen={() => onOpen(s.name)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function SuppliersPage({ active, onOpen }: { active: boolean; onOpen: (name: string) => void }) {
  const { data, error } = usePolling<SuppliersData>("/api/suppliers", fetcher, dashboardConfig.suppliers.cacheSeconds * 1000, active, { keepPreviousData: true });
  if (!data) {
    return (
      <div className="h-full bg-card border border-cardBorder rounded-2xl flex items-center justify-center text-gray-400 text-[18px]">
        {error ? <OfflineBadge /> : "جاري التحميل…"}
      </div>
    );
  }
  const wood = data.suppliers.filter((s) => s.category === "wood");
  const plastic = data.suppliers.filter((s) => s.category === "plastic");
  return (
    // عمودين، والصفحة نفسها مش بتعمل سكرول (كل عمود بيعمل سكرول جواه) - two columns; only the columns scroll
    <div className="h-full min-h-0 grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
      <SupplierColumn category="wood" list={wood} onOpen={onOpen} />
      <SupplierColumn category="plastic" list={plastic} onOpen={onOpen} />
    </div>
  );
}
