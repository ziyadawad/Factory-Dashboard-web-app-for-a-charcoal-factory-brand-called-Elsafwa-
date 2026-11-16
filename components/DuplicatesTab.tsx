"use client";

import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { DuplicatesReport } from "@/lib/types";
import { formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";

// تاب "⚠ عمليات مكررة": عمليات شكلها مكررة في آخر 60 يوم (قراية بس)، بتتجاب بس لما التاب يتفتح
// The "⚠ عمليات مكررة" tab: suspected duplicates in the last 60 days (read-only), fetched only when the tab opens

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const n = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(value)}
  </span>
);

export default function DuplicatesTab({ scope }: { scope: "money" | "stock" }) {
  const { data, error, isLoading } = useSWR<DuplicatesReport>(`/api/duplicates?scope=${scope}`, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-xl text-gray-400">
        {error && !isLoading ? "غير متصل — جرب تاني بعد شوية" : "بدوّر على العمليات المكررة..."}
      </div>
    );
  }
  return (
    <div className="px-5 py-3 flex flex-col gap-2.5">
      <p className="text-gray-400">
        عمليات بنفس البيانات من{" "}
        <span dir="ltr" className="font-numbers">{data.from.slice(8)}/{Number(data.from.slice(5, 7))}</span> لحد النهارده (آخر 60 يوم، من غير الملغي) —{" "}
        <b className={data.items.length ? "text-brandOrange" : "text-statusGreen"}>
          {data.items.length ? `${data.items.length} حالة` : "مفيش تكرار ✓"}
        </b>
        {data.skipped.length > 0 && <span className="text-gray-500"> · مش متاح: {data.skipped.join("، ")}</span>}
      </p>
      {data.items.map((d) => (
        <div key={d.id} className="rounded-xl border border-brandOrange/40 bg-brandOrange/[0.06] px-4 py-2 flex flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="rounded-full bg-brandOrange/20 text-brandOrange font-bold px-2.5 text-[0.85em] leading-[1.8]">
              ⚠ {d.label} ×{n(d.docs.length)}
            </span>
            <span className="text-white font-semibold">{formatDayName(d.date)}</span>
            {d.amount !== null && <b className="text-white">{n(d.amount)} ج.م</b>}
            <span className="text-gray-200 min-w-0 break-words">{toEnglishDigits(d.summary)}</span>
          </p>
          <p className="text-[0.85em] text-gray-500">القاعدة: {d.rule}</p>
          <div className="flex flex-col gap-0.5">
            {d.docs.map((doc) => (
              <p key={doc.name} className="flex flex-wrap items-center gap-x-3 text-[0.95em]">
                <span dir="ltr" className="font-numbers text-gray-100">{doc.name}</span>
                {doc.docstatus === 0 && <span className="rounded-full bg-gray-500/25 text-gray-300 px-2 text-[0.8em] font-bold">مسودة</span>}
                <span className="text-gray-400">
                  سجّلها <span className="text-gray-200">{doc.owner || "—"}</span>
                </span>
                <span dir="ltr" className="font-numbers text-gray-500">{doc.creation}</span>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-brandOrange hover:underline underline-offset-2"
                >
                  <ExternalLink size={14} />
                  افتح في ERPNext
                </a>
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
