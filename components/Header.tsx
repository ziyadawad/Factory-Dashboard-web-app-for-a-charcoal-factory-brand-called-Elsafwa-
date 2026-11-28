"use client";

import { useState, useEffect, ReactNode } from "react";
import { Factory, HandHeart, House, LucideIcon, Maximize2, Minimize2, Network, Store, Truck, Users, Wallet, Warehouse } from "lucide-react";
import { DATE_LOCALE } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface HeaderProps {
  // false بس لو جلب البيانات فشل - false only when the data fetch failed
  isConnected: boolean;
  // أزرار التنقل بين الصفحات (بتظهر في أقصى الشمال) - page navigation, shown at the far left
  nav?: ReactNode;
  // الصفحة الحالية (اسمها بيظهر في نص الهيدر) - current page, its title is shown in the header center
  page?: { id: string; title: string };
  // رقم الصفحة الحالية (من 1) وعدد الصفحات - current page number (1-based) and page count
  pageNumber?: number;
  pageCount?: number;
  // الصفحة متثبتة (التقليب واقف) - the page is pinned (rotation stopped)
  pinned?: boolean;
  // الضغط على نقطة صفحة بيروح لها (index من 0) - clicking a page dot goes to that page (0-based index)
  onPageChange?: (index: number, dir: 1 | -1) => void;
  // أسامي الصفحات (للتلميح على النقط) - page titles (dot tooltips)
  pageTitles?: string[];
  // أزرار خاصة بالصفحة الحالية (جنب ملء الشاشة) - buttons for the current page (next to fullscreen)
  actions?: ReactNode;
}

// عرض خانة كل نقطة (مساحة الضغط) - each dot's slot width (click area)
const DOT_SLOT = 18;

// نقط الصفحات: نقطة لكل صفحة، والحالية حبة برتقاني بتتزحلق لمكانها - page dots; the current one is an orange pill that slides
function PageDots({ current, count, titles, onPick }: { current: number; count: number; titles?: string[]; onPick?: (index: number) => void }) {
  const { pageDotSize, pageDotActiveWidth } = dashboardConfig.sizes.header;
  const inset = (DOT_SLOT - pageDotActiveWidth) / 2;
  return (
    <span className="relative flex items-center" style={{ height: DOT_SLOT }}>
      {/* الحبة البرتقاني (بتتحرك بـ transform) - the orange pill (moves by transform) */}
      <span
        aria-hidden
        className="page-dot-active absolute top-1/2 rounded-full bg-brandOrange shadow-[0_0_8px_rgba(255,122,0,0.75),0_0_16px_rgba(255,122,0,0.35)]"
        style={{
          right: inset,
          width: pageDotActiveWidth,
          height: pageDotSize,
          marginTop: -pageDotSize / 2,
          transform: `translateX(${-current * DOT_SLOT}px)`,
        }}
      />
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick?.(i)}
          title={titles?.[i] ? `${i + 1}. ${titles[i]}` : String(i + 1)}
          aria-label={`صفحة ${i + 1}${titles?.[i] ? ` — ${titles[i]}` : ""}`}
          aria-current={i === current ? "page" : undefined}
          className="group relative z-[1] flex items-center justify-center pointer-events-auto cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brandOrange/60"
          style={{ width: DOT_SLOT, height: DOT_SLOT }}
        >
          <span
            className={`rounded-full transition-colors duration-300 ${i === current ? "bg-transparent" : "bg-gray-500 group-hover:bg-gray-300"}`}
            style={{ width: pageDotSize, height: pageDotSize }}
          />
        </button>
      ))}
    </span>
  );
}

// أيقونة كل صفحة حسب الـ id بتاعها - icon for each page id
const PAGE_ICONS: Record<string, LucideIcon> = {
  main: House,
  production: Factory,
  stock: Warehouse,
  sales: Truck,
  distributors: Store,
  wallets: Wallet,
  charity: HandHeart,
  it: Network,
  customers: Users, // صفحة العملاء (/customers) برّه التقليب - the customers page (outside the rotation)
};

// يفتح أو يقفل ملء الشاشة (لو المتصفح رفض مفيش حاجة بتحصل) - enter or leave fullscreen (ignored if the browser refuses)
function toggleFullscreen() {
  const request = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  request?.catch((error) => console.log("Fullscreen error:", error));
}

