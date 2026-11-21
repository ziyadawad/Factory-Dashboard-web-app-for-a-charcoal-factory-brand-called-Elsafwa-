"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  UserCheck,
  X,
  LucideIcon,
} from "lucide-react";
import { Attendance, AttendanceGroup } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { useFitFontSize } from "@/lib/useFitFontSize";
import { dashboardConfig } from "@/config/dashboard.config";
import { OfflineBadge } from "./OfflineBadge";

interface FloorWorkersSectionProps {
  // العمال + السواقين والمناديب والغفر (دول برّه إجمالي العمال) - workers + drivers, reps, guards (not in the workers total)
  data: Attendance;
  offline?: boolean; // ERPNext فشل ودي آخر قيمة نجحت - ERPNext failed, these are the last good values
  // الضغط على قسم يفتح تفاصيله (المفتاح من attendance.sections) - clicking a section opens its details
  onOpenSection?: (section: string) => void;
}

// useLayoutEffect بيطلع تحذير على السيرفر - useLayoutEffect warns during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

// صفين طولهم على قد المحتوى (من غير ما يعدّوا مكان الكارت) - two rows sized by their content, never past the card
const CONTENT_ROWS_2 = "minmax(0,auto) minmax(0,auto)";

// الحاضرين والإجازة (رمادي) فوق، والغايبين (أحمر) تحت - present and on leave (gray) on top, absent (red) below
const shownPeople = (group: AttendanceGroup) => group.people.filter((p) => p.status !== "absent");
const absentPeople = (group: AttendanceGroup) => group.people.filter((p) => p.status === "absent");

