"use client";

// لوحة تفاصيل عميل: البيانات (اتصال / واتساب / خريطة)، المؤشرات، مشترياته آخر 12 شهر، المنتجات، أعمار المديونية،
// الملاحظات (عندنا)، الفواتير والدفعات (تفتح في ERPNext). التفاصيل بتتجاب لما اللوحة تتفتح بس
// A customer's details panel: profile (call / WhatsApp / map), KPIs, last 12 months, products, debt aging, notes (ours),
// invoices and payments (open in ERPNext). Details are fetched only when the panel opens

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, MapPin, MessageCircle, Phone, X } from "lucide-react";
import { formatNumber, formatTime12 } from "@/lib/format";
import type { CustomerDetails, CustomerNote, CustomerRow, CustomersRep } from "@/lib/customer-types";
import { monthName } from "../SalesCommon";
import { fetcher, fmtDate, mapUrl, Money, N, recency, RepChip, waNumber } from "./common";

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-cardBorder bg-background/50 p-4 ${className}`}>
      <h3 className="text-[17px] font-extrabold text-white mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, packets, amount, invoices }: { label: string; packets: number; amount: number; invoices?: number }) {
  return (
    <div className="rounded-xl border border-cardBorder bg-card px-3 py-2">
      <p className="text-gray-400 text-[13px] font-semibold">{label}</p>
      <p className="leading-[1.3]">
        <N value={packets} className="text-[24px] font-extrabold text-brandYellow" /> <span className="text-gray-400 text-[13px]">باكت</span>
      </p>
      <p className="text-[13px] text-gray-300">
        <Money value={amount} />
        {invoices !== undefined && <span className="text-gray-500"> · {invoices} فاتورة</span>}
      </p>
    </div>
  );
}

function MonthsChart({ months }: { months: CustomerDetails["months"] }) {
  const data = months.map((m) => ({ ...m, label: monthName(m.month).slice(0, 6) }));
  return (
    <div className="h-[220px]" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#232B40" />
          <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={{ stroke: "#232B40" }} tickLine={false} reversed />
          <YAxis orientation="right" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const m = payload[0].payload as (typeof data)[number];
              return (
                <div dir="rtl" className="rounded-xl border border-cardBorder bg-card px-3 py-2 text-[13px] shadow-xl">
                  <p className="font-bold text-white">
                    {monthName(m.month)} {m.month.slice(0, 4)}
                  </p>
                  <p className="text-gray-300">
                    <N value={m.packets} className="text-brandYellow font-bold" /> باكت
                  </p>
                  <p className="text-gray-300">
                    <Money value={m.amount} />
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="packets" fill="#FF7A00" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Notes({ id, note, tags, enabled, onSaved }: { id: string; note: CustomerNote | null; tags: string[]; enabled: boolean; onSaved: (n: CustomerNote | null) => void }) {
  const [text, setText] = useState(note?.text ?? "");
  const [chosen, setChosen] = useState<string[]>(note?.tags ?? []);
  const [custom, setCustom] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const allTags = Array.from(new Set([...tags, ...chosen]));
  const dirty = text !== (note?.text ?? "") || chosen.join("|") !== (note?.tags ?? []).join("|");
  const toggle = (t: string) => setChosen((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
  const save = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/customers/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text, tags: chosen }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { note: CustomerNote | null };
      onSaved(body.note);
      setState("saved");
    } catch {
      setState("error");
    }
  };
  if (!enabled) return <p className="text-gray-500">الملاحظات محتاجة Redis (Upstash) يتفعّل في Vercel.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {allTags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={`px-2.5 py-0.5 rounded-full border text-[13px] font-bold ${
              chosen.includes(t) ? "border-brandOrange bg-brandOrange/20 text-white" : "border-cardBorder text-gray-400 hover:bg-white/5"
            }`}
          >
            {chosen.includes(t) ? "✓ " : ""}
            {t}
          </button>
        ))}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              toggle(custom.trim());
              setCustom("");
            }
          }}
          placeholder="+ تاج جديد (Enter)"
          className="w-[150px] px-2 py-0.5 rounded-full border border-dashed border-cardBorder bg-transparent text-[13px] text-white placeholder:text-gray-500 outline-none focus:border-brandOrange"
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="ملاحظات عن العميل (بتتحفظ عندنا بس، مش في ERPNext)"
        className="w-full rounded-xl border border-cardBorder bg-card p-2 text-white placeholder:text-gray-500 outline-none focus:border-brandOrange resize-y"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === "saving"}
          className="px-4 py-1.5 rounded-xl bg-gradient-to-l from-brandOrange to-brandDeepOrange text-white font-bold disabled:opacity-40"
        >
          {state === "saving" ? "جاري الحفظ..." : "حفظ"}
        </button>
        {state === "saved" && !dirty && <span className="text-statusGreen text-[14px]">اتحفظ ✓</span>}
        {state === "error" && <span className="text-statusRed text-[14px]">الحفظ فشل — جرّب تاني</span>}
        {note?.updatedAt && <span className="text-gray-500 text-[12px] ms-auto">آخر تعديل {fmtDate(note.updatedAt.slice(0, 10))} {formatTime12(note.updatedAt)}</span>}
      </div>
    </div>
  );
}

export default function CustomerPanel({ row, reps, inactiveDays, tags, zoom = 1, note, notesEnabled, onNoteSaved, onClose }: {
  row: CustomerRow;
  reps: Map<string, CustomersRep>;
  inactiveDays: number;
  tags: string[];
  zoom?: number; // نفس تكبير الصفحة - the page zoom
  note: CustomerNote | null;
  notesEnabled: boolean;
  onNoteSaved: (id: string, note: CustomerNote | null) => void;
  onClose: () => void;
}) {
  const { data, error } = useSWR<CustomerDetails>(`/api/customers/details?id=${encodeURIComponent(row.id)}`, fetcher, { revalidateOnFocus: false });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rc = recency(row.daysSince, inactiveDays);
  const wa = row.mobile ? waNumber(row.mobile) : null;
  const map = mapUrl(row);
  const totalProducts = data ? data.products.reduce((s, p) => s + Math.max(0, p.packets), 0) : 0;
  const th = "px-2 py-1.5 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const td = "px-2 border-b border-cardBorder/60 text-center whitespace-nowrap";
  const link = "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-cardBorder bg-card hover:bg-cardBorder text-gray-200 font-bold text-[14px]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label={row.name}>
      <div
        // المقاس متظبط بالتكبير عشان اللوحة تفضل جوه الشاشة - size compensated for the zoom so it stays on screen
        style={{ zoom, width: `min(1200px, ${97 / zoom}vw)`, height: `${94 / zoom}vh` }}
        className="relative flex flex-col rounded-2xl border border-cardBorder bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* الاسم والمندوب والحالة - name, rep and status */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-cardBorder">
          <h2 className="text-[26px] font-extrabold text-white">{row.name}</h2>
          {row.type && <span className="px-2 py-0.5 rounded-full border border-cardBorder text-gray-300 text-[13px] font-bold">{row.type}</span>}
          <RepChip rep={row.repId ? reps.get(row.repId) : undefined} />
          {row.repFromOverride && <span className="text-gray-500 text-[12px]">(مثبت بالإيد)</span>}
          <span className={`text-[13px] font-bold border rounded-full px-2 ${rc.cls}`}>آخر شرا {rc.text}</span>
          {row.isNew && <span className="text-[13px] font-bold text-sky-300 border border-sky-400/40 bg-sky-400/10 rounded-full px-2">✨ جديد</span>}
          <div className="ms-auto flex items-center gap-2">
            {data && (
              <a href={data.erpUrl} target="_blank" rel="noreferrer" className={link}>
                <ExternalLink size={15} /> ERPNext
              </a>
            )}
            <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {/* البيانات - profile */}
          <div className="flex flex-wrap items-center gap-2 text-[15px]">
            {row.mobile ? (
              <>
                <a href={`tel:${row.mobile.replace(/[^\d+]/g, "")}`} className={link}>
                  <Phone size={15} /> <span dir="ltr" className="font-numbers">{row.mobile}</span>
                </a>
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={`${link} text-statusGreen`}>
                    <MessageCircle size={15} /> واتساب
                  </a>
                )}
              </>
            ) : (
              <span className="text-statusRed font-bold">📵 مفيش موبايل</span>
            )}
            {map && (
              <a href={map} target="_blank" rel="noreferrer" className={`${link} text-sky-300`}>
                <MapPin size={15} /> الخريطة
              </a>
            )}
            <span className="text-gray-300">📍 {row.area ?? <span className="text-statusRed">مفيش منطقة</span>}</span>
            <span className="text-gray-400">🏠 {row.address ?? <span className="text-statusRed">مفيش عنوان</span>}</span>
            <span className="text-gray-500 ms-auto text-[13px]">
              أول شرا {fmtDate(row.firstDate)} · آخر شرا {fmtDate(row.lastDate)}
              {row.created && <> · اتضاف {fmtDate(row.created)}</>}
            </span>
          </div>

          {/* المؤشرات - KPIs */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="الشهر ده" packets={row.month.packets} amount={row.month.amount} invoices={row.month.invoices} />
            <Stat label="آخر 3 شهور" packets={row.three.packets} amount={row.three.amount} invoices={row.three.invoices} />
            <Stat label="من الأول" packets={row.all.packets} amount={row.all.amount} invoices={row.all.invoices} />
            <div className="rounded-xl border border-cardBorder bg-card px-3 py-2">
              <p className="text-gray-400 text-[13px] font-semibold">متوسط الفاتورة</p>
              <p className="leading-[1.5]"><Money value={row.avgOrder} className="text-[24px] font-extrabold text-white" /></p>
              <p className="text-[13px] text-gray-400">بيحب: {row.favorites.length ? row.favorites.join("، ") : "—"}</p>
            </div>
            <div className="rounded-xl border border-cardBorder bg-card px-3 py-2 xl:col-span-2">
              <p className="text-gray-400 text-[13px] font-semibold">المديونية</p>
              <p className="leading-[1.5]">
                <Money value={row.debt} className={`text-[24px] font-extrabold ${row.debt > 0.5 ? "text-brandOrange" : "text-statusGreen"}`} />
              </p>
              <p className="text-[13px] text-gray-400">
                {row.oldestUnpaid ? (
                  <>
                    أقدم فاتورة مفتوحة {fmtDate(row.oldestUnpaid.date)} (<span className="text-statusRed font-bold">من {row.oldestUnpaid.days} يوم</span>)
                  </>
                ) : (
                  "مفيش فواتير مفتوحة ✅"
                )}
              </p>
            </div>
          </div>

          {!data ? (
            <p className="text-center text-gray-400 py-10 text-lg">{error ? "⚠️ التفاصيل مش راضية تيجي من ERPNext" : "جاري تحميل التفاصيل..."}</p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Section title="📊 المشتريات آخر 12 شهر (باكت)">
                  <MonthsChart months={data.months} />
                </Section>
                <Section title="📦 المنتجات (من الأول)">
                  <div className="flex flex-col gap-2">
                    {data.products.map((p) => {
                      const pct = totalProducts > 0 ? Math.round((Math.max(0, p.packets) / totalProducts) * 100) : 0;
                      return (
                        <div key={p.label}>
                          <div className="flex items-center text-[14px]">
                            <span className="text-gray-300 font-semibold">{p.label}</span>
                            <span className="ms-auto text-gray-400">
                              <N value={p.packets} className="text-white font-bold" /> باكت · {pct}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-card border border-cardBorder overflow-hidden">
                            <div className="h-full rounded-full bg-brandYellow" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="⏳ أعمار المديونية">
                  <div className="grid grid-cols-2 gap-2">
                    {data.aging.map((a, i) => (
                      <div key={a.label} className="rounded-xl border border-cardBorder bg-card px-3 py-2">
                        <p className="text-gray-400 text-[13px] font-semibold">{a.label}</p>
                        <p>
                          <Money value={a.amount} className={`text-[20px] font-extrabold ${a.amount <= 0 ? "text-gray-600" : i >= 2 ? "text-statusRed" : "text-brandOrange"}`} />
                        </p>
                        <p className="text-gray-500 text-[12px]">{a.invoices} فاتورة</p>
                      </div>
                    ))}
                  </div>
                  {data.unlinkedCredit > 0.5 && (
                    <p className="text-gray-500 text-[13px] mt-2">
                      اتخصم <Money value={data.unlinkedCredit} /> دفعات مش متربطة بفواتير (على أقدم الفواتير الأول)
                    </p>
                  )}
                </Section>
                <Section title="📝 ملاحظات وتاجات">
                  <Notes id={row.id} note={note} tags={tags} enabled={notesEnabled} onSaved={(n) => onNoteSaved(row.id, n)} />
                </Section>
              </div>

              <Section title={`🧾 الفواتير (${data.invoices.length})`}>
                {data.invoices.length === 0 ? (
                  <p className="text-gray-500">مفيش فواتير</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full border-separate border-spacing-0 text-[14px] leading-[2.2]">
                      <thead className="sticky top-0 bg-background">
                        <tr>
                          <th className={th}>التاريخ</th>
                          <th className={th}>الساعة</th>
                          <th className={th}>الفاتورة</th>
                          <th className={th}>باكت</th>
                          <th className={th}>المبلغ</th>
                          <th className={th}>المدفوع</th>
                          <th className={th}>الباقي</th>
                          <th className={th}>المندوب</th>
                          <th className={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoices.map((inv) => (
                          <tr key={inv.name} className={inv.isReturn ? "text-statusRed" : ""}>
                            <td className={`${td} font-numbers`}>{fmtDate(inv.date)}</td>
                            <td className={`${td} text-gray-400`}>{inv.time ? formatTime12(inv.time) : "—"}</td>
                            <td className={`${td} font-numbers text-gray-400 text-[12px]`} dir="ltr">
                              {inv.name} {inv.isReturn && <span className="text-statusRed">(مرتجع)</span>}
                            </td>
                            <td className={td}><N value={inv.packets} className={inv.isReturn ? "" : "text-brandYellow font-bold"} /></td>
                            <td className={td}><N value={inv.amount} /></td>
                            <td className={td}><N value={inv.paid} className="text-statusGreen" /></td>
                            <td className={td}><N value={inv.outstanding} className={inv.outstanding > 0.5 ? "text-brandOrange font-bold" : "text-gray-600"} /></td>
                            <td className={td}><RepChip rep={inv.repId ? reps.get(inv.repId) : undefined} small /></td>
                            <td className={td}>
                              <a href={inv.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline inline-flex items-center gap-1">
                                <ExternalLink size={13} /> افتح
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section title={`💵 الدفعات${data.payments ? ` (${data.payments.length})` : ""}`}>
                {data.payments === null ? (
                  <p className="text-statusRed">الدفعات مش راضية تيجي من ERPNext</p>
                ) : data.payments.length === 0 ? (
                  <p className="text-gray-500">مفيش دفعات منفصلة (المدفوع وقت الفاتورة ظاهر في جدول الفواتير)</p>
                ) : (
                  <div className="max-h-[320px] overflow-auto">
                    <table className="w-full border-separate border-spacing-0 text-[14px] leading-[2.2]">
                      <thead className="sticky top-0 bg-background">
                        <tr>
                          <th className={th}>التاريخ</th>
                          <th className={th}>المبلغ</th>
                          <th className={th}>طريقة الدفع</th>
                          <th className={th}>المستند</th>
                          <th className={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((p) => (
                          <tr key={p.name}>
                            <td className={`${td} font-numbers`}>{fmtDate(p.date)}</td>
                            <td className={td}>
                              <N value={p.amount} className={p.kind === "in" ? "text-statusGreen font-bold" : "text-statusRed font-bold"} />
                              {p.kind === "out" && <span className="text-statusRed text-[12px]"> (رد للعميل)</span>}
                            </td>
                            <td className={`${td} text-gray-300`}>{p.mode ?? "—"}</td>
                            <td className={`${td} font-numbers text-gray-400 text-[12px]`} dir="ltr">{p.name}</td>
                            <td className={td}>
                              <a href={p.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline inline-flex items-center gap-1">
                                <ExternalLink size={13} /> افتح
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
