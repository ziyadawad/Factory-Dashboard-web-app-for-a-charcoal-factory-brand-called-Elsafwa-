"use client";

import { Factory, Package, Axe, HardHat, Wrench, Cog, CalendarDays, LucideIcon } from "lucide-react";
import { AttendanceGroup, WorkersAttendance } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { useFitFontSize } from "@/lib/useFitFontSize";
import { dashboardConfig } from "@/config/dashboard.config";

interface FloorWorkersSectionProps {
  data: WorkersAttendance;
  // موبايل بالطول: الكروت تحت بعض وطولها على قد الأسامي - phone portrait: boxes stacked, height follows the names
  stacked?: boolean;
}

type FactoryGroupKey = keyof WorkersAttendance["productionFactory"]["groups"];

// مجموعات مصنع الإنتاج - production factory sub-groups
const FACTORY_GROUPS: { key: FactoryGroupKey; icon: LucideIcon }[] = [
  { key: "production", icon: HardHat },
  { key: "workshop", icon: Wrench },
  { key: "operators", icon: Cog },
];

export default function FloorWorkersSection({ data, stacked }: FloorWorkersSectionProps) {
  const sizes = dashboardConfig.sizes.floorWorkers;
  const factory = data.productionFactory;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور عمال</h2>
        <p className="text-gray-400 text-sm whitespace-nowrap">
          الإجمالي: <span className="text-white font-bold tabular-nums">{formatNumber(data.present)}</span> حاضر من{" "}
          <span className="text-white font-bold tabular-nums">{formatNumber(data.total)}</span>
        </p>
      </div>

      <div
        className={stacked ? "flex flex-col gap-2" : "flex-1 min-h-0 grid gap-2"}
        style={stacked ? undefined : { gridTemplateRows: `minmax(0,${sizes.factoryRowHeight}fr) minmax(0,1fr)` }}
      >
        {/* مصنع الإنتاج ومجموعاته التلاتة - production factory and its 3 sub-groups */}
        <div className="bg-background rounded-xl p-2.5 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <GroupHeader label={factory.label} icon={Factory} group={factory} />
          <div className={`flex-1 min-h-0 grid gap-2 ${stacked ? "grid-cols-1" : "grid-cols-3"}`}>
            {FACTORY_GROUPS.map(({ key, icon }) => (
              <GroupBox key={key} group={factory.groups[key]} icon={icon} variant="nested" />
            ))}
          </div>
        </div>

        {/* تحت (من اليمين): تعبئة، منشار، يومية - bottom row (right to left): packing, saw, daily */}
        <div className={`min-h-0 grid gap-2 ${stacked ? "grid-cols-1" : "grid-cols-3"}`}>
          <GroupBox group={data.packing} icon={Package} />
          <GroupBox group={data.saw} icon={Axe} />
          <GroupBox group={data.daily} icon={CalendarDays} />
        </div>
      </div>
    </div>
  );
}

// عنوان القسم: الأيقونة والاسم و"حاضر / إجمالي" وشريط النسبة - group header: icon, name, count and progress bar
// الشريط = حاضر ÷ (الإجمالي − إجازة) - bar = present / (total − on leave)
function GroupHeader({
  label,
  icon: Icon,
  group,
  titleFontSize = dashboardConfig.sizes.floorWorkers.groupTitleFontSize,
}: {
  label: string;
  icon: LucideIcon;
  group: { total: number; present: number; leave: number };
  titleFontSize?: number;
}) {
  const sizes = dashboardConfig.sizes.floorWorkers;
  const counted = group.total - group.leave;
  const percentage = counted > 0 ? Math.min(100, (group.present / counted) * 100) : 0;
  // الاسم عمره ما بيتقص: لو مش واخد مكانه الخط بيصغر، ولو لسه مش واخد مكانه بينزل سطرين
  // The title is never cut: its font shrinks to fit, and at the smallest size it wraps instead
  const minTitleFontSize = sizes.minGroupTitleFontSize;
  const [titleRef, fittedTitleSize] = useFitFontSize<HTMLParagraphElement>(titleFontSize, minTitleFontSize, label);
  const wrapTitle = fittedTitleSize <= minTitleFontSize;

  return (
    <>
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Icon className="w-5 h-5 text-brandOrange shrink-0" />
          <p
            ref={titleRef}
            className={`font-bold text-white min-w-0 flex-1 ${wrapTitle ? "leading-tight" : "whitespace-nowrap overflow-hidden"}`}
            style={{ fontSize: `${fittedTitleSize}px` }}
          >
            {label}
          </p>
        </div>
        <p className="shrink-0 leading-tight whitespace-nowrap">
          <span
            className="font-numbers font-bold text-brandOrange tabular-nums"
            style={{ fontSize: `${sizes.groupNumberFontSize}px` }}
          >
            {formatNumber(group.present)}
          </span>
          <span className="font-numbers text-gray-400 tabular-nums" style={{ fontSize: `${sizes.groupTotalFontSize}px` }}>
            {" "}
            / {formatNumber(group.total)}
          </span>
        </p>
      </div>

      <div className="relative h-1.5 bg-cardBorder rounded-full overflow-hidden shrink-0 mt-1.5 mb-1.5">
        <div
          className="absolute top-0 right-0 h-full bg-gradient-to-r from-brandYellow to-brandOrange rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </>
  );
}

// كارت قسم: العنوان وكبسولات الحاضرين (والإجازة رمادي). الأسامي الكتير بتعمل scroll جوه الكارت
// A section box: header + present name chips (on leave in gray); many names scroll inside the box
export function GroupBox({
  group,
  icon,
  variant = "box",
}: {
  group: AttendanceGroup;
  icon: LucideIcon;
  // nested = جوه مصنع الإنتاج، box = جوه حضور عمال، card = كارت لوحده (سواقين/مناديب/غفر)
  // nested = inside the factory, box = inside the workers card, card = a standalone card
  variant?: "nested" | "box" | "card";
}) {
  const sizes = dashboardConfig.sizes.floorWorkers;
  const shown = group.people.filter((p) => p.status !== "absent");
  const chipStyle = { fontSize: `${sizes.nameChipFontSize}px`, padding: "1px 7px", lineHeight: 1.5 };
  const boxClass = {
    nested: "bg-card border border-cardBorder p-2",
    box: "bg-background p-2.5",
    card: "bg-card border border-cardBorder rounded-2xl p-3 h-full",
  }[variant];

  return (
    <div className={`rounded-xl min-w-0 min-h-0 flex flex-col overflow-hidden ${boxClass}`}>
      <GroupHeader
        label={group.label}
        icon={icon}
        group={group}
        titleFontSize={variant === "nested" ? sizes.subGroupTitleFontSize : sizes.groupTitleFontSize}
      />

      {shown.length === 0 ? (
        <p className="text-gray-400" style={{ fontSize: `${sizes.nameChipFontSize}px` }}>
          لا يوجد
        </p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-wrap content-start gap-1 min-w-0 overflow-y-auto thin-scroll">
          {shown.map((person, index) => (
            <span
              key={index}
              className={`rounded-md max-w-full whitespace-nowrap overflow-hidden text-ellipsis ${
                person.status === "leave" ? "bg-gray-500/15 text-gray-300" : "bg-brandOrange/15 text-white"
              }`}
              style={chipStyle}
              title={person.status === "leave" ? "إجازة" : undefined}
            >
              {toEnglishDigits(person.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
