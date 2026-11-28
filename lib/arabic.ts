// بيشتغل في المتصفح والسيرفر - works in the browser and on the server
// ===== توحيد الأسامي العربي (عشان "مدينة نصر" و"مدينه نصر" يبقوا منطقة واحدة) - Arabic name normalization =====
// التشكيل والتطويل بيتشالوا، أ إ آ = ا، ة = ه، ى = ي، الأرقام العربي = إنجليزي، والعلامات والمسافات بتتشال
// "منطقة X" / "حي X" / "قرية X" = "X" (بس "مدينة X" بتفضل زي "مدينة نصر")
// Diacritics and tatweel removed, alef forms / taa marbuta / alef maqsura unified, Arabic-Indic digits to Latin,
// punctuation and spaces dropped; a leading "منطقة" / "حي" / "قرية" is dropped ("مدينة" is kept, e.g. "مدينة نصر")
export function normalizeArabic(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/[^0-9a-zء-ي]+/g, " ")
    .trim()
    .replace(/^(منطقه|حي|قريه)\s+(?=\S)/, "")
    .replace(/\s+/g, "");
}
