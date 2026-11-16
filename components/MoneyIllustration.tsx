"use client";

import { useId } from "react";

// رسمة فلوس (SVG، من غير صور ولا عملة حقيقية): رزمة ورق أخضر مفرودة شوية وقدامها عملات دهب
// بتطفو بالراحة، ولمعة دهب بتعدي على العملات كل ~6 ثواني. red = المنصرف أكتر من الوارد (الورق بيميل للأحمر)
// A money drawing (inline SVG, no photos, no real currency): a slightly fanned stack of green notes with gold coins
// in front; a slow float and a gold shine across the coins every ~6 s. red = outgoing > incoming (notes tint red)
export default function MoneyIllustration({ red = false, className = "", style }: { red?: boolean; className?: string; style?: React.CSSProperties }) {
  const id = useId().replace(/:/g, "");
  const note = `note-${id}`;
  const coin = `coin-${id}`;
  const coinsClip = `coins-${id}`;
  // ورقة: مستطيل مدور بإطار وميدالية في النص - one note: a rounded rectangle with a border and a medallion
  const Note = ({ rotate, dx, dy, top = false }: { rotate: number; dx: number; dy: number; top?: boolean }) => (
    <g transform={`translate(${dx} ${dy}) rotate(${rotate} 80 52)`}>
      <rect x="22" y="26" width="116" height="56" rx="7" fill={`url(#${note})`} stroke="#0F5132" strokeWidth="1.2" />
      <rect x="27" y="31" width="106" height="46" rx="5" fill="none" stroke="#BBF7D0" strokeOpacity="0.45" strokeWidth="1" />
      {red && <rect x="22" y="26" width="116" height="56" rx="7" fill="#EF4444" opacity="0.28" />}
      {top && (
        <>
          <circle cx="80" cy="54" r="14" fill="#DCFCE7" fillOpacity="0.22" stroke="#DCFCE7" strokeOpacity="0.55" />
          <text x="80" y="59.5" textAnchor="middle" fontSize="15" fontWeight={800} fill="#F0FDF4">
            £
          </text>
          <text x="40" y="44" textAnchor="middle" fontSize="9" fontWeight={800} fill="#F0FDF4" opacity="0.9">
            ج.م
          </text>
          <text x="120" y="72" textAnchor="middle" fontSize="9" fontWeight={800} fill="#F0FDF4" opacity="0.9">
            ج.م
          </text>
        </>
      )}
    </g>
  );
  const coins = [
    { cx: 46, cy: 92, r: 14 },
    { cx: 112, cy: 94, r: 13 },
    { cx: 78, cy: 98, r: 15 },
  ];
  return (
    <svg viewBox="0 0 160 118" className={className} style={style} role="img" aria-label="فلوس">
      <defs>
        <linearGradient id={note} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="55%" stopColor="#22A55A" />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>
        <radialGradient id={coin} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="45%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#B45309" />
        </radialGradient>
        <clipPath id={coinsClip}>
          {coins.map((c) => (
            <circle key={c.cx} cx={c.cx} cy={c.cy} r={c.r} />
          ))}
        </clipPath>
      </defs>
      {/* ضل تحت - a soft shadow under it */}
      <ellipse cx="80" cy="112" rx="58" ry="5" fill="#000" opacity="0.35" />
      <g className="money-float">
        {/* الورق مفرود شوية - the fanned notes */}
        <Note rotate={-12} dx={-6} dy={4} />
        <Note rotate={-4} dx={-2} dy={0} />
        <Note rotate={5} dx={3} dy={-3} />
        <Note rotate={-1} dx={0} dy={-8} top />
        {/* العملات الدهب قدام - the gold coins in front */}
        {coins.map((c) => (
          <g key={c.cx}>
            <circle cx={c.cx} cy={c.cy + 2} r={c.r} fill="#78350F" opacity="0.6" />
            <circle cx={c.cx} cy={c.cy} r={c.r} fill={`url(#${coin})`} stroke="#92400E" strokeWidth="1.2" />
            <circle cx={c.cx} cy={c.cy} r={c.r - 4} fill="none" stroke="#FDE68A" strokeOpacity="0.8" strokeWidth="1" />
            <text x={c.cx} y={c.cy + 4} textAnchor="middle" fontSize={c.r * 0.85} fontWeight={800} fill="#92400E" opacity="0.75">
              £
            </text>
          </g>
        ))}
        {/* لمعة دهب بتعدي على العملات - a gold shine sweeping across the coins */}
        <g clipPath={`url(#${coinsClip})`}>
          <rect className="money-shine" x="20" y="70" width="14" height="50" fill="#FFFBEB" opacity="0" transform="skewX(-20)" />
        </g>
      </g>
    </svg>
  );
}
