"use client";

import { Delete } from "lucide-react";

// لوحة أرقام كبيرة (من غير كيبورد الموبايل) - a big on-screen number pad (no phone keyboard)
export default function Keypad({
  value,
  onChange,
  maxLength = 5,
  disabled = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  compact?: boolean; // أزرار أقصر لما الشاشة فيها حاجات كتير - shorter keys when the screen is busy
}) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === "back") return onChange(value.slice(0, -1));
    if (key === "clear") return onChange("");
    if (value.length >= maxLength) return;
    // من غير أصفار في الأول - no leading zeros
    onChange(value === "0" ? key : value + key);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  return (
    // الأرقام من الشمال لليمين زي أي تليفون - digits laid out left to right like any phone
    <div dir="ltr" className={`grid grid-cols-3 w-full ${compact ? "gap-2.5" : "gap-3"}`}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => press(key)}
          className={`${compact ? "h-[54px]" : "h-[64px]"} rounded-2xl border text-[28px] font-bold font-numbers transition-colors active:scale-[0.97] disabled:opacity-40 select-none ${
            key === "clear" || key === "back"
              ? "bg-background/60 border-cardBorder text-gray-300 text-[18px]"
              : "bg-card border-cardBorder text-white hover:bg-cardBorder"
          }`}
          aria-label={key === "back" ? "امسح رقم" : key === "clear" ? "امسح الكل" : key}
        >
          {key === "back" ? <Delete className="mx-auto" size={26} /> : key === "clear" ? "مسح" : key}
        </button>
      ))}
    </div>
  );
}
