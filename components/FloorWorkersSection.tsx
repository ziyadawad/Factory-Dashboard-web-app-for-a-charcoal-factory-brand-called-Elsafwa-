"use client";

import { Factory, Package, Axe, Truck, LucideIcon } from "lucide-react";
import { FloorWorkers, WorkerGroup } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { dashboardConfig } from "@/config/dashboard.config";

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
      <h2 className="text-xl font-bold text-white mb-1 shrink-0">حضور عمال</h2>
      <p className="text-gray-400 text-sm mb-2 shrink-0">
        الإجمالي: <span className="text-white font-bold tabular-nums">{formatNumber(totalPresent)}</span> حاضر من{" "}
        <span className="text-white font-bold tabular-nums">{formatNumber(totalRegistered)}</span>
      </p>

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
  const visibleNames = group.presentNames.slice(0, sizes.maxVisibleNames);
  const hiddenCount = present - visibleNames.length;

  return (
    <div className="bg-background rounded-xl p-2 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 shrink-0">
        <Icon className="w-4 h-4 text-brandOrange shrink-0" />
        <p
          className="font-bold text-white truncate"
          style={{ fontSize: `${sizes.groupTitleFontSize}px` }}
        >
          {group.label}
        </p>
      </div>

      <p className="shrink-0 leading-tight">
        <span
          className="font-bold text-brandOrange tabular-nums"
          style={{ fontSize: `${sizes.groupNumberFontSize}px` }}
        >
          {formatNumber(present)}
        </span>
        <span className="text-gray-400 text-sm tabular-nums"> / {formatNumber(group.total)}</span>
      </p>

      <div className="relative h-1.5 bg-cardBorder rounded-full overflow-hidden shrink-0 mt-1 mb-2">
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
        <div className="flex flex-wrap gap-1 min-w-0 overflow-hidden">
          {visibleNames.map((name, index) => (
            <span
              key={index}
              className="bg-brandOrange/15 text-white rounded-md px-1.5 py-0.5 max-w-full truncate"
              style={{ fontSize: `${sizes.nameChipFontSize}px` }}
            >
              {toEnglishDigits(name)}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span
              className="text-gray-400 px-1 py-0.5"
              style={{ fontSize: `${sizes.nameChipFontSize}px` }}
            >
              +{formatNumber(hiddenCount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
