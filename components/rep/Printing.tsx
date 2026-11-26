"use client";

// الطباعة في تطبيق المناديب: شاشة الفاتورة بعد الحفظ (معاينة + اطبع / طباعة عادية / PDF)، وإعدادات الطابعة
// Printing in the rep app: the receipt sheet after saving (preview + print / normal print / PDF) and printer settings
import { useCallback, useEffect, useState } from "react";
import { Bluetooth, FileDown, Printer, Usb, X } from "lucide-react";
import {
  bluetoothSupported, forgetPrinter, loadPaper, loadPrinter, monoPreview, NoPrinterError, PaperWidth, pickPrinter, printNormally, printReceipt,
  renderReceipt, savePaper, SavedPrinter, sharePdf, testReceipt, usbSupported,
} from "@/lib/rep-print";
import { RepInfo, RepReceipt } from "@/lib/rep-types";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const btn = "h-14 rounded-2xl text-[18px] font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50";

// بعد "حفظ وطباعة": بتطبع لوحدها لو فيه طابعة محفوظة - after "حفظ وطباعة": prints on its own when a printer is saved
export function ReceiptSheet({ receipt, autoPrint, onClose, onSettings }: { receipt: RepReceipt; autoPrint: boolean; onClose: () => void; onSettings: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;
    renderReceipt(receipt, loadPaper())
      .then((c) => !stopped && setPreview(monoPreview(c)))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [receipt]);

  const thermal = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("بيطبع…");
    try {
      await printReceipt(receipt);
      setStatus("✓ اتطبعت");
    } catch (e) {
      setStatus(null);
      setError(e instanceof NoPrinterError ? e.message : `الطباعة فشلت: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  }, [receipt]);

  useEffect(() => {
    if (autoPrint && loadPrinter()) thermal();
  }, [autoPrint, thermal]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur" role="dialog" aria-modal="true">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 min-h-0 flex-col gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[22px] font-extrabold text-white">{receipt.temporary ? "⏳ فاتورة مؤقتة" : "✓ الفاتورة اتسجلت"}</h2>
          <button type="button" onClick={onClose} className="rounded-xl border border-cardBorder p-2 text-gray-300" aria-label="إغلاق">
            <X size={24} />
          </button>
        </div>
        {receipt.temporary && (
          <p className="rounded-xl border border-statusAmber/50 bg-statusAmber/10 px-3 py-2 text-[15px] font-bold text-statusAmber">
            ERPNext مش بيرد — الفاتورة محفوظة على الموبايل وهتتبعت لوحدها أول ما يرجع
          </p>
        )}
        {receipt.paymentError && <p className="rounded-xl border border-statusRed/50 bg-statusRed/10 px-3 py-2 text-[15px] font-bold text-statusRed">⚠ {receipt.paymentError}</p>}
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="الفاتورة" className="mx-auto w-full max-w-[384px]" /> : <p className="py-10 text-center text-gray-500">بيجهز الفاتورة…</p>}
        </div>
        {status && <p className="text-center text-[17px] font-bold text-statusGreen">{status}</p>}
        {error && (
          <p className="text-center text-[16px] font-bold text-statusRed">
            {error}{" "}
            <button type="button" onClick={onSettings} className="underline underline-offset-4">
              الإعدادات
            </button>
          </p>
        )}
        <button type="button" disabled={busy} onClick={thermal} className={`${btn} bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white`}>
          <Printer size={22} /> اطبع
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => printNormally(receipt).catch((e) => setError(errText(e)))} className={`${btn} border border-cardBorder bg-card text-gray-100 text-[16px]`}>
            <Printer size={20} /> طباعة عادية
          </button>
          <button type="button" onClick={() => sharePdf(receipt).catch((e) => setError(errText(e)))} className={`${btn} border border-cardBorder bg-card text-gray-100 text-[16px]`}>
            <FileDown size={20} /> مشاركة PDF
          </button>
        </div>
        <button type="button" onClick={onClose} className={`${btn} bg-statusGreen/90 text-black`}>
          فاتورة جديدة
        </button>
      </div>
    </div>
  );
}

// الإعدادات: عرض الورق، الطابعة، طباعة تجربة - settings: paper width, printer, test print
export function PrinterSettings({ rep, companyName, thanks }: { rep: RepInfo; companyName: string; thanks: string }) {
  const [paper, setPaper] = useState<PaperWidth>(58);
  const [printer, setPrinter] = useState<SavedPrinter | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState({ bt: false, usb: false });
  useEffect(() => {
    setPaper(loadPaper());
    setPrinter(loadPrinter());
    setSupport({ bt: bluetoothSupported(), usb: usbSupported() });
  }, []);

  const pick = async (kind: "bluetooth" | "usb") => {
    setBusy(true);
    setMsg(null);
    try {
      setPrinter(await pickPrinter(kind));
      setMsg({ ok: true, text: "✓ الطابعة اتوصلت واتحفظت" });
    } catch (e) {
      if (!(e instanceof Error && e.name === "NotFoundError")) setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await printReceipt(testReceipt(rep.name, rep.van, companyName, thanks), paper);
      setMsg({ ok: true, text: "✓ ورقة التجربة اتبعتت للطابعة" });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-cardBorder bg-card/80 p-4 flex flex-col gap-3">
        <h3 className="text-[19px] font-extrabold text-white">عرض الورق</h3>
        <div className="grid grid-cols-2 gap-2">
          {([58, 80] as PaperWidth[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => (setPaper(p), savePaper(p))}
              className={`${btn} border ${paper === p ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/60 text-gray-200"}`}
            >
              <span className="font-numbers">{p}mm</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-cardBorder bg-card/80 p-4 flex flex-col gap-3">
        <h3 className="text-[19px] font-extrabold text-white">الطابعة</h3>
        <p className="text-[16px] text-gray-300">
          {printer ? (
            <>
              {printer.kind === "bluetooth" ? "🔵 Bluetooth" : "🔌 USB"}: <b className="text-white">{printer.name}</b>
            </>
          ) : (
            "مفيش طابعة محفوظة"
          )}
        </p>
        {support.bt ? (
          <button type="button" disabled={busy} onClick={() => pick("bluetooth")} className={`${btn} bg-brandBlue/90 text-white`}>
            <Bluetooth size={22} /> اختار طابعة Bluetooth
          </button>
        ) : (
          <p className="rounded-xl bg-statusAmber/10 px-3 py-2 text-[15px] text-statusAmber">
            الـ Bluetooth شغال على Chrome أندرويد بس (مش آيفون). استخدم «طباعة عادية» أو «مشاركة PDF».
          </p>
        )}
        {support.usb && (
          <button type="button" disabled={busy} onClick={() => pick("usb")} className={`${btn} border border-cardBorder bg-background/60 text-gray-100`}>
            <Usb size={22} /> طابعة USB (كابل OTG)
          </button>
        )}
        <button type="button" disabled={busy || !printer} onClick={test} className={`${btn} bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white`}>
          <Printer size={22} /> طباعة تجربة
        </button>
        {printer && (
          <button type="button" onClick={() => (forgetPrinter(), setPrinter(null))} className="text-[15px] font-bold text-gray-400 underline underline-offset-4">
            انسى الطابعة دي
          </button>
        )}
        {msg && <p className={`text-[16px] font-bold ${msg.ok ? "text-statusGreen" : "text-statusRed"}`}>{msg.text}</p>}
        <p className="text-[13px] leading-[1.7] text-gray-500">
          لازم طابعة حرارية <b>BLE</b> (Bluetooth Low Energy) بتفهم ESC/POS — شغّل الـ Bluetooth والـ Location في الموبايل، ومتعملش pairing من
          إعدادات أندرويد (اختارها من هنا على طول).
        </p>
      </section>
    </div>
  );
}
