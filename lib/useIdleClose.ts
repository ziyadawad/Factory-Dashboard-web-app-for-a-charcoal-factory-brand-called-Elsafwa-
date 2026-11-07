"use client";

import { useEffect, useRef } from "react";

// لوحة تفاصيل: Esc يقفل، ولو محدش لمس الشاشة idleMs تقفل لوحدها (أي لمسة أو حركة أو زرار يعيد العداد)
// A details panel: Esc closes it; it closes by itself after idleMs with no touch (any touch, move or key restarts the timer)
export function useIdleClose(onClose: () => void, idleMs = 60_000) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let timer = setTimeout(() => close.current(), idleMs);
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => close.current(), idleMs);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      else touch();
    };
    const events = ["pointerdown", "pointermove", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    window.addEventListener("scroll", touch, { passive: true, capture: true });
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, touch));
      window.removeEventListener("scroll", touch, { capture: true });
      window.removeEventListener("keydown", onKey);
    };
  }, [idleMs]);
}
