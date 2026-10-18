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

  return (
    <div className="min-h-screen bg-background">
      <Header lastUpdate={lastUpdate} isConnected={isConnected} />

      <main className="p-6 h-[calc(100vh-88px)] overflow-hidden">
        {data ? (
          <div className="grid grid-cols-4 gap-4 h-full">
            {/* Top row */}
            <div className={flashSection === "treasury" ? "animate-flash" : ""}>
              <TreasurySection data={data.treasury} />
            </div>
            <div className={flashSection === "attendance" ? "animate-flash" : ""}>
              <AttendanceSection data={data.attendance} />
            </div>
            <div className={flashSection === "floorWorkers" ? "animate-flash" : ""}>
              <FloorWorkersSection data={data.floorWorkers} />
            </div>
            <div className={flashSection === "kilns" ? "animate-flash" : ""}>
              <KilnsSection data={data.kilns} />
            </div>

            {/* Bottom row - Warehouse stock spans 4 columns */}
            <StockSection data={data.stock} className="col-span-4" />
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
