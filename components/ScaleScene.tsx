"use client";

// مشهد الميزان في "آخر وزنة" (SVG مسطح زي رسمة الفرن والترول): بسكول أرضي واطي بلوح أحمر وإطار أصفر ورجول
// صغيرة، وجنبه عمود أصفر عليه شاشة "VS VENESIA SCALE" سودا بأرقام حمرا (7 segments) ولمبات صغيرة، والترول واقف
// على البسكول ومكتوب عليه رقمه.
// الحركة (كل وزنة جديدة، ومرة أول ما الصفحة تفتح): الترول بينزل على البسكول (0.8 ثانية بنطة صغيرة)، والبسكول بينزل
// شوية، وبعدين الأرقام بتعد من 0 للوزن (ثانية) وبترمش مرتين. وهو واقف: الشاشة بتنور نور خفيف.
// prefers-reduced-motion = من غير حركة (الوزن بيظهر على طول)
// The scale scene in "آخر وزنة" (flat SVG like the kiln and trolley drawings): a low platform scale (red plate,
// yellow frame, small feet), a yellow pole with the black "VS VENESIA SCALE" indicator (red 7-segment digits, small
// lights), and the trolley standing on the platform with its number. Animation (each new weighing, and once on load):
// the trolley drops onto the platform (0.8 s, small bounce), the platform dips, the digits count up from 0 (1 s) and
// blink twice. Idle: a soft glow on the screen. prefers-reduced-motion = no motion (the weight shows at once)

import { useEffect, useState } from "react";
import TrolleyIllustration from "./TrolleyIllustration";

// الـ 7 segments لكل رقم - the 7 segments of each digit
const SEGMENTS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcfgd",
};
const ON = "#FF3B30";
const OFF = "#3A0D0D";

function Digit({ x, y, ch }: { x: number; y: number; ch: string | null }) {
  const w = 11;
  const h = 21;
  const t = 2.4;
  const half = h / 2;
  const rects: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, half - t],
    c: [x + w - t, y + half, t, half - t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + half, t, half - t],
    f: [x, y + t, t, half - t],
    g: [x + t, y + half - t / 2, w - 2 * t, t],
  };
  const lit = ch ? SEGMENTS[ch] ?? "" : "";
  return (
    <g>
      {Object.entries(rects).map(([seg, [rx, ry, rw, rh]]) => (
        <rect key={seg} x={rx} y={ry} width={rw} height={rh} rx={0.9} fill={lit.includes(seg) ? ON : OFF} />
      ))}
    </g>
  );
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function ScaleScene({
  playKey,
  weightKg,
  trolley,
  className = "",
}: {
  playKey: string | null; // بيتغير مع كل وزنة جديدة = الحركة بتتعاد - changes with each new weighing = the animation replays
  weightKg: number | null;
  trolley: string;
  className?: string;
}) {
  const target = weightKg === null ? null : Math.round(weightKg);
  const [shown, setShown] = useState<number | null>(target);
  const [blink, setBlink] = useState(false);

  // الأرقام: بعد ما الترول ينزل بتعد من 0 للوزن وبعدين بترمش مرتين - the digits count up after the drop, then blink twice
  useEffect(() => {
    setBlink(false);
    if (target === null || reducedMotion()) {
      setShown(target);
      return;
    }
    setShown(0);
    let frame = 0;
    let start = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / 1000);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
      else {
        setBlink(true);
        timers.push(setTimeout(() => setBlink(false), 700));
      }
    };
    timers.push(setTimeout(() => (frame = requestAnimationFrame(step)), 1100));
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
    };
  }, [playKey, target]);

  // 4 خانات من اليمين، والفاضي مطفي - 4 cells right-aligned, empty ones dark
  const text = shown === null ? "" : String(Math.min(9999, shown));
  const cells = Array.from({ length: 4 }, (_, i) => text[text.length - 4 + i] ?? null);

  return (
    <svg viewBox="0 0 300 190" className={className} preserveAspectRatio="xMidYMax meet" role="img" aria-label={`الميزان: ${text || "—"} كجم`}>
      {/* ضل على الأرض - floor shadow */}
      <ellipse cx="150" cy="182" rx="140" ry="6" fill="#000" opacity="0.35" />

      {/* العمود الأصفر والشاشة - the yellow pole and the indicator */}
      <rect x="224" y="174" width="30" height="6" rx="2" fill="#CA8A04" />
      <rect x="235" y="70" width="9" height="106" fill="#FACC15" />
      <rect x="235" y="70" width="3" height="106" fill="#FDE68A" opacity="0.6" />
      <path d="M200 160 C214 160 222 168 236 170" stroke="#1F2937" strokeWidth="2" fill="none" />
      <g>
        <rect x="196" y="18" width="92" height="60" rx="6" fill="#0B0B0D" stroke="#2D2F36" strokeWidth="1.5" />
        <text x="242" y="29" textAnchor="middle" fontSize="7" fontWeight="800" fill="#E5E7EB" fontFamily="Arial, sans-serif" letterSpacing="0.6">
          VS VENESIA SCALE
        </text>
        {/* نور الشاشة وهي واقفة - the idle screen glow */}
        <rect className="scale-screen-idle" x="201" y="33" width="82" height="31" rx="3" fill="#FF3B30" opacity="0.25" filter="url(#scale-blur)" />
        <rect x="203" y="34" width="78" height="29" rx="2.5" fill="#1A0505" />
        <g className={blink ? "scale-digits-blink" : ""}>
          {cells.map((ch, i) => (
            <Digit key={i} x={207 + i * 14} y={38} ch={ch} />
          ))}
          <text x="270" y="58" fontSize="7" fontWeight="700" fill={ON} fontFamily="Arial, sans-serif">
            kg
          </text>
        </g>
        {/* لمبات صغيرة - small lights */}
        <circle cx="208" cy="71" r="2.2" fill="#22C55E" />
        <circle cx="216" cy="71" r="2.2" fill="#EF4444" />
        <circle cx="224" cy="71" r="2.2" fill="#F59E0B" opacity="0.6" />
        <rect x="246" y="68.5" width="34" height="5" rx="2.5" fill="#1F2937" />
      </g>
      <defs>
        <filter id="scale-blur" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* البسكول (بينزل شوية لما الترول يقع عليه) والترول عليه - the platform (dips when the trolley lands) with the trolley */}
      <g key={`dip-${playKey}`} className="scale-platform-dip">
        <g key={`drop-${playKey}`} className="scale-trolley-drop">
          <TrolleyIllustration place={{ x: 64, y: 31, width: 94, height: 118 }} />
          {trolley && (
            <g>
              <rect x="86" y="80" width="50" height="18" rx="4" fill="#0B0B0D" opacity="0.75" />
              <text x="111" y="93.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#FFFFFF" direction="rtl" fontFamily="inherit">
                ترول {trolley}
              </text>
            </g>
          )}
        </g>
        <rect x="18" y="146" width="186" height="16" rx="3" fill="#FACC15" />
        <rect x="18" y="146" width="186" height="3" rx="1.5" fill="#FDE68A" opacity="0.7" />
        <rect x="24" y="141" width="174" height="7" rx="2" fill="#DC2626" />
        <rect x="24" y="141" width="174" height="2" rx="1" fill="#F87171" opacity="0.8" />
        <circle cx="34" cy="166" r="5" fill="#374151" />
        <circle cx="188" cy="166" r="5" fill="#374151" />
        <circle cx="111" cy="166" r="4" fill="#374151" />
      </g>
    </svg>
  );
}
