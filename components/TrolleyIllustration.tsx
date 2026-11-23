// رسمة الترول (SVG، نفس الستايل المسطح بتاع رسمة الفرن): صندوق صاج طويل غامق ومستعمل شوية، ضلوع رأسية،
// حافة فوق أفتح، فحم ونشارة على الحافة، ورجلين وزلاقة تحت. بتكبر وتصغر مع المكان (viewBox).
// waiting = ترول لسه مجاش: إطار متقطع كهرماني بس. highlight = الترول الجديد وقت التنبيه (إطار برتقالي)
// The trolley drawing (SVG, flat like the kiln drawing): a tall dark, slightly worn steel box with vertical ribs, a
// lighter top rim, charcoal and sawdust on the rim, feet and a skid at the bottom. Scales with its box (viewBox).
// waiting = a trolley still to come: a dashed amber outline only. highlight = the new trolley during an alert

const RIBS = [22, 34, 46, 58, 70, 82, 94];

export default function TrolleyIllustration({
  waiting = false,
  highlight = false,
  className = "",
  place,
}: {
  waiting?: boolean;
  highlight?: boolean;
  className?: string;
  // مكانها جوه SVG تاني (زي مشهد الميزان) - its position inside another SVG (e.g. the scale scene)
  place?: { x: number; y: number; width: number; height: number };
}) {
  if (waiting) {
    return (
      <svg viewBox="0 0 120 150" className={className} preserveAspectRatio="xMidYMax meet" aria-hidden {...place}>
        <g fill="none" stroke="#F59E0B" strokeOpacity="0.65" strokeWidth="2.5" strokeDasharray="7 6" strokeLinejoin="round">
          <rect x="8" y="20" width="104" height="8" rx="2" />
          <rect x="12" y="28" width="96" height="96" rx="2" />
          <path d="M14 140 H106" strokeLinecap="round" />
          <path d="M22 124 V138 M98 124 V138" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 150" className={className} preserveAspectRatio="xMidYMax meet" aria-hidden {...place}>
      <defs>
        <linearGradient id="trolley-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#23272E" />
          <stop offset="0.45" stopColor="#343A43" />
          <stop offset="1" stopColor="#1E2228" />
        </linearGradient>
      </defs>

      {/* الفحم والنشارة على الحافة - charcoal and sawdust on the rim */}
      <path d="M14 21 L20 13 L27 17 L33 9 L41 15 L48 10 L55 16 L63 8 L70 14 L78 10 L85 15 L93 9 L100 16 L106 21 Z" fill="#111317" />
      <path d="M24 19 L30 14 L35 19 Z M58 19 L64 12 L70 19 Z M86 19 L92 13 L97 19 Z" fill="#2A2E35" />
      {[
        [18, 19], [26, 20], [38, 18], [45, 20], [52, 19], [61, 20], [74, 18], [81, 20], [89, 19], [99, 20], [104, 19],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#B08850" opacity="0.85" />
      ))}

      {/* الحافة اللي فوق (أفتح) - the top rim (lighter) */}
      <rect x="8" y="20" width="104" height="8" rx="2" fill="#5B6370" />
      <rect x="8" y="20" width="104" height="2.5" rx="1.2" fill="#7A8391" />

      {/* الجسم والضلوع - the body and ribs */}
      <rect x="12" y="28" width="96" height="96" fill="url(#trolley-body)" />
      {RIBS.map((x) => (
        <g key={x}>
          <rect x={x - 2.5} y="30" width="5" height="92" fill="#191C21" />
          <rect x={x + 2.5} y="30" width="1.4" height="92" fill="#454C57" />
        </g>
      ))}
      {/* استعمال: خدوش وصدا خفيف - wear: scratches and light rust */}
      <path d="M28 52 l9 -3 M64 88 l12 -4 M40 104 l7 2" stroke="#59606B" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="86" cy="62" rx="5" ry="3" fill="#6B4A2E" opacity="0.35" />
      <ellipse cx="30" cy="96" rx="4" ry="2.5" fill="#6B4A2E" opacity="0.3" />

      {/* الحزام اللي تحت، والرجلين، والزلاقة - the bottom band, feet and skid */}
      <rect x="10" y="120" width="100" height="6" rx="1.5" fill="#454C57" />
      <rect x="18" y="126" width="14" height="10" fill="#1A1D22" />
      <rect x="88" y="126" width="14" height="10" fill="#1A1D22" />
      <rect x="12" y="136" width="96" height="5" rx="2.5" fill="#4B525D" />

      {highlight && <rect x="5" y="5" width="110" height="140" rx="8" fill="none" stroke="#FF7A00" strokeWidth="3.5" />}
    </svg>
  );
}
