"use client";

import { useId } from "react";

// رسمة عربية سوزوكي سوبر كاري البيضا من قدام (SVG مسطح زي رسمة الفرن والترول): كابينة بيضا مربعة بسقف مدوّر، زجاج
// قدامي غامق بمساحة واحدة، فانوسين مربعين، اكصدام أسود، علامة "S" صغيرة، ولوحة أرقام مصري تحت. رقم العربية مرسوم كبير
// على مقدمة السقف بلون الخط. بتكبر وتصغر مع المكان (viewBox)
// The white Suzuki Super Carry seen from the front (flat SVG like the kiln and trolley drawings): a boxy white cab with
// a rounded roof, a big dark windscreen with one wiper, two square headlights, a black bumper, a small "S" emblem and
// an Egyptian number plate. The van number is painted big on the front of the roof in the route color
// driving = المندوب بصم النهارده: الفوانيس منورة وشعاع خفيف قدام، رعشة موتور خفيفة، خطوط طريق بتتحرك وتراب ورا الكاوتش.
// flash = البصمة لسه جاية: الفوانيس بتنوّر مرتين قبل ما تبدأ تمشي. من غير driving = العربية زي ما هي بالظبط.
// (CSS transform / opacity بس، و"حركة أقل" = عربية منورة واقفة)
// driving = the rep punched today: headlights on with soft beams, a gentle engine shake, moving road lines and dust by
// the tyres. flash = the punch just arrived: the headlights flash twice before driving. Without driving the van is
// exactly as before. (CSS transform / opacity only; reduced motion = a lit, still van)
export default function VanIllustration({ number, color, title, width = 90, driving = false, flash = false }: {
  number: string; color: string; title?: string; width?: number; driving?: boolean; flash?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const lit = driving || flash;
  return (
    <svg
      viewBox="0 0 120 112"
      width={width}
      height={(width * 112) / 120}
      role="img"
      aria-label={title}
      className={`shrink-0 ${driving ? "van-driving" : ""} ${flash ? "van-flash" : ""}`}
      style={lit ? { overflow: "visible" } : undefined}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D9DEE5" />
          <stop offset="0.18" stopColor="#F8FAFC" />
          <stop offset="0.82" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#CBD2DB" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#334155" />
          <stop offset="1" stopColor="#0B1220" />
        </linearGradient>
        {lit && (
          <>
            <radialGradient id={`${id}-glow`}>
              <stop offset="0" stopColor="#FFF7D6" stopOpacity="1" />
              <stop offset="0.35" stopColor="#FDE68A" stopOpacity="0.85" />
              <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FDE68A" stopOpacity="0.55" />
              <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
            </linearGradient>
          </>
        )}
      </defs>

      {/* ماشية: خطوط الطريق بتقرب وتختفي، وتراب ورا الكاوتش - driving: road dashes coming closer and fading, dust by the tyres */}
      {driving && (
        <g aria-hidden>
          {[0, 1, 2].map((i) => (
            <rect key={i} className={`van-road van-road-${i}`} x="58.5" y="106" width="3" height="5" rx="1" fill="#9CA3AF" />
          ))}
          <circle className="van-dust van-dust-0" cx="10" cy="104" r="3.5" fill="#B8A98F" />
          <circle className="van-dust van-dust-1" cx="110" cy="104" r="3.5" fill="#B8A98F" />
          <circle className="van-dust van-dust-2" cx="6" cy="106" r="2.5" fill="#C9BCA4" />
          <circle className="van-dust van-dust-3" cx="114" cy="106" r="2.5" fill="#C9BCA4" />
        </g>
      )}

      {/* رعشة الموتور على جسم العربية بس (الظل والطريق ثابتين) - the engine shake on the body only (shadow and road stay) */}
      <g className={driving ? "van-shake" : undefined}>

      {/* ظل تحت العربية - the shadow under the van */}
      <ellipse cx="60" cy="107" rx="50" ry="4" fill="#000" opacity="0.35" />
      {/* الكاوتش - the tyres */}
      <rect x="15" y="88" width="14" height="18" rx="3" fill="#111318" />
      <rect x="91" y="88" width="14" height="18" rx="3" fill="#111318" />
      {/* المرايات - the side mirrors */}
      <rect x="3" y="40" width="7" height="12" rx="2" fill="#1F2937" />
      <rect x="110" y="40" width="7" height="12" rx="2" fill="#1F2937" />
      <path d="M10 46 H13 M107 46 H110" stroke="#9CA3AF" strokeWidth="2" />

      {/* الكابينة البيضا بسقف مدوّر - the white cab with a rounded roof */}
      <path d="M12 30 Q12 10 32 9 H88 Q108 10 108 30 V88 Q108 92 104 92 H16 Q12 92 12 88 Z" fill={`url(#${id}-body)`} stroke="#94A3B8" strokeWidth="1.2" />
      {/* رقم العربية على مقدمة السقف بلون الخط - the van number on the front of the roof in the route color */}
      <rect x="40" y="10.5" width="40" height="23" rx="6" fill={color} opacity="0.16" />
      <text x="60" y="31" textAnchor="middle" fontSize="23" fontWeight={900} fill={color} stroke="#FFFFFF" strokeWidth="0.6" fontFamily="Cairo, sans-serif">
        {number}
      </text>

      {/* الزجاج القدامي ومساحة واحدة - the windscreen and one wiper */}
      <path d="M19 37 Q19 34 22 34 H98 Q101 34 101 37 L98 62 Q97.5 64 95 64 H25 Q22.5 64 22 62 Z" fill={`url(#${id}-glass)`} />
      <path d="M30 38 L46 38 L34 60 L22 60 Z" fill="#FFFFFF" opacity="0.08" />
      <path d="M40 62 L74 50" stroke="#0A0A0A" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="40" cy="62" r="1.8" fill="#0A0A0A" />

      {/* الفوانيس المربعة والإشارات - the square headlights and indicators */}
      <rect x="16" y="68" width="16" height="12" rx="2" fill="#475569" />
      <rect x="18" y="70" width="12" height="8" rx="1.5" fill="#FEF3C7" />
      <rect x="88" y="68" width="16" height="12" rx="2" fill="#475569" />
      <rect x="90" y="70" width="12" height="8" rx="1.5" fill="#FEF3C7" />
      <rect x="18" y="81.5" width="8" height="3" rx="1" fill="#F59E0B" />
      <rect x="94" y="81.5" width="8" height="3" rx="1" fill="#F59E0B" />
      {/* الشبكة وعلامة سوزوكي "S" - the grille and the Suzuki "S" emblem */}
      <path d="M36 71 H84 M36 75 H84" stroke="#CBD5E1" strokeWidth="1.2" />
      <rect x="54" y="67" width="12" height="12" rx="2.5" fill="#E5E7EB" stroke="#94A3B8" strokeWidth="0.8" />
      <text x="60" y="76.5" textAnchor="middle" fontSize="10" fontWeight={900} fontStyle="italic" fill="#DC2626" fontFamily="Arial, sans-serif">
        S
      </text>

      {/* الاكصدام الأسود - the black bumper */}
      <rect x="9" y="86" width="102" height="8" rx="3" fill="#111827" />
      {/* لوحة الأرقام المصري: شريط أزرق فوق مكتوب فيه مصر - the Egyptian plate: a blue band on top reading مصر */}
      <rect x="39" y="88" width="42" height="17" rx="2" fill="#FFFFFF" stroke="#1F2937" strokeWidth="0.8" />
      <rect x="39" y="88" width="42" height="5" rx="1.5" fill="#2563EB" />
      <text x="60" y="92.2" textAnchor="middle" fontSize="4" fontWeight={700} fill="#FFFFFF" fontFamily="Cairo, sans-serif">
        مصر
      </text>
      <text x="60" y="102" textAnchor="middle" fontSize="6.5" fontWeight={800} fill="#111827" fontFamily="Cairo, sans-serif" direction="rtl">
        {`ن ق ل ${number.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])}`}
      </text>

      {/* الفوانيس منورة: هالة صفرا وشعاع خفيف نازل قدام على الأرض - headlights on: a warm halo and soft beams to the ground */}
      {lit && (
        <g className="van-lights" aria-hidden>
          <path d="M18 80 L4 122 L44 122 L30 80 Z" fill={`url(#${id}-beam)`} />
          <path d="M90 80 L76 122 L116 122 L102 80 Z" fill={`url(#${id}-beam)`} />
          <circle cx="24" cy="74" r="13" fill={`url(#${id}-glow)`} />
          <circle cx="96" cy="74" r="13" fill={`url(#${id}-glow)`} />
          <rect x="18" y="70" width="12" height="8" rx="1.5" fill="#FFFBEB" />
          <rect x="90" y="70" width="12" height="8" rx="1.5" fill="#FFFBEB" />
        </g>
      )}
      </g>
    </svg>
  );
}
