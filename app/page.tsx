"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Header from "@/components/Header";
import AttendanceSection from "@/components/AttendanceSection";
import StockSection from "@/components/StockSection";
import KilnsSection from "@/components/KilnsSection";
import FloorWorkersSection from "@/components/FloorWorkersSection";
import TreasurySection from "@/components/TreasurySection";
import PageNav from "@/components/PageNav";
import BatchesSection from "@/components/BatchesSection";
import CharitySection from "@/components/CharitySection";
import SalesRepsSection from "@/components/SalesRepsSection";
import DistributorsSection from "@/components/DistributorsSection";
import WalletsSection from "@/components/WalletsSection";
import { useViewportFit, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/useViewportFit";
import { DashboardData } from "@/lib/types";
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

// الصفحات الشغالة بس (enabled: false = متوقفة) - enabled pages only
const PAGES = dashboardConfig.pages.list.filter((page) => page.enabled !== false);

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

  const [flashSection, setFlashSection] = useState<string | null>(null);
  const prevDataRef = useRef<DashboardData | null>(null);
  const cols = dashboardConfig.sizes.topRowColumns;
  const fadeMs = dashboardConfig.sizes.pageNav.fadeMs;
  const autoRotate = dashboardConfig.pages.autoRotate;

  // الصفحة الحالية - current page index (data stays in SWR, so switching never refetches)
  const [pageIndex, setPageIndex] = useState(0);
  // بيزيد مع كل تقليب عشان العداد يبدأ من الأول حتى لو الصفحة هي هي - bumps on every switch so the timer restarts
  const [switchCount, setSwitchCount] = useState(0);
  useEffect(() => setPageIndex(pageFromUrl()), []);
  // لوحة تفاصيل مفتوحة = التقليب واقف (والأسهم كمان) - a details panel is open: rotation (and arrow keys) paused
  const [paused, setPaused] = useState(false);

  const changePage = useCallback((index: number) => {
    setPageIndex(index);
    setSwitchCount((count) => count + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(index + 1));
    window.history.replaceState(null, "", url);
  }, []);

  // أسهم الكيبورد: الشمال = التالي، اليمين = السابق (عشان الصفحة عربي)
  // Keyboard arrows: left = next, right = previous (RTL)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const step = e.key === "ArrowLeft" ? 1 : -1;
      changePage((pageIndex + step + PAGES.length) % PAGES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, paused, changePage]);

  // التقليب التلقائي: كل صفحة بمدتها - auto rotate, each page for its own duration
  // (the timer restarts after every switch, manual or automatic)
  useEffect(() => {
    const seconds = PAGES[pageIndex]?.durationSeconds;
    if (paused || !autoRotate || PAGES.length < 2 || !(seconds > 0)) return;
    const timer = setTimeout(() => changePage((pageIndex + 1) % PAGES.length), seconds * 1000);
    return () => clearTimeout(timer);
  }, [pageIndex, switchCount, paused, autoRotate, changePage]);

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

      // Check for changes in today's batches
      if (JSON.stringify(data.batches) !== JSON.stringify(prev.batches)) {
        setFlashSection("batches");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in charity funds
      if (JSON.stringify(data.charity) !== JSON.stringify(prev.charity)) {
        setFlashSection("charity");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in kilns
      if (JSON.stringify(data.kilns.kilns) !== JSON.stringify(prev.kilns.kilns)) {
        setFlashSection("kilns");
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
              gridTemplateColumns: `minmax(0,${cols.treasury}fr) minmax(0,${cols.management}fr) minmax(0,${cols.workers}fr) minmax(0,${cols.kilns}fr)`,
              gridTemplateRows: "minmax(0,1fr)",
            }}
          >
            <div className={flashClass("treasury")}>
              {cards.treasury.missing ? (
                <OfflineCard title="رصيد الخزنة" />
              ) : (
                <TreasurySection data={data.treasury} offline={cards.treasury.offline} />
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
                />
              )}
            </div>
            <div className={flashClass("floorWorkers")}>
              {cards.attendance.missing ? (
                <OfflineCard title="حضور عمال" />
              ) : (
                <FloorWorkersSection data={data.attendance} offline={cards.attendance.offline} />
              )}
            </div>
            {/* الأفران وتحتها الطرحات اليوم - kilns with today's batches below */}
            <div className="min-h-0 flex flex-col gap-4">
              <div className={`shrink-0 ${flashClass("kilns")}`}>
                {cards.kilns.missing ? (
                  <OfflineCard title="الأفران" />
                ) : (
                  <KilnsSection data={data.kilns} offline={cards.kilns.offline} />
                )}
              </div>
              <div className={`flex-1 ${flashClass("batches")}`}>
                <BatchesSection data={data.batches} />
              </div>
            </div>
          </div>
        );
      case "stock":
        return <StockSection data={data.stock} className="h-full min-h-0" />;
      case "sales":
        return <SalesRepsSection data={data.sales ?? null} onDetailsChange={setPaused} />;
      case "distributors":
        return <DistributorsSection data={data.distributors ?? null} />;
      case "wallets":
        return <WalletsSection data={data.wallets ?? null} />;
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
      className={`${fit.scale ? "" : "h-screen "}flex flex-col overflow-hidden bg-background`}
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
      <Header
        isConnected={isConnected}
        page={PAGES[pageIndex]}
        pageNumber={pageIndex + 1}
        pageCount={PAGES.length}
        nav={<PageNav pages={PAGES} current={pageIndex} onChange={changePage} />}
      />

      <main className="flex-1 min-h-0 p-4 overflow-hidden">
        {data ? (
          // كل الصفحات فوق بعض والحالية بس اللي ظاهرة - pages are stacked; only the active one is visible
          <div className="relative h-full">
            {PAGES.map((page, index) => {
              const active = index === pageIndex;
              return (
                <div
                  key={page.id}
                  aria-hidden={!active}
                  className={`absolute inset-0 transition-[opacity,visibility] ${
                    active ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  }`}
                  style={{ transitionDuration: `${fadeMs}ms` }}
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
    </div>
  );

  return fit.scale ? <div className="fixed inset-0 overflow-hidden bg-background">{dashboard}</div> : dashboard;
}
