"use client";

// شاشة "عميل جديد": الاسم، الموبايل (اختياري، مصري)، المنطقة (أزرار من مناطق عملاء المندوب + كتابة)، العنوان بالتفصيل،
// "حدد موقعي" (GPS اختياري بمعاينة خريطة صغيرة)، ونوع العميل. نفس الاسم أو الموبايل = "العميل ده موجود" ونختاره
// The "عميل جديد" screen: name, mobile (optional, Egyptian), area (chips from the rep's customers' areas + free text),
// detailed address, "حدد موقعي" (optional GPS with a small map preview) and the customer type. Same name or mobile =
// "العميل ده موجود" with that customer to pick
import { useState } from "react";
import { Check, Loader2, LocateFixed, MapPin, Phone, Store, Tag, User, X } from "lucide-react";
import { RepCustomer, RepNewCustomer, RepOptions } from "@/lib/rep-types";
import { repFetch, RepFetchError } from "./api";

const EG_MOBILE = /^01[0125]\d{8}$/;
const latin = (t: string) => t.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");

type Gps = NonNullable<RepNewCustomer["gps"]>;

function Field({ icon, label, hint, children }: { icon: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[16px] font-extrabold text-gray-200">
        <span className="text-brandOrange">{icon}</span>
        {label}
        {hint && <span className="text-[13px] font-semibold text-gray-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const input =
  "h-14 w-full rounded-2xl border border-cardBorder bg-background/70 px-4 text-[18px] text-white placeholder:text-gray-600 outline-none focus:border-brandOrange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.15)]";

export default function NewCustomer({
  options,
  initialName,
  onCreated,
  onBack,
  onClose,
}: {
  options: RepOptions;
  initialName: string;
  onCreated: (c: RepCustomer, warning: string | null) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<string>(options.customerTypes[0] ?? "");
  const [gps, setGps] = useState<Gps | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<RepCustomer | null>(null);

  const digits = latin(phone);
  const phoneBad = digits.length > 0 && !EG_MOBILE.test(digits);
  const ready = name.trim().length >= 2 && !phoneBad && area.trim().length > 0 && address.trim().length > 0 && !busy;

  const locate = () => {
    if (!navigator.geolocation) {
      setGpsError("الموبايل ده مش بيدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null });
        setLocating(false);
      },
      (e) => {
        setGpsError(e.code === e.PERMISSION_DENIED ? "اسمح للتطبيق بالموقع من إعدادات Chrome" : "مش قادر يحدد الموقع — اطلع مكان مفتوح وجرب تاني");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 }
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setExisting(null);
    try {
      const body: RepNewCustomer = { name, phone: digits, area, address, type, gps };
      const r = await repFetch<{ customer: RepCustomer; warning: string | null }>("/api/rep/customer", { json: body });
      options.customers.unshift(r.customer);
      onCreated(r.customer, r.warning);
    } catch (e) {
      const found = e instanceof RepFetchError ? (e.body.customer as RepCustomer | undefined) : undefined;
      if (found) setExisting(found);
      else setError(e instanceof Error ? e.message : "حصلت مشكلة");
    } finally {
      setBusy(false);
    }
  };

  const d = 0.004;
  const map = gps
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${gps.lng - d},${gps.lat - d},${gps.lng + d},${gps.lat + d}&layer=mapnik&marker=${gps.lat},${gps.lng}`
    : null;
  const chip = (on: boolean) =>
    `h-11 rounded-full border px-4 text-[15px] font-bold whitespace-nowrap ${on ? "border-brandOrange bg-brandOrange/15 text-brandOrange" : "border-cardBorder bg-background/60 text-gray-300"}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background" role="dialog" aria-modal="true" aria-label="عميل جديد">
      {/* الإضاءة الهادية - the soft ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[380px] w-[520px] rounded-full bg-statusGreen/15 blur-[120px]" />
        <div className="absolute -bottom-48 -left-24 h-[340px] w-[340px] rounded-full bg-brandOrange/15 blur-[120px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* الهيدر - header */}
        <header className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rep/logo-round.png" alt="" className="h-12 w-12 rounded-full shadow-[0_0_30px_rgba(255,122,0,0.3)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[24px] font-extrabold leading-tight text-white">عميل جديد</h2>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-cardBorder bg-card/80 px-2.5 py-0.5 text-[13px] font-bold text-gray-300">
              🚚 {options.rep.name} · {options.rep.van}
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-cardBorder bg-card/80 p-2.5 text-gray-300" aria-label="إغلاق">
            <X size={24} />
          </button>
        </header>

        {/* البيانات - the details */}
        <section className="flex flex-col gap-5 rounded-3xl border border-cardBorder bg-card/80 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <Field icon={<User size={18} />} label="اسم العميل / المحل" hint="(مطلوب)">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلا: سوبر ماركت الأمل" className={input} autoFocus={!initialName} />
          </Field>
          <Field icon={<Phone size={18} />} label="الموبايل" hint="(اختياري)">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.slice(0, 14))}
              placeholder="01xxxxxxxxx"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              className={`${input} font-numbers tracking-wider ${phoneBad ? "border-statusRed" : ""}`}
            />
            {phoneBad && <span className="text-[14px] font-bold text-statusRed">لازم 11 رقم ويبدأ بـ 010 / 011 / 012 / 015</span>}
          </Field>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-cardBorder bg-card/80 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <Field icon={<MapPin size={18} />} label="المنطقة / المدينة" hint="(مطلوب)">
            {options.areas.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {options.areas.map((a) => (
                  <button key={a} type="button" onClick={() => setArea(a)} className={chip(area === a)}>
                    {a}
                  </button>
                ))}
              </div>
            )}
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="اكتب المنطقة أو اختار من فوق" className={input} />
          </Field>
          <Field icon={<Store size={18} />} label="العنوان بالتفصيل" hint="(مطلوب)">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="الشارع / علامة مميزة" className={input} />
          </Field>
          {/* حدد موقعي (اختياري) - pin my location (optional) */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className={`flex h-14 items-center justify-center gap-2 rounded-2xl border text-[17px] font-extrabold ${gps ? "border-statusGreen/60 bg-statusGreen/10 text-statusGreen" : "border-dashed border-brandBlue/60 bg-brandBlue/10 text-sky-300"}`}
            >
              {locating ? <Loader2 size={20} className="animate-spin" /> : <LocateFixed size={20} />}
              {locating ? "بيحدد الموقع…" : gps ? "✓ الموقع اتحدد — حدد تاني" : "🗺️ حدد موقعي"}
              <span className="text-[13px] font-semibold opacity-70">(اختياري)</span>
            </button>
            {gpsError && <span className="text-[14px] font-bold text-statusRed">{gpsError}</span>}
            {gps && map && (
              <div className="overflow-hidden rounded-2xl border border-cardBorder">
                <iframe title="الموقع" src={map} className="pointer-events-none block h-40 w-full" loading="lazy" />
                <p dir="ltr" className="flex justify-between bg-background/80 px-3 py-1.5 font-numbers text-[12px] text-gray-400">
                  <span>
                    {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                  </span>
                  {gps.accuracy !== null && <span>± {gps.accuracy} m</span>}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-cardBorder bg-card/80 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <span className="flex items-center gap-2 text-[16px] font-extrabold text-gray-200">
            <Tag size={18} className="text-brandOrange" /> نوع العميل
          </span>
          <div className="flex flex-wrap gap-2">
            {options.customerTypes.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={chip(type === t)}>
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* موجود قبل كده - already exists */}
        {existing && (
          <section className="flex flex-col gap-3 rounded-3xl border border-statusAmber/60 bg-statusAmber/10 p-5">
            <p className="text-[18px] font-extrabold text-statusAmber">⚠ العميل ده موجود</p>
            <div className="rounded-2xl bg-background/70 px-4 py-3">
              <p className="text-[18px] font-bold text-white">{existing.name}</p>
              {existing.phone && (
                <p dir="ltr" className="text-end font-numbers text-[14px] text-gray-400">
                  {existing.phone}
                </p>
              )}
              {existing.address && <p className="text-[14px] text-gray-400">📍 {existing.address}</p>}
            </div>
            <button type="button" onClick={() => onCreated(existing, null)} className="h-12 rounded-2xl bg-statusAmber text-[17px] font-extrabold text-black">
              اختار العميل ده
            </button>
          </section>
        )}
        {error && <p className="rounded-2xl border border-statusRed/50 bg-statusRed/10 px-4 py-3 text-[16px] font-bold text-statusRed">⚠ {error}</p>}

        <button
          type="button"
          disabled={!ready}
          onClick={save}
          className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-statusGreen text-[21px] font-extrabold text-black shadow-[0_8px_30px_rgba(34,197,94,0.35)] disabled:opacity-45"
        >
          {busy ? <Loader2 size={24} className="animate-spin" /> : <Check size={24} />}
          {busy ? "بيسجل…" : "سجّل العميل"}
        </button>
        <button type="button" onClick={onBack} className="h-14 rounded-2xl border border-cardBorder bg-card/80 text-[17px] font-bold text-gray-300">
          رجوع للقايمة
        </button>
      </div>
    </div>
  );
}