export default function FloorWorkersSection({ data, offline = false, onOpenSection }: FloorWorkersSectionProps) {
  // مقاسات الكلام من sizes.page1 في الكونفج - text sizes from sizes.page1 in the config
  const text = useWorkerSizes();

  // كل ما الشاشة يتغير مقاسها أو الخط يحمّل، كل قسم بيرجع لحجم خطه الأصلي ويقيس تاني
  // On resize or when web fonts load, every section goes back to its normal chip size and measures again
  const [round, setRound] = useState(0);
  useEffect(() => {
    let active = true;
    const remeasure = () => active && setRound((r) => r + 1);
    document.fonts?.ready.then(remeasure);
    window.addEventListener("resize", remeasure);
    return () => {
      active = false;
      window.removeEventListener("resize", remeasure);
    };
  }, []);
  const boxProps = { text, round };
  const open = (section: string) => (onOpenSection ? () => onOpenSection(section) : undefined);

  const workers = data.workers;
  const factory = workers.productionFactory;

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-white whitespace-nowrap">حضور عمال</h2>
          {offline && <OfflineBadge />}
        </div>
        <p className="text-gray-400 text-sm whitespace-nowrap">
          الإجمالي: <span className="text-white font-bold tabular-nums">{formatNumber(workers.present)}</span> حاضر من{" "}
          <span className="text-white font-bold tabular-nums">{formatNumber(workers.total)}</span>
        </p>
      </div>

      {/* الطول على قد الأسامي: كل صف/قسم بياخد طول أساميه، والمساحة الزيادة بتتوزع بالتساوي
          Heights follow the names: each row / section gets its content height, extra space is shared equally */}
      <div className="flex-1 min-h-0 grid gap-2" style={{ gridTemplateRows: CONTENT_ROWS_2 }}>
        {/* مصنع الإنتاج ومجموعاته التلاتة - production factory and its 3 sub-groups */}
        <div className="bg-background rounded-xl p-2.5 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <GroupHeader label={factory.label} icon={Factory} group={factory} titleFontSize={text.workerTitleFontSize} text={text} />
          {/* من اليمين: خارج البصمة | عمال إنتاج | أوبريتر فوق وورشة تحت. خارج البصمة مش في إجمالي الكارت
              Right to left: outside the biometric | production | operators above workshop. Outside is not in the card's totals */}
          <div className="flex-1 min-h-0 grid grid-cols-3 gap-2">
            {data.outside ? (
              <GroupBox group={data.outside} icon={UserCheck} {...boxProps} nested onOpen={open("outside")} />
            ) : (
              <div />
            )}
            <GroupBox group={factory.groups.production} icon={HardHat} {...boxProps} nested onOpen={open("production")} />
            <div className="min-h-0 grid gap-2" style={{ gridTemplateRows: CONTENT_ROWS_2 }}>
              <GroupBox group={factory.groups.operators} icon={Cog} {...boxProps} nested onOpen={open("operators")} />
              <GroupBox group={factory.groups.workshop} icon={Wrench} {...boxProps} nested onOpen={open("workshop")} />
            </div>
          </div>
        </div>

        {/* تحت (من اليمين): تعبئة | يومية فوق وغفر تحت | سواقين فوق ومناديب تحت
            Bottom area (right to left): packing | daily above guards | drivers above reps */}
        <div className="min-h-0 grid grid-cols-3 gap-2">
          <GroupBox group={workers.packing} icon={Package} {...boxProps} onOpen={open("packing")} />
          <div className="min-h-0 grid gap-2" style={{ gridTemplateRows: CONTENT_ROWS_2 }}>
            <GroupBox group={workers.daily} icon={CalendarDays} {...boxProps} onOpen={open("daily")} />
            <GroupBox group={data.guards} icon={ShieldCheck} {...boxProps} onOpen={open("guards")} />
          </div>
          <div className="min-h-0 grid gap-2" style={{ gridTemplateRows: CONTENT_ROWS_2 }}>
            <GroupBox group={data.drivers} icon={Truck} {...boxProps} onOpen={open("drivers")} />
            <GroupBox group={data.reps} icon={Briefcase} {...boxProps} onOpen={open("reps")} />
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
function NameChip({
  id,
  name,
  className,
  text,
  fontSize,
  wide = false,
  compact = false,
}: {
  id: string;
  name: string;
  className: string;
  text: WorkerSizes;
  fontSize: number;
  wide?: boolean; // في العمودين: اسم طويل واخد السطر كله - two columns: a long name taking the whole row
  compact?: boolean; // في العمودين - in two columns
}) {
  return (
    <span
      data-chip={id}
      className={`block w-fit max-w-full min-w-0 justify-self-start text-start rounded-md whitespace-nowrap overflow-hidden text-ellipsis font-bold ${className}`}
      style={{
        gridColumn: wide ? "1 / -1" : undefined,
        fontSize: `${fontSize}px`,
        // عمودين: مسافة جانبية أقل عشان الاسم ياخد مكانه - two columns: less side padding so the name fits
        padding: `${text.workerChipPaddingY}px ${compact ? Math.max(2, Math.floor(text.workerChipPaddingX / 2)) : text.workerChipPaddingX}px`,
        lineHeight: text.workerChipLineHeight,
      }}
    >
      {toEnglishDigits(name)}
    </span>
  );
}

// الاسم متقصوص ("…")؟ بنقيس عرض الكلام نفسه بالظبط (scrollWidth بيتقرّب لرقم صحيح فممكن يفوّت كسور البكسل)
// Is the name cut ("…")? Measures the text's exact width (scrollWidth rounds to whole pixels and can miss fractions)
function isCut(chip: HTMLElement): boolean {
  const range = document.createRange();
  range.selectNodeContents(chip);
  const textWidth = range.getBoundingClientRect().width;
  const style = getComputedStyle(chip);
  const room = chip.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return textWidth > room + 0.25;
}

// الكبسولة القديمة (جنب بعض) في النسخة المخفية اللي بتحافظ على مقاس الكارت - the old side-by-side chip, used only
// in the invisible copy that keeps the card sizes unchanged
function OldChip({ name, text }: { name: string; text: WorkerSizes }) {
  return (
    <span
      className="rounded-md max-w-full whitespace-nowrap overflow-hidden font-bold"
      style={{ fontSize: `${text.workerChipFontSize}px`, padding: `${text.workerChipPaddingY}px ${text.workerChipPaddingX}px`, lineHeight: text.workerChipLineHeight }}
    >
      {toEnglishDigits(name)}
    </span>
  );
}

// ليستة أسامي: كل اسم في سطر لوحده (الكبسولة على قد الاسم)، أو عمودين لو مش واخدة مكانها (والاسم اللي مش واخد مكانه في نص
// السطر بياخد السطر كله، والقصيرين بيملوا الفراغات) - a names list: one name per row, or two columns
// when they don't fit; each chip only as wide as its name (a name too long for half a row takes the whole row; short ones fill the gaps)
function NameList({ prefix, people, cols, wide, chipClass, text, fontSize, wrap = false }: {
  prefix: string;
  wrap?: boolean; // جنب بعض لو فيه مكان (الغايبين) - side by side when there is room (the absent names)
  people: AttendanceGroup["people"];
  cols: number;
  wide: string[];
  chipClass: (person: AttendanceGroup["people"][number]) => string;
  text: WorkerSizes;
  fontSize: number;
}) {
  return (
    <div
      className={wrap ? "flex flex-wrap content-start gap-1 min-w-0" : "grid gap-1 min-w-0"}
      style={wrap ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoFlow: "row dense" }}
    >
      {people.map((person, index) => (
        <NameChip
          key={index}
          id={`${prefix}${index}`}
          name={person.name}
          className={chipClass(person)}
          text={text}
          fontSize={fontSize}
          wide={!wrap && cols > 1 && wide.includes(`${prefix}${index}`)}
          compact={!wrap && cols > 1}
        />
      ))}
    </div>
  );
}

