"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Factory,
  Package,
  Axe,
  Truck,
  Briefcase,
  ShieldCheck,
  HardHat,
  Wrench,
  Cog,
  CalendarDays,
  LucideIcon,
} from "lucide-react";
import { Attendance, AttendanceGroup } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { useFitFontSize } from "@/lib/useFitFontSize";
import { dashboardConfig } from "@/config/dashboard.config";

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

// الأسامي اللي بتظهر: الحاضرين والإجازة (رمادي) - names shown: present, and on leave (gray)
const shownPeople = (group: AttendanceGroup) => group.people.filter((p) => p.status !== "absent");

export default function FloorWorkersSection({ data }: FloorWorkersSectionProps) {
  const sizes = dashboardConfig.sizes.floorWorkers;

  const workers = data.workers;
  const factory = workers.productionFactory;
  const factoryGroups = FACTORY_GROUPS.map(({ key, icon }) => ({ group: factory.groups[key], icon, key }));
  const allGroups = [
    ...factoryGroups.map(({ group }) => group),
    workers.packing,
    data.drivers,
    data.reps,
    data.guards,
    workers.saw,
    workers.daily,
  ];

  // حجم خط واحد للأسماء في كل الأقسام (أصغر حجم يكفي الكل)
  // One shared chip font size for every group (the smallest one that makes every group fit).
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
  const allNamesKey = allGroups.map((group) => shownPeople(group).map((p) => p.name).join("|")).join("||");
  const prevAllNamesKey = useRef(allNamesKey);
  useIsomorphicLayoutEffect(() => {
    if (prevAllNamesKey.current === allNamesKey) return;
    prevAllNamesKey.current = allNamesKey;
    remeasure();
  }, [allNamesKey, remeasure]);

  // لما خط Cairo يخلص تحميل الأسماء بتعرض، فنقيس تاني - re-measure once web fonts load (Cairo is wider)
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => active && remeasure());
    return () => {
      active = false;
    };
  }, [remeasure]);

  const boxProps = {
    sizes,
    chipFontSize: chipFit.fontSize,
    round: chipFit.round,
    onOverflow: shrinkChips,
    onResize: remeasure,
  };

  // المساحة بين الأقسام اللي فوق بعض على قد عدد الأسماء - stacked groups share the height by name count
  const stackRows = (groups: AttendanceGroup[]) =>
    groups.map((group) => `minmax(0,${shownPeople(group).length + 4}fr)`).join(" ");

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور عمال</h2>
        <p className="text-gray-400 text-sm whitespace-nowrap">
          الإجمالي: <span className="text-white font-bold tabular-nums">{formatNumber(workers.present)}</span> حاضر من{" "}
          <span className="text-white font-bold tabular-nums">{formatNumber(workers.total)}</span>
        </p>
      </div>

      <div
        className="flex-1 min-h-0 grid gap-2"
        style={{ gridTemplateRows: `minmax(0,${sizes.factoryRowHeight}fr) minmax(0,1fr)` }}
      >
        {/* مصنع الإنتاج ومجموعاته التلاتة - production factory and its 3 sub-groups */}
        <div className="bg-background rounded-xl p-2.5 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <GroupHeader
            label={factory.label}
            icon={Factory}
            group={factory}
            titleFontSize={sizes.groupTitleFontSize}
            numberFontSize={sizes.groupNumberFontSize}
          />
          <div className="flex-1 min-h-0 grid grid-cols-3 gap-2">
            {factoryGroups.map(({ group, icon, key }) => (
              <GroupBox key={key} group={group} icon={icon} nested {...boxProps} />
            ))}
          </div>
        </div>

        {/* تحت (من اليمين): تعبئة، سواقين ومناديب وغفر فوق بعض، والعمود التالت منشار فوق ويومية تحت
            Bottom row (right to left): packing, drivers / reps / guards stacked, then saw on top of daily workers */}
        <div className="min-h-0 grid grid-cols-3 gap-2">
          <GroupBox group={workers.packing} icon={Package} {...boxProps} />
          <div className="min-h-0 grid gap-2" style={{ gridTemplateRows: stackRows([data.drivers, data.reps, data.guards]) }}>
            <GroupBox group={data.drivers} icon={Truck} {...boxProps} />
            <GroupBox group={data.reps} icon={Briefcase} {...boxProps} />
            <GroupBox group={data.guards} icon={ShieldCheck} {...boxProps} />
          </div>
          <div className="min-h-0 grid gap-2" style={{ gridTemplateRows: stackRows([workers.saw, workers.daily]) }}>
            <GroupBox group={workers.saw} icon={Axe} {...boxProps} />
            <GroupBox group={workers.daily} icon={CalendarDays} {...boxProps} />
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
  numberFontSize,
}: {
  label: string;
  icon: LucideIcon;
  group: { present: number; total: number; leave: number };
  titleFontSize: number;
  numberFontSize: number;
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
          <Icon className="w-4 h-4 text-brandOrange shrink-0" />
          <p
            ref={titleRef}
            className={`font-bold text-white min-w-0 flex-1 ${wrapTitle ? "leading-tight" : "whitespace-nowrap overflow-hidden"}`}
            style={{ fontSize: `${fittedTitleSize}px` }}
          >
            {label}
          </p>
        </div>
        <p className="shrink-0 leading-tight whitespace-nowrap">
          <span className="font-bold text-brandOrange tabular-nums" style={{ fontSize: `${numberFontSize}px` }}>
            {formatNumber(group.present)}
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
    </>
  );
}

