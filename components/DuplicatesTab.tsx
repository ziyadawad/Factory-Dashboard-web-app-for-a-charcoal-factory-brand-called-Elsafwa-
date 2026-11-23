"use client";

import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { DuplicatesReport, SuspectedDuplicate } from "@/lib/types";
import { formatDateTime12, formatDayName, formatNumber, toEnglishDigits } from "@/lib/format";

// تاب "⚠ عمليات مكررة": بس اللي كل حاجة فيه زي بعض بعد مقارنة المستند كامل (قراية بس، آخر 60 يوم)
// The "⚠ عمليات مكررة" tab: only groups identical in everything after a full-document comparison (read-only, last 60 days)

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

const LEVEL = {
  sure: { label: "مكررة أكيد", box: "border-brandOrange/50 bg-brandOrange/[0.06]", chip: "bg-brandOrange/20 text-brandOrange" },
  draft: { label: "مسودة شبه عملية متسجلة", box: "border-gray-500/50 bg-white/[0.03]", chip: "bg-gray-500/25 text-gray-200" },
} as const;

// مقارنة جنب بعض: أي خانة أو سطر بيفرق بيتلوّن - side by side: any differing field or row is highlighted
function Compare({ item }: { item: SuspectedDuplicate }) {
  const docs = item.docs;
  const labels = docs[0]?.compare.fields.map(([label]) => label) ?? [];
  const valueOf = (i: number, label: string) => docs[i].compare.fields.find(([l]) => l === label)?.[1] ?? "—";
  const differs = (label: string) => new Set(docs.map((_, i) => valueOf(i, label))).size > 1;
  const rowIn = (row: string) => docs.every((d) => d.compare.rows.includes(row));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[0.85em] leading-[1.7]">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 text-start font-semibold border-b border-cardBorder w-[9em]" />
            {docs.map((d) => (
              <th key={d.name} className="px-2 text-start font-semibold border-b border-cardBorder">
                <span dir="ltr" className="font-numbers text-gray-200">{d.name}</span>
                {d.docstatus === 0 && <span className="ms-1.5 rounded-full bg-gray-500/25 text-gray-300 px-1.5 text-[0.85em]">مسودة</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label) => {
            const diff = differs(label);
            return (
              <tr key={label}>
                <td className="px-2 border-b border-cardBorder/40 text-gray-500 align-top">{label}</td>
                {docs.map((d, i) => (
                  <td key={d.name} className={`px-2 border-b border-cardBorder/40 align-top break-words ${diff ? "text-brandYellow font-bold bg-brandYellow/10" : "text-gray-200"}`}>
                    {toEnglishDigits(valueOf(i, label))}
                  </td>
                ))}
              </tr>
            );
          })}
          {docs.some((d) => d.compare.rows.length > 0) && (
            <tr>
              <td className="px-2 border-b border-cardBorder/40 text-gray-500 align-top">السطور</td>
              {docs.map((d) => (
                <td key={d.name} className="px-2 border-b border-cardBorder/40 align-top">
                  {d.compare.rows.map((row, i) => (
                    <p key={i} className={`break-words ${rowIn(row) ? "text-gray-300" : "text-brandYellow font-bold bg-brandYellow/10"}`}>
                      {toEnglishDigits(row)}
                    </p>
                  ))}
                </td>
              ))}
            </tr>
          )}
          <tr className="text-gray-500">
            <td className="px-2 align-top">سجّلها</td>
            {docs.map((d) => (
              <td key={d.name} className="px-2 align-top">
                {d.owner || "—"} · <span dir="ltr" className="font-numbers">{formatDateTime12(d.creation)}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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
  const sure = data.items.filter((d) => d.level === "sure").length;
  const drafts = data.items.length - sure;
  return (
    <div className="px-5 py-3 flex flex-col gap-2.5">
      <p className="text-gray-400">
        آخر 60 يوم (من غير الملغي)، ومقارنة المستند كامل: البيان والمرجع وكل السطور —{" "}
        <b className={sure ? "text-brandOrange" : "text-statusGreen"}>{sure ? `${sure} مكررة أكيد` : "مفيش تكرار أكيد ✓"}</b>
        {drafts > 0 && <span className="text-gray-300"> · {drafts} مسودة شبه عملية متسجلة</span>}
        <span className="text-gray-500"> · اتفحص {data.checked} واتشال {data.rejected.length} لأنهم بيفرقوا في حاجة</span>
        {data.skipped.length > 0 && <span className="text-gray-500"> · مش متاح: {data.skipped.join("، ")}</span>}
      </p>
      {data.items.map((d) => {
        const level = LEVEL[d.level];
        return (
          <div key={d.id} className={`rounded-xl border ${level.box} px-4 py-2 flex flex-col gap-1.5`}>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className={`rounded-full font-bold px-2.5 text-[0.85em] leading-[1.8] ${level.chip}`}>
                ⚠ {level.label} · {d.label} ×{n(d.docs.length)}
              </span>
              <span className="text-white font-semibold">{formatDayName(d.date)}</span>
              {d.amount !== null && <b className="text-white">{n(d.amount)} ج.م</b>}
              <span className="text-gray-200 min-w-0 break-words">{toEnglishDigits(d.summary)}</span>
            </p>
            <Compare item={d} />
            <div className="flex flex-wrap gap-x-4">
              {d.docs.map((doc) => (
                <a
                  key={doc.name}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-brandOrange hover:underline underline-offset-2 text-[0.9em]"
                >
                  <ExternalLink size={14} />
                  افتح <span dir="ltr" className="font-numbers">{doc.name}</span> في ERPNext
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
