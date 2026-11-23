"use client";

// تسجيل ترول (كل وزنة = ترول، والطرحة = 2 أو 3 ترولات من نفس الفرن)، خطوة في كل شاشة:
// - أول ترول في طرحة (مفيش طرحة مفتوحة): الطرحة دي كام ترول؟ ← الفرن ← الغرفة ← النوع ← الترول ← الوزن ← مراجعة
// - طرحة مفتوحة (ناقصة وفي حدود الوقت): بتتختار لوحدها والفرن والغرفة والنوع منها، فرقم الترول ← الوزن ← مراجعة
//   ("طرحة جديدة" بيبدأ طرحة تانية). بعد الحفظ: ملخص الطرحة "ترول 1: 580 · ترول 2: 587 → المجموع 1,167 كجم (2 من 3)"
// Registering a trolley (each weighing = one trolley; a batch = 2 or 3 trolleys from one kiln), one step per screen:
// - first trolley of a batch (no open batch): how many trolleys? -> kiln -> room -> type -> trolley -> weight -> review
// - an open batch (short and within the window) is picked by default with its kiln, room and type: trolley -> weight
//   -> review ("طرحة جديدة" starts another). After saving: the batch summary

import { useMemo, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import Keypad from "./Keypad";
import { LiveScale } from "@/lib/useLiveScale";
import { OperatorBatchSummary, OperatorOptions, OperatorSaveRequest, PendingWeighing } from "@/lib/types";
import { Batch, cairoNowMinutes, isOpen } from "@/lib/batches";
import { dashboardConfig } from "@/config/dashboard.config";
import { formatTime12 } from "@/lib/format";
import { TypeBadge, TypeIcon, typeStyle } from "../TypeBadge";

const RULES = { windowMinutes: dashboardConfig.production.batchWindowMinutes, maxTrolleys: dashboardConfig.production.maxTrolleysPerBatch };
// اختيارات عدد الترولات: من 2 لحد maxTrolleysPerBatch - trolley count choices: 2..maxTrolleysPerBatch
const SIZES = Array.from({ length: Math.max(1, RULES.maxTrolleys - 1) }, (_, i) => i + 2);

type Step = "size" | "kiln" | "room" | "type" | "trolley" | "weight" | "review" | "done";
const NEW_STEPS: Step[] = ["size", "kiln", "room", "type", "trolley", "weight", "review"];
const OPEN_STEPS: Step[] = ["trolley", "weight", "review"];
const TITLES: Record<Step, string> = {
  size: "الطرحة دي كام ترول؟",
  kiln: "الفرن",
  room: "الغرفة",
  type: "النوع",
  trolley: "رقم الترول",
  weight: "الوزن الممتلئ",
  review: "راجع واحفظ",
  done: "اتسجلت",
};

const kg = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
// الساعة بـ ص / م (lib/format) - the time with ص / م (lib/format)
const cairoTime = (iso: string) => formatTime12(iso);
const kilnNumber = (kiln: string) => kiln.replace(/^\D+/, "") || kiln;

type Duplicate = { time: string; kiln: string; netKg: number | null };

// "ترول 1: 580 · ترول 2: 587" - the trolleys of a batch, by position
const trolleyLine = (list: { netKg: number | null }[]) => list.map((t, i) => `ترول ${i + 1}: ${t.netKg === null ? "—" : kg(t.netKg)}`).join(" · ");

export default function ExitForm({
  options,
  pending,
  batches,
  scale,
  onClose,
  onSaved,
}: {
  options: OperatorOptions;
  pending: PendingWeighing | null;
  batches: Batch[]; // طرحات النهارده - today's batches
  scale: LiveScale;
  onClose: () => void;
  onSaved: () => void;
}) {
  // الطرحات المفتوحة وقت الوزنة (أو دلوقتي) - the batches open at the weighing time (or now)
  const [openBatches] = useState(() => {
    const at = cairoNowMinutes(pending ? Date.parse(pending.time) : Date.now());
    return batches.filter((b) => isOpen(b, at, RULES));
  });
  const first = openBatches[0] ?? null;
  const [batch, setBatch] = useState<Batch | null>(first);
  const [size, setSize] = useState<number | null>(null);
  const [step, setStep] = useState<Step>(first ? "trolley" : "size");
  const [kiln, setKiln] = useState(first?.kiln ?? "");
  const [room, setRoom] = useState(first?.room ?? "");
  const [type, setType] = useState(first?.type ?? "");
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
  const [summary, setSummary] = useState<OperatorBatchSummary | null>(null);
  const STEPS = batch ? OPEN_STEPS : NEW_STEPS;

  const known = useMemo(() => options.trolleys.find((t) => String(t.no) === trolley) ?? null, [options.trolleys, trolley]);
  const grossKg = pending ? pending.grossKg : Number(gross) || 0;
  const tareKg = known ? known.emptyKg : Number(tare) || 0;
  const net = Math.round((grossKg - tareKg) * 10) / 10;
  const index = STEPS.indexOf(step);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const back = () => {
    if (index <= 0 || step === "done") return onClose();
    setDuplicate(null);
    go(STEPS[index - 1]);
  };

  // كمّل طرحة مفتوحة - continue an open batch
  const pickBatch = (b: Batch) => {
    setBatch(b);
    setSize(null);
    setKiln(b.kiln);
    setRoom(b.room);
    setType(b.type);
    setDuplicate(null);
    go("trolley");
  };
  // طرحة جديدة - a new batch
  const newBatch = () => {
    setBatch(null);
    setSize(null);
    setKiln("");
    setRoom("");
    setType("");
    setDuplicate(null);
    go("size");
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
      batchId: batch?.batchId ?? null,
      batchSize: batch ? batch.size : size,
    };
    try {
      const res = await fetch("/api/operator/exit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await res.json().catch(() => ({}))) as {
        error?: string;
        duplicate?: Duplicate;
        gone?: boolean;
        batchGone?: boolean;
        netKg?: number;
        batch?: OperatorBatchSummary | null;
      };
      if (res.status === 401) return window.location.reload();
      if (res.ok) {
        setSavedNet(result.netKg ?? net);
        setSummary(result.batch ?? null);
        setStep("done");
        onSaved();
        return;
      }
      // الطرحة كملت أو اتشالت من جهاز تاني: ابدأ طرحة جديدة - the batch filled up or vanished elsewhere: start a new one
      if (result.batchGone) {
        newBatch();
        setError(result.error ?? "الطرحة دي كملت — ابدأ طرحة جديدة");
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
    !batch && size ? `طرحة ${size} ترول` : "",
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
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background" role="dialog" aria-modal="true" aria-label="تسجيل ترول">
      <div aria-hidden className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[380px] w-[480px] rounded-full bg-brandOrange/15 blur-[120px]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {/* الهيدر: رجوع / الخطوة / قفل - header: back / step / close */}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={back} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cardBorder bg-card text-gray-200" aria-label="رجوع">
            <ArrowRight size={24} />
          </button>
          <div className="flex flex-col items-center">
            <p className="text-[13px] text-gray-400">{pending ? `وزنة ${cairoTime(pending.time)} — ${kg(pending.grossKg)} كجم` : "ترول بالإيد"}</p>
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

        {/* الطرحة المفتوحة: "طرحة فرن 3 — ترول 2 من 3"، وتغيير الطرحة - the open batch, and switching batches */}
        {batch && step !== "done" && (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-statusAmber/60 bg-statusAmber/10 px-4 py-3.5">
            <p className="text-[21px] font-extrabold text-statusAmber">
              طرحة فرن {kilnNumber(batch.kiln)} — ترول <span className="font-numbers">{batch.count + 1}</span> من{" "}
              <span className="font-numbers">{batch.size}</span>
            </p>
            <p className="font-numbers text-[15px] text-gray-200">
              {trolleyLine(batch.trolleys.map((t) => ({ netKg: t.kg })))} → المجموع {kg(batch.kg)} كجم
            </p>
            <div className="flex flex-wrap gap-2">
              {openBatches
                .filter((b) => b.key !== batch.key)
                .map((b) => (
                  <button key={b.key} type="button" onClick={() => pickBatch(b)} className="h-11 rounded-xl border border-cardBorder bg-card px-3 text-[15px] font-bold text-gray-100">
                    طرحة فرن {kilnNumber(b.kiln)} ({b.count + 1} من {b.size})
                  </button>
                ))}
              <button type="button" onClick={newBatch} className="h-11 rounded-xl border border-brandOrange/60 bg-brandOrange/10 px-4 text-[15px] font-extrabold text-brandOrange">
                + طرحة جديدة
              </button>
            </div>
          </div>
        )}

        {error && step !== "review" && (
          <p className="rounded-2xl border border-statusRed/50 bg-statusRed/10 px-4 py-3 text-[17px] font-bold text-statusRed" role="alert">
            {error}
          </p>
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

        {step === "size" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setSize(n);
                    go("kiln");
                  }}
                  className={`${bigBtn} flex h-[150px] flex-col items-center justify-center gap-1 ${size === n ? "border-brandOrange bg-brandOrange/15" : ""}`}
                >
                  <span className="font-numbers text-[64px] leading-none">{n}</span>
                  <span className="text-[18px] font-bold text-gray-400">ترول</span>
                </button>
              ))}
            </div>
            {/* الرجوع لطرحة مفتوحة - back to an open batch */}
            {openBatches.map((b) => (
              <button key={b.key} type="button" onClick={() => pickBatch(b)} className="h-[56px] rounded-2xl border border-statusAmber/50 bg-statusAmber/10 text-[17px] font-bold text-statusAmber">
                كمّل طرحة فرن {kilnNumber(b.kiln)} (ترول {b.count + 1} من {b.size})
              </button>
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
                style={{ borderColor: type === t.label ? typeStyle(t.label).color : undefined, background: type === t.label ? `${typeStyle(t.label).color}22` : undefined }}
              >
                <TypeIcon label={t.label} size={34} />
                <span style={{ color: typeStyle(t.label).color }}>{t.label}</span>
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
                <TypeBadge label={type} iconSize={22} className="font-bold" />
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
                  ⚠ الترول {trolley} اتسجل من شوية ({formatTime12(duplicate.time)} — {duplicate.kiln}
                  {duplicate.netKg ? ` — ${kg(duplicate.netKg)} كجم` : ""})
                </p>
                <p className="text-[15px] text-gray-300">لو ده ترول تاني فعلا احفظه، ولو نفس الوزنة ارجع.</p>
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
            <p className="text-[28px] font-extrabold text-white">الترول اتسجل</p>
            <p className="text-[20px] text-gray-300">
              فرن {kilnNumber(kiln)} · {type} · ترول {trolley} · صافي <span className="font-numbers font-extrabold text-statusGreen">{kg(savedNet ?? net)}</span> كجم
            </p>
            {/* ملخص الطرحة - the batch summary */}
            {summary && (
              <div
                className={`w-full rounded-2xl border-2 px-5 py-4 ${
                  summary.complete ? "border-statusGreen/60 bg-statusGreen/10" : "border-statusAmber/60 bg-statusAmber/10"
                }`}
              >
                <p className="font-numbers text-[18px] font-bold leading-[1.8] text-gray-100">
                  {trolleyLine(summary.trolleys)} → المجموع {kg(summary.totalKg)} كجم
                  {summary.size !== null && ` (${summary.trolleys.length} من ${summary.size})`}
                </p>
                {summary.complete ? (
                  <p className="mt-1 text-[26px] font-extrabold text-statusGreen">
                    ✓ الطرحة كملت — <span className="font-numbers">{kg(summary.totalKg)}</span> كجم
                  </p>
                ) : (
                  summary.size !== null && (
                    <p className="mt-1 text-[18px] font-bold text-statusAmber">
                      فاضل <span className="font-numbers">{summary.size - summary.trolleys.length}</span> ترول — الوزنة الجاية هتروح للطرحة دي
                    </p>
                  )
                )}
              </div>
            )}
            <button type="button" onClick={onClose} className={primary}>
              تمام
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
