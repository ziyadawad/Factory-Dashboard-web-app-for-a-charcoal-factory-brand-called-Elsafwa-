"use client";

// صورة من الواتساب (من /api/wa/media/[id] بعد الدخول). الصورة ممكن تكون لسه ما اترفعتش لما الرسالة توصل (الإيجنت بيبعت
// الرسالة الأول وبعدين الملف): shimmer "جاري تحميل الصورة…" ومحاولة كل ثانية لحد retrySeconds، ولما توصل onArrive.
// لو مجتش: placeholder ثابت من غير ما حاجة تبوظ
// A WhatsApp image (from /api/wa/media/[id], login only). It may not be uploaded yet when the message arrives (the agent
// sends the message first, then the file): a shimmer "جاري تحميل الصورة…" and a retry every second up to retrySeconds;
// onArrive when it lands late. Still missing: a static placeholder, nothing breaks

import { CSSProperties, useEffect, useRef, useState } from "react";
import { mediaUrl } from "./wa-common";

export default function WaImage({
  mediaId,
  className = "",
  style,
  retrySeconds = 10,
  compact = false,
  onLoad,
  onArrive,
  onClick,
}: {
  mediaId: string;
  className?: string;
  style?: CSSProperties;
  retrySeconds?: number;
  compact?: boolean; // صورة صغيرة (كارت الجروب): من غير كلام - a small thumbnail (group row): no words
  onLoad?: () => void;
  onArrive?: () => void; // وصلت بعد محاولة فاشلة - arrived after a failed try
  onClick?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const startedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    setAttempt(0);
    setStatus("loading");
    startedAt.current = Date.now();
  }, [mediaId]);

  // ?r= بيكسر كاش المتصفح للمحاولة الفاشلة (الـ 404 نفسه no-store) - ?r= skips the browser cache for a retry
  const src = attempt ? `${mediaUrl(mediaId)}?r=${attempt}` : mediaUrl(mediaId);
  const failed = () => {
    if (Date.now() - startedAt.current < retrySeconds * 1000) timer.current = setTimeout(() => setAttempt((a) => a + 1), 1000);
    else setStatus("missing");
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt=""
        onLoad={() => {
          setStatus("ok");
          if (attempt > 0) onArrive?.();
          onLoad?.();
        }}
        onError={failed}
        onClick={
          onClick
            ? (e) => {
                e.stopPropagation();
                onClick();
              }
            : undefined
        }
        className={`${className} ${status === "ok" ? "" : "hidden"} ${onClick ? "cursor-zoom-in" : ""}`}
        style={style}
      />
      {status !== "ok" && (
        <span
          className={`${className} ${status === "loading" ? "wa-shimmer" : "bg-white/[0.06]"} flex items-center justify-center text-center text-gray-300 border border-white/10`}
          style={{ ...style, minWidth: compact ? undefined : 220, aspectRatio: compact ? undefined : "4 / 3" }}
        >
          {compact ? "📷" : status === "loading" ? "جاري تحميل الصورة…" : "📷 الصورة لسه ما وصلتش"}
        </span>
      )}
    </>
  );
}
