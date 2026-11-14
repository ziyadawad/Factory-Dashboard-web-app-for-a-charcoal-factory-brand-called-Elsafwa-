"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Header from "@/components/Header";
import AttendanceSection from "@/components/AttendanceSection";
import StockSection from "@/components/StockSection";
import FloorWorkersSection from "@/components/FloorWorkersSection";
import TreasurySection from "@/components/TreasurySection";
import PageNav from "@/components/PageNav";
import ProductionPage, { ProductionTarget } from "@/components/ProductionPage";
import ActivityFeed from "@/components/ActivityFeed";
import ProductionDetailsPanel from "@/components/ProductionDetailsPanel";
import CharitySection from "@/components/CharitySection";
import SalesRepsSection from "@/components/SalesRepsSection";
import AttendanceDetailsPanel from "@/components/AttendanceDetailsPanel";
import AccountDetailsPanel from "@/components/AccountDetailsPanel";
import DistributorsSection from "@/components/DistributorsSection";
import WalletsSection from "@/components/WalletsSection";
import StockDetailsPanel, { StockPanelTarget } from "@/components/StockDetailsPanel";
import { useViewportFit, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/useViewportFit";
import { DashboardData, ProductionData } from "@/lib/types";
import { OfflineCard } from "@/components/OfflineBadge";
import { useLastGood } from "@/lib/useLastGood";
import { dashboardConfig } from "@/config/dashboard.config";

// لو الـ API رجّع error بنرمي عشان SWR يسيب آخر داتا سليمة - throw on an error status so SWR keeps the last good data
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const REFRESH_MS = dashboardConfig.erp.refreshSeconds * 1000;
// الإنتاج والأفران بيتحدث أسرع (كل production.refreshSeconds) - production refreshes faster
const PRODUCTION_REFRESH_MS = dashboardConfig.production.refreshSeconds * 1000;

// الصفحات الشغالة بس (enabled: false = متوقفة) - enabled pages only
const PAGES = dashboardConfig.pages.list.filter((page) => page.enabled !== false);
// رقم حساب الخزنة (نفس حساب الكارت: "1110 - الخزينة - AC" -> "1110") - the treasury card's account number
const treasuryField = dashboardConfig.erp.treasury.balance;
const TREASURY_ACCOUNT_NUMBER = treasuryField.source === "erp" ? treasuryField.account.split(" - ")[0].trim() : "1110";

// مفتاح حفظ تثبيت الصفحة - localStorage key for the page pin
const PIN_KEY = "elsafwa:pinned";
// الإضاءة الخفيفة ورا الكروت - ambient light settings
const ambient = dashboardConfig.sizes.ambient;

// ?page=2 (رقم الصفحة) أو ?page=stock (اسمها) - page from the URL: 1-based number or page id
function pageFromUrl(): number {
  const param = new URLSearchParams(window.location.search).get("page");
  if (!param) return 0;
  const byId = PAGES.findIndex((page) => page.id === param);
  if (byId >= 0) return byId;
  const byNumber = parseInt(param, 10) - 1;
  return byNumber >= 0 && byNumber < PAGES.length ? byNumber : 0;
}

export default function Dashboard() {
  const { data: serverData, error } = useSWR<DashboardData>(
    "/api/dashboard",
    fetcher,
    {
      // بيسأل كل refreshSeconds من غير reload للصفحة (الداتا القديمة فاضلة لحد ما الجديدة توصل، فمفيش رمشة)
      // Polls every refreshSeconds without reloading the page (old data stays until the new data arrives: no flicker)
      refreshInterval: REFRESH_MS,
      // النت رجع أو الشاشة رجعلها الفوكس = اسأل حالا - internet back or window focused = refetch right away
      revalidateOnReconnect: true,
      revalidateOnFocus: true,
      // يفضل يسأل وهو أوفلاين: الطلب بيفشل فتظهر "غير متصل" والأرقام القديمة فاضلة - keep polling offline so the badge shows
      refreshWhenOffline: true,
      dedupingInterval: 2000,
      // لو الطلب فشل: إعادة كل ~15 ثانية وبتطول لحد دقيقة، ومش بتقف أبدا - on failure retry from ~15 s backing off to 60 s, forever
      errorRetryInterval: 15_000,
      onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
        const delay = Math.min(60_000, 15_000 * 2 ** Math.min(retryCount - 1, 2));
        setTimeout(() => revalidate({ retryCount }), delay);
      },
    }
  );

  // كل كارت بيحتفظ بآخر قيمة نجحت لوحده - every card keeps its own last good value
  const { view: data, cards } = useLastGood(serverData);

  // الإنتاج والأفران (صفحة الإنتاج + كارت الرئيسية): طلب لوحده كل 10 ثواني، ولو فشل بتفضل آخر داتا مع "غير متصل"
  // Production (its page + the main card): its own request every 10 s; on failure the last data stays, marked offline
  const { data: productionRaw, error: productionError } = useSWR<ProductionData>("/api/production", fetcher, {
    refreshInterval: PRODUCTION_REFRESH_MS,
    revalidateOnReconnect: true,
    revalidateOnFocus: true,
    refreshWhenOffline: true,
    dedupingInterval: 2000,
    errorRetryInterval: 15_000,
  });
  const production = productionRaw ? (productionError ? { ...productionRaw, offline: true } : productionRaw) : null;
  const [productionTarget, setProductionTarget] = useState<ProductionTarget | null>(null);
  const closeProduction = useCallback(() => setProductionTarget(null), []);

  const [flashSection, setFlashSection] = useState<string | null>(null);
  const prevDataRef = useRef<DashboardData | null>(null);
  const cols = dashboardConfig.sizes.topRowColumns;
  const { slideMs, slideDistance } = dashboardConfig.sizes.pageNav;
  const autoRotate = dashboardConfig.pages.autoRotate;

  // الصفحة الحالية - current page index (data stays in SWR, so switching never refetches)
  const [pageIndex, setPageIndex] = useState(0);
  // بيزيد مع كل تقليب عشان العداد يبدأ من الأول حتى لو الصفحة هي هي - bumps on every switch so the timer restarts
  const [switchCount, setSwitchCount] = useState(0);
  // اتجاه آخر تقليب: 1 = الجاية (من تحت)، -1 = اللي فاتت (من فوق) - last switch direction: 1 next, -1 previous
  const [direction, setDirection] = useState<1 | -1>(1);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevPageRef = useRef(0);
  useEffect(() => setPageIndex(pageFromUrl()), []);
  // لوحة تفاصيل مفتوحة = التقليب واقف (والأسهم كمان) - a details panel is open: rotation (and arrow keys) paused
  const [salesDetailsOpen, setSalesDetailsOpen] = useState(false);
  // تفاصيل حدث من "اللي بيحصل دلوقتي" مفتوحة - an activity event's details are open
  const [activityDetailsOpen, setActivityDetailsOpen] = useState(false);
  // قسم الحضور المفتوح (من كروت الحضور في الرئيسية) - the open attendance section (from the main page cards)
  const [attendanceSection, setAttendanceSection] = useState<string | null>(null);
  const closeAttendance = useCallback(() => setAttendanceSection(null), []);
  // لوحة تفاصيل الخزنة (من كارت رصيد الخزنة) - the treasury details panel (from the treasury card)
  const [treasuryOpen, setTreasuryOpen] = useState(false);
  const closeTreasury = useCallback(() => setTreasuryOpen(false), []);
  // المحفظة المفتوحة (من كروت صفحة الخزن والمحافظ) - the open wallet (from the wallets page cards)
  const [wallet, setWallet] = useState<{ accountNumber: string; title: string } | null>(null);
  const closeWallet = useCallback(() => setWallet(null), []);
  // تفاصيل كارت في أرصدة المخازن - the open stock card details
  const [stockItem, setStockItem] = useState<StockPanelTarget | null>(null);
  const closeStockItem = useCallback(() => setStockItem(null), []);
  // تثبيت الصفحة (محفوظ في المتصفح عشان يفضل بعد الريفرش، وقفل اللوحة مش بيلغيه)
  // Page pin, kept in localStorage so it survives a refresh (closing a panel never unpins)
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem(PIN_KEY) === "1");
    } catch {}
  }, []);
  const togglePin = useCallback(() => {
    setPinned((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  const paused =
    salesDetailsOpen || attendanceSection !== null || treasuryOpen || wallet !== null || stockItem !== null || productionTarget !== null || activityDetailsOpen;

  const changePage = useCallback((index: number, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setPageIndex(index);
    setSwitchCount((count) => count + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(index + 1));
    window.history.replaceState(null, "", url);
  }, []);

  // الكيبورد: تحت / PageDown / الشمال = الجاية، فوق / PageUp / اليمين = اللي فاتت (وبتلف)
  // Keyboard: ArrowDown / PageDown / ArrowLeft = next, ArrowUp / PageUp / ArrowRight = previous (wraps around)
  useEffect(() => {
    const NEXT_KEYS = ["ArrowDown", "PageDown", "ArrowLeft"];
    const PREV_KEYS = ["ArrowUp", "PageUp", "ArrowRight"];
    const onKey = (e: KeyboardEvent) => {
      const step = NEXT_KEYS.includes(e.key) ? 1 : PREV_KEYS.includes(e.key) ? -1 : 0;
      if (paused || step === 0) return;
      // مش جوه خانة كتابة - not while typing in a field
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      e.preventDefault();
      changePage((pageIndex + step + PAGES.length) % PAGES.length, step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, paused, changePage]);

  // التقليب التلقائي: كل صفحة بمدتها - auto rotate, each page for its own duration
  // (the timer restarts after every switch, manual or automatic)
  useEffect(() => {
    const seconds = PAGES[pageIndex]?.durationSeconds;
    if (paused || pinned || !autoRotate || PAGES.length < 2 || !(seconds > 0)) return;
    const timer = setTimeout(() => changePage((pageIndex + 1) % PAGES.length, 1), seconds * 1000);
    return () => clearTimeout(timer);
  }, [pageIndex, switchCount, paused, pinned, autoRotate, changePage]);

  // حركة التقليب: الجديدة بتدخل من تحت (الجاية) أو من فوق (اللي فاتت)، والقديمة بتخرج عكسها وهي بتختفي.
  // "حركة أقل" في الجهاز: من غير حركة، ظهور تدريجي بس
  // Switch animation: the new page enters from below (next) or above (previous), the old one leaves the other
  // way while fading. prefers-reduced-motion: no movement, the fade only
  useEffect(() => {
    const previous = prevPageRef.current;
    prevPageRef.current = pageIndex;
    if (switchCount === 0 || previous === pageIndex) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const options: KeyframeAnimationOptions = { duration: slideMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
    const shift = direction * slideDistance;
    const entering = pageRefs.current[pageIndex]?.animate(
      [{ transform: `translateY(${shift}px)` }, { transform: "translateY(0)" }],
      options
    );
    const leaving = pageRefs.current[previous]?.animate(
      [{ transform: "translateY(0)" }, { transform: `translateY(${-shift}px)` }],
      options
    );
    return () => {
      entering?.finish();
      leaving?.finish();
    };
  }, [pageIndex, switchCount, direction, slideMs, slideDistance]);

  useEffect(() => {
    if (data && prevDataRef.current) {
      const prev = prevDataRef.current;

      // Check for changes in treasury balance
      if (data.treasury.balance !== prev.treasury.balance) {
        setFlashSection("treasury");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in management attendance
      if (data.attendance.management.present !== prev.attendance.management.present) {
        setFlashSection("attendance");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in workers attendance (with drivers, reps and guards)
      if (JSON.stringify(data.attendance) !== JSON.stringify(prev.attendance)) {
        setFlashSection("floorWorkers");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in charity funds
      if (JSON.stringify(data.charity) !== JSON.stringify(prev.charity)) {
        setFlashSection("charity");
        setTimeout(() => setFlashSection(null), 500);
      }
    }

    if (data) {
      prevDataRef.current = data;
    }
  }, [data]);

  // "غير متصل" بيظهر بس لو الجلب أو ERPNext فشل (مش وقت التحميل) - offline only when the fetch or ERPNext failed
  const isConnected = !error && !data?.erpOffline;

  const flashClass = (section: string) =>
    `min-h-0 ${flashSection === section ? "animate-flash" : ""}`;

  const renderPage = (id: string, data: DashboardData) => {
    switch (id) {
      case "main":
        return (
          <div
            className="grid gap-4 h-full"
            style={{
              gridTemplateColumns: `minmax(0,${cols.treasury}fr) minmax(0,${cols.management}fr) minmax(0,${cols.workers}fr) minmax(0,${cols.activity}fr)`,
              gridTemplateRows: "minmax(0,1fr)",
            }}
          >
            <div className={flashClass("treasury")}>
              {cards.treasury.missing ? (
                <OfflineCard title="رصيد الخزنة" />
              ) : (
                <TreasurySection
                  data={data.treasury}
                  offline={cards.treasury.offline}
                  onOpen={() => setTreasuryOpen(true)}
                />
              )}
            </div>
            <div className={flashClass("attendance")}>
              {cards.attendance.missing ? (
                <OfflineCard title="حضور الإدارة" />
              ) : (
                <AttendanceSection
                  data={data.attendance.management}
                  updatedAt={data.updatedAt}
                  offline={cards.attendance.offline}
                  onOpen={() => setAttendanceSection("management")}
                />
              )}
            </div>
            <div className={flashClass("floorWorkers")}>
              {cards.attendance.missing ? (
                <OfflineCard title="حضور عمال" />
              ) : (
                <FloorWorkersSection
                  data={data.attendance}
                  offline={cards.attendance.offline}
                  onOpenSection={setAttendanceSection}
                />
              )}
            </div>
            {/* اللي بيحصل دلوقتي (بيفضل شغال حتى والصفحة متقلبة) - the live feed (keeps running while pages rotate) */}
            <div className="min-h-0">
              <ActivityFeed onDetailsChange={setActivityDetailsOpen} />
            </div>
          </div>
        );
      case "production":
        return <ProductionPage data={production} onOpen={setProductionTarget} />;
      case "stock":
        return <StockSection data={data.stock} className="h-full min-h-0" onOpenItem={setStockItem} />;
      case "sales":
        return <SalesRepsSection data={data.sales ?? null} onDetailsChange={setSalesDetailsOpen} />;
      case "distributors":
        return <DistributorsSection data={data.distributors ?? null} />;
      case "wallets":
        return <WalletsSection
            data={data.wallets ?? null}
            onOpenWallet={(card) => setWallet({ accountNumber: card.accountNumber, title: card.name })}
          />;
      case "charity":
        return (
          <div className={`h-full ${flashClass("charity")}`}>
            <CharitySection data={data.charity} />
          </div>
        );
      default:
        return null;
    }
  };

  // شاشة صغيرة (موبايل بالعرض): الصفحة على لوحة 1920×1080 متصغرة بـ scale. الشاشات الكبيرة مفيش أي تغيير
  // Small screens (phone landscape): the page on a 1920x1080 canvas scaled down. Large screens: unchanged
  const fit = useViewportFit();

  if (fit.portrait) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="text-6xl">📱</span>
        <p className="text-white text-2xl font-bold">لف الموبايل بالعرض</p>
      </div>
    );
  }

  const dashboard = (
    <div
      className={`${fit.scale ? "" : "relative h-screen "}flex flex-col overflow-hidden bg-background`}
      style={
        fit.scale
          ? {
              position: "absolute",
              left: "50%",
              top: "50%",
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `translate(-50%, -50%) scale(${fit.scale})`,
            }
          : undefined
      }
    >
      {/* إضاءة خفيفة ورا الكروت (CSS بس) - soft ambient glow behind the cards (CSS only) */}
      {ambient.enabled && (
        <div className="ambient-light" aria-hidden style={{ opacity: ambient.opacity }}>
          <span className="ambient-blob ambient-blob-1" />
          <span className="ambient-blob ambient-blob-2" />
          <span className="ambient-blob ambient-blob-3" />
        </div>
      )}

      <Header
        pinned={pinned}
        isConnected={isConnected}
        page={PAGES[pageIndex]}
        pageNumber={pageIndex + 1}
        pageCount={PAGES.length}
        nav={<PageNav pages={PAGES} current={pageIndex} onChange={changePage} pinned={pinned} onTogglePin={togglePin} />}
      />

      <main className="relative flex-1 min-h-0 p-4 overflow-hidden">
        {data ? (
          // كل الصفحات فوق بعض والحالية بس اللي ظاهرة - pages are stacked; only the active one is visible
          <div className="relative h-full">
            {PAGES.map((page, index) => {
              const active = index === pageIndex;
              return (
                <div
                  key={page.id}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  aria-hidden={!active}
                  className={`absolute inset-0 transition-[opacity,visibility] ${
                    active ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  }`}
                  style={{ transitionDuration: `${slideMs}ms` }}
                >
                  {renderPage(page.id, data)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-xl">جاري تحميل البيانات...</p>
          </div>
        )}
      </main>

      {attendanceSection && <AttendanceDetailsPanel section={attendanceSection} onClose={closeAttendance} />}
      {treasuryOpen && (
        <AccountDetailsPanel accountNumber={TREASURY_ACCOUNT_NUMBER} title="رصيد الخزنة" mode="recent" onClose={closeTreasury} />
      )}
      {wallet && <AccountDetailsPanel accountNumber={wallet.accountNumber} title={wallet.title} mode="months" onClose={closeWallet} />}
      {productionTarget && production && (
        <ProductionDetailsPanel data={production} target={productionTarget} onClose={closeProduction} />
      )}
      {stockItem && <StockDetailsPanel key={`${stockItem.group}|${stockItem.name}|${stockItem.variant ?? ""}`} target={stockItem} onClose={closeStockItem} />}
    </div>
  );

  return fit.scale ? <div className="fixed inset-0 overflow-hidden bg-background">{dashboard}</div> : dashboard;
}
