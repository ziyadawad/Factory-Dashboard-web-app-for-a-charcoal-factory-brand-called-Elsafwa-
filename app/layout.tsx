import type { Metadata } from "next";
import "@fontsource-variable/cairo";
import "./globals.css";

export const metadata: Metadata = {
  title: "لوحة متابعة المصنع - الصفوة",
  description: "لوحة متابعة المصنع في الوقت الفعلي",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
