// أسامي أصناف مخزن القطاعي على الشاشة - display names for the retail warehouse items
import { dashboardConfig } from "@/config/dashboard.config";

// اسم قصير: لو الصنف مربوط بكارت شكاير يبقى "برتقال ناعم" بنفس أسامي الكروت (مانجو، كازوارينا)،
// غير كده نشيل "شيكارة فحم" من أول اسم ERPNext ("شيكارة فحم جوافة خشن" ← "جوافة خشن")
// Short name: an item mapped to a sack card uses the card naming ("مانجو خشن"); otherwise the ERPNext
// name without its leading "شيكارة فحم"
export function retailItemName(itemCode: string): string {
  for (const [sack, variants] of Object.entries(dashboardConfig.erp.stock.sacks)) {
    for (const [variant, field] of Object.entries(variants)) {
      if (field.source === "erp" && field.itemCodes.includes(itemCode)) return `${sack.replace(/^شكاير\s*/, "")} ${variant}`;
    }
  }
  return itemCode.replace(/^(شيكارة|شيكاره|شكارة)?\s*فحم\s+/, "").trim() || itemCode;
}

// الوحدة المشتركة: لو كل الوحدات زي بعض تبقى هي، غير كده أول كلمة لو مشتركة ("شيكارة 14 ك" + "شيكارة 15 ك" ← "شيكارة")
// The shared unit: identical units stay as they are; otherwise their common first word, if any
export function sharedUnit(units: string[]): string {
  const unique = Array.from(new Set(units.filter(Boolean)));
  if (unique.length <= 1) return unique[0] ?? "";
  const words = Array.from(new Set(unique.map((unit) => unit.split(/\s+/)[0])));
  return words.length === 1 ? words[0] : "";
}
