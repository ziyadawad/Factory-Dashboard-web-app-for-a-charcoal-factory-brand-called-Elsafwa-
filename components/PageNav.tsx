"use client";

import { ChevronDown, ChevronUp, Pin } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";

interface PageNavProps {
  pages: { id: string; title: string }[];
  current: number;
  // direction: 1 = الجاية (من تحت)، -1 = اللي فاتت (من فوق) - 1 = next (from below), -1 = previous (from above)
  onChange: (index: number, direction: 1 | -1) => void;
  // تثبيت الصفحة: التقليب التلقائي واقف والأسهم لسه شغالة - pin: auto-rotation stopped, the arrows still work
  pinned: boolean;
  onTogglePin: () => void;
}

// أسهم التنقل بين الصفحات فوق بعض (▲ اللي فاتت، ▼ الجاية، وبتلف) وجنبها زرار التثبيت
// Page navigation arrows stacked (▲ previous, ▼ next, wrapping around) with the pin button beside them
export default function PageNav({ pages, current, onChange, pinned, onTogglePin }: PageNavProps) {
  const sizes = dashboardConfig.sizes.pageNav;
  const count = pages.length;
  if (count < 2) return null;

  const go = (step: 1 | -1) => onChange((current + step + count) % count, step);
  const buttonClass =
    "p-1 rounded-lg text-gray-300 hover:bg-cardBorder hover:text-white transition-colors";
  const arrowSize = sizes.iconSize;
  const arrowClass =
    "px-1.5 py-0.5 leading-none text-gray-300 hover:bg-cardBorder hover:text-white transition-colors";

  return (
    <div className="flex items-center gap-1 bg-background px-1.5 py-1 rounded-xl border border-cardBorder">
      {/* كبسولة طولي: ▲ فوق و▼ تحت - vertical pill: ▲ on top, ▼ below */}
      <div className="flex flex-col items-center rounded-lg border border-cardBorder overflow-hidden">
        <button onClick={() => go(-1)} className={arrowClass} title="الصفحة اللي فاتت" aria-label="الصفحة اللي فاتت">
          <ChevronUp style={{ width: arrowSize, height: arrowSize }} />
        </button>
        <span className="h-px w-full bg-cardBorder" aria-hidden />
        <button onClick={() => go(1)} className={arrowClass} title="الصفحة الجاية" aria-label="الصفحة الجاية">
          <ChevronDown style={{ width: arrowSize, height: arrowSize }} />
        </button>
      </div>

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
