// علامة "غير متصل" الصغيرة على الكارت اللي ERPNext فشل فيه - the small "غير متصل" badge on a card whose ERPNext request failed
export function OfflineBadge() {
  return (
    <div className="shrink-0 flex items-center gap-1.5 bg-statusRed/10 px-2.5 py-1 rounded-lg border border-statusRed/50">
      <div className="w-2 h-2 rounded-full bg-statusRed" />
      <span className="text-statusRed text-xs font-semibold whitespace-nowrap">غير متصل</span>
    </div>
  );
}

// كارت فاضي: ERPNext فشل ومفيش أي نتيجة قديمة النهارده، فمش بنعرض أرقام غلط (زي 0/0)
// Empty card: ERPNext failed and there is no earlier result today, so no fake numbers (like 0/0) are shown
export function OfflineCard({ title }: { title: string }) {
  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">{title}</h2>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <OfflineBadge />
      </div>
    </div>
  );
}
