"use client";

// شاشة الأوبريتر: الطرحات المفتوحة فوق، الوزن المباشر، الوزنات المستنية، ترول بالإيد، وطرحات النهارده
// (كل وزنة = ترول، والطرحة = 2 أو 3 ترولات - lib/batches.ts)
// الطلبات بتحصل بس والصفحة مفتوحة وظاهرة: المستنية كل pendingPollSeconds، والنهارده كل todayPollSeconds
// The operator screen: live weight (factory LAN only), pending weighings, a manual exit, and today's latest exits.
// Requests only while the page is open and visible: pending every pendingPollSeconds, today every todayPollSeconds

import { useEffect, useMemo, useState } from "react";
import { LogOut, Plus, Scale } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import { usePageVisible, usePolling } from "@/lib/usePolling";
import { useLiveScale } from "@/lib/useLiveScale";
import { OperatorExit, OperatorOptions, PendingWeighing } from "@/lib/types";
import { BatchMember, cairoNowMinutes, groupBatches, isOpen, kilnNumber, progressText } from "@/lib/batches";
import ExitForm from "./ExitForm";
import { TypeBadge } from "../TypeBadge";
import OperatorShell from "./OperatorShell";

const cfg = dashboardConfig.operator;
const RULES = { windowMinutes: dashboardConfig.production.batchWindowMinutes, maxTrolleys: dashboardConfig.production.maxTrolleysPerBatch };
const member = (e: OperatorExit): BatchMember => ({
  id: e.name, date: e.date, time: e.time, kiln: e.kiln, room: e.room, type: e.type, trolley: e.trolley, kg: e.netKg, batchId: e.batchId, batchSize: e.batchSize,
});

// 401 = الكوكي خلص أو الرقم اتغير: نرجع لشاشة الرقم - 401 = cookie expired or PIN changed: back to the PIN screen
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.reload();
    throw new Error("login required");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const kg = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const cairoTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "دلوقتي";
  if (min < 60) return `من ${min} دقيقة`;
  const h = Math.floor(min / 60);
  return `من ${h} ساعة`;
}

type InstallEvent = Event & { prompt: () => Promise<void> };