// قسم: العنوان، الحاضرين (والإجازة رمادي)، وتحتهم "غائب" بالأحمر - كل اسم في سطر لوحده. مفيش scroll: لو الأسامي
// مش واخدة مكانها بتبقى عمودين، ولو لسه، خط القسم ده بس بيصغر لحد minWorkerChipFontSize
// A section box: header, present (on leave in gray), then the red "غائب" list, one name per row. No scroll: if the
// names don't fit they go to two columns, and if they still don't, only this box's font shrinks (minWorkerChipFontSize)
function GroupBox({
  group,
  icon,
  text,
  round,
  nested,
  onOpen,
}: {
  group: AttendanceGroup;
  icon: LucideIcon;
  text: WorkerSizes;
  round: number;
  nested?: boolean;
  onOpen?: () => void;
}) {
  const minFontSize = text.minWorkerChipFontSize;
  const shown = shownPeople(group);
  const absent = absentPeople(group);
  const chipsRef = useRef<HTMLDivElement>(null);

  // الترتيب اللي بنجربه: عمود واحد بالحجم العادي، بعدين عمودين والخط بيصغر لحد minFontSize، بعدين عمود واحد والخط
  // بيصغر. أول ترتيب الأسامي فيه كلها باينة ومتقصتش بيكسب؛ لو مفيش، اللي مفيهوش طول زيادة وفيه أقل "…"
  // Layouts tried in order: one column at the normal size, then two columns shrinking to minFontSize, then one column
  // shrinking. The first where every name shows uncut wins; if none, the one not too tall with the fewest "…" names
  const base = text.workerChipFontSize;
  const candidates = useMemo(() => {
    const list = [{ cols: 1, fontSize: base }];
    for (let f = base; f >= minFontSize; f--) list.push({ cols: 2, fontSize: f });
    for (let f = base - 1; f >= minFontSize; f--) list.push({ cols: 1, fontSize: f });
    return list;
  }, [base, minFontSize]);
  // wide = الأسامي اللي واخدة السطر كله في العمودين - wide = names spanning both columns (two-column layouts)
  const [step, setStep] = useState<{ index: number; done: boolean; wide: string[] }>({ index: 0, done: false, wide: [] });
  // أحسن ترتيب مفيهوش طول زيادة (أقل أسامي متقصوصة) - the best layout that is not too tall (fewest cut names)
  const bestNotTall = useRef<{ index: number; cut: number; wide: string[] } | null>(null);
  const namesKey = group.people.map((p) => `${p.status}:${p.name}`).join("|");
  useIsomorphicLayoutEffect(() => {
    bestNotTall.current = null;
    setStep({ index: 0, done: false, wide: [] });
  }, [base, namesKey, round]);
  useIsomorphicLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el || step.done) return;
    const tooTall = el.scrollHeight > el.clientHeight + 1;
    const chips = Array.from(el.querySelectorAll<HTMLElement>("[data-chip]"));
    const cutChips = chips.filter(isCut);
    const cut = cutChips.length;
    if (!tooTall && cut === 0) return setStep({ ...step, done: true });
    // أي ترتيب مفيهوش طول زيادة بيتسجل (بأقل أسامي متقصوصة) - every layout that is not too tall is remembered (fewest cut)
    if (!tooTall && (!bestNotTall.current || cut < bestNotTall.current.cut)) bestNotTall.current = { index: step.index, cut, wide: step.wide };
    // عمودين ومفيش طول زيادة: أطول اسم متقصوص ياخد السطر كله (واحد واحد)، ونقيس تاني
    // Two columns and not too tall: the most-cut name takes the whole row (one at a time), then measure again
    if (candidates[step.index].cols > 1 && !tooTall) {
      const next = cutChips
        .filter((chip) => chip.dataset.chip?.startsWith("p") && !step.wide.includes(chip.dataset.chip))
        .sort((a, b) => b.scrollWidth - b.clientWidth - (a.scrollWidth - a.clientWidth))[0];
      if (next) return setStep({ ...step, wide: [...step.wide, next.dataset.chip!] });
    }
    if (step.index + 1 < candidates.length) return setStep({ index: step.index + 1, done: false, wide: [] });
    // مفيش ترتيب كامل: اللي فيه أقل أسامي متقصوصة ("…")، وإلا الأصغر - no perfect layout: the one with the fewest cut names, else the smallest
    const best = bestNotTall.current;
    setStep(best ? { index: best.index, done: true, wide: best.wide } : { index: candidates.length - 1, done: true, wide: step.wide });
  });
  const { cols, fontSize } = candidates[Math.min(step.index, candidates.length - 1)];
  const textStyle = { fontSize: `${fontSize}px` };

  return (
    <div
      onClick={onOpen}
      className={`min-w-0 min-h-0 flex flex-col overflow-hidden ${onOpen ? "cursor-pointer" : ""} ${
        nested ? "rounded-xl bg-card border border-cardBorder" : "rounded-xl bg-background"
      }`}
      style={{ padding: `${nested ? text.workerNestedBoxPadding : text.workerBoxPadding}px` }}
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
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* مقاس الكارت زي ما كان: نسخة مخفية من الكبسولات القديمة (جنب بعض) هي اللي بتحدد طول القسم في الشبكة،
              والليستة الحقيقية فوقها. Card sizes unchanged: an invisible copy of the old side-by-side chips sets the
              box's height in the grid; the real list sits on top of it */}
          <div aria-hidden className="invisible pointer-events-none">
            <div className="flex flex-wrap content-start gap-1 min-w-0">
              {shown.map((person, index) => (
                <OldChip key={index} name={person.name} text={text} />
              ))}
            </div>
            {absent.length > 0 && (
              <>
                <p className="flex items-center gap-0.5 font-bold whitespace-nowrap mt-1 mb-0.5" style={{ fontSize: `${text.workerAbsentLabelFontSize}px` }}>
                  <X className="w-4 h-4" strokeWidth={3} />
                  غائب
                </p>
                <div className="flex flex-wrap content-start gap-1 min-w-0">
                  {absent.map((person, index) => (
                    <OldChip key={index} name={person.name} text={text} />
                  ))}
                </div>
              </>
            )}
          </div>
        <div ref={chipsRef} data-names data-cols={cols} className="absolute inset-0 min-w-0 overflow-hidden">
          {shown.length > 0 ? (
            <NameList
              prefix="p"
              people={shown}
              cols={cols}
              wide={step.wide}
              chipClass={(person) => (person.status === "leave" ? "bg-gray-500/15 text-gray-300" : "bg-brandOrange/15 text-white")}
              text={text}
              fontSize={fontSize}
            />
          ) : (
            <p className="text-gray-400" style={textStyle}>
              لا يوجد
            </p>
          )}
          {/* "✕ غائب" في سطر لوحده والأسامي الحمرا تحتها - the "✕ غائب" label on its own line, red names under it */}
          {absent.length > 0 && (
            <>
              <p
                className="flex items-center gap-0.5 font-bold text-statusRed whitespace-nowrap mt-1 mb-0.5"
                style={{ fontSize: `${text.workerAbsentLabelFontSize}px` }}
              >
                <X className="w-4 h-4" strokeWidth={3} />
                غائب
              </p>
              <NameList prefix="a" wrap people={absent} cols={cols} wide={step.wide} chipClass={() => "bg-statusRed/15 text-statusRed"} text={text} fontSize={fontSize} />
            </>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
