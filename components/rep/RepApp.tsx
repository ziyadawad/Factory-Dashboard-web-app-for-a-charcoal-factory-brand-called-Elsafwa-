"use client";

// تطبيق فواتير المناديب: "فاتورة جديدة" / "فواتيري النهارده" / "الإعدادات". الأصناف والعملاء بيتحفظوا على الموبايل
// (عشان يقدر يعمل فاتورة من غير نت)، والفاتورة اللي ERPNext ما ردش عليها بتستنى في الطابور وتتطبع "مؤقتة"
// The rep app: new invoice / today's invoices / settings. Items and customers are kept on the phone (so an invoice can
// be made offline); an invoice ERPNext didn't answer waits in the queue and prints as "مؤقتة"
import { useCallback, useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import OperatorShell from "../operator/OperatorShell";
import { RepOptions, RepReceipt, RepToday } from "@/lib/rep-types";
import { dropQueued, flushQueue, newUuid, putQueued, QueuedInvoice, queued } from "@/lib/rep-queue";
import InvoiceForm, { Draft, emptyDraft, totalsOf } from "./InvoiceForm";
import { PrinterSettings, ReceiptSheet } from "./Printing";
import { money, repFetch, RepFetchError } from "./api";

const OPTIONS_KEY = "elsafwa:rep:options";
type Tab = "new" | "today" | "settings";
type InstallEvent = Event & { prompt: () => Promise<void> };

const nowCairo = () => {
  const d = new Date();
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d),
  };
};

