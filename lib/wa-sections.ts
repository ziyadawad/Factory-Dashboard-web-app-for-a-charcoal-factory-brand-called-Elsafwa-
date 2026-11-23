// تقسيم جروبات الواتساب لأقسام (whatsapp.sections + whatsapp.sectionOverrides) - الصفحة والسيرفر بيستخدموه هو هو
// الفحص: النقل بالإيد الأول، وبعدين الأقسام بالترتيب (أول كلمة تطابق)، والباقي للقسم default
// Splits WhatsApp groups into sections (whatsapp.sections + whatsapp.sectionOverrides); the page and the server share it.
// Check order: the manual override, then the sections in order (first keyword match), the rest to the default section

import { dashboardConfig } from "@/config/dashboard.config";

const cfg = dashboardConfig.whatsapp;
export type WaSection = (typeof cfg.sections)[number];

// توحيد للمقارنة: من غير مسافات ولا تشكيل ولا تطويل، ة = ه، أ/إ/آ = ا، ى = ي، ئ = ي، ؤ = و، إنجليزي small
// Normalized for matching: no spaces, diacritics or tatweel; ة = ه, أ/إ/آ = ا, ى = ي, ئ = ي, ؤ = و; English lower-case
export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/[\s\-_.،,:;|/\\()[\]{}"'`~!?؟@#*+=]+/g, "");
}

const SECTIONS = cfg.sections.map((s) => ({ ...s, keys: s.keywords.map(normalizeName).filter(Boolean) }));
const DEFAULT = SECTIONS.find((s) => s.default) ?? SECTIONS[SECTIONS.length - 1];
const OVERRIDES = Object.entries(cfg.sectionOverrides as Record<string, string>);

export function sectionOf(group: { id: string; name: string }): WaSection {
  // 1) نقل بالإيد: بالـ id أو بالاسم (بالظبط أو بعد التوحيد) - 1) manual: by id or name (exact or normalized)
  const name = normalizeName(group.name);
  const override = OVERRIDES.find(([key]) => key === group.id || key === group.name || normalizeName(key) === name);
  const manual = override && SECTIONS.find((s) => s.id === override[1]);
  if (manual) return manual;
  // 2) الكلمات بالترتيب - 2) keywords, in order
  for (const s of SECTIONS) if (!s.default && s.keys.some((k) => name.includes(k))) return s;
  // 3) الباقي - 3) the rest
  return DEFAULT;
}
