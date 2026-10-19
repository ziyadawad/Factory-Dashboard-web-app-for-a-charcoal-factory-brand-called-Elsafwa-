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
import { DashboardData } from "@/lib/types";
import { dashboardConfig } from "@/config/dashboard.config";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const PAGES = dashboardConfig.pages.list;

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
  const { data, error, isLoading } = useSWR<DashboardData>(
    "/api/dashboard",
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );

  const [flashSection, setFlashSection] = useState<string | null>(null);
  const prevDataRef = useRef<DashboardData | null>(null);
  const cols = dashboardConfig.sizes.topRowColumns;
  const fadeMs = dashboardConfig.sizes.pageNav.fadeMs;
  const autoRotateSeconds = dashboardConfig.pages.autoRotateSeconds;

  // الصفحة الحالية - current page index (data stays in SWR, so switching never refetches)
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => setPageIndex(pageFromUrl()), []);

  const changePage = useCallback((index: number) => {
    setPageIndex(index);
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

  // التقليب التلقائي - auto rotate (the timer restarts after every manual switch)
  useEffect(() => {
    if (!(autoRotateSeconds > 0) || PAGES.length < 2) return;
    const timer = setTimeout(() => changePage((pageIndex + 1) % PAGES.length), autoRotateSeconds * 1000);
    return () => clearTimeout(timer);
  }, [pageIndex, autoRotateSeconds, changePage]);

  useEffect(() => {
    if (data && prevDataRef.current) {
      const prev = prevDataRef.current;

      // Check for changes in treasury balance
      if (data.treasury.balance !== prev.treasury.balance) {
        setFlashSection("treasury");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in attendance
      if (data.attendance.present !== prev.attendance.present) {
        setFlashSection("attendance");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in floor workers
      if (JSON.stringify(data.floorWorkers) !== JSON.stringify(prev.floorWorkers)) {
        setFlashSection("floorWorkers");
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

  const isConnected = !error && !isLoading;
  const lastUpdate = data?.updatedAt || null;

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
              <TreasurySection data={data.treasury} />
            </div>
            <div className={flashClass("attendance")}>
              <AttendanceSection data={data.attendance} />
            </div>
            <div className={flashClass("floorWorkers")}>
              <FloorWorkersSection data={data.floorWorkers} />
            </div>
            <div className={flashClass("kilns")}>
              <KilnsSection data={data.kilns} />
            </div>
          </div>
        );
      case "stock":
        return <StockSection data={data.stock} className="h-full min-h-0" />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header
        lastUpdate={lastUpdate}
        isConnected={isConnected}
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
}
