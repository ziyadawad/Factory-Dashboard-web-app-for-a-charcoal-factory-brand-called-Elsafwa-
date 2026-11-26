import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { dashboardConfig } from "@/config/dashboard.config";
import RepApp from "@/components/rep/RepApp";
import RepLogin from "@/components/rep/RepLogin";
import { REP_COOKIE, repFromCookie, repPins, repsConfigured } from "@/lib/rep-auth";

// تطبيق فواتير المناديب: برّه تقليب صفحات التلفزيون وليه رقم سري لكل مندوب (الـ middleware سايبه)
// The rep invoices app: outside the TV rotation, a PIN per rep (the middleware leaves it alone)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "فواتير المناديب - الصفوة",
  description: "فواتير البيع من الموبايل والطباعة على طابعة حرارية",
  manifest: "/rep/manifest.webmanifest",
  icons: { icon: "/rep/icon-192.png", apple: "/rep/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "فواتير المناديب", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0F1A",
};

export default async function RepPage() {
  const cookieStore = await cookies();
  const rep = repFromCookie(cookieStore.get(REP_COOKIE)?.value);
  if (rep) return <RepApp />;
  const pins = repPins();
  const reps = dashboardConfig.sales.reps.map((r) => ({ id: r.id, name: r.name, van: r.van, ready: !!pins[r.id] }));
  return <RepLogin configured={repsConfigured()} reps={reps} />;
}
