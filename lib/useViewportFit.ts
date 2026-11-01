"use client";

import { useEffect, useState } from "react";

// لوحة ثابتة 1920×1080 للشاشات الصغيرة بس - a fixed 1920x1080 canvas, for small screens only
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

// شاشة صغيرة = عرض أقل من 1100 أو طول أقل من 650 (موبايل). التلفزيون واللابتوب مش بيتأثروا
// Small = narrower than 1100 or shorter than 650 (phones). TVs and laptops are never affected
const SMALL_WIDTH = 1100;
const SMALL_HEIGHT = 650;

type Fit = { scale: number | null; portrait: boolean };

function measure(): Fit {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const small = width < SMALL_WIDTH || height < SMALL_HEIGHT;
  if (!small) return { scale: null, portrait: false };
  // موبايل واقف: رسالة "لف الموبايل" - phone in portrait: the rotate message
  if (height > width) return { scale: null, portrait: true };
  return { scale: Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT), portrait: false };
}

// scale = null يعني الصفحة زي ما هي - scale null = render the page as it is
export function useViewportFit(): Fit {
  const [fit, setFit] = useState<Fit>({ scale: null, portrait: false });
  useEffect(() => {
    const update = () => setFit(measure());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return fit;
}