interface GroupBoxProps {
  group: AttendanceGroup;
  icon: LucideIcon;
  // جوه مصنع الإنتاج - inside the production factory box
  nested?: boolean;
  sizes: typeof dashboardConfig.sizes.floorWorkers;
  chipFontSize: number;
  round: number;
  onOverflow: (fontSize: number, round: number) => void;
  onResize: () => void;
}

function GroupBox({ group, icon, nested, sizes, chipFontSize, round, onOverflow, onResize }: GroupBoxProps) {
  const shown = shownPeople(group);
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

  // بنقيس بعد الرسم: لو الأسماء أطول من المساحة نصغر الخط، ولو لسه كتير بتعمل scroll جوه القسم
  // Measure after layout: on overflow shrink the shared font; still too many names scroll inside the box
  useIsomorphicLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    if (chipFontSize > sizes.minNameChipFontSize) onOverflow(chipFontSize, round);
  });

  const chipStyle = { fontSize: `${chipFontSize}px`, padding: "1px 7px", lineHeight: 1.4 };

  return (
    <div
      ref={sectionRef}
      className={`rounded-xl min-w-0 min-h-0 flex flex-col overflow-hidden ${
        nested ? "bg-card border border-cardBorder p-2" : "bg-background p-2.5"
      }`}
    >
      <GroupHeader
        label={group.label}
        icon={icon}
        group={group}
        titleFontSize={nested ? sizes.subGroupTitleFontSize : sizes.groupTitleFontSize}
        numberFontSize={sizes.groupNumberFontSize}
      />

      {shown.length === 0 ? (
        <p className="text-gray-400" style={{ fontSize: `${sizes.nameChipFontSize}px` }}>
          لا يوجد
        </p>
      ) : (
        <div
          ref={chipsRef}
          className="flex-1 min-h-0 flex flex-wrap content-start gap-1 min-w-0 overflow-y-auto thin-scroll"
        >
          {shown.map((person, index) => (
            <span
              key={index}
              className={`rounded-md max-w-full whitespace-nowrap overflow-hidden text-ellipsis ${
                person.status === "leave" ? "bg-gray-500/15 text-gray-300" : "bg-brandOrange/15 text-white"
              }`}
              style={chipStyle}
            >
              {toEnglishDigits(person.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
