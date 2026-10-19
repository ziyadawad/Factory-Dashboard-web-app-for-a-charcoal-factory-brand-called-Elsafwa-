"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";

interface PageNavProps {
  pages: { id: string; title: string }[];
  current: number;
  onChange: (index: number) => void;
}

// سهمين التنقل بين الصفحات (اسم الصفحة في نص الهيدر) - page navigation arrows (page title is in the header center) (RTL: next is on the left, previous on the right)
export default function PageNav({ pages, current, onChange }: PageNavProps) {
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
    </div>
  );
}
