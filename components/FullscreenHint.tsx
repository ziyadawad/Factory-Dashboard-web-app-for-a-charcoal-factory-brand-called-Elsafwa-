"use client";

import { useEffect, useState } from "react";

// شغالين ملء شاشة؟ (fullscreen API أو شاشة kiosk بنفس طول الشاشة) - fullscreen via the API, or a kiosk window as tall as the screen
function isFullscreenNow() {
  return !!document.fullscreenElement || window.innerHeight >= window.screen.height - 2;
}

// أول ضغطة/لمسة/زرار في أي حتة بتفتح ملء الشاشة (المتصفح مش بيسمح من غير ضغطة)، ومعاها تلميح صغير تحت
// The first click/touch/key anywhere enters fullscreen (browsers need a user gesture), with a small hint at the bottom
export default function FullscreenHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!document.fullscreenEnabled) return;
    // لو المتصفح رفض مرة نبطل نمسك الضغطات - stop intercepting once the browser refuses
    let refused = false;
    const update = () => setShow(!refused && !isFullscreenNow());

    const enter = (e: Event) => {
      if (refused || isFullscreenNow()) return;
      if (e instanceof KeyboardEvent && ["Control", "Alt", "Shift", "Meta", "Escape", "Tab"].includes(e.key)) return;
      // الضغطة دي بس للشاشة الكاملة، متوصلش للزرار اللي تحتها - this gesture only enters fullscreen, it must not reach the element under it
      e.preventDefault();
      e.stopPropagation();
      document.documentElement.requestFullscreen()?.catch((error) => {
        console.log("Fullscreen error:", error);
        refused = true;
        update();
      });
    };

    update();
    document.addEventListener("fullscreenchange", update);
    window.addEventListener("resize", update);
    window.addEventListener("click", enter, true);
    window.addEventListener("keydown", enter, true);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("click", enter, true);
      window.removeEventListener("keydown", enter, true);
    };
  }, []);

  if (!show) return null;
  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none select-none rounded-full bg-black/50 border border-cardBorder/60 px-3 py-1 text-xs text-gray-400 whitespace-nowrap">
      اضغط في أي حتة للشاشة الكاملة ⛶
    </div>
  );
}
