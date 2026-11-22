import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import OperatorApp from "@/components/operator/OperatorApp";
import OperatorPin from "@/components/operator/OperatorPin";
import { OPERATOR_COOKIE, operatorPin, operatorSessionValid } from "@/lib/operator-auth";

// شاشة الأوبريتر: برّه تقليب صفحات التلفزيون وليها رقم سري لوحدها (الـ middleware سايبها)
// The operator screen: outside the TV page rotation, with its own PIN (the middleware leaves it alone)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "شاشة الأوبريتر - الصفوة",
  description: "تسجيل طرحات الأفران من الموبايل",
  manifest: "/operator/manifest.webmanifest",
  icons: { icon: "/operator/icon-192.png", apple: "/operator/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "الأوبريتر", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0F1A",
};

export default async function OperatorPage() {
  const cookieStore = await cookies();
  const authed = operatorSessionValid(cookieStore.get(OPERATOR_COOKIE)?.value);
  return authed ? <OperatorApp /> : <OperatorPin configured={!!operatorPin()} />;
}
