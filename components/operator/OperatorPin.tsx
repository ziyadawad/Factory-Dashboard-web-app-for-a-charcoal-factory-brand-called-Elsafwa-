"use client";

import { useEffect, useState } from "react";
import Keypad from "./Keypad";
import OperatorShell from "./OperatorShell";

// شاشة الرقم السري (4 أرقام): بيتبعت أول ما الرقم الرابع يتكتب، والتشييك على السيرفر بس
// The PIN screen (4 digits): sent as soon as the 4th digit is typed; checked on the server only
export default function OperatorPin({ configured }: { configured: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(configured ? null : "الرقم السري لسه متظبطش على السيرفر (OPERATOR_PIN)");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    fetch("/api/operator/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) })
      .then(async (res) => {
        if (res.ok) {
          window.location.reload();
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "حصلت مشكلة — جرب تاني");
        setPin("");
        setBusy(false);
      })
      .catch(() => {
        setError("مفيش نت — جرب تاني");
        setPin("");
        setBusy(false);
      });
  }, [pin, busy]);

  return (
    <OperatorShell>
      <div className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/operator/logo-round.png" alt="الصفوة" className="h-28 w-28 rounded-full shadow-[0_0_60px_rgba(255,122,0,0.35)]" />
          <h1 className="text-[28px] font-extrabold text-white">شاشة الأوبريتر</h1>
          <p className="text-gray-400 text-[17px]">اكتب الرقم السري</p>
        </div>
        <div dir="ltr" className="flex gap-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-5 w-5 rounded-full border-2 transition-colors ${
                i < pin.length ? "border-brandOrange bg-brandOrange" : "border-gray-500 bg-transparent"
              }`}
            />
          ))}
        </div>
        <p className={`min-h-[28px] text-center text-[17px] font-bold ${error ? "text-statusRed" : "text-transparent"}`} role="alert">
          {error ?? "."}
        </p>
        <div className="w-full max-w-[340px]">
          <Keypad
            value={pin}
            maxLength={4}
            disabled={busy || !configured}
            onChange={(v) => {
              setError(null);
              setPin(v);
            }}
          />
        </div>
      </div>
    </OperatorShell>
  );
}
