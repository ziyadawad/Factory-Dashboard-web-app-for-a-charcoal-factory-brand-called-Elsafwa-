"use client";

import { useLayoutEffect, useState } from "react";

// مقاس التصميم الثابت: الداشبورد كله بيترسم على 1920x1080 وبعدين بيتكبر أو يتصغر على قد الشاشة
// Fixed design canvas: the whole dashboard is laid out at 1920x1080, then scaled to fit the screen
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

type Fit = { scale: number; left: number; top: number };

function fitToWindow(): Fit {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  return {
    scale,
    left: (window.innerWidth - STAGE_WIDTH * scale) / 2,
    top: (window.innerHeight - STAGE_HEIGHT * scale) / 2,
  };
}

// زي شاشة العرض: المساحة الفاضية حوالين الكانفاس بنفس لون الخلفية
// Like a TV / presentation stage: the leftover area keeps the same background color
export default function ScaleStage({ children }: { children: React.ReactNode }) {
  const [fit, setFit] = useState<Fit | null>(null);

  // بيتحسب عند التحميل وتغيير المقاس والدخول/الخروج من ملء الشاشة - on load, resize and fullscreen change
  useLayoutEffect(() => {
    const update = () => setFit(fitToWindow());
    update();
    window.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <div
        className="absolute origin-top-left"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          left: fit?.left ?? 0,
          top: fit?.top ?? 0,
          transform: `scale(${fit?.scale ?? 1})`,
          // مخفي لحد ما المقاس يتحسب عشان ميرعشش - hidden until the scale is known, so it never jumps
          visibility: fit ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
