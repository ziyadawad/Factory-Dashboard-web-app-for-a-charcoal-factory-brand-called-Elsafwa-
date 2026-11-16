"use client";

import { useEffect, useRef } from "react";

// لوحة تفاصيل: Esc يقفل، ولو محدش لمس الشاشة idleMs تقفل لوحدها (أي لمسة أو حركة أو زرار يعيد العداد)
// A details panel: Esc closes it; it closes by itself after idleMs with no touch (any touch, move or key restarts the timer)
// لو onClose رجّعت false (قفلت لوحة فرعية بس) العداد بيبدأ من الأول - onClose returning false (closed a nested panel only) re-arms the timer
export function useIdleClose(onClose: () => void | boolean, idleMs = 60_000) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const fire = () => {
      if (close.current() === false) timer = setTimeout(fire, idleMs);
    };
    let timer = setTimeout(fire, idleMs);
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(fire, idleMs);
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
