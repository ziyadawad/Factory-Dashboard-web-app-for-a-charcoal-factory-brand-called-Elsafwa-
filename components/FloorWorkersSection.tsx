"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

  // حجم خط واحد للأسماء في الأقسام الأربعة (أصغر حجم يكفي الكل)
  // One shared chip font size for all 4 groups (the smallest one that makes every group fit).
  // كل ما "round" يزيد بنبدأ القياس من الأول - every new round restarts the measurement
  const [chipFit, setChipFit] = useState({ fontSize: sizes.nameChipFontSize, round: 0 });

  const remeasure = useCallback(
    () => setChipFit((f) => ({ fontSize: sizes.nameChipFontSize, round: f.round + 1 })),
    [sizes.nameChipFontSize]
  );

  // قسم الأسماء فيه مش كافية - a group overflows at this font size, try one step smaller
  const shrinkChips = useCallback(
    (fontSize: number, round: number) =>
      setChipFit((f) =>
        f.round !== round || fontSize <= sizes.minNameChipFontSize
          ? f
          : { ...f, fontSize: Math.min(f.fontSize, fontSize - 1) }
      ),
    [sizes.minNameChipFontSize]
  );

  // لما الأسماء تتغير نقيس تاني - re-measure when any names change
  const allNamesKey = groups.map(({ group }) => group.presentNames.join("|")).join("||");
  const prevAllNamesKey = useRef(allNamesKey);
  useIsomorphicLayoutEffect(() => {
    if (prevAllNamesKey.current === allNamesKey) return;
    prevAllNamesKey.current = allNamesKey;
    remeasure();
  }, [allNamesKey, remeasure]);

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
          <GroupBox
            key={key}
            group={group}
            icon={icon}
            sizes={sizes}
            chipFontSize={chipFit.fontSize}
            round={chipFit.round}
            onOverflow={shrinkChips}
            onResize={remeasure}
          />
        ))}
      </div>
    </div>
  );
}

interface GroupBoxProps {
  group: WorkerGroup;
  icon: LucideIcon;
  sizes: typeof dashboardConfig.sizes.floorWorkers;
  chipFontSize: number;
  round: number;
  onOverflow: (fontSize: number, round: number) => void;
  onResize: () => void;
}

function GroupBox({ group, icon: Icon, sizes, chipFontSize, round, onOverflow, onResize }: GroupBoxProps) {
  const present = group.presentNames.length;
  const percentage = group.total > 0 ? Math.min(100, (present / group.total) * 100) : 0;
  const sectionRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // لما مقاس القسم يتغير (أو الشاشة) نقيس تاني - re-measure when the section (or window) is resized
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width && el.clientHeight === height) return;
      width = el.clientWidth;
      height = el.clientHeight;
      onResize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onResize]);

  // بنقيس بعد الرسم: لو الأسماء أطول من المساحة نصغر الخط بس، ومفيش أي اسم بيتخبى
  // Measure after layout: on overflow only shrink the shared font - every name is always shown
  useIsomorphicLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    if (chipFontSize > sizes.minNameChipFontSize) onOverflow(chipFontSize, round);
  });

  const chipStyle = { fontSize: `${chipFontSize}px`, padding: "1px 7px", lineHeight: 1.4 };

  return (
    <div ref={sectionRef} className="bg-background rounded-xl p-2.5 min-w-0 min-h-0 flex flex-col overflow-hidden">
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
          {group.presentNames.map((name, index) => (
            <span
              key={index}
              className="bg-brandOrange/15 text-white rounded-md max-w-full break-words"
              style={chipStyle}
            >
              {toEnglishDigits(name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
