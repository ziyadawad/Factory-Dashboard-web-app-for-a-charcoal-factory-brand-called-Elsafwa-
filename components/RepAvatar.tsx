"use client";

import { useState } from "react";

// صورة المندوب الدايرية بحلقة بلونه: public/reps/<id>.jpg (id من sales.reps في الكونفج). لو الصورة مش موجودة = أول حروف اسمه
// A rep's round photo with a ring in his color: public/reps/<id>.jpg (id from sales.reps in the config).
// If the file is missing, his initials are shown instead
export function repInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  // ZWNJ بين الحروف عشان ميتلزقوش في بعض - a ZWNJ between letters so they don't join
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("‌");
}

export default function RepAvatar({ id, name, color, size }: { id: string; name: string; color: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const ring = Math.max(2, Math.round(size / 18));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden font-extrabold text-white select-none"
      style={{ width: size, height: size, boxShadow: `0 0 0 ${ring}px ${color}`, background: color, fontSize: Math.round(size * 0.4) }}
      title={name}
      aria-hidden
    >
      {failed ? (
        <span className="leading-none">{repInitials(name)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/reps/${id}.jpg`} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} draggable={false} />
      )}
    </span>
  );
}
