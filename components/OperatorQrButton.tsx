"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import QRCode from "qrcode";
import { dashboardConfig } from "@/config/dashboard.config";
import { useIdleClose } from "@/lib/useIdleClose";

// زرار "📱 شاشة الأوبريتر" في هيدر صفحة الإنتاج: QR كبير لصفحة /operator على Vercel (شغالة من أي مكان)
// وزرار كبير "افتح شاشة الأوبريتر" بيفتحها في تاب جديد
// The "📱 شاشة الأوبريتر" button in the production page header: a big QR for the /operator page on Vercel (works
// anywhere) and a big "افتح شاشة الأوبريتر" button that opens it in a new tab

const OPERATOR_URL = dashboardConfig.it.operatorUrl || "/operator";

// تطبيق على الموبايل (QR + زرار يفتحه): شاشة الأوبريتر وفواتير المناديب - a phone app (QR + open button)
export type QrApp = { url: string; localPath: string; title: string; subtitle: string; openLabel: string; buttonLabel: string };
const OPERATOR_APP: QrApp = {
  url: OPERATOR_URL,
  localPath: "/operator",
  title: "📱 شاشة الأوبريتر",
  subtitle: "امسح الكود بالموبايل — شغالة من أي مكان بالرقم السري",
  openLabel: "افتح شاشة الأوبريتر",
  buttonLabel: "📱 شاشة الأوبريتر",
};

function OperatorQrPopup({ onClose, app }: { onClose: () => void; app: QrApp }) {
  useIdleClose(onClose);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let stopped = false;
    QRCode.toString(app.url, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then((s) => !stopped && setSvg(s))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [app.url]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={app.title}>
      <div
        className="relative bg-card border border-cardBorder rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="absolute top-3 end-3 p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
        >
          <X size={24} />
        </button>
        <h2 className="text-[26px] font-extrabold text-white">{app.title}</h2>
        <p className="text-gray-400 text-[16px] -mt-2">{app.subtitle}</p>
        {/* الـ QR على خلفية بيضا عشان يتقري بسهولة - the QR on white so it scans easily */}
        <div
          className="bg-white rounded-xl p-2 [&>svg]:w-full [&>svg]:h-full"
          style={{ width: "min(50vh, 80vw, 460px)", height: "min(50vh, 80vw, 460px)" }}
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <a href={app.url} target="_blank" rel="noreferrer" dir="ltr" className="font-numbers text-[22px] font-bold text-brandOrange hover:underline break-all text-center">
          {app.url}
        </a>
        {/* نفس الموقع (التلفزيون أو اللابتوب) في تاب جديد - same site, new tab */}
        <a
          href={app.localPath}
          target="_blank"
          rel="noopener"
          className="w-full max-w-[460px] h-[64px] flex items-center justify-center rounded-2xl bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white text-[22px] font-extrabold shadow-[0_8px_30px_rgba(255,122,0,0.35)] hover:brightness-110"
        >
          {app.openLabel}
        </a>
      </div>
    </div>
  );
}

// "📱 أبلكيشن المناديب" في هيدر صفحة مبيعات المناديب - in the reps sales page header
export const REP_APP: QrApp = {
  url: dashboardConfig.sales.repAppUrl || "/rep",
  localPath: "/rep",
  title: "📱 أبلكيشن المناديب",
  subtitle: "امسح الكود بموبايل المندوب — كل مندوب برقمه السري",
  openLabel: "افتح التطبيق",
  buttonLabel: "📱 أبلكيشن المناديب",
};

// open بيتمسك في الصفحة عشان التقليب يقف والـ QR مفتوح - open lives in the page so rotation pauses while the QR is shown
export default function OperatorQrButton({ open, setOpen, app = OPERATOR_APP, className = "" }: { open: boolean; setOpen: (open: boolean) => void; app?: QrApp; className?: string }) {
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${className} px-2 min-[1600px]:px-3 py-1 bg-background border border-cardBorder rounded-xl hover:bg-cardBorder transition-colors text-[13px] min-[1600px]:text-[14px] leading-tight font-bold text-gray-200 whitespace-nowrap`}
        title={app.url}
      >
        {app.buttonLabel}
      </button>
      {open && <OperatorQrPopup app={app} onClose={() => setOpen(false)} />}
    </>
  );
}
