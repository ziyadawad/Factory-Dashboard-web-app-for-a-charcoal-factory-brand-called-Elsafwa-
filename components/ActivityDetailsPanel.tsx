"use client";

import useSWR from "swr";
import { ExternalLink, X } from "lucide-react";
import { ActivityDetails, ActivityEvent } from "@/lib/types";
import { formatDayName } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";

// لوحة تفاصيل حدث من "اللي بيحصل دلوقتي" (نفس شكل باقي اللوحات): المستند كامل بيتجاب بس لما تتفتح
// An activity event's details panel (same style as the other panels): the full document is fetched only when opened

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const TONE: Record<string, string> = { in: "text-statusGreen", out: "text-statusRed", accent: "text-brandOrange" };

export default function ActivityDetailsPanel({ event, icon, color, onClose }: { event: ActivityEvent; icon: string; color: string; onClose: () => void }) {
  useIdleClose(onClose);
  const { data, error, isLoading } = useSWR<ActivityDetails>(
    `/api/activity/details?doctype=${encodeURIComponent(event.doctype)}&name=${encodeURIComponent(event.docname)}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const th = "px-3 py-2 font-semibold text-gray-400 border-b border-cardBorder";
  const td = "px-3 py-1 border-b border-cardBorder/60 align-top";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1300px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl text-[15px] min-[1600px]:text-[17px]"
        style={{ borderTopColor: color, borderTopWidth: 4 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان - header */}
        <div className="shrink-0 flex items-start gap-4 px-5 py-3 border-b border-cardBorder">
          <span className="text-[34px] leading-none shrink-0 mt-1">{icon}</span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-baseline gap-x-4 font-extrabold text-white text-[22px] min-[1600px]:text-[26px] leading-[1.5] break-words">
              <span>{event.title}</span>
              {event.amount !== null && (
                <span dir="ltr" className="font-numbers" style={{ color }}>
                  {new Intl.NumberFormat("en-US").format(event.amount)} ج.م
                </span>
              )}
            </h2>
            <p className="text-gray-200 font-semibold break-words">{event.details}</p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-400 mt-1">
              <span>
                {event.doctype} <span dir="ltr" className="font-numbers text-gray-200">{event.docname}</span>
              </span>
              {data?.postingDate && (
                <span className="inline-flex items-baseline gap-1.5">
                  التاريخ: <span className="text-gray-200">{formatDayName(data.postingDate)}</span>
                  {data.postingTime && (
                    <span dir="ltr" className="font-numbers text-gray-200">
                      {data.postingTime}
                    </span>
                  )}
                </span>
              )}
              {data && (
                <span>
                  سجّلها: <span className="text-gray-200">{data.owner || "—"}</span>
                </span>
              )}
              {data?.creation && (
                <span>
                  وقت التسجيل: <span dir="ltr" className="font-numbers text-gray-200">{data.creation}</span>
                </span>
              )}
              {data && data.lateDays > 1 && (
                <span className="rounded-full bg-brandOrange/15 text-brandOrange font-bold px-2.5 leading-[1.8]">اتسجلت متأخر {data.lateDays} يوم</span>
              )}
            </p>
          </div>
          {data?.erpUrl && (
            <a
              href={data.erpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-2 rounded-xl border border-brandOrange/50 bg-brandOrange/10 text-brandOrange px-4 py-2 font-bold hover:bg-brandOrange/20"
            >
              <ExternalLink size={18} />
              افتح في ERPNext
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="shrink-0 p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
          >
            <X size={26} />
          </button>
        </div>

        {/* المحتوى (بيعمل scroll جوه اللوحة) - the content (scrolls inside the panel) */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error && !isLoading ? "مش قادر أجيب التفاصيل — جرب تاني بعد شوية" : "جاري تحميل التفاصيل..."}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* الخانات: النص كامل من غير قص - the fields: full text, never cut */}
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {data.fields.map((f, i) => (
                  <div key={`${f.label}-${i}`} className={`rounded-xl bg-background/60 border border-cardBorder px-3 py-2 min-w-0 ${f.value.length > 60 ? "col-span-full" : ""}`}>
                    <p className="text-gray-500 text-[0.85em]">{f.label}</p>
                    <p className={`font-bold break-words whitespace-pre-wrap ${f.tone ? TONE[f.tone] : "text-gray-100"}`}>{f.value}</p>
                  </div>
                ))}
              </div>
              {data.tables.map((t) => (
                <div key={t.title} className="rounded-xl border border-cardBorder overflow-hidden">
                  <h3 className="px-3 py-2 bg-background/70 font-bold text-white">{t.title}</h3>
                  {t.rows.length === 0 ? (
                    <p className="px-3 py-2 text-gray-500">لا يوجد</p>
                  ) : (
                    <table className="w-full border-separate border-spacing-0 leading-[1.9]">
                      <thead>
                        <tr>
                          {t.columns.map((c) => (
                            <th key={c.label} className={`${th} ${c.num ? "text-center" : "text-start"}`}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-white/5">
                            {r.map((cell, j) => (
                              <td key={j} className={`${td} break-words ${t.columns[j]?.num ? "text-center font-bold text-white whitespace-nowrap" : "text-gray-200"}`}>
                                {t.columns[j]?.num ? (
                                  <span dir="ltr" className="font-numbers">
                                    {cell}
                                  </span>
                                ) : (
                                  cell
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {t.footer && (
                        <tfoot>
                          <tr className="bg-background/70 font-extrabold">
                            {t.footer.map((cell, j) => (
                              <td key={j} className={`px-3 py-1.5 ${t.columns[j]?.num ? "text-center text-brandOrange" : "text-white"}`}>
                                {t.columns[j]?.num ? (
                                  <span dir="ltr" className="font-numbers">
                                    {cell}
                                  </span>
                                ) : (
                                  cell
                                )}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
