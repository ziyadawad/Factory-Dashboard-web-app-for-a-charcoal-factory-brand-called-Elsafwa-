"use client";

import { useEffect, useState } from "react";
import Keypad from "../operator/Keypad";
import OperatorShell from "../operator/OperatorShell";

type RepChoice = { id: string; name: string; van: string; ready: boolean };

// الدخول: اختار المندوب، وبعدين الرقم السري (4 أرقام) بيتبعت أول ما الرابع يتكتب - pick the rep, then the 4-digit PIN
export default function RepLogin({ configured, reps }: { configured: boolean; reps: RepChoice[] }) {
  const [rep, setRep] = useState<RepChoice | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(configured ? null : "الأرقام السرية لسه متظبطتش على السيرفر (REP_PINS)");

  useEffect(() => {
    if (!rep || pin.length !== 4 || busy) return;
    setBusy(true);
    fetch("/api/rep/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rep: rep.id, pin }) })
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
  }, [pin, busy, rep]);

  return (
    <OperatorShell>
      <div className="flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rep/logo-round.png" alt="الصفوة" className="h-24 w-24 rounded-full shadow-[0_0_60px_rgba(255,122,0,0.35)]" />
          <h1 className="text-[28px] font-extrabold text-white">🧾 فواتير المناديب</h1>
          <p className="text-gray-400 text-[17px]">{rep ? `${rep.name} — اكتب رقمك السري` : "انت مين؟"}</p>
        </div>

        {!rep ? (
          <div className="grid w-full grid-cols-2 gap-3">
            {reps.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={!configured || !r.ready}
                onClick={() => {
                  setError(null);
                  setRep(r);
                }}
                className="flex flex-col items-center gap-1 rounded-2xl border border-cardBorder bg-card/80 px-3 py-5 active:scale-[0.98] disabled:opacity-40"
              >
                <span className="text-[34px]">🚚</span>
                <span className="text-[19px] font-extrabold text-white text-center">{r.name}</span>
                <span className="text-[14px] text-gray-400">{r.van}</span>
                {!r.ready && configured && <span className="text-[12px] text-statusAmber">ملوش رقم سري لسه</span>}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div dir="ltr" className="flex gap-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-5 w-5 rounded-full border-2 ${i < pin.length ? "border-brandOrange bg-brandOrange" : "border-gray-500"}`} />
              ))}
            </div>
            <div className="w-full max-w-[340px]">
              <Keypad
                value={pin}
                maxLength={4}
                disabled={busy}
                onChange={(v) => {
                  setError(null);
                  setPin(v);
                }}
              />
            </div>
            <button type="button" onClick={() => (setRep(null), setPin(""), setError(null))} className="text-[16px] font-bold text-gray-400 underline underline-offset-4">
              مش أنا — رجوع
            </button>
          </>
        )}
        <p className={`min-h-[28px] text-center text-[17px] font-bold ${error ? "text-statusRed" : "text-transparent"}`} role="alert">
          {error ?? "."}
        </p>
      </div>
    </OperatorShell>
  );
}
