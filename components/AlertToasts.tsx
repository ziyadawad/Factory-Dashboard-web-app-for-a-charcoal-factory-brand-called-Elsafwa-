"use client";

// تنبيهات صغيرة في الركن وقت ما الصفحة متثبتة (📌): مش بتقفل حاجة ولا بتنقل الشاشة، والضغط عليها بيروح للحاجة
// Small corner toasts while the page is pinned (📌): non-blocking, no page jump; clicking one goes there

import { useEffect } from "react";
import { X } from "lucide-react";

export type AlertToast = {
  id: string;
  icon: string; // "🔥" / "💬"
  title: string; // "طرحة دخلت فرن 4" / "رسالة جديدة في <جروب>"
  sub?: string; // سطر صغير تحت - a small second line
  color: string;
  onGo: () => void;
};

const TOAST_SECONDS = 10;

function Toast({ toast, onClose }: { toast: AlertToast; onClose: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), TOAST_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);
  return (
    <div
      role="status"
      onClick={() => {
        toast.onGo();
        onClose(toast.id);
      }}
      title="اضغط عشان تروح هناك"
      className="alert-toast pointer-events-auto cursor-pointer w-[380px] max-w-[90vw] rounded-2xl border-2 bg-card/95 shadow-2xl px-4 py-3 flex items-start gap-3"
      style={{ borderColor: toast.color, boxShadow: `0 0 24px -6px ${toast.color}` }}
    >
      <span className="text-[26px] leading-none mt-0.5">{toast.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[18px] font-extrabold text-white leading-snug truncate">{toast.title}</p>
        {toast.sub && (
          <p className="text-[14px] text-gray-300 truncate" dir="auto">
            {toast.sub}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="إغلاق"
        onClick={(e) => {
          e.stopPropagation();
          onClose(toast.id);
        }}
        className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
      >
        <X size={18} />
      </button>
    </div>
  );
}

// آخر 4 بس، الأحدث تحت - the latest 4 only, newest at the bottom
export default function AlertToasts({ toasts, onClose }: { toasts: AlertToast[]; onClose: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[65] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(-4).map((t) => (
        <Toast key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
}
