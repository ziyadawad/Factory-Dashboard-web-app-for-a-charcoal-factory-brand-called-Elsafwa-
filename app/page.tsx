"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import Header from "@/components/Header";
import AttendanceSection from "@/components/AttendanceSection";
import StockSection from "@/components/StockSection";
import KilnsSection from "@/components/KilnsSection";
import FloorWorkersSection, { GroupBox } from "@/components/FloorWorkersSection";
import ScaledCanvas, { FitWidth } from "@/components/ScaledCanvas";
import TreasurySection from "@/components/TreasurySection";
import PageNav from "@/components/PageNav";
import BatchesSection from "@/components/BatchesSection";
import CharitySection from "@/components/CharitySection";
import { Briefcase, ShieldCheck, Truck } from "lucide-react";
import { DashboardData } from "@/lib/types";
import { dashboardConfig } from "@/config/dashboard.config";

// لو الـ API رجّع error بنرمي عشان SWR يسيب آخر داتا سليمة - throw on an error status so SWR keeps the last good data
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const REFRESH_MS = dashboardConfig.erp.refreshSeconds * 1000;

const PAGES = dashboardConfig.pages.list;

const CANVAS = dashboardConfig.sizes.attendanceCanvas;
// موبايل بالطول: كروت الحضور في عمود واحد - phone portrait: attendance cards in one column
const PORTRAIT_QUERY = `(orientation: portrait) and (max-width: ${CANVAS.portraitMaxWidth}px)`;
// شاشة أضيق من كده: الهيدر بيتصغّر على قد العرض في صفحة الحضور بدل ما يتداخل
// Narrower than this: on the attendance page the header is shrunk to the width instead of overlapping
const NARROW_QUERY = `(max-width: ${CANVAS.headerMinWidth - 1}px)`;
// المسافة حوالين الصفحة (p-4 في main) - padding around the page (p-4 on main)
const MAIN_PADDING = 16;

// ?page=2 (رقم الصفحة) أو ?page=stock (اسمها) - page from the URL: 1-based number or page id
function pageFromUrl(): number {
  const param = new URLSearchParams(window.location.search).get("page");
  if (!param) return 0;
  const byId = PAGES.findIndex((page) => page.id === param);
  if (byId >= 0) return byId;
  const byNumber = parseInt(param, 10) - 1;
  return byNumber >= 0 && byNumber < PAGES.length ? byNumber : 0;
}

// بيتحسب تاني مع تغيير المقاس أو لف الشاشة - re-evaluated on resize and orientationchange
function useMediaQuery(media: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(media);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [media]);
  return matches;
}

export default function Dashboard() {
  const { data, error } = useSWR<DashboardData>(
    "/api/dashboard",
    fetcher,
    {
      refreshInterval: REFRESH_MS,
      revalidateOnFocus: false,
      dedupingInterval: REFRESH_MS / 2,
    }
  );

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

  // طول الهيدر الحقيقي عشان مقاس صفحة الحضور = 1920×1080 من غيره - real header height, so the
  // attendance canvas is what's left of 1920×1080 under it
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const portrait = useMediaQuery(PORTRAIT_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);

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
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const step = e.key === "ArrowLeft" ? 1 : -1;
      changePage((pageIndex + step + PAGES.length) % PAGES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, changePage]);

  // التقليب التلقائي: كل صفحة بمدتها - auto rotate, each page for its own duration
  // (the timer restarts after every switch, manual or automatic)
  useEffect(() => {
    const seconds = PAGES[pageIndex]?.durationSeconds;
    if (!autoRotate || PAGES.length < 2 || !(seconds > 0)) return;
    const timer = setTimeout(() => changePage((pageIndex + 1) % PAGES.length), seconds * 1000);
    return () => clearTimeout(timer);
  }, [pageIndex, switchCount, autoRotate, changePage]);

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

      // Check for changes in workers attendance
      if (JSON.stringify(data.attendance.workers) !== JSON.stringify(prev.attendance.workers)) {
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
      case "main": {
        const attendance = data.attendance;
        // سواقين ومناديب وغفر: كروت لوحدها برّه "حضور عمال" - drivers, reps, guards: separate cards
        const separateCards = (
          <>
            <div className="min-h-0">
              <GroupBox group={attendance.drivers} icon={Truck} variant="card" />
            </div>
            <div className="min-h-0">
              <GroupBox group={attendance.reps} icon={Briefcase} variant="card" />
            </div>
            <div className="min-h-0">
              <GroupBox group={attendance.guards} icon={ShieldCheck} variant="card" />
            </div>
          </>
        );
        if (portrait) {
          return (
            <div className="h-full overflow-y-auto thin-scroll flex flex-col gap-4 [&>*]:shrink-0">
              <div className={flashClass("attendance")}>
                <AttendanceSection data={attendance.management} updatedAt={data.updatedAt} />
              </div>
              <div className={flashClass("floorWorkers")}>
                <FloorWorkersSection data={attendance.workers} stacked />
              </div>
              {separateCards}
            </div>
          );
        }
        // لحد ما الهيدر يتقاس - until the header is measured
        if (!headerHeight) return null;
        return (
          <ScaledCanvas
            width={CANVAS.width - MAIN_PADDING * 2}
            height={CANVAS.height - headerHeight - MAIN_PADDING * 2}
          >
            <div
              className="grid gap-4 h-full"
              style={{
                gridTemplateColumns: `minmax(0,${cols.treasury}fr) minmax(0,${cols.management}fr) minmax(0,${cols.workers}fr) minmax(0,${cols.kilns}fr)`,
                gridTemplateRows: "minmax(0,1fr)",
              }}
            >
              <div className={flashClass("treasury")}>
                <TreasurySection data={data.treasury} />
              </div>
              <div className={flashClass("attendance")}>
                <AttendanceSection data={attendance.management} updatedAt={data.updatedAt} />
              </div>
              {/* حضور عمال وتحته سواقين ومناديب وغفر - workers attendance with drivers, reps and guards below */}
              <div className="min-h-0 flex flex-col gap-4">
                <div className={`flex-1 ${flashClass("floorWorkers")}`}>
                  <FloorWorkersSection data={attendance.workers} />
                </div>
                <div
                  className="shrink-0 grid grid-cols-3 gap-4"
                  style={{ height: `${dashboardConfig.sizes.floorWorkers.separateCardsHeight}px` }}
                >
                  {separateCards}
                </div>
              </div>
              {/* الأفران وتحتها الطرحات اليوم - kilns with today's batches below */}
              <div className="min-h-0 flex flex-col gap-4">
                <div className={`shrink-0 ${flashClass("kilns")}`}>
                  <KilnsSection data={data.kilns} />
                </div>
                <div className={`flex-1 ${flashClass("batches")}`}>
                  <BatchesSection data={data.batches} />
                </div>
              </div>
            </div>
          </ScaledCanvas>
        );
      }
      case "stock":
        return <StockSection data={data.stock} className="h-full min-h-0" />;
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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <FitWidth width={CANVAS.headerMinWidth} enabled={narrow && PAGES[pageIndex]?.id === "main"}>
        <div ref={headerRef} className="shrink-0">
          <Header
            isConnected={isConnected}
            page={PAGES[pageIndex]}
            pageNumber={pageIndex + 1}
            pageCount={PAGES.length}
            nav={<PageNav pages={PAGES} current={pageIndex} onChange={changePage} />}
          />
        </div>
      </FitWidth>

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
}
