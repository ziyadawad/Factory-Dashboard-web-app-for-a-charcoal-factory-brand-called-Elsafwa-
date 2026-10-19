"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";

interface PageNavProps {
  pages: { id: string; title: string }[];
  current: number;
  onChange: (index: number) => void;
}

// أزرار التنقل بين الصفحات - page navigation (RTL: next is on the left, previous on the right)
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

      <div className="flex flex-col items-center gap-1 px-1 min-w-[72px]">
        <span className="text-gray-300 whitespace-nowrap leading-none" style={{ fontSize: `${sizes.titleFontSize}px` }}>
          {pages[current].title}
        </span>
        <div className="flex items-center gap-1">
          {pages.map((page, index) => (
            <button
              key={page.id}
              onClick={() => onChange(index)}
              title={page.title}
              className={`rounded-full transition-colors ${
                index === current ? "bg-brandOrange" : "bg-cardBorder hover:bg-gray-500"
              }`}
              style={{ width: sizes.dotSize, height: sizes.dotSize }}
            />
          ))}
        </div>
      </div>

      <button onClick={() => go(1)} className={buttonClass} title="الصفحة التالية">
        <ChevronLeft style={{ width: sizes.iconSize, height: sizes.iconSize }} />
      </button>
    </div>
  );
}