export default function Header({ isConnected, nav, page, pageNumber, pageCount, pinned, onPageChange, pageTitles, actions }: HeaderProps) {
  const sizes = dashboardConfig.sizes.header;
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(DATE_LOCALE, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString(DATE_LOCALE, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Wake Lock API to prevent screen from sleeping
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
        }
      } catch (err) {
        console.log("Wake Lock error:", err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, []);

  // ملء الشاشة: الأيقونة بتتظبط من fullscreenchange (حتى لو خرجت بـ Esc)، وزرار F بيفتح/يقفل
  // Fullscreen: the icon follows fullscreenchange (also when leaving with Esc); the F key toggles it
  useEffect(() => {
    const update = () => setIsFullscreen(!!document.fullscreenElement);
    update();
    document.addEventListener("fullscreenchange", update);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F" && e.code !== "KeyF") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      e.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const PageIcon = page ? PAGE_ICONS[page.id] : undefined;

  return (
    <header className="relative shrink-0 bg-card border-b border-cardBorder px-6 py-3 flex items-center justify-between">
      {/* اسم الصفحة الحالية في النص (مش بيزود ارتفاع الهيدر) - current page title, centered without adding height */}
      {page && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 bg-background border border-brandOrange/50 shadow-[0_0_14px_rgba(255,122,0,0.35),0_0_44px_rgba(255,122,0,0.12)] rounded-full px-6 py-1 pointer-events-none">
          {PageIcon && <PageIcon className="text-brandOrange shrink-0" size={sizes.pageTitleIconSize} />}
          <div className="flex flex-col items-center">
            <span
              className="font-extrabold whitespace-nowrap leading-tight bg-gradient-to-l from-brandYellow to-brandOrange bg-clip-text text-transparent"
              style={{ fontSize: `${sizes.pageTitleFontSize}px` }}
            >
              {page.title}
            </span>
            {pageNumber && pageCount && (
              // نقط الصفحات + "1 / 6" - page dots + "1 / 6"
              <span className="flex items-center gap-2.5 whitespace-nowrap leading-none mt-0.5">
                <PageDots
                  current={pageNumber - 1}
                  count={pageCount}
                  titles={pageTitles}
                  onPick={(i) => i !== pageNumber - 1 && onPageChange?.(i, i > pageNumber - 1 ? 1 : -1)}
                />
                <span dir="ltr" className="font-numbers tabular-nums font-extrabold" style={{ fontSize: `${sizes.pageNumberFontSize}px` }}>
                  <span key={pageNumber} className="page-num-fade inline-block text-brandOrange">
                    {pageNumber}
                  </span>
                  <span className="text-gray-500"> / {pageCount}</span>
                </span>
              </span>
            )}
          </div>
          {/* "متثبتة" على شمال الحبة عشان متزحمش الرقم - the pinned chip on the pill's left so it doesn't crowd the number */}
          {pinned && (
            <span className="rounded-full bg-brandOrange/15 px-2 py-0.5 text-[13px] font-bold text-brandOrange whitespace-nowrap">📌 متثبتة</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-6">
        <img
          src="/logo.png"
          alt="الصفوة"
          style={{ width: sizes.logoHeight, height: sizes.logoHeight }}
        />
        <div>
          <h1
            className="font-bold text-white"
            style={{ fontSize: `${sizes.titleFontSize}px` }}
          >
            لوحة متابعة المصنع
          </h1>
          <p
            className="text-gray-400"
            style={{ fontSize: `${sizes.subtitleFontSize}px` }}
          >
            الصفوة
          </p>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="text-left">
          <p
            className="font-bold text-white tabular-nums"
            style={{ fontSize: `${sizes.clockFontSize}px` }}
          >
            {currentTime}
          </p>
          <p className="text-gray-400 text-sm">{currentDate}</p>
        </div>

        {/* بيظهر بس لو البيانات فشلت تتجاب - shown only when the data fetch fails */}
        {!isConnected && (
          <div className="flex items-center gap-2 bg-statusRed/10 px-3 py-1.5 rounded-xl border border-statusRed/50">
            <div className="w-2.5 h-2.5 rounded-full bg-statusRed" />
            <span className="text-statusRed text-sm font-semibold">غير متصل</span>
          </div>
        )}

        {actions}

        {/* زرار ملء الشاشة دايما ظاهر - the fullscreen button is always shown */}
        <button
          onClick={toggleFullscreen}
          className="p-2 bg-background border border-cardBorder rounded-xl hover:bg-cardBorder transition-colors"
          title={isFullscreen ? "خروج من ملء الشاشة (F)" : "ملء الشاشة (F)"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5 text-gray-300" />
          ) : (
            <Maximize2 className="w-5 h-5 text-gray-300" />
          )}
        </button>

        {nav}
      </div>
    </header>
  );
}
