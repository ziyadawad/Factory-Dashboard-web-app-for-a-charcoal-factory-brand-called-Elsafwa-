"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Factory, Package, Axe, Truck, LucideIcon } from "lucide-react";
import { FloorWorkers, WorkerGroup } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface FloorWorkersSectionProps {
  data: FloorWorkers;
}

const GROUPS: { key: keyof FloorWorkers; icon: LucideIcon }[] = [
  { key: "production", icon: Factory },
  { key: "packing", icon: Package },
  { key: "saw", icon: Axe },
  { key: "drivers", icon: Truck },
];

export default function FloorWorkersSection({ data }: FloorWorkersSectionProps) {
  const sizes = dashboardConfig.sizes.floorWorkers;

  const groups = GROUPS.map(({ key, icon }) => ({ group: data[key], icon, key }));
  const totalPresent = groups.reduce((sum, { group }) => sum + group.presentNames.length, 0);
  const totalRegistered = groups.reduce((sum, { group }) => sum + group.total, 0);

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور عمال</h2>
        <p className="text-gray-400 text-sm whitespace-nowrap">
          الإجمالي: <span className="text-white font-bold tabular-nums">{formatNumber(totalPresent)}</span> حاضر من{" "}
          <span className="text-white font-bold tabular-nums">{formatNumber(totalRegistered)}</span>
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2">
        {groups.map(({ group, icon, key }) => (
          <GroupBox key={key} group={group} icon={icon} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}

interface GroupBoxProps {
  group: WorkerGroup;
  icon: LucideIcon;
  sizes: typeof dashboardConfig.sizes.floorWorkers;
}

function GroupBox({ group, icon: Icon, sizes }: GroupBoxProps) {
  const present = group.presentNames.length;
  const percentage = group.total > 0 ? Math.min(100, (present / group.total) * 100) : 0;
  const initialVisible = Math.min(present, sizes.maxVisibleNames);
  const namesKey = group.presentNames.join("|");

  // بنصغر الخط خطوة خطوة لحد ما الأسماء تكفي، وبعدها بنخبي أسماء ونعرض "+N"
  // Shrink the font step by step until the chips fit, then hide names behind "+N"
  const [fit, setFit] = useState({ fontSize: sizes.nameChipFontSize, visible: initialVisible });
  const chipsRef = useRef<HTMLDivElement>(null);

  // نرجع للبداية لما الأسماء أو مساحة القسم تتغير - restart when names or box size change
  useIsomorphicLayoutEffect(() => {
    const reset = () => setFit({ fontSize: sizes.nameChipFontSize, visible: initialVisible });
    reset();

    const el = chipsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width && el.clientHeight === height) return;
      width = el.clientWidth;
      height = el.clientHeight;
      reset();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [namesKey, initialVisible, sizes.nameChipFontSize]);

  useIsomorphicLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    setFit((f) => {
      if (f.fontSize > sizes.minNameChipFontSize) return { ...f, fontSize: f.fontSize - 1 };
      if (f.visible > 0) return { ...f, visible: f.visible - 1 };
      return f;
    });
  }, [fit, sizes.minNameChipFontSize]);

  const visibleNames = group.presentNames.slice(0, fit.visible);
  const hiddenCount = present - visibleNames.length;
  const chipStyle = { fontSize: `${fit.fontSize}px`, padding: "1px 7px", lineHeight: 1.4 };

  return (
    <div className="bg-background rounded-xl p-2.5 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-4 h-4 text-brandOrange shrink-0" />
          <p
            className="font-bold text-white truncate"
            style={{ fontSize: `${sizes.groupTitleFontSize}px` }}
          >
            {group.label}
          </p>
        </div>
        <p className="shrink-0 leading-tight whitespace-nowrap">
          <span
            className="font-bold text-brandOrange tabular-nums"
            style={{ fontSize: `${sizes.groupNumberFontSize}px` }}
          >
            {formatNumber(present)}
          </span>
          <span className="text-gray-400 text-sm tabular-nums"> / {formatNumber(group.total)}</span>
        </p>
      </div>

      <div className="relative h-1.5 bg-cardBorder rounded-full overflow-hidden shrink-0 mt-1.5 mb-1.5">
        <div
          className="absolute top-0 right-0 h-full bg-gradient-to-r from-brandYellow to-brandOrange rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {group.total === 0 || present === 0 ? (
        <p className="text-gray-400" style={{ fontSize: `${sizes.nameChipFontSize}px` }}>
          لا يوجد
        </p>
      ) : (
        <div
          ref={chipsRef}
          className="flex-1 min-h-0 flex flex-wrap content-start gap-1 min-w-0 overflow-hidden"
        >
          {visibleNames.map((name, index) => (
            <span
              key={index}
              className="bg-brandOrange/15 text-white rounded-md max-w-full break-words"
              style={chipStyle}
            >
              {toEnglishDigits(name)}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="text-gray-400" style={chipStyle}>
              +{formatNumber(hiddenCount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
