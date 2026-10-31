"use client";

import { useEffect, useState } from "react";
import {
  Factory,
  Package,
  Truck,
  Briefcase,
  ShieldCheck,
  HardHat,
  Wrench,
  Cog,
  CalendarDays,
  X,
  LucideIcon,
} from "lucide-react";
import { Attendance, AttendanceGroup } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { useFitFontSize } from "@/lib/useFitFontSize";
import { dashboardConfig } from "@/config/dashboard.config";

interface FloorWorkersSectionProps {
  // العمال + السواقين والمناديب والغفر (دول برّه إجمالي العمال) - workers + drivers, reps, guards (not in the workers total)
  data: Attendance;
}

type FactoryGroupKey = keyof Attendance["workers"]["productionFactory"]["groups"];

// مجموعات مصنع الإنتاج - production factory sub-groups
const FACTORY_GROUPS: { key: FactoryGroupKey; icon: LucideIcon }[] = [
  { key: "production", icon: HardHat },
  { key: "workshop", icon: Wrench },
  { key: "operators", icon: Cog },
];

type WorkerSizes = typeof dashboardConfig.sizes.page1.compact;

// مقاسات الكلام: العادية، أو الأصغر على الشاشات الضيقة (بكسل ثابت من الكونفج)
// Text sizes: the normal ones, or the compact ones on narrow screens (fixed px from the config)
function useWorkerSizes(): WorkerSizes {
  const page1 = dashboardConfig.sizes.page1;
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${page1.compactMaxWidth}px)`);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [page1.compactMaxWidth]);
  return compact ? page1.compact : page1;
}

// الحاضرين والإجازة (رمادي) فوق، والغايبين (أحمر) تحت - present and on leave (gray) on top, absent (red) below
const shownPeople = (group: AttendanceGroup) => group.people.filter((p) => p.status !== "absent");
const absentPeople = (group: AttendanceGroup) => group.people.filter((p) => p.status === "absent");

export default function FloorWorkersSection({ data }: FloorWorkersSectionProps) {
  // المقاسات والارتفاعات من sizes.page1 في الكونفج - sizes and heights from sizes.page1 in the config
  const page1 = dashboardConfig.sizes.page1;
  const text = useWorkerSizes();
  const middle = page1.middleColumn;
  const left = page1.leftColumn;

  const workers = data.workers;
  const factory = workers.productionFactory;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور عمال</h2>
        <p className="text-gray-400 text-sm whitespace-nowrap">
          الإجمالي: <span className="text-white font-bold tabular-nums">{formatNumber(workers.present)}</span> حاضر من{" "}
          <span className="text-white font-bold tabular-nums">{formatNumber(workers.total)}</span>
        </p>
      </div>

      {/* مصنع الإنتاج طوله على قد الأسامي (لحد factoryMaxHeightPercent)، والباقي للأقسام اللي تحت
          The factory row is as tall as its names (up to factoryMaxHeightPercent); the rest goes to the bottom area */}
      <div
        className="flex-1 min-h-0 grid gap-2"
        style={{ gridTemplateRows: `fit-content(${page1.factoryMaxHeightPercent}%) minmax(0,1fr)` }}
      >
        {/* مصنع الإنتاج ومجموعاته التلاتة - production factory and its 3 sub-groups */}
        <div className="bg-background rounded-xl p-2.5 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <GroupHeader label={factory.label} icon={Factory} group={factory} titleFontSize={text.workerTitleFontSize} text={text} />
          <div className="flex-1 min-h-0 grid grid-cols-3 gap-2">
            {FACTORY_GROUPS.map(({ key, icon }) => (
              <GroupBox key={key} group={factory.groups[key]} icon={icon} text={text} nested />
            ))}
          </div>
        </div>

        {/* تحت (من اليمين): تعبئة | يومية فوق وغفر تحت | سواقين فوق ومناديب تحت
            Bottom area (right to left): packing | daily above guards | drivers above reps */}
        <div className="min-h-0 grid grid-cols-3 gap-2">
          <GroupBox group={workers.packing} icon={Package} text={text} />
          <div
            className="min-h-0 grid gap-2"
            style={{ gridTemplateRows: `minmax(0,${middle.daily}fr) minmax(0,${middle.guards}fr)` }}
          >
            <GroupBox group={workers.daily} icon={CalendarDays} text={text} />
            <GroupBox group={data.guards} icon={ShieldCheck} text={text} />
          </div>
          <div
            className="min-h-0 grid gap-2"
            style={{ gridTemplateRows: `minmax(0,${left.drivers}fr) minmax(0,${left.reps}fr)` }}
          >
            <GroupBox group={data.drivers} icon={Truck} text={text} />
            <GroupBox group={data.reps} icon={Briefcase} text={text} />
          </div>
        </div>
      </div>
    </div>
  );
}

// عنوان القسم: الأيقونة والاسم والعدد وشريط النسبة - group header: icon, name, count and progress bar
// الشريط = حاضر ÷ (الإجمالي − إجازة) - bar = present / (total − on leave)
function GroupHeader({
  label,
  icon: Icon,
  group,
  titleFontSize,
  text,
}: {
  label: string;
  icon: LucideIcon;
  group: { present: number; total: number; leave: number };
  titleFontSize: number;
  text: WorkerSizes;
}) {
  const counted = group.total - group.leave;
  const percentage = counted > 0 ? Math.min(100, (group.present / counted) * 100) : 0;
  // الاسم عمره ما بيتقص: لو مش واخد مكانه الخط بيصغر، ولو لسه مش واخد مكانه بينزل سطرين
  // The title is never cut: its font shrinks to fit, and at the smallest size it wraps instead
  const minTitleFontSize = dashboardConfig.sizes.floorWorkers.minGroupTitleFontSize;
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
          <span className="font-bold text-brandOrange tabular-nums" style={{ fontSize: `${text.workerNumberFontSize}px` }}>
            {formatNumber(group.present)}
          </span>
          <span className="text-gray-400 tabular-nums" style={{ fontSize: `${text.workerTotalFontSize}px` }}>
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

// كبسولة اسم - a name chip
function NameChip({ name, className, text }: { name: string; className: string; text: WorkerSizes }) {
  return (
    <span
      className={`rounded-md max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-bold ${className}`}
      style={{
        fontSize: `${text.workerChipFontSize}px`,
        padding: `${text.workerChipPaddingY}px ${text.workerChipPaddingX}px`,
        lineHeight: 1.3,
      }}
    >
      {toEnglishDigits(name)}
    </span>
  );
}

// قسم: العنوان، الحاضرين (والإجازة رمادي)، وتحتهم "غائب" بالأحمر. الأسامي الكتير بتعمل scroll جوه القسم
// A section box: header, present (on leave in gray), then the red "غائب" list; many names scroll inside the box
function GroupBox({
  group,
  icon,
  text,
  nested,
}: {
  group: AttendanceGroup;
  icon: LucideIcon;
  text: WorkerSizes;
  nested?: boolean;
}) {
  const shown = shownPeople(group);
  const absent = absentPeople(group);
  const textStyle = { fontSize: `${text.workerChipFontSize}px` };

  return (
    <div
      className={`rounded-xl min-w-0 min-h-0 flex flex-col overflow-hidden ${
        nested ? "bg-card border border-cardBorder p-2" : "bg-background p-2.5"
      }`}
    >
      <GroupHeader
        label={group.label}
        icon={icon}
        group={group}
        titleFontSize={nested ? text.workerSubTitleFontSize : text.workerTitleFontSize}
        text={text}
      />

      {group.total === 0 ? (
        <p className="text-gray-400" style={textStyle}>
          لا يوجد
        </p>
      ) : (
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto thin-scroll">
          {shown.length > 0 ? (
            <div className="flex flex-wrap content-start gap-1 min-w-0">
              {shown.map((person, index) => (
                <NameChip
                  key={index}
                  name={person.name}
                  className={person.status === "leave" ? "bg-gray-500/15 text-gray-300" : "bg-brandOrange/15 text-white"}
                  text={text}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-400" style={textStyle}>
              لا يوجد
            </p>
          )}
          {absent.length > 0 && (
            <>
              <p
                className="flex items-center gap-0.5 font-bold text-statusRed mt-1.5 mb-0.5"
                style={{ fontSize: `${text.workerAbsentLabelFontSize}px` }}
              >
                <X className="w-4 h-4" strokeWidth={3} />
                غائب
              </p>
              <div className="flex flex-wrap content-start gap-1 min-w-0">
                {absent.map((person, index) => (
                  <NameChip key={index} name={person.name} className="bg-statusRed/15 text-statusRed" text={text} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