function TodayTab({ queue, onReprint, onRetry, onDrop }: { queue: QueuedInvoice[]; onReprint: (r: RepReceipt) => void; onRetry: () => void; onDrop: (uuid: string) => void }) {
  const [data, setData] = useState<RepToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await repFetch<RepToday>("/api/rep/today"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصلت مشكلة");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const reprint = async (name: string) => {
    setBusy(name);
    try {
      onReprint((await repFetch<{ receipt: RepReceipt }>(`/api/rep/invoice?name=${encodeURIComponent(name)}`)).receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصلت مشكلة");
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (name: string) => {
    setBusy(name);
    try {
      await repFetch("/api/rep/cancel", { json: { name } });
      setAsking(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصلت مشكلة");
    } finally {
      setBusy(null);
    }
  };

  const card = "rounded-2xl border border-cardBorder bg-card/80 p-4";
  return (
    <div className="flex flex-col gap-3">
      {queue.length > 0 && (
        <div className={`${card} border-statusAmber/50 flex flex-col gap-2`}>
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[18px] font-extrabold text-statusAmber">⏳ مستنية تتبعت ({queue.length})</p>
            <button type="button" onClick={onRetry} className="rounded-xl border border-cardBorder px-3 py-1.5 text-[15px] font-bold text-gray-200">
              ابعت دلوقتي
            </button>
          </div>
          {queue.map((q) => (
            <div key={q.uuid} className="rounded-xl bg-background/60 px-3 py-2 flex flex-col gap-1">
              <p className="flex justify-between gap-2 text-[16px] text-white">
                <span className="truncate font-bold">{q.receipt.customerName}</span>
                <span className="font-numbers">{money(q.receipt.total)}</span>
              </p>
              {q.status === "failed" ? (
                <p className="text-[14px] text-statusRed">
                  ⚠ ERPNext رفضها: {q.error}{" "}
                  <button type="button" onClick={() => onDrop(q.uuid)} className="underline underline-offset-2 font-bold">
                    امسحها
                  </button>
                </p>
              ) : (
                <p className="text-[14px] text-gray-400">هتتبعت لوحدها أول ما ERPNext يرد</p>
              )}
              <button type="button" onClick={() => onReprint(q.receipt)} className="self-start text-[14px] font-bold text-brandOrange underline underline-offset-2">
                اطبع المؤقتة تاني
              </button>
            </div>
          ))}
        </div>
      )}
      {data && (
        <div className={`${card} grid grid-cols-2 gap-2 text-center`}>
          <div>
            <p className="text-[14px] text-gray-400">فواتير</p>
            <p className="font-numbers text-[26px] font-extrabold text-white">{data.totals.count}</p>
          </div>
          <div>
            <p className="text-[14px] text-gray-400">الإجمالي</p>
            <p className="font-numbers text-[26px] font-extrabold text-brandOrange">{money(data.totals.total)}</p>
          </div>
          <div>
            <p className="text-[14px] text-gray-400">اتحصّل</p>
            <p className="font-numbers text-[22px] font-extrabold text-statusGreen">{money(data.totals.paid)}</p>
          </div>
          <div>
            <p className="text-[14px] text-gray-400">آجل</p>
            <p className="font-numbers text-[22px] font-extrabold text-statusAmber">{money(data.totals.remaining)}</p>
          </div>
        </div>
      )}
      {error && <p className="text-center text-[16px] font-bold text-statusRed">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-gray-500">جاري التحميل…</p>}
      {data?.invoices.length === 0 && <p className="py-8 text-center text-gray-500">لسه مفيش فواتير النهارده</p>}
      {data?.invoices.map((inv) => (
        <div key={inv.name} className={`${card} flex flex-col gap-2 ${inv.cancelled ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-extrabold text-white">{inv.customerName}</p>
              <p dir="ltr" className="text-end font-numbers text-[13px] text-gray-400">
                {inv.name} · {inv.time}
              </p>
            </div>
            <div className="text-end">
              <p className="font-numbers text-[20px] font-extrabold text-white">{money(inv.total)}</p>
              {inv.remaining > 0 && <p className="font-numbers text-[14px] text-statusAmber">باقي {money(inv.remaining)}</p>}
            </div>
          </div>
          {inv.cancelled ? (
            <p className="text-[15px] font-bold text-statusRed">ملغية</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy === inv.name} onClick={() => reprint(inv.name)} className="h-11 flex-1 rounded-xl border border-cardBorder bg-background/60 text-[16px] font-bold text-gray-100">
                🖨 إعادة طباعة
              </button>
              {inv.cancelRequested ? (
                <span className="h-11 flex-1 rounded-xl bg-statusAmber/10 text-[15px] font-bold text-statusAmber flex items-center justify-center">طلب الإلغاء اتبعت</span>
              ) : asking === inv.name ? (
                <button type="button" disabled={busy === inv.name} onClick={() => cancel(inv.name)} className="h-11 flex-1 rounded-xl bg-statusRed text-[16px] font-extrabold text-white">
                  متأكد؟ ابعت الطلب
                </button>
              ) : (
                <button type="button" onClick={() => setAsking(inv.name)} className="h-11 flex-1 rounded-xl border border-statusRed/50 text-[16px] font-bold text-statusRed">
                  طلب إلغاء
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RepApp() {
  const [tab, setTab] = useState<Tab>("new");
  const [options, setOptions] = useState<RepOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // فاتورة شبهها: نفس الـ uuid لو قال "أيوه" - a similar invoice: the same uuid if he says yes
  const [duplicate, setDuplicate] = useState<{ message: string; uuid: string } | null>(null);
  const [receipt, setReceipt] = useState<{ r: RepReceipt; auto: boolean } | null>(null);
  const [queue, setQueue] = useState<QueuedInvoice[]>([]);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      const o = await repFetch<RepOptions>("/api/rep/options");
      setOptions(o);
      setOptionsError(null);
      try {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
      } catch {}
    } catch (e) {
      // من غير نت: آخر أصناف وعملاء اتحفظوا - offline: the last saved items and customers
      try {
        const saved = window.localStorage.getItem(OPTIONS_KEY);
        if (saved) setOptions((cur) => cur ?? (JSON.parse(saved) as RepOptions));
      } catch {}
      setOptionsError(e instanceof Error ? e.message : "حصلت مشكلة");
    }
  }, []);
  const refreshQueue = useCallback(async () => setQueue(await queued()), []);
  const flush = useCallback(async () => {
    const r = await flushQueue();
    await refreshQueue();
    if (r.sent > 0) loadOptions();
  }, [refreshQueue, loadOptions]);

  useEffect(() => {
    loadOptions();
    refreshQueue().then(flush);
    navigator.serviceWorker?.register("/rep-sw.js", { scope: "/rep" }).catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const onOnline = () => flush();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("online", onOnline);
    const timer = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [loadOptions, refreshQueue, flush]);

  // رصيد العميل لما يتختار - the customer's balance once picked
  const customerId = draft.customer?.id ?? null;
  useEffect(() => {
    if (!customerId) return;
    let stopped = false;
    setBalance(undefined);
    repFetch<{ balance: number }>(`/api/rep/customer?id=${encodeURIComponent(customerId)}`)
      .then((r) => !stopped && setBalance(r.balance))
      .catch(() => !stopped && setBalance(null));
    return () => {
      stopped = true;
    };
  }, [customerId]);

  // بعد الحفظ: الرصيد في العربية بيقل على الموبايل لحد التحديث الجاي - after saving: lower the van stock locally
  const takeStock = (cart: Record<string, number>) =>
    setOptions((o) => (o ? { ...o, products: o.products.map((p) => ({ ...p, stock: Math.max(0, p.stock - (cart[p.code] ?? 0)) })) } : o));

  const save = async (confirmDuplicate = false, uuid?: string) => {
    if (!options || !draft.customer) return;
    const t = totalsOf(draft, options.products);
    const request = {
      uuid: uuid ?? newUuid(),
      customer: draft.customer.id,
      items: t.lines.map((l) => ({ code: l.code, qty: l.qty })),
      paid: t.paid,
      discount: t.discount,
      confirmDuplicate,
      createdAt: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      const r = await repFetch<{ receipt: RepReceipt; existing: boolean }>("/api/rep/invoice", { json: request });
      takeStock(draft.cart);
      setReceipt({ r: r.receipt, auto: true });
      setDraft(emptyDraft());
      setBalance(undefined);
      loadOptions();
    } catch (e) {
      if (e instanceof RepFetchError && e.status === 409 && typeof e.body.duplicate === "string") {
        setDuplicate({ message: e.message, uuid: request.uuid });
      } else if (e instanceof RepFetchError && e.queueable) {
        // ERPNext مش بيرد: نحفظها على الموبايل ونطبع مؤقتة - ERPNext down: keep it on the phone and print a temporary one
        const { date, time } = nowCairo();
        const temp: RepReceipt = {
          name: `مؤقتة-${request.uuid.slice(0, 6).toUpperCase()}`,
          temporary: true,
          date,
          time,
          repName: options.rep.name,
          van: options.rep.van,
          customerName: draft.customer.name,
          items: t.lines.map((l) => ({ name: l.name, qty: l.qty, rate: l.rate, amount: l.amount })),
          subtotal: t.subtotal,
          discount: t.discount,
          total: t.total,
          paid: t.paid,
          remaining: t.remaining,
          previousBalance: typeof balance === "number" ? balance : null,
          newBalance: typeof balance === "number" ? Math.round((balance + t.remaining) * 100) / 100 : null,
          companyName: options.companyName,
          thanks: options.thanks,
        };
        await putQueued({ uuid: request.uuid, request: { ...request, confirmDuplicate: true }, receipt: temp, status: "waiting", tries: 0, createdAt: request.createdAt });
        await refreshQueue();
        takeStock(draft.cart);
        setReceipt({ r: temp, auto: true });
        setDraft(emptyDraft());
        setBalance(undefined);
      } else {
        setSaveError(e instanceof Error ? e.message : "حصلت مشكلة");
        if (e instanceof RepFetchError && e.status === 409) loadOptions();
      }
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/api/rep/login", { method: "DELETE" }).catch(() => {});
    window.location.reload();
  };

  const tabs: [Tab, string][] = [
    ["new", "🧾 فاتورة جديدة"],
    ["today", "📋 فواتيري النهارده"],
    ["settings", "⚙️ الإعدادات"],
  ];

  return (
    <OperatorShell>
      <header className="flex items-center gap-3 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rep/logo-round.png" alt="" className="h-11 w-11 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-extrabold text-white">{options?.rep.name ?? "فواتير المناديب"}</p>
          <p className="text-[13px] text-gray-400">{options ? `🚚 ${options.rep.van}` : "…"}</p>
        </div>
        {queue.length > 0 && (
          <button type="button" onClick={() => setTab("today")} className="rounded-full bg-statusAmber/15 px-2.5 py-1 text-[13px] font-bold text-statusAmber">
            ⏳ {queue.length}
          </button>
        )}
        <button type="button" onClick={loadOptions} className="rounded-xl border border-cardBorder p-2 text-gray-300" aria-label="تحديث">
          <RefreshCw size={20} />
        </button>
        <button type="button" onClick={logout} className="rounded-xl border border-cardBorder p-2 text-gray-300" aria-label="خروج">
          <LogOut size={20} />
        </button>
      </header>
      {install && (
        <button type="button" onClick={() => install.prompt().then(() => setInstall(null))} className="mb-3 w-full rounded-xl border border-brandOrange/50 bg-brandOrange/10 py-2 text-[15px] font-bold text-brandOrange">
          📲 ضيف التطبيق على الشاشة الرئيسية
        </button>
      )}
      <nav className="sticky top-0 z-20 -mx-4 mb-3 grid grid-cols-3 gap-1.5 bg-background/90 px-4 py-2 backdrop-blur">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`h-12 rounded-xl text-[14px] font-extrabold ${tab === id ? "bg-brandOrange text-white" : "border border-cardBorder bg-card/80 text-gray-300"}`}>
            {label}
          </button>
        ))}
      </nav>
      {optionsError && (
        <p className="mb-3 rounded-xl border border-statusAmber/50 bg-statusAmber/10 px-3 py-2 text-[14px] font-bold text-statusAmber">
          {options ? `⚠ مش متصل — الأصناف والأسعار من آخر مرة (${optionsError})` : `⚠ ${optionsError}`}
        </p>
      )}

      {tab === "new" &&
        (options ? (
          <InvoiceForm options={options} draft={draft} setDraft={setDraft} balance={draft.customer ? balance : undefined} onSave={() => save(false)} saving={saving} error={saveError} />
        ) : (
          <p className="py-16 text-center text-gray-500">{optionsError ? "مش قادر يجيب الأصناف — اضغط تحديث" : "جاري التحميل…"}</p>
        ))}
      {tab === "today" && (
        <TodayTab
          queue={queue}
          onReprint={(r) => setReceipt({ r, auto: false })}
          onRetry={flush}
          onDrop={async (uuid) => {
            await dropQueued(uuid);
            await refreshQueue();
          }}
        />
      )}
      {tab === "settings" && options && <PrinterSettings rep={options.rep} companyName={options.companyName} thanks={options.thanks} />}

      {duplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-[460px] rounded-2xl border border-statusAmber/60 bg-card p-5 flex flex-col gap-4">
            <p className="text-[19px] font-extrabold text-white">⚠ فاتورة شبهها</p>
            <p className="text-[17px] text-gray-200">{duplicate.message}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDuplicate(null)} className="h-14 rounded-2xl border border-cardBorder text-[18px] font-bold text-gray-200">
                لأ
              </button>
              <button
                type="button"
                onClick={() => {
                  const again = duplicate.uuid;
                  setDuplicate(null);
                  save(true, again);
                }}
                className="h-14 rounded-2xl bg-statusAmber text-black text-[18px] font-extrabold"
              >
                أيوه، جديدة
              </button>
            </div>
          </div>
        </div>
      )}
      {receipt && <ReceiptSheet receipt={receipt.r} autoPrint={receipt.auto} onClose={() => setReceipt(null)} onSettings={() => (setReceipt(null), setTab("settings"))} />}
    </OperatorShell>
  );
}