export default function OperatorApp() {
  const visible = usePageVisible();
  const scale = useLiveScale();
  const [form, setForm] = useState<{ pending: PendingWeighing | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  const options = usePolling<OperatorOptions>("/api/operator/options", fetcher, 5 * 60_000, true);
  const pending = usePolling<{ pending: PendingWeighing[] }>("/api/scale/pending", fetcher, cfg.pendingPollSeconds * 1000, !form);
  const today = usePolling<{ exits: OperatorExit[] }>("/api/operator/today", fetcher, cfg.todayPollSeconds * 1000, !form);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [visible]);

  // "ضيفه على الشاشة الرئيسية": service worker + زرار التثبيت (أندرويد)
  // "Add to Home screen": service worker + install button (Android)
  useEffect(() => {
    navigator.serviceWorker?.register("/operator-sw.js", { scope: "/operator" }).catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const refresh = () => {
    pending.mutate();
    today.mutate();
  };

  const drop = async (id: string) => {
    setConfirmDrop(null);
    // تختفي على طول، وترجع لو الطلب فشل - hide at once; it comes back if the request fails
    pending.mutate((d) => d && { pending: d.pending.filter((p) => p.id !== id) }, { revalidate: false });
    await fetch(`/api/scale/pending?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    pending.mutate();
  };

  const logout = async () => {
    await fetch("/api/operator/login", { method: "DELETE" }).catch(() => null);
    window.location.reload();
  };

  const list = pending.data?.pending ?? [];
  const exits = today.data?.exits ?? [];
  const todayNet = exits.reduce((s, e) => s + (e.netKg ?? 0), 0);
  // الطرحات (الأحدث الأول) واللي لسه مفتوحة - batches (newest first) and the ones still open
  const batches = useMemo(() => groupBatches((today.data?.exits ?? []).map(member), RULES), [today.data]);
  const open = batches.filter((b) => isOpen(b, cairoNowMinutes(now), RULES));
  const manual = new Set(exits.filter((e) => e.manual).map((e) => e.name));

  return (
    <OperatorShell>
      <div className="flex flex-col gap-6">
        {/* الهيدر: اللوجو والعنوان - header: logo and title */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/operator/logo-round.png" alt="الصفوة" className="h-14 w-14 rounded-full shadow-[0_0_40px_rgba(255,122,0,0.35)]" />
            <div>
              <h1 className="text-[22px] font-extrabold leading-tight text-white">شاشة الأوبريتر</h1>
              <p className="text-[14px] text-gray-400">تسجيل ترولات الطرحات</p>
            </div>
          </div>
          <button type="button" onClick={logout} className="flex h-11 items-center gap-2 rounded-xl border border-cardBorder bg-card/80 px-3 text-[14px] font-bold text-gray-300" aria-label="خروج">
            <LogOut size={18} /> خروج
          </button>
        </header>

        {install && (
          <button
            type="button"
            onClick={async () => {
              await install.prompt().catch(() => {});
              setInstall(null);
            }}
            className="h-[52px] rounded-2xl border border-brandBlue/50 bg-brandBlue/10 text-[17px] font-bold text-sky-300"
          >
            📲 ثبّت الشاشة على الموبايل
          </button>
        )}

        {/* الطرحات المفتوحة: "طرحة فرن 3 — ترول 2 من 3" - open batches */}
        {open.map((b) => (
          <section key={b.key} className="flex flex-col gap-2 rounded-3xl border-2 border-statusAmber/60 bg-statusAmber/10 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[22px] font-extrabold text-statusAmber">
                طرحة فرن {kilnNumber(b.kiln)} — ترول <span className="font-numbers">{b.count + 1}</span> من <span className="font-numbers">{b.size}</span>
              </p>
              <span className="font-numbers text-[16px] font-bold text-gray-300">{b.time}</span>
            </div>
            <p className="flex items-center gap-2 text-[15px] text-gray-300">
              {b.room && <span>غرفة {b.room} ·</span>}
              <TypeBadge label={b.type} iconSize={20} className="font-bold" />
            </p>
            <p className="font-numbers text-[16px] font-bold text-gray-100">
              {b.trolleys.map((t, i) => `ترول ${i + 1}: ${kg(t.kg)}`).join(" · ")} → المجموع {kg(b.kg)} كجم
            </p>
            <p className="text-[14px] text-gray-400">الوزنة الجاية هتروح للطرحة دي (وتقدر تبدأ طرحة جديدة من الفورم)</p>
          </section>
        ))}

        {/* الوزن المباشر - live weight */}
        {scale.online && scale.weightKg !== null ? (
          <section className="rounded-3xl border border-cardBorder bg-card/90 px-6 py-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[17px] font-bold text-gray-300">
                <Scale size={20} /> الميزان دلوقتي
              </p>
              <span
                className={`rounded-full px-3 py-1 text-[15px] font-extrabold ${
                  scale.stable ? "bg-statusGreen/15 text-statusGreen" : "bg-statusAmber/15 text-statusAmber"
                }`}
              >
                {scale.stable ? "ثابت" : "بيتحرك"}
              </span>
            </div>
            <p className="mt-2 text-center font-numbers text-[76px] font-extrabold leading-none text-white">
              {kg(scale.weightKg)} <span className="text-[26px] text-gray-400">كجم</span>
            </p>
          </section>
        ) : (
          <section className="flex items-center gap-3 rounded-3xl border border-cardBorder/70 bg-card/50 px-5 py-4 text-[16px] text-gray-400">
            <Scale size={22} className="shrink-0 text-gray-500" />
            الميزان مش متصل — اكتب الوزن بإيدك
          </section>
        )}

        {/* الوزنات المستنية - pending weighings */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-extrabold text-white">وزنات مستنية</h2>
            {list.length > 0 && <span className="rounded-full bg-brandOrange/15 px-3 py-0.5 font-numbers text-[16px] font-extrabold text-brandOrange">{list.length}</span>}
          </div>
          {pending.error && !pending.data && <p className="text-[15px] text-statusRed">مش قادرين نجيب الوزنات — بنحاول تاني…</p>}
          {pending.data && list.length === 0 && (
            <p className="rounded-2xl border border-dashed border-cardBorder px-5 py-5 text-center text-[16px] text-gray-500">مفيش وزنات مستنية</p>
          )}
          {list.map((p) => (
            <div key={p.id} className="flex flex-col gap-4 rounded-3xl border border-brandOrange/40 bg-card/90 px-5 py-5 shadow-[0_0_30px_rgba(255,122,0,0.12)]">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[15px] text-gray-400">الوزن الممتلئ</p>
                  <p className="font-numbers text-[44px] font-extrabold leading-none text-white">
                    {kg(p.grossKg)} <span className="text-[20px] text-gray-400">كجم</span>
                  </p>
                </div>
                <div className="text-end">
                  <p className="font-numbers text-[22px] font-bold text-gray-200">{cairoTime(p.time)}</p>
                  <p className="text-[14px] text-gray-500">{ago(p.time, now)}</p>
                </div>
              </div>
              {confirmDrop === p.id ? (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => drop(p.id)} className="h-[56px] rounded-2xl bg-statusRed/90 text-[18px] font-extrabold text-white">
                    أيوه، مش ترول
                  </button>
                  <button type="button" onClick={() => setConfirmDrop(null)} className="h-[56px] rounded-2xl border border-cardBorder bg-background/60 text-[18px] font-bold text-gray-200">
                    رجوع
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <button
                    type="button"
                    disabled={!options.data}
                    onClick={() => setForm({ pending: p })}
                    className="h-[60px] rounded-2xl bg-gradient-to-l from-brandOrange to-brandDeepOrange text-[20px] font-extrabold text-white shadow-[0_8px_30px_rgba(255,122,0,0.3)] disabled:opacity-50"
                  >
                    سجّل ترول
                  </button>
                  <button type="button" onClick={() => setConfirmDrop(p.id)} className="h-[60px] rounded-2xl border border-cardBorder bg-background/60 text-[18px] font-bold text-gray-300">
                    مش ترول
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* ترول بالإيد (نفس خطوات الطرحة) - a manual trolley (same batch flow) */}
        <button
          type="button"
          disabled={!options.data}
          onClick={() => setForm({ pending: null })}
          className="flex h-[64px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brandOrange/60 bg-brandOrange/5 text-[20px] font-extrabold text-brandOrange disabled:opacity-50"
        >
          <Plus size={24} /> {open.length > 0 ? "ترول بإيدي" : "طرحة جديدة بإيدي"}
        </button>
        {options.error && !options.data && <p className="-mt-3 text-center text-[15px] text-statusRed">ERPNext مش بيرد — بنحاول تاني…</p>}

        {/* طرحات النهارده: سطر لكل طرحة وتحته الترولات - today's batches, one row each with its trolleys */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[20px] font-extrabold text-white">طرحات النهارده</h2>
            {exits.length > 0 && (
              <p className="text-[14px] text-gray-400">
                <span className="font-numbers font-bold text-gray-200">{batches.length}</span> طرحة ·{" "}
                <span className="font-numbers font-bold text-gray-200">{exits.length}</span> ترول ·{" "}
                <span className="font-numbers font-bold text-gray-200">{kg(Math.round(todayNet))}</span> كجم
              </p>
            )}
          </div>
          {today.data && exits.length === 0 && (
            <p className="rounded-2xl border border-dashed border-cardBorder px-5 py-5 text-center text-[16px] text-gray-500">مفيش طرحات النهارده لسه</p>
          )}
          <div className="flex flex-col gap-2.5">
            {batches.slice(0, 20).map((b) => (
              <div key={b.key} className="flex flex-col gap-2 rounded-2xl border border-cardBorder bg-card/80 px-4 py-3">
                <div className="flex items-center gap-4">
                  <span className="font-numbers text-[18px] font-bold text-gray-300">{b.time}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-[17px] font-bold text-white">
                      {b.kiln}
                      {b.room && <span className="text-[14px] font-semibold text-gray-400">غ {b.room}</span>}
                      <TypeBadge label={b.type} iconSize={20} className="text-[15px] font-bold" />
                    </p>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 text-[13px] font-bold ${
                        b.complete ? "bg-white/10 text-gray-300" : "bg-statusAmber/15 text-statusAmber"
                      }`}
                    >
                      {b.complete ? `${b.count} ترول` : progressText(b)}
                    </span>
                  </div>
                  <p className="text-end">
                    <span className="block font-numbers text-[24px] font-extrabold text-statusGreen">{kg(b.weighed > 0 ? b.kg : null)}</span>
                    <span className="text-[12px] text-gray-500">كجم صافي</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.trolleys.map((t, i) => (
                    <span key={t.id} className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[14px] text-gray-300">
                      ترول {t.trolley || i + 1}: <b className="font-numbers text-gray-100">{kg(t.kg)}</b>
                      {manual.has(t.id) && <span className="ms-1 text-[12px] font-bold text-statusAmber">يدوي</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {form && options.data && (
        <ExitForm
          options={options.data}
          pending={form.pending}
          batches={batches}
          scale={scale}
          onClose={() => {
            setForm(null);
            refresh();
          }}
          onSaved={() => {
            refresh();
            options.mutate(); // ترول جديد ممكن يكون اتحفظ - a new trolley may have been saved
          }}
        />
      )}
    </OperatorShell>
  );
}
