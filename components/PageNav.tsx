"use client";

import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";

interface PageNavProps {
  pages: { id: string; title: string }[];
  current: number;
  onChange: (index: number) => void;
  // تثبيت الصفحة: التقليب التلقائي واقف والأسهم لسه شغالة - pin: auto-rotation stopped, the arrows still work
  pinned: boolean;
  onTogglePin: () => void;
}

// سهمين التنقل بين الصفحات (اسم الصفحة في نص الهيدر) - page navigation arrows (page title is in the header center) (RTL: next is on the left, previous on the right)
export default function PageNav({ pages, current, onChange, pinned, onTogglePin }: PageNavProps) {
  const sizes = dashboardConfig.sizes.pageNav;
  const count = pages.length;
  if (count < 2) return null;

  const go = (step: number) => onChange((current + step + count) % count);
  const buttonClass =
    "p-1 rounded-lg text-gray-300 hover:bg-cardBorder hover:text-white transition-colors";

  return (
    <div className="flex items-center gap-1 bg-background px-1.5 py-1 rounded-xl border border-cardBorder">
      <button onClick={() => go(-1)} className={buttonClass} title="الصفحة السابقة">
        <ChevronRight style={{ width: sizes.iconSize, height: sizes.iconSize }} />
      </button>

      <button onClick={() => go(1)} className={buttonClass} title="الصفحة التالية">
        <ChevronLeft style={{ width: sizes.iconSize, height: sizes.iconSize }} />
      </button>

      {/* زرار التثبيت: برتقالي وهو شغال - pin button, orange while active */}
      <button
        onClick={onTogglePin}
        className={
          pinned
            ? "p-1 rounded-lg bg-brandOrange/20 text-brandOrange shadow-[0_0_10px_rgba(255,122,0,0.35)] hover:bg-brandOrange/30 transition-colors"
            : buttonClass
        }
        title={pinned ? "إلغاء التثبيت (يرجع يقلب)" : "ثبّت الصفحة"}
        aria-pressed={pinned}
      >
        <Pin className={pinned ? "fill-current" : ""} style={{ width: sizes.iconSize, height: sizes.iconSize }} />
      </button>
    </div>
  );
}
