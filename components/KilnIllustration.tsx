"use client";

import { useId } from "react";

// رسمة فرن (SVG، من غير صور): بيت النار في النص بمدخنة طويلة وباب نار صغير، وعلى يمينه وشماله غرفتين بسقف مقوّس
// وألواح صاج طولية وباب كبير بإطار حديد ومقبضين وترابيس. الحالات: شغالة (نار ودخان) / صيانة / متوقفة
// A kiln drawing (inline SVG, no photos): the center firebox with a tall chimney and a small fire door, two long
// chambers left and right with arched roofs, corrugated panels and a big steel-framed door with two handles and
// latch bars. States: working (fire + smoke) / maintenance / stopped
export type KilnState = "working" | "maintenance" | "stopped";

// ألوان كل حالة: أزرق ملكي، والمتوقفة رمادي - palette per state: royal blue, gray when stopped
const PALETTE = {
  blue: { body: "#2153C9", dark: "#183F9E", deep: "#12317A", line: "#173A8F", light: "#3A6BE0", steel: "#1E293B", steelLine: "#334155", metal: "#CBD5E1" },
  gray: { body: "#4B5563", dark: "#374151", deep: "#1F2937", line: "#3F4753", light: "#6B7280", steel: "#1F2937", steelLine: "#374151", metal: "#9CA3AF" },
};

// غرفة: سقف مقوّس، ألواح صاج، باب بإطار حديد ومقبضين وترابيس - one chamber: arched roof, corrugated panels, framed door
function Chamber({ x, c }: { x: number; c: (typeof PALETTE)["blue"] }) {
  const w = 90;
  const top = 50;
  const base = 128;
  const roof = `M${x} ${base} V${top + 16} Q${x} ${top - 8} ${x + w / 2} ${top - 8} Q${x + w} ${top - 8} ${x + w} ${top + 16} V${base} Z`;
  const ribs = [];
  for (let rx = x + 5; rx < x + w - 2; rx += 6) ribs.push(rx);
  const door = { x: x + 20, y: top + 14, w: w - 40, h: base - top - 16 };
  return (
    <g>
      <path d={roof} fill={c.body} />
      {/* ضل السقف - roof shading */}
      <path d={`M${x} ${top + 16} Q${x} ${top - 8} ${x + w / 2} ${top - 8} Q${x + w} ${top - 8} ${x + w} ${top + 16} Q${x + w / 2} ${top + 2} ${x} ${top + 16} Z`} fill={c.light} opacity={0.55} />
      {/* ألواح الصاج الطولية - corrugated vertical panels */}
      {ribs.map((rx) => (
        <line key={rx} x1={rx} y1={top + 14} x2={rx} y2={base - 1} stroke={c.line} strokeWidth={1.4} />
      ))}
      <rect x={x} y={base - 7} width={w} height={7} fill={c.deep} />
      {/* الباب الكبير بإطار حديد - the big door in a steel frame */}
      <rect x={door.x - 3} y={door.y - 3} width={door.w + 6} height={door.h + 3} rx={2} fill={c.steel} />
      <rect x={door.x} y={door.y} width={door.w} height={door.h} fill={c.dark} />
      <line x1={door.x + door.w / 2} y1={door.y} x2={door.x + door.w / 2} y2={door.y + door.h} stroke={c.steel} strokeWidth={1.6} />
      {/* الترابيس - latch bars */}
      {[0.28, 0.72].map((f) => (
        <rect key={f} x={door.x - 4} y={door.y + door.h * f - 2} width={door.w + 8} height={4} rx={1} fill={c.steelLine} />
      ))}
      {/* المقبضين - the two handles */}
      <rect x={door.x + door.w / 2 - 7} y={door.y + door.h * 0.42} width={3} height={13} rx={1.5} fill={c.metal} />
      <rect x={door.x + door.w / 2 + 4} y={door.y + door.h * 0.42} width={3} height={13} rx={1.5} fill={c.metal} />
    </g>
  );
}

