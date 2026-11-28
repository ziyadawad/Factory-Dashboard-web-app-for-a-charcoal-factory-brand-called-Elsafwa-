"use client";

// لوحة "🧠 تحليل واقتراحات": الاقتراحات فوق (كل واحد بيفتح قايمة العملاء بالفلتر بتاعه)، وتحتها كروت التحليل
// The "🧠 تحليل واقتراحات" panel: suggestions on top (each opens the customers list with its filter), analysis cards below

import { useEffect } from "react";
import { X } from "lucide-react";
import { dashboardConfig } from "@/config/dashboard.config";
import type { AreaStat, InsightLink, Insights, Suggestion } from "@/lib/customer-insights";
import type { CustomersRep } from "@/lib/customer-types";
import { N, NO_REP, RepChip } from "./common";

const T = dashboardConfig.customers.insights;

const TONE: Record<Suggestion["tone"], string> = {
  bad: "border-statusRed/50 bg-statusRed/10",
  warn: "border-brandOrange/50 bg-brandOrange/10",
  info: "border-sky-400/50 bg-sky-400/10",
  good: "border-statusGreen/50 bg-statusGreen/10",
};

function Growth({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const cls = value >= T.growthUpPercent ? "text-statusGreen" : value <= T.growthDownPercent ? "text-statusRed" : "text-gray-300";
  return (
    <span dir="ltr" className={`font-numbers font-bold ${cls}`}>
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-cardBorder bg-background/50 p-3 flex flex-col">
      <h3 className="text-[16px] font-extrabold text-white">{title}</h3>
      {hint && <p className="text-[12px] text-gray-500 mb-2">{hint}</p>}
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

// سطر منطقة قابل للضغط - a clickable area line
function Line({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[14px] text-start hover:bg-white/5">
      <span className="flex-1 min-w-0 truncate text-gray-100 font-semibold">📍 {label}</span>
      <span className="shrink-0 flex items-center gap-2 text-gray-400">{children}</span>
    </button>
  );
}

const Empty = ({ text = "مفيش" }: { text?: string }) => <p className="text-gray-500 text-[14px] px-2 py-1">{text}</p>;

export default function InsightsPanel({ insights, scope, repId, reps, inactiveDays, onPick, onClose }: {
  insights: Insights;
  scope: string;
  repId: string; // "all" أو المندوب المختار - "all" or the chosen rep
  reps: Map<string, CustomersRep>;
  inactiveDays: number;
  onPick: (link: InsightLink) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { areas, total } = insights;
  // المنطقة بتفتح في نفس النطاق (المندوب المختار أو الكل) - an area opens in the same scope (the chosen rep or all)
  const go = (a: AreaStat, status: InsightLink["status"] = null) => onPick({ rep: repId, area: a.key, status });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label="تحليل واقتراحات">
      <div className="relative w-[min(1400px,97vw)] h-[94vh] flex flex-col rounded-2xl border border-cardBorder bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-cardBorder">
          <h2 className="text-[24px] font-extrabold text-white">🧠 تحليل واقتراحات</h2>
          <span className="px-3 py-0.5 rounded-full border border-cardBorder text-gray-300 font-bold">{scope}</span>
          <span className="text-gray-400 text-[14px]">
            الشهر ده <N value={total.month} className="text-brandYellow font-bold" /> باكت مقابل <N value={total.lastMonthToDate} className="text-gray-200 font-bold" /> لحد
            نفس اليوم الشهر اللي فات <Growth value={total.growth} />
          </span>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="ms-auto p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {/* الاقتراحات - suggestions */}
          <section>
            <h3 className="text-[18px] font-extrabold text-white mb-2">💡 اقتراحات</h3>
            {insights.suggestions.length === 0 ? (
              <p className="text-statusGreen">مفيش حاجة محتاجة تدخل دلوقتي ✅</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {insights.suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPick(s.link)}
                    className={`text-start rounded-xl border px-3 py-2 hover:brightness-125 transition ${TONE[s.tone]}`}
                    title="اعرض العملاء دول"
                  >
                    <p className="text-[16px] font-extrabold text-white leading-[1.6]">
                      {s.icon} {s.text}
                    </p>
                    {s.detail && <p className="text-[13px] text-gray-300">{s.detail}</p>}
                    <p className="text-[12px] text-sky-300 mt-0.5">← اعرض العملاء</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card title="🏆 المناطق حسب المبيعات" hint="باكت الشهر ده · آخر 3 شهور · النمو">
              {areas.length === 0 && <Empty />}
              {areas.slice(0, 12).map((a, i) => (
                <Line key={a.key} label={`${i + 1}. ${a.label}`} onClick={() => go(a)}>
                  <N value={a.month} className="text-brandYellow font-bold" />
                  <N value={a.three} className="text-gray-400 text-[12px]" />
                  <Growth value={a.growth} />
                </Line>
              ))}
            </Card>

            <Card title="📈📉 النمو عن الشهر اللي فات" hint={`لحد نفس اليوم — مناطق فيها ${T.minAreaPackets} باكت على الأقل`}>
              {insights.growthUp.length + insights.growthDown.length === 0 && <Empty text="مفيش تغيير كبير" />}
              {insights.growthUp.slice(0, 5).map((a) => (
                <Line key={a.key} label={a.label} onClick={() => go(a, "active")}>
                  <N value={a.lastMonthToDate} className="text-gray-500 text-[12px]" /> ← <N value={a.month} className="text-white" /> <Growth value={a.growth} />
                </Line>
              ))}
              {insights.growthDown.slice(0, 5).map((a) => (
                <Line key={a.key} label={a.label} onClick={() => go(a)}>
                  <N value={a.lastMonthToDate} className="text-gray-500 text-[12px]" /> ← <N value={a.month} className="text-white" /> <Growth value={a.growth} />
                </Line>
              ))}
            </Card>

            <Card title="🚶 مناطق بتخسر عملاء" hint={`اشتروا آخر 3 شهور ووقفوا أكتر من ${inactiveDays} يوم`}>
              {insights.losing.length === 0 && <Empty text={`مفيش منطقة فيها ${T.lostMinCustomers} متوقفين أو أكتر ✅`} />}
              {insights.losing.slice(0, 8).map((a) => (
                <Line key={a.key} label={a.label} onClick={() => go(a, "lost")}>
                  <N value={a.lost} className="text-statusRed font-bold" /> متوقف من <N value={a.customers} />
                </Line>
              ))}
            </Card>

            <Card title="💰 مناطق مديونيتها عالية" hint={`أكتر من ${T.highDebtAmount.toLocaleString("en-US")} ج.م أو ${Math.round(T.highDebtRatio * 100)}% من مبيعات 3 شهور`}>
              {insights.highDebt.length === 0 && <Empty text="مفيش ✅" />}
              {insights.highDebt.slice(0, 8).map((a) => (
                <Line key={a.key} label={a.label} onClick={() => go(a, "debt")}>
                  <N value={a.debt} className="text-brandOrange font-bold" />
                  {a.threeAmount > 0 && <span className="text-[12px]">{Math.round((a.debt / a.threeAmount) * 100)}%</span>}
                </Line>
              ))}
            </Card>

            <Card title="🧾 متوسط الفاتورة" hint={`آخر 3 شهور — مناطق فيها ${T.avgOrderMinInvoices} فواتير على الأقل`}>
              {insights.bestAvg.length === 0 && <Empty />}
              {insights.bestAvg.length > 0 && <p className="text-[12px] text-statusGreen px-2">الأعلى</p>}
              {insights.bestAvg.map((a) => (
                <Line key={a.key} label={a.label} onClick={() => go(a)}>
                  <N value={a.avgOrder ?? 0} className="text-statusGreen font-bold" />
                </Line>
              ))}
              {insights.worstAvg.length > 0 && <p className="text-[12px] text-statusRed px-2 mt-1">الأقل</p>}
              {insights.worstAvg.map((a) => (
                <Line key={a.key} label={a.label} onClick={() => go(a)}>
                  <N value={a.avgOrder ?? 0} className="text-statusRed font-bold" />
                </Line>
              ))}
            </Card>

            <Card title="🔀 تداخل ومناطق من غير مندوب" hint={`منطقة فيها مندوبين (كل واحد ${T.overlapMinCustomers} عملاء على الأقل) · عملاء من غير مندوب`}>
              {insights.overlaps.length === 0 && insights.uncovered.length === 0 && <Empty text="مفيش تداخل ✅" />}
              {insights.overlaps.slice(0, 6).map((o) => (
                <button
                  key={o.area.key}
                  type="button"
                  onClick={() => onPick({ rep: o.reps[1].id, area: o.area.key, status: null })}
                  className="flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] text-start hover:bg-white/5"
                >
                  <span className="text-gray-100 font-semibold">📍 {o.area.label}</span>
                  {o.reps.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1">
                      <RepChip rep={reps.get(r.id)} small /> <N value={r.count} className="text-gray-400 text-[12px]" />
                    </span>
                  ))}
                </button>
              ))}
              {insights.uncovered.slice(0, 6).map((u) => (
                <Line key={`u-${u.area.key}`} label={u.area.label} onClick={() => onPick({ rep: NO_REP, area: u.area.key, status: null })}>
                  <N value={u.count} className="text-gray-200 font-bold" /> من غير مندوب
                </Line>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
