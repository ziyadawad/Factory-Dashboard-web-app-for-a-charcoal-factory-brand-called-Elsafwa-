"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

// بيرسم المحتوى على مقاس ثابت (width × height) وبيكبره/يصغره مرة واحدة بـ scale() على قد المكان، في النص
// Draws its content at a fixed width × height and scales it once (keeping the ratio) to fit, centered.
// بيتحسب تاني مع تغيير مقاس الشاشة أو لفّها - recalculated on resize and orientationchange
export default function ScaledCanvas({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () =>
      setBox((prev) =>
        prev && prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight }
      );
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    observer?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const scale = box && width > 0 && height > 0 ? Math.min(box.width / width, box.height / height) : 1;

  return (
    <div ref={outerRef} className="relative w-full h-full overflow-hidden">
      <div
        className="absolute"
        style={{
          width,
          height,
          left: box ? (box.width - width * scale) / 2 : 0,
          top: box ? (box.height - height * scale) / 2 : 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: box ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// بيرسم المحتوى بعرض ثابت ويصغّره على قد عرض المكان (من غير ما يكبّره) - draws its content at a fixed
// width and shrinks it to the available width (never enlarges); enabled = false renders it as is
export function FitWidth({ width, enabled, children }: { width: number; enabled: boolean; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ outer: width, inner: 0 });

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!enabled || !outer || !inner || typeof ResizeObserver === "undefined") return;
    const measure = () => setSize({ outer: outer.clientWidth, inner: inner.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [enabled]);

  // نفس الـ DOM في الحالتين عشان الهيدر مايتعملش من الأول - same DOM either way, so the header never remounts
  const scale = enabled ? Math.min(1, size.outer / width) : 1;
  return (
    <div
      ref={outerRef}
      className={enabled ? "relative shrink-0 overflow-hidden" : "contents"}
      style={enabled ? { height: size.inner * scale } : undefined}
    >
      <div
        ref={innerRef}
        className={enabled ? "absolute top-0 right-0" : "contents"}
        style={enabled ? { width, transform: `scale(${scale})`, transformOrigin: "top right" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
