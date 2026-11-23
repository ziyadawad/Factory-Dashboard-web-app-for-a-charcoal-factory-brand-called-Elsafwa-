"use client";

// مشهد الميزان في "آخر وزنة" (SVG مسطح زي رسمة الفرن والترول): بسكول أرضي واطي بلوح أحمر وإطار أصفر ورجول
// صغيرة، وجنبه عمود أصفر عليه شاشة "VS VENESIA SCALE" سودا بأرقام حمرا (7 segments) ولمبات صغيرة، والترول واقف
// على البسكول ومكتوب عليه رقمه.
// الحركة لفة ورا لفة على طول (production.scaleLoopSeconds): الترول بينزل على البسكول بنطة صغيرة، البسكول بينزل شوية،
// الأرقام بتعد من 0 للوزن وبترمش مرتين، ثانيتين واقف، وبعدين الترول بيطلع والشاشة ترجع 0 واللفة تتعاد. وزنة جديدة =
// اللفة بتبدأ من الأول على طول بالترول والوزن الجديد. الحركة من CSS، والأرقام ماشية مع كل لفة (animationiteration).
// prefers-reduced-motion = مشهد ثابت (الترول على البسكول والوزن ظاهر)
// The animation loops all the time (production.scaleLoopSeconds): the trolley drops onto the platform, the platform
// dips, the digits count 0 -> weight and blink twice, a 2 s hold, then the trolley lifts off, the screen returns to 0
// and it repeats. A new weighing restarts the loop at once. Motion is CSS; the digits follow each loop
// (animationiteration). prefers-reduced-motion = a static scene (trolley on the platform, weight shown)
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { dashboardConfig } from "@/config/dashboard.config";
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
  const loopMs = dashboardConfig.production.scaleLoopSeconds * 1000;
  const [shown, setShown] = useState<number | null>(target);
  const [blink, setBlink] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const frame = useRef(0);

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(frame.current);
  }, []);

  // لفة واحدة للأرقام (بتبدأ مع كل لفة للترول): 0، وبعد ما ينزل بتعد للوزن (ثانية) وبترمش، وتفضل لحد ما يطلع وترجع 0
  // One digits loop (started with each trolley loop): 0, count up to the weight after the drop (1 s), blink, hold,
  // back to 0 when the trolley lifts off. Fractions of the loop match the CSS keyframes
  const runLoop = useCallback(() => {
    stop();
    setBlink(false);
    if (target === null) {
      setShown(null);
      return;
    }
    setShown(0);
    const at = (fraction: number, fn: () => void) => timers.current.push(setTimeout(fn, fraction * loopMs));
    at(1.1 / 6.5, () => {
      let start = 0;
      const countMs = Math.min(1000, loopMs * 0.15);
      const step = (now: number) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / countMs);
        setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    });
    at(2.15 / 6.5, () => setBlink(true));
    at(2.85 / 6.5, () => setBlink(false));
    at(4.9 / 6.5, () => setShown(0));
  }, [target, loopMs, stop]);

  // وزنة جديدة: اللفة بتبدأ من الأول (الـ key بيعيد الـ CSS، والأرقام من onAnimationStart). من غير حركة: الوزن ثابت
  // A new weighing restarts the loop (the key restarts the CSS; digits via onAnimationStart). Reduced motion: static weight
  useEffect(() => {
    if (reducedMotion()) {
      stop();
      setBlink(false);
      setShown(target);
    }
    return stop;
  }, [playKey, target, stop]);

  // 4 خانات من اليمين، والفاضي مطفي - 4 cells right-aligned, empty ones dark
  const text = shown === null ? "" : String(Math.min(9999, shown));
  const cells = Array.from({ length: 4 }, (_, i) => text[text.length - 4 + i] ?? null);

  return (
    <svg
      viewBox="0 0 300 190"
      className={className}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={`الميزان: ${target ?? "—"} كجم`}
      style={{ "--scale-loop": `${dashboardConfig.production.scaleLoopSeconds}s` } as CSSProperties}
    >
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
      <g key={`dip-${playKey}`} className="scale-platform-loop">
        <g key={`drop-${playKey}`} className="scale-trolley-loop" onAnimationStart={runLoop} onAnimationIteration={runLoop}>
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
