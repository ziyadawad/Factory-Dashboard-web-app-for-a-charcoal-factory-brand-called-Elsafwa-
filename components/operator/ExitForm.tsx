"use client";

// تسجيل طرحة: خطوة في كل شاشة — الفرن ← الغرفة ← النوع ← الترول ← الوزن ← مراجعة وحفظ
// Registering an exit, one step per screen: kiln -> room -> type -> trolley -> weight -> review and save

import { useMemo, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import Keypad from "./Keypad";
import { LiveScale } from "@/lib/useLiveScale";
import { OperatorOptions, OperatorSaveRequest, PendingWeighing } from "@/lib/types";

type Step = "kiln" | "room" | "type" | "trolley" | "weight" | "review" | "done";
const STEPS: Step[] = ["kiln", "room", "type", "trolley", "weight", "review"];
const TITLES: Record<Step, string> = {
  kiln: "الفرن",
  room: "الغرفة",
  type: "النوع",
  trolley: "رقم الترول",
  weight: "الوزن الممتلئ",
  review: "راجع واحفظ",
  done: "اتسجلت",
};

const kg = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const cairoTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const kilnNumber = (kiln: string) => kiln.replace(/^\D+/, "") || kiln;

type Duplicate = { time: string; kiln: string; netKg: number | null };

export default function ExitForm({
  options,
  pending,
  scale,
  onClose,
  onSaved,
}: {
  options: OperatorOptions;
  pending: PendingWeighing | null;
  scale: LiveScale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>("kiln");
  const [kiln, setKiln] = useState("");
  const [room, setRoom] = useState("");
  const [type, setType] = useState("");
  const [trolley, setTrolley] = useState("");
  const [tare, setTare] = useState("");
  const [editing, setEditing] = useState<"trolley" | "tare">("trolley");
  const [saveTrolley, setSaveTrolley] = useState(true);
  const [gross, setGross] = useState(pending ? String(pending.grossKg) : "");
  const [fromScale, setFromScale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [savedNet, setSavedNet] = useState<number | null>(null);

  const known = useMemo(() => options.trolleys.find((t) => String(t.no) === trolley) ?? null, [options.trolleys, trolley]);
  const grossKg = pending ? pending.grossKg : Number(gross) || 0;
  const tareKg = known ? known.emptyKg : Number(tare) || 0;
  const net = Math.round((grossKg - tareKg) * 10) / 10;
  const typeColor = options.types.find((t) => t.label === type)?.color ?? "#9CA3AF";
  const index = STEPS.indexOf(step);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const back = () => {
    if (step === "kiln" || step === "done") return onClose();
    setDuplicate(null);
    go(STEPS[index - 1]);
  };

  const save = async (confirmDuplicate: boolean) => {
    setBusy(true);
    setError(null);
    const body: OperatorSaveRequest = {
      kiln, room, type,
      trolley: Number(trolley),
      tareKg: known ? null : Number(tare) || null,
      saveTrolley: !known && saveTrolley,
      grossKg,
      pendingId: pending?.id ?? null,
      fromScale,
      confirmDuplicate,
    };
    try {
      const res = await fetch("/api/operator/exit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await res.json().catch(() => ({}))) as { error?: string; duplicate?: Duplicate; gone?: boolean; netKg?: number };
      if (res.status === 401) return window.location.reload();
      if (res.ok) {
        setSavedNet(result.netKg ?? net);
        setStep("done");
        onSaved();
        return;
      }
      if (result.duplicate) setDuplicate(result.duplicate);
      else setError(result.error ?? "الحفظ فشل — جرب تاني");
      if (result.gone) onSaved();
    } catch {
      setError("مفيش نت — الطرحة متسجلتش، جرب تاني");
    } finally {
      setBusy(false);
    }
  };

  // ملخص اللي اتختار لحد دلوقتي - what has been chosen so far
  const chips = [
    kiln && `فرن ${kilnNumber(kiln)}`,
    room && `غرفة ${room}`,
    type,
    trolley && index > STEPS.indexOf("trolley") ? `ترول ${trolley}` : "",
  ].filter(Boolean) as string[];

  const bigBtn =
    "rounded-2xl border border-cardBorder bg-card text-white font-extrabold transition-all active:scale-[0.98] hover:border-brandOrange/60";
  const primary =
    "w-full h-[64px] rounded-2xl bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white text-[22px] font-extrabold shadow-[0_8px_30px_rgba(255,122,0,0.35)] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none";

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background" role="dialog" aria-modal="true" aria-label="تسجيل طرحة">
      <div aria-hidden className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[380px] w-[480px] rounded-full bg-brandOrange/15 blur-[120px]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {/* الهيدر: رجوع / الخطوة / قفل - header: back / step / close */}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={back} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cardBorder bg-card text-gray-200" aria-label="رجوع">
            <ArrowRight size={24} />
          </button>
          <div className="flex flex-col items-center">
            <p className="text-[13px] text-gray-400">{pending ? `وزنة ${cairoTime(pending.time)} — ${kg(pending.grossKg)} كجم` : "طرحة بالإيد"}</p>
            <h2 className="text-[22px] font-extrabold text-white">{TITLES[step]}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cardBorder bg-card text-gray-200" aria-label="إغلاق">
            <X size={24} />
          </button>
        </div>

        {step !== "done" && (
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-brandOrange" : "bg-cardBorder"}`} />
            ))}
          </div>
        )}

        {chips.length > 0 && step !== "done" && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-cardBorder bg-card/80 px-3 py-1 text-[15px] font-bold text-gray-200">
                {c}
              </span>
            ))}
          </div>
        )}

        {step === "kiln" && (
          <div className="grid grid-cols-3 gap-3">
            {options.kilns.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKiln(k);
                  go("room");
                }}
                className={`${bigBtn} flex h-[110px] flex-col items-center justify-center gap-1 ${kiln === k ? "border-brandOrange bg-brandOrange/15" : ""}`}
              >
                <span className="text-[15px] font-bold text-gray-400">فرن</span>
                <span className="font-numbers text-[40px] leading-none">{kilnNumber(k)}</span>
              </button>
            ))}
          </div>
        )}

        {step === "room" && (
          <div className="grid grid-cols-2 gap-3">
            {options.rooms.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRoom(r);
                  go("type");
                }}
                className={`${bigBtn} flex h-[140px] flex-col items-center justify-center gap-1 ${room === r ? "border-brandOrange bg-brandOrange/15" : ""}`}
              >
                <span className="text-[16px] font-bold text-gray-400">غرفة</span>
                <span className="font-numbers text-[48px] leading-none">{r}</span>
              </button>
            ))}
          </div>
        )}

        {step === "type" && (
          <div className="grid grid-cols-2 gap-3">
            {options.types.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setType(t.label);
                  go("trolley");
                }}
                className={`${bigBtn} flex h-[96px] items-center justify-center gap-3 text-[24px]`}
                style={{ borderColor: type === t.label ? t.color : undefined, background: type === t.label ? `${t.color}22` : undefined }}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
        )}

        {step === "trolley" && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setEditing("trolley")}
              className={`rounded-2xl border bg-card px-5 text-start ${trolley && !known ? "py-2.5" : "py-4"} ${editing === "trolley" ? "border-brandOrange" : "border-cardBorder"}`}
            >
              <span className="block text-[15px] text-gray-400">رقم الترول</span>
              <span dir="ltr" className={`block text-end font-numbers font-extrabold leading-tight text-white ${trolley && !known ? "text-[36px]" : "text-[44px]"}`}>{trolley || "—"}</span>
            </button>

            {trolley && known && (
              <div className="rounded-2xl border border-statusGreen/40 bg-statusGreen/10 px-5 py-3 text-[18px] font-bold text-statusGreen">
                ✓ الترول متسجل — وزنه فاضي <span className="font-numbers">{kg(known.emptyKg)}</span> كجم
              </div>
            )}

            {trolley && !known && (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-statusAmber/40 bg-statusAmber/10 p-3.5">
                <p className="text-[18px] font-bold text-statusAmber">⚠ الترول ده مش متسجل</p>
                <button
                  type="button"
                  onClick={() => setEditing("tare")}
                  className={`flex items-center justify-between gap-3 rounded-xl border bg-background/60 px-4 py-2.5 text-start ${editing === "tare" ? "border-brandOrange" : "border-cardBorder"}`}
                >
                  <span className="text-[15px] text-gray-300">وزن الترول الفاضي (كجم)</span>
                  <span dir="ltr" className="font-numbers text-[32px] font-extrabold leading-tight text-white">{tare || "—"}</span>
                </button>
                <label className="flex items-center gap-3 text-[17px] font-bold text-gray-100">
                  <input type="checkbox" checked={saveTrolley} onChange={(e) => setSaveTrolley(e.target.checked)} className="h-6 w-6 accent-[#FF7A00]" />
                  احفظ الترول ده
                </label>
                {!saveTrolley && <p className="text-[14px] text-gray-400">من غير ما تحفظه الطرحة هتتسجل من غير رقم ترول.</p>}
              </div>
            )}

            <Keypad
              compact={!!trolley && !known}
              value={editing === "tare" && !known ? tare : trolley}
              maxLength={editing === "tare" ? 4 : 5}
              onChange={(v) => {
                if (editing === "tare" && !known) setTare(v);
                else {
                  setTrolley(v);
                  setEditing("trolley");
                }
              }}
            />
            <button
              type="button"
              className={primary}
              disabled={!(Number(trolley) > 0) || (!known && !(Number(tare) > 0))}
              onClick={() => go(pending ? "review" : "weight")}
            >
              التالي
            </button>
          </div>
        )}

        {step === "weight" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-brandOrange bg-card px-5 py-4">
              <span className="block text-[15px] text-gray-400">الوزن الممتلئ (كجم)</span>
              <span dir="ltr" className="block text-end font-numbers text-[48px] font-extrabold leading-tight text-white">{gross || "—"}</span>
              {fromScale && <span className="text-[14px] font-bold text-statusGreen">من الميزان</span>}
            </div>
            {scale.online && scale.weightKg !== null && scale.weightKg > 0 && (
              <button
                type="button"
                disabled={!scale.stable}
                onClick={() => {
                  setGross(String(scale.weightKg));
                  setFromScale(true);
                }}
                className="h-[56px] rounded-2xl border border-statusGreen/50 bg-statusGreen/10 text-[18px] font-bold text-statusGreen disabled:border-cardBorder disabled:bg-card disabled:text-gray-500"
              >
                {scale.stable ? `خد الوزن من الميزان (${kg(scale.weightKg)} كجم)` : `الميزان بيتحرك… (${kg(scale.weightKg)} كجم)`}
              </button>
            )}
            <Keypad
              value={gross}
              maxLength={4}
              onChange={(v) => {
                setGross(v);
                setFromScale(false);
              }}
            />
            <button type="button" className={primary} disabled={!(Number(gross) > 0)} onClick={() => go("review")}>
              التالي
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-cardBorder bg-card px-4 py-4">
                <p className="text-[15px] text-gray-400">ممتلئ</p>
                <p className="font-numbers text-[34px] font-extrabold text-white">{kg(grossKg)}</p>
              </div>
              <div className="rounded-2xl border border-cardBorder bg-card px-4 py-4">
                <p className="text-[15px] text-gray-400">فاضي (الترول)</p>
                <p className="font-numbers text-[34px] font-extrabold text-white">{kg(tareKg)}</p>
              </div>
            </div>
            <div
              className={`rounded-2xl border px-5 py-5 text-center ${
                net > 0 ? "border-statusGreen/50 bg-statusGreen/10" : "border-statusRed/60 bg-statusRed/10"
              }`}
            >
              <p className="text-[17px] font-bold text-gray-300">الصافي</p>
              <p className={`font-numbers text-[64px] font-extrabold leading-tight ${net > 0 ? "text-statusGreen" : "text-statusRed"}`}>
                {kg(net)} <span className="text-[24px]">كجم</span>
              </p>
              {net <= 0 && <p className="text-[16px] font-bold text-statusRed">الصافي لازم يبقى أكبر من صفر — ارجع وراجع الوزن</p>}
            </div>
            <div className="rounded-2xl border border-cardBorder bg-card/70 px-5 py-4 text-[17px] leading-[2] text-gray-200">
              <p>
                <span className="text-gray-400">الفرن: </span>فرن {kilnNumber(kiln)} · <span className="text-gray-400">الغرفة: </span>
                {room}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-gray-400">النوع: </span>
                <span className="h-3 w-3 rounded-full" style={{ background: typeColor }} />
                {type}
              </p>
              <p>
                <span className="text-gray-400">الترول: </span>
                {trolley}
                {!known && (saveTrolley ? " (جديد — هيتحفظ)" : " (مش هيتحفظ)")}
              </p>
              <p>
                <span className="text-gray-400">الوقت: </span>
                {pending ? `${cairoTime(pending.time)} (وقت الوزن)` : "دلوقتي"}
                {!pending && !fromScale && <span className="ms-2 rounded-full bg-statusAmber/15 px-2 text-[14px] font-bold text-statusAmber">وزن بالإيد</span>}
              </p>
            </div>

            {duplicate && (
              <div className="flex flex-col gap-3 rounded-2xl border border-statusAmber/60 bg-statusAmber/10 p-4">
                <p className="text-[18px] font-bold text-statusAmber">
                  ⚠ الترول {trolley} اتسجل من شوية ({duplicate.time} — {duplicate.kiln}
                  {duplicate.netKg ? ` — ${kg(duplicate.netKg)} كجم` : ""})
                </p>
                <p className="text-[15px] text-gray-300">لو دي طرحة تانية فعلا احفظها، ولو نفس الطرحة ارجع.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" disabled={busy} onClick={() => save(true)} className="h-[52px] rounded-xl bg-statusAmber text-[18px] font-extrabold text-black disabled:opacity-50">
                    احفظ برضه
                  </button>
                  <button type="button" onClick={onClose} className="h-[52px] rounded-xl border border-cardBorder bg-card text-[18px] font-bold text-gray-200">
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-2xl border border-statusRed/50 bg-statusRed/10 px-4 py-3 text-[17px] font-bold text-statusRed" role="alert">
                {error}
              </p>
            )}

            {!duplicate && (
              <button type="button" className={primary} disabled={busy || net <= 0} onClick={() => save(false)}>
                {busy ? "بيتحفظ…" : "حفظ"}
              </button>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-statusGreen/15 shadow-[0_0_60px_rgba(34,197,94,0.35)]">
              <Check size={64} className="text-statusGreen" />
            </div>
            <p className="text-[28px] font-extrabold text-white">الطرحة اتسجلت</p>
            <p className="text-[20px] text-gray-300">
              فرن {kilnNumber(kiln)} · {type} · صافي <span className="font-numbers font-extrabold text-statusGreen">{kg(savedNet ?? net)}</span> كجم
            </p>
            <button type="button" onClick={onClose} className={primary}>
              تمام
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
