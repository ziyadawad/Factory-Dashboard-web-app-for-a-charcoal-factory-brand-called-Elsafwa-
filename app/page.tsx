"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Header from "@/components/Header";
import AttendanceSection from "@/components/AttendanceSection";
import StockSection from "@/components/StockSection";
import KilnsSection from "@/components/KilnsSection";
import FloorWorkersSection from "@/components/FloorWorkersSection";
import TreasurySection from "@/components/TreasurySection";
import { DashboardData } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
      if (data.floorWorkers.present !== prev.floorWorkers.present) {
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

  return (
    <ScaleToFit>
      <Header lastUpdate={lastUpdate} isConnected={isConnected} />

      <main className="flex-1 min-h-0 p-4 overflow-hidden">
        {data ? (
          <div className="grid grid-cols-4 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 h-full">
            {/* Top row */}
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

            {/* Bottom row - Warehouse stock spans 4 columns */}
            <StockSection data={data.stock} className="col-span-4 min-h-0" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-xl">جاري تحميل البيانات...</p>
          </div>
        )}
      </main>
    </ScaleToFit>
  );
}

// The dashboard is laid out on a fixed 1920x1080 canvas and scaled to fit the
// screen, so everything is always visible on one page without scrolling.
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

function ScaleToFit({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      setScale(
        Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT)
      );
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
      <div
        className="flex flex-col shrink-0 overflow-hidden bg-background"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
