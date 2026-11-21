"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import QRCode from "qrcode";
import { dashboardConfig } from "@/config/dashboard.config";
import { useIdleClose } from "@/lib/useIdleClose";

// زرار "📱 شاشة الأوبريتر" في هيدر صفحة الإنتاج: بيفتح QR كبير لـ it.operatorUrl والرابط مكتوب تحته
// The "📱 شاشة الأوبريتر" button in the production page header: opens a big QR code for it.operatorUrl with the link under it

const OPERATOR_URL = dashboardConfig.it.operatorUrl;

function OperatorQrPopup({ onClose }: { onClose: () => void }) {
  useIdleClose(onClose);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let stopped = false;
    QRCode.toString(OPERATOR_URL, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then((s) => !stopped && setSvg(s))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="شاشة الأوبريتر">
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
        <h2 className="text-[26px] font-extrabold text-white">📱 شاشة الأوبريتر</h2>
        <p className="text-gray-400 text-[16px] -mt-2">امسح الكود بالموبايل (على شبكة المصنع)</p>
        {/* الـ QR على خلفية بيضا عشان يتقري بسهولة - the QR on white so it scans easily */}
        <div
          className="bg-white rounded-xl p-2 [&>svg]:w-full [&>svg]:h-full"
          style={{ width: "min(62vh, 80vw, 520px)", height: "min(62vh, 80vw, 520px)" }}
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <a href={OPERATOR_URL} target="_blank" rel="noreferrer" dir="ltr" className="font-numbers text-[22px] font-bold text-brandOrange hover:underline break-all text-center">
          {OPERATOR_URL}
        </a>
      </div>
    </div>
  );
}

// open بيتمسك في الصفحة عشان التقليب يقف والـ QR مفتوح - open lives in the page so rotation pauses while the QR is shown
export default function OperatorQrButton({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  if (!OPERATOR_URL) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-background border border-cardBorder rounded-xl hover:bg-cardBorder transition-colors text-[15px] font-bold text-gray-200 whitespace-nowrap"
        title={OPERATOR_URL}
      >
        📱 شاشة الأوبريتر
      </button>
      {open && <OperatorQrPopup onClose={() => setOpen(false)} />}
    </>
  );
}
