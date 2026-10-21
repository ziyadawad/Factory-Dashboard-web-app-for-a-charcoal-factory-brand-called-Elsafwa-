import { useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// بيصغر الخط لحد ما الكلام ياخد مكانه من غير ما يتقص، ويرجع للحجم الأصلي لو العرض أو المحتوى اتغير
// Shrinks the font until the text fits without clipping; resets when the width or the content changes
export function useFitFontSize<T extends HTMLElement>(maxSize: number, minSize: number, contentKey: string) {
  const ref = useRef<T>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useIsomorphicLayoutEffect(() => setFontSize(maxSize), [maxSize, contentKey]);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (fontSize > minSize) setFontSize(fontSize - 1);
  });

  // لما خط Cairo يخلص تحميل الكلام بيعرض، فنقيس تاني - re-measure once web fonts load (Cairo is wider)
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => active && setFontSize(maxSize));
    return () => {
      active = false;
    };
  }, [maxSize]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      setFontSize(maxSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxSize]);

  return [ref, fontSize] as const;
}
