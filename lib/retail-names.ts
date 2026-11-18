// أصناف مخزن القطاعي: النوع (معبأ / شكاير / أخرى) والاسم على الشاشة
// Retail warehouse items: their kind (packaged / sacks / other) and display name
import { dashboardConfig } from "@/config/dashboard.config";

export type RetailKind = "packaged" | "sacks" | "other";

// الكارت والنوع اللي الصنف مربوط بيهم في erp.stock - the card and variant an item is mapped to in erp.stock
function mappedTo(itemCode: string): { group: "packaged" | "sacks"; card: string; variant: string } | null {
  const { packaged, sacks } = dashboardConfig.erp.stock;
  for (const [group, cards] of [["packaged", packaged], ["sacks", sacks]] as const) {
    for (const [card, variants] of Object.entries(cards)) {
      for (const [variant, field] of Object.entries(variants)) {
        if (field.source === "erp" && field.itemCodes.includes(itemCode)) return { group, card, variant };
      }
    }
  }
  return null;
}

// النوع: معبأ = مربوط بكارت منتج معبأ، شكاير = مربوط بكارت شكاير أو وحدته "شيكارة..."، غير كده أخرى
// Kind: packaged = mapped to a packaged card; sacks = mapped to a sack card or its unit starts with "شيكارة"; else other
export function retailKind(itemCode: string, uom: string): RetailKind {
  const mapped = mappedTo(itemCode);
  if (mapped) return mapped.group;
  return /^شيكار|^شكار/.test(uom.trim()) ? "sacks" : "other";
}

// الكمية بالباكت للمنتجات المعبأة (نفس تحويل باقي الداشبورد: sales.packetsPerUnit، الافتراضي 1)
// Quantity in packets for packaged items (same conversion as the rest of the dashboard; default 1)
export function packetsOf(itemCode: string, qty: number): number {
  return qty * (dashboardConfig.sales.packetsPerUnit[itemCode] ?? 1);
}

// اسم قصير بأسامي الكروت: "ربع كيلو" / "ربع كيلو كامل" / "مانجو خشن"، وغير المربوط من غير "شيكارة فحم"
// Short name in card naming: "ربع كيلو" / "ربع كيلو كامل" / "مانجو خشن"; unmapped items lose a leading "شيكارة فحم"
export function retailItemName(itemCode: string): string {
  const mapped = mappedTo(itemCode);
  if (mapped?.group === "packaged") return mapped.variant === "عادي" ? mapped.card : `${mapped.card} ${mapped.variant}`;
  if (mapped?.group === "sacks") return `${mapped.card.replace(/^شكاير\s*/, "")} ${mapped.variant}`;
  return itemCode.replace(/^(شيكارة|شيكاره|شكارة)?\s*فحم\s+/, "").trim() || itemCode;
}

// وحدة قصيرة للسطر الصغير: أول كلمة ("شيكارة 14 ك" ← "شيكارة") - short unit for small rows: the first word
export function shortUnit(uom: string): string {
  return uom.trim().split(/\s+/)[0] ?? "";
}