export default function KilnIllustration({ state, label, className = "" }: { state: KilnState; label: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const working = state === "working";
  const c = state === "stopped" ? PALETTE.gray : PALETTE.blue;
  return (
    <svg
      viewBox="0 0 240 140"
      className={`overflow-visible ${className}`}
      style={state === "maintenance" ? { filter: "saturate(0.55)" } : undefined}
      role="img"
      aria-label={working ? "فرن شغال" : state === "maintenance" ? "فرن في الصيانة" : "فرن متوقف"}
    >
      <defs>
        <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF7A00" stopOpacity={0.75} />
          <stop offset="100%" stopColor="#FF7A00" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`fire-${id}`} cx="50%" cy="85%" r="75%">
          <stop offset="0%" stopColor="#FFE08A" />
          <stop offset="45%" stopColor="#FF8A00" />
          <stop offset="100%" stopColor="#D61F1F" />
        </radialGradient>
        <pattern id={`hazard-${id}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill="#111827" />
          <rect width="6" height="12" fill="#FACC15" />
        </pattern>
      </defs>

      {/* توهج برتقالي تحت الفرن الشغال - soft orange glow under a working kiln */}
      {working && <ellipse className="kiln-glow" cx="120" cy="132" rx="118" ry="10" fill={`url(#glow-${id})`} />}

      {/* الجسم (اهتزاز خفيف وهو شغال) - the body (a subtle shimmer while working) */}
      <g className={working ? "kiln-body-hot" : undefined}>
        <Chamber x={2} c={c} />
        <Chamber x={148} c={c} />

        {/* المدخنة - the chimney pipe */}
        <rect x="113" y="6" width="14" height="44" fill={c.steelLine} />
        <rect x="113" y="6" width="5" height="44" fill={c.steel} opacity={0.6} />
        <rect x="110" y="3" width="20" height="6" rx="1.5" fill={c.steel} />

        {/* بيت النار - the firebox */}
        <rect x="94" y="44" width="52" height="84" rx="3" fill={c.dark} />
        <rect x="94" y="44" width="52" height="7" rx="2" fill={c.light} opacity={0.6} />
        <rect x="94" y="121" width="52" height="7" fill={c.deep} />
        {/* باب النار الصغير تحت - the small square fire door near the bottom */}
        <rect x="109" y="96" width="22" height="22" rx="2" fill={c.steel} />
        <rect x="112" y="99" width="16" height="16" rx="1" fill={working ? "#2A0A00" : "#0B1220"} />
        {working && (
          <g>
            <rect className="kiln-glow" x="112" y="99" width="16" height="16" fill={`url(#fire-${id})`} opacity={0.7} />
            <path className="kiln-flame" d="M114 115 Q113 107 117 104 Q117 109 120 108 Q119 103 123 100 Q123 106 126 107 Q127 111 126 115 Z" fill={`url(#fire-${id})`} />
            <path className="kiln-flame kiln-flame-2" d="M116 115 Q116 110 119 108 Q120 111 122 110 Q124 112 124 115 Z" fill="#FFE08A" />
          </g>
        )}

        {/* رقم الفرن على بيت النار - the kiln number badge on the firebox */}
        <rect x="95" y="55" width="50" height="25" rx="5" fill="#0B1220" opacity={0.8} />
        <text x="120" y="73" textAnchor="middle" fontSize="16" fontWeight={800} fill="#FFFFFF" direction="rtl">
          {label}
        </text>

        {/* شريط تحذير أصفر وأسود تحت (صيانة) - yellow/black hazard band across the base (maintenance) */}
        {state === "maintenance" && <rect x="2" y="122" width="236" height="8" fill={`url(#hazard-${id})`} />}
      </g>

      {/* الدخان من المدخنة - smoke puffs from the chimney */}
      {working &&
        [0, 1, 2].map((i) => (
          <circle key={i} className={`kiln-smoke kiln-smoke-${i}`} cx="120" cy="0" r="7" fill="#E5E7EB" opacity={0} />
        ))}
    </svg>
  );
}
