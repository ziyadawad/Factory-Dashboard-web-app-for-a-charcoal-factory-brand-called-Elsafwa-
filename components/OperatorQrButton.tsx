"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import QRCode from "qrcode";
import { dashboardConfig } from "@/config/dashboard.config";
import { useIdleClose } from "@/lib/useIdleClose";

// زرار "📱 شاشة الأوبريتر" في هيدر صفحة الإنتاج: بيفتح QR كبير لـ it.operatorUrl والرابط مكتوب تحته
// The "📱 شاشة الأوبريتر" button in the production page header: opens a big QR code for it.operatorUrl with the link under it

// الزرار دايما ظاهر: لو operatorUrl فاضي بناخد {cameraBaseUrl}/operator - always shown: empty operatorUrl = {cameraBaseUrl}/operator
const AGENT_BASE = dashboardConfig.it.cameraBaseUrl.replace(/\/+$/, "");
const OPERATOR_URL = dashboardConfig.it.operatorUrl || `${AGENT_BASE}/operator`;
// بنسأل الإيجنت لما الـ popup يفتح عشان نعرف هو بيرد ولا لأ - probe the agent when the popup opens
const PROBE_URL = AGENT_BASE ? `${AGENT_BASE}/status.json` : OPERATOR_URL;
const PROBE_TIMEOUT_MS = dashboardConfig.it.localStatusTimeoutMs || 2000;

function OperatorQrPopup({ onClose }: { onClose: () => void }) {
  useIdleClose(onClose);
  const [svg, setSvg] = useState("");
  // null = لسه بنسأل، true = الإيجنت رد، false = مش بيرد (برا المصنع أو كمبيوتر الـ IT مقفول)
  // null = still probing, true = the agent answered, false = unreachable (outside the factory or the IT PC is off)
  const [reachable, setReachable] = useState<boolean | null>(null);
  useEffect(() => {
    let stopped = false;
    fetch(PROBE_URL, { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
      .then((res) => !stopped && setReachable(res.ok))
      .catch(() => !stopped && setReachable(false));
    return () => {
      stopped = true;
    };
  }, []);
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
        {/* الـ QR والرابط بيظهروا دايما، والملاحظة لو الإيجنت مش بيرد - QR and link always shown; the note when the agent is unreachable */}
        {reachable === false && (
          <p className="max-w-[520px] text-center text-[17px] font-bold text-statusAmber bg-statusAmber/10 border border-statusAmber/40 rounded-xl px-4 py-2">
            ⚠️ متاحة جوه المصنع بس، ولما كمبيوتر الـ IT يكون شغال
          </p>
        )}
      </div>
    </div>
  );
}

// open بيتمسك في الصفحة عشان التقليب يقف والـ QR مفتوح - open lives in the page so rotation pauses while the QR is shown
export default function OperatorQrButton({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
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
