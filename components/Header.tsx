"use client";

import { useState, useEffect, ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { DATE_LOCALE } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

interface HeaderProps {
  lastUpdate: string | null;
  isConnected: boolean;
  // أزرار التنقل بين الصفحات (بتظهر في أقصى الشمال) - page navigation, shown at the far left
  nav?: ReactNode;
}

export default function Header({ lastUpdate, isConnected, nav }: HeaderProps) {
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatLastUpdate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(DATE_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  return (
    <header className="shrink-0 bg-card border-b border-cardBorder px-6 py-3 flex items-center justify-between">
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

        <div className="flex items-center gap-3 bg-background px-4 py-2 rounded-xl border border-cardBorder">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? "bg-statusGreen animate-pulse-dot" : "bg-statusRed"
            }`}
          />
          <span className="text-gray-300 text-sm">
            {isConnected && lastUpdate
              ? `آخر تحديث: ${formatLastUpdate(lastUpdate)}`
              : "غير متصل"}
          </span>
        </div>

        {!isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-background border border-cardBorder rounded-xl hover:bg-cardBorder transition-colors"
            title="ملء الشاشة"
          >
            <Maximize2 className="w-5 h-5 text-gray-300" />
          </button>
        )}

        {nav}
      </div>
    </header>
  );
}
