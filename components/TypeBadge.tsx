// نوع الخشب: أيقونة صغيرة (SVG مسطح) + الاسم بلونه، من production.types في الكونفج. نوع مش معروف = نقطة رمادي
// وكمان ستايل الشريحة الخضرا بتاعة الفرن والغرفة (نفس أخضر "شغالة")
// A wood type: a small flat SVG icon + the name in its color, from production.types in the config. Unknown = a gray dot.
// Also the green chip style for the kiln and room (the same green as "شغالة")

import { CSSProperties } from "react";
import { dashboardConfig } from "@/config/dashboard.config";
import { TypeIconName } from "@/lib/types";

// شريحة الفرن / الغرفة الخضرا - the green kiln / room chip
export const GREEN_CHIP = "rounded-lg border border-[#22c55e55] bg-[#12351f] text-[#4ade80] font-bold whitespace-nowrap";

// توحيد الحروف عشان "مانجو" = "مانجا" و"جوافه" = "جوافة" - normalize letters so spellings match
const norm = (text: string) =>
  text
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");

export function typeStyle(label: string): { color: string; icon: TypeIconName | null } {
  const key = norm(label || "");
  const found = key
    ? dashboardConfig.production.types.find((t) => [t.label, ...(t.aliases ?? [])].some((n) => norm(n) === key))
    : undefined;
  return found ? { color: found.color, icon: found.icon ?? null } : { color: dashboardConfig.production.defaultTypeColor, icon: null };
}

// الأيقونات (viewBox 24×24) - the icons
export function TypeIcon({ label, size = 22, className = "" }: { label: string; size?: number; className?: string }) {
  const { color, icon } = typeStyle(label);
  const common = { width: size, height: size, viewBox: "0 0 24 24", className: `shrink-0 ${className}`, "aria-hidden": true } as const;
  switch (icon) {
    case "orange":
      return (
        <svg {...common}>
          <circle cx="12" cy="13.5" r="8.5" fill="#F97316" />
          <circle cx="9" cy="10.5" r="2.4" fill="#FDBA74" opacity="0.7" />
          <circle cx="14.5" cy="16" r="0.7" fill="#C2410C" />
          <circle cx="11" cy="17.5" r="0.6" fill="#C2410C" />
          <path d="M12 5.2 V3.2" stroke="#7C4A1E" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12.3 4.6 C14 2.2 17.4 2 19 3.2 C17.6 5.4 14.6 6 12.3 4.6 Z" fill="#22C55E" />
        </svg>
      );
    case "mango":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="type-mango" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FDE047" />
              <stop offset="1" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
          <path d="M7.5 7.5 C11 4 18.5 5.5 19.6 11.5 C20.6 17 16 21.2 10.8 20.6 C5.4 20 3.6 14 5.2 10.6 C5.8 9.2 6.6 8.3 7.5 7.5 Z" fill="url(#type-mango)" />
          <ellipse cx="10" cy="11" rx="2" ry="1.3" fill="#FEF9C3" opacity="0.7" transform="rotate(-30 10 11)" />
          <path d="M8.2 7.1 L7.2 4.4" stroke="#7C4A1E" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M7.6 5 C9 2.4 12.4 2.2 13.8 3.4 C12.2 5.6 9.6 6 7.6 5 Z" fill="#22C55E" />
        </svg>
      );
    case "guava":
      return (
        <svg {...common}>
          {/* الجوافة كاملة (خضرا) ونصها مقطوع (وردي ببذور) - the whole guava (green) and a cut half (pink with seeds) */}
          <circle cx="9" cy="12" r="7" fill="#A3E635" />
          <circle cx="7" cy="9.5" r="1.8" fill="#D9F99D" opacity="0.8" />
          <circle cx="15.5" cy="14" r="6.5" fill="#84CC16" />
          <circle cx="15.5" cy="14" r="5.3" fill="#FB7185" />
          <circle cx="15.5" cy="14" r="2.4" fill="#FDA4AF" />
          {[
            [13.6, 12.6], [17.4, 12.4], [13.4, 15.6], [17.6, 15.8], [15.5, 11.2], [15.5, 16.9],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#FFF1F2" />
          ))}
          <path d="M9 5 C10 3 12.4 2.8 13.4 3.6 C12.2 5.2 10.4 5.6 9 5 Z" fill="#16A34A" />
        </svg>
      );
    case "grill":
      return (
        <svg {...common}>
          {/* شواية بنار (الجازورينا للشوي) - a grill with a flame (جازورينا is for grilling) */}
          <path d="M12 2.2 C13.8 4.2 14.6 5.8 13.6 7.6 C13.2 6.6 12.6 6.2 12 6 C12.4 7.4 11.6 8.4 10.6 8.6 C9.6 7.2 10.2 5 12 2.2 Z" fill="#F97316" />
          <path d="M12 5.2 C12.9 6.4 12.9 7.6 12 8.4 C11.2 7.6 11.2 6.4 12 5.2 Z" fill="#FACC15" />
          <path d="M3.5 10 H20.5" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6 10 V9 M9 10 V9 M12 10 V9 M15 10 V9 M18 10 V9" stroke="#9CA3AF" strokeWidth="1" />
          <path d="M4 11 H20 C20 15 16.4 17.6 12 17.6 C7.6 17.6 4 15 4 11 Z" fill="#374151" />
          <path d="M5.2 12.4 C6 14.6 8.6 16.2 12 16.2" stroke="#22C55E" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <path d="M8 17 L6 21.5 M16 17 L18 21.5 M12 17.6 V21.5" stroke="#6B7280" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6" fill={color} />
        </svg>
      );
  }
}

// الأيقونة + الاسم بلونه - the icon + the name in its color
export function TypeBadge({
  label,
  iconSize = 22,
  className = "",
  style,
}: {
  label: string;
  iconSize?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { color } = typeStyle(label);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`} style={{ color, ...style }}>
      <TypeIcon label={label} size={iconSize} />
      {label || "غير محدد"}
    </span>
  );
}
