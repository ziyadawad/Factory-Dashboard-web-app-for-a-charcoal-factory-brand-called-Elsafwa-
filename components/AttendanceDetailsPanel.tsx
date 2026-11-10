"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowRight, ChevronLeft, ExternalLink, Users, X } from "lucide-react";
import { AttendanceDetails, DayStatus, EmployeeAttendance, EmployeeSalary, PersonStatus, SalaryValue, SectionSalaries } from "@/lib/types";
import { formatDayName, formatNumber } from "@/lib/format";
import { useIdleClose } from "@/lib/useIdleClose";
import { monthName } from "./SalesCommon";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// أول الأسبوع السبت - weeks start on Saturday
const WEEK_HEADER = ["السبت", "الأحد", "الاتنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

const n = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(value)}
  </span>
);

// حالة النهارده: حاضر + وقت أول بصمة / غائب / إجازة - today's status pill
function TodayPill({ status, punch }: { status: PersonStatus; punch: string | null }) {
  if (status === "present") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-statusGreen/15 text-statusGreen px-3 font-bold">
        حاضر
        {punch && (
          <span dir="ltr" className="font-numbers tabular-nums text-gray-200 font-semibold">
            {punch}
          </span>
        )}
      </span>
    );
  }
  if (status === "leave") return <span className="inline-flex rounded-full bg-gray-500/20 text-gray-300 px-3 font-bold">إجازة</span>;
  return <span className="inline-flex rounded-full bg-statusRed/15 text-statusRed px-3 font-bold">غائب</span>;
}

// مبصمش النهارده: عشان الـ HR يسجلهم في ERPNext (اللينك بيفتح بحساب الـ HR نفسه في تابة جديدة)
// Not punched today: for HR to mark in ERPNext (the link opens with HR's own login in a new tab)
function NotPunchedToday({ data }: { data: AttendanceDetails }) {
  if (data.todayOff) return null;
  const list = data.notPunchedToday;
  return (
    <div className="mx-3 mt-3 rounded-xl border border-statusRed/40 bg-statusRed/5 px-4 py-2 text-[16px]">
      <p className="font-extrabold text-statusRed">
        مبصمش النهارده {n(list.length)}
        {list.length === 0 && <span className="text-gray-400 font-semibold"> — كله بصم أو متسجل</span>}
      </p>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1.5 mb-1">
          {list.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-cardBorder bg-background/70 px-3 leading-[2]">
              <span className="text-white font-semibold">{p.name}</span>
              {p.code && (
                <span dir="ltr" className="font-numbers tabular-nums text-gray-500 text-[14px]">
                  {p.code}
                </span>
              )}
              {data.erpUrl && (
                <a
                  href={`${data.erpUrl}/app/attendance/new?employee=${encodeURIComponent(p.id)}&attendance_date=${data.today}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brandOrange font-bold hover:underline"
                >
                  سجّل حضور
                  <ExternalLink size={14} />
                </a>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// قايمة القسم - the section list
function SectionList({ data, onPick }: { data: AttendanceDetails; onPick: (id: string) => void }) {
  const th = "px-3 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  if (data.people.length === 0) {
    return <div className="h-full flex items-center justify-center text-xl text-gray-400">لا يوجد</div>;
  }
  return (
    <table className="w-full border-separate border-spacing-0 text-[17px] leading-[2.2]">
      <thead className="sticky top-0 z-10 bg-card">
        <tr>
          <th className={`${th} text-center w-[140px]`}>كود البصمة</th>
          <th className={`${th} text-start`}>الاسم الكامل</th>
          <th className={`${th} text-center`}>حالة النهارده</th>
          <th className={`${th} text-center`}>أيام الحضور الشهر ده</th>
          <th className={`${th} text-center`}>أيام الغياب الشهر ده</th>
        </tr>
      </thead>
      <tbody>
        {data.people.map((person) => (
          <tr key={person.id} onClick={() => onPick(person.id)} className="cursor-pointer hover:bg-white/5">
            <td className="px-3 text-center border-b border-cardBorder/60 text-gray-300">
              {person.code ? (
                <span dir="ltr" className="font-numbers tabular-nums">
                  {person.code}
                </span>
              ) : (
                <span className="text-gray-600">—</span>
              )}
            </td>
            <td className="px-3 border-b border-cardBorder/60 text-white font-semibold">
              <span className="inline-flex items-center gap-1.5">
                {person.name}
                <ChevronLeft size={16} className="text-gray-600" />
              </span>
            </td>
            <td className="px-3 text-center border-b border-cardBorder/60">
              <TodayPill status={person.today} punch={person.todayFirstPunch} />
            </td>
            <td className="px-3 text-center border-b border-cardBorder/60 text-statusGreen font-bold">{n(person.presentDays)}</td>
            <td className={`px-3 text-center border-b border-cardBorder/60 font-bold ${person.absentDays ? "text-statusRed" : "text-gray-600"}`}>
              {person.absentDays ? n(person.absentDays) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CELL_STYLE: Record<DayStatus, string> = {
  present: "bg-statusGreen/20 border-statusGreen/50 text-white",
  absent: "bg-statusRed/20 border-statusRed/60 text-white",
  leave: "bg-gray-500/20 border-gray-500/40 text-gray-300",
  off: "bg-gray-500/20 border-gray-500/40 text-gray-300",
  holiday: "bg-gray-500/20 border-gray-500/40 text-gray-300",
  none: "border-cardBorder/60 text-gray-600",
  future: "border-cardBorder/60 text-gray-600",
};

const CELL_NOTE: Partial<Record<DayStatus, string>> = { absent: "غائب", leave: "إجازة", off: "جمعة", holiday: "إجازة رسمية" };

// تقويم الشهر - the month calendar
function MonthCalendar({ person }: { person: EmployeeAttendance }) {
  const first = person.days[0]?.date;
  const offset = first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 1) % 7 : 0; // السبت = 0
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_HEADER.map((day) => (
          <p key={day} className="text-center text-gray-400 font-semibold text-[15px]">
            {day}
          </p>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {person.days.map((day) => (
          <div
            key={day.date}
            className={`h-[62px] rounded-lg border flex flex-col items-center justify-center leading-tight ${
              day.half ? "bg-amber-400/15 border-amber-400/70 text-white" : CELL_STYLE[day.status]
            }`}
          >
            <span dir="ltr" className="font-numbers tabular-nums font-bold text-[18px]">
              {Number(day.date.slice(8))}
              {day.half && <span className="text-amber-300 text-[14px]"> ½</span>}
            </span>
            {day.firstPunch && day.status !== "future" ? (
              <span dir="ltr" className="font-numbers tabular-nums text-[13px] text-gray-300">
                {day.firstPunch}
              </span>
            ) : (
              CELL_NOTE[day.status] && <span className="text-[12px] opacity-80">{CELL_NOTE[day.status]}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[14px] text-gray-400">
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-statusGreen/60" /> حاضر (وقت أول بصمة)</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-statusRed/60" /> غائب</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-amber-400/60" /> نص يوم (بصمة واحدة الصبح)</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-gray-500/60" /> إجازة / جمعة / إجازة رسمية</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded border border-cardBorder" /> لسه / قبل البصمة أو التعيين</span>
      </div>
    </div>
  );
}

// ===== المرتبات (بتظهر بس بعد زرار "💰 المرتب") - salaries (only after the button) =====
const money = (value: number) => (
  <span dir="ltr" className="font-numbers tabular-nums">
    {formatNumber(Math.round(value * 100) / 100)}
  </span>
);

// مصدر الأجر الشامل - where the salary came from
const SOURCE_LABEL = { structure: "من هيكل المرتب", employee: "من ملف الموظف" } as const;
const SourceTag = ({ salary }: { salary: EmployeeSalary }) =>
  salary.source ? <span className="ms-2 text-gray-500 text-[13px] font-normal">{SOURCE_LABEL[salary.source]}</span> : null;

// "يدوي" = مش متسجل في ERPNext (0 ولازم يتراجع) - "manual" = not in ERPNext (shown as 0)
const ManualTag = () => <span className="ms-2 rounded-full bg-amber-400/15 text-amber-300 px-2 text-[13px] font-bold">يدوي</span>;

type SalaryState = { data: SectionSalaries | null; error: boolean };

function SalaryMessage({ text }: { text: string }) {
  return <div className="rounded-xl bg-background border border-cardBorder p-4 text-center text-[18px] text-gray-300">{text}</div>;
}

// كارت مرتب موظف - one employee's salary card
function SalaryCard({ salary, state }: { salary: EmployeeSalary | undefined; state: SalaryState }) {
  if (state.error) return <SalaryMessage text="المرتبات مش متاحة دلوقتي — جرب تاني بعد شوية" />;
  if (!state.data) return <SalaryMessage text="جاري تحميل المرتب..." />;
  if (!salary || salary.kind === "none") return <SalaryMessage text="المرتب مش متسجل في السيستم" />;
  if (salary.kind === "daily") return <SalaryMessage text="اليومية حسابها خارجي" />;

  const perDay = state.data.daysPerMonth;
  const row = (label: string, value: React.ReactNode, tone = "text-white") => (
    <p className="flex items-center justify-between gap-4 border-b border-cardBorder/60 py-1.5">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </p>
  );
  const deduction = (label: string, v: SalaryValue) =>
    row(
      label,
      <>
        {v.value ? <span className="text-statusRed">− {money(v.value)}</span> : money(0)}
        {v.manual && <ManualTag />}
      </>
    );
  return (
    <div className="rounded-xl bg-background border border-amber-400/30 p-4 flex flex-col text-[17px]">
      <p className="text-amber-300 font-extrabold text-[19px] mb-1">💰 المرتب — الشهر ده لحد النهارده</p>
      {salary.mismatch && (
        <p className="mb-1 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-1 text-[14px] text-amber-400 font-semibold">
          ⚠ المرتب في ملف الموظف ({money(salary.mismatch.ctc)}) مختلف عن هيكل المرتب ({money(salary.mismatch.structure)})
        </p>
      )}
      {row(
        "الأجر الشامل",
        <>
          {money(salary.total)}
          <SourceTag salary={salary} />
        </>
      )}
      {row("أيام الغياب حتى النهارده", money(salary.absentDays), salary.absentDays ? "text-statusRed" : "text-gray-400")}
      {row(
        `خصم الغياب حتى النهارده (الشامل ÷ ${perDay} × الأيام)`,
        salary.absence ? <span className="text-statusRed">− {money(salary.absence)}</span> : money(0)
      )}
      {deduction("سلف الشهر", salary.advances)}
      {deduction("قسط القرض", salary.loan)}
      {deduction("التأمينات", salary.insurance)}
      {deduction("جزاءات", salary.penalty)}
      {deduction("تأخير", salary.late)}
      <div className="flex items-center justify-between gap-4 pt-2 border-b border-cardBorder/60 pb-2">
        <span className="text-white font-bold">المرتب لحد النهارده</span>
        <span className="text-end leading-tight">
          <span className="block text-[30px] font-extrabold text-white">
            {money(salary.earned)} <span className="text-[18px] text-gray-300">ج.م</span>
          </span>
          <span className="block text-[13px] text-gray-400">
            ({money(salary.daysPassed)} يوم × {money(salary.perDay)} ج.م − خصم غياب {money(salary.absence)} ج.م)
          </span>
        </span>
      </div>
      <p className="flex items-center justify-between gap-4 pt-2">
        <span className="text-white font-bold">الصافي المتوقع آخر الشهر</span>
        <span className="text-[30px] font-extrabold text-statusGreen leading-tight">{money(salary.expectedNet)}</span>
      </p>
      <p className="text-gray-300 mt-1">
        لو مغابش تاني، صافي آخر الشهر = <b className="text-white">{money(salary.expectedNet)}</b> ج.م
      </p>
    </div>
  );
}

// جدول مرتبات القسم - the section salaries table
function SectionSalaryList({ data, state, onPick }: { data: AttendanceDetails; state: SalaryState; onPick: (id: string) => void }) {
  if (state.error) {
    return <div className="h-full flex items-center justify-center text-xl text-gray-400">المرتبات مش متاحة دلوقتي — جرب تاني بعد شوية</div>;
  }
  if (!state.data) return <div className="h-full flex items-center justify-center text-xl text-gray-400">جاري تحميل المرتبات...</div>;
  const byId = new Map(state.data.people.map((p) => [p.id, p]));
  const th = "px-3 py-2 font-semibold text-gray-400 whitespace-nowrap border-b border-cardBorder";
  const td = "px-3 text-center border-b border-cardBorder/60";
  const foot = "px-3 text-center border-t border-cardBorder font-extrabold";
  const { totals } = state.data;
  return (
    <table className="w-full border-separate border-spacing-0 text-[17px] leading-[2.2]">
      <thead className="sticky top-0 z-10 bg-card">
        <tr>
          <th className={`${th} text-center w-[140px]`}>كود البصمة</th>
          <th className={`${th} text-start`}>الاسم الكامل</th>
          <th className={`${th} text-center`}>الأجر الشامل</th>
          <th className={`${th} text-center`}>أيام الغياب</th>
          <th className={`${th} text-center`}>خصم الغياب حتى النهارده</th>
          <th className={`${th} text-center`}>لحد النهارده</th>
          <th className={`${th} text-center`}>الصافي المتوقع</th>
        </tr>
      </thead>
      <tbody>
        {data.people.map((person) => {
          const s = byId.get(person.id);
          return (
            <tr key={person.id} onClick={() => onPick(person.id)} className="cursor-pointer hover:bg-white/5">
              <td className={`${td} text-gray-300`}>
                {person.code ? (
                  <span dir="ltr" className="font-numbers tabular-nums">
                    {person.code}
                  </span>
                ) : (
                  <span className="text-gray-600">—</span>
                )}
              </td>
              <td className="px-3 border-b border-cardBorder/60 text-white font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  {person.name}
                  <ChevronLeft size={16} className="text-gray-600" />
                </span>
              </td>
              {!s || s.kind !== "monthly" ? (
                <td colSpan={5} className={`${td} text-gray-500`}>
                  {s?.kind === "daily" ? "اليومية حسابها خارجي" : "المرتب مش متسجل في السيستم"}
                </td>
              ) : (
                <>
                  <td className={`${td} text-white font-bold`}>
                    {money(s.total)}
                    {s.mismatch && <span className="ms-1 text-amber-400" title="المرتب في ملف الموظف مختلف عن هيكل المرتب">⚠</span>}
                    <span className="block text-gray-500 text-[12px] font-normal leading-tight">{s.source ? SOURCE_LABEL[s.source] : ""}</span>
                  </td>
                  <td className={`${td} font-bold ${s.absentDays ? "text-statusRed" : "text-gray-600"}`}>{s.absentDays ? money(s.absentDays) : "—"}</td>
                  <td className={`${td} font-bold ${s.absence ? "text-statusRed" : "text-gray-600"}`}>{s.absence ? money(s.absence) : "—"}</td>
                  <td className={`${td} text-white font-bold`}>{money(s.earned)}</td>
                  <td className={`${td} text-statusGreen font-bold`}>{money(s.expectedNet)}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot className="sticky bottom-0 bg-card">
        <tr className="text-[18px]">
          <td className="border-t border-cardBorder" />
          <td className="px-3 border-t border-cardBorder text-white font-extrabold">
            إجمالي القسم <span className="text-gray-400 font-semibold text-[15px]">({money(totals.monthly)} شهري)</span>
          </td>
          <td className={`${foot} text-white`}>{money(totals.total)}</td>
          <td className="border-t border-cardBorder" />
          <td className={`${foot} text-statusRed`}>{money(totals.absence)}</td>
          <td className={`${foot} text-white`}>{money(totals.earned)}</td>
          <td className={`${foot} text-statusGreen`}>{money(totals.expectedNet)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// تفاصيل موظف - one employee
function EmployeeView({
  person,
  onBack,
  showSalary,
  onToggleSalary,
  salary,
  salaryState,
}: {
  person: EmployeeAttendance;
  onBack: () => void;
  showSalary: boolean;
  onToggleSalary: () => void;
  salary: EmployeeSalary | undefined;
  salaryState: SalaryState;
}) {
  const info = (label: string, value: string | null, ltr = false) => (
    <p className="flex items-center justify-between gap-4 border-b border-cardBorder/60 py-1.5">
      <span className="text-gray-400">{label}</span>
      <span dir={ltr ? "ltr" : undefined} className={`text-white font-semibold ${ltr ? "font-numbers tabular-nums" : ""}`}>
        {value || "—"}
      </span>
    </p>
  );
  return (
    <div className="p-5 flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start flex items-center gap-2 rounded-xl border border-cardBorder bg-background/70 px-4 py-1.5 text-gray-200 font-semibold text-[17px] hover:border-gray-500"
      >
        <ArrowRight size={20} />
        رجوع للقايمة
      </button>
      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)" }}>
        <div className="flex flex-col gap-4 text-[17px]">
          <div>
            <h3 className="text-[26px] font-extrabold text-white leading-[1.6]">{person.name}</h3>
            {info("كود البصمة", person.code, true)}
            {info("Employee ID", person.id, true)}
            {info("القسم", person.section)}
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-gray-400">النهارده</span>
              <TodayPill status={person.today} punch={person.todayFirstPunch} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-background border border-cardBorder text-center py-2">
              <p className="text-[34px] font-extrabold text-statusGreen leading-tight">{n(person.presentDays)}</p>
              <p className="text-gray-400">يوم حضور</p>
            </div>
            <div className="rounded-xl bg-background border border-cardBorder text-center py-2">
              <p className={`text-[34px] font-extrabold leading-tight ${person.absentDays ? "text-statusRed" : "text-gray-500"}`}>
                {n(person.absentDays)}
              </p>
              <p className="text-gray-400">يوم غياب</p>
            </div>
          </div>
          <div className="rounded-xl bg-background border border-cardBorder p-3">
            <p className="text-gray-400 font-semibold mb-1">أيام الغياب</p>
            <p className={`leading-[1.9] ${person.absentDates.length ? "text-statusRed font-semibold" : "text-gray-500"}`}>
              {person.absentDates.length ? person.absentDates.map(formatDayName).join("، ") : "مفيش غياب الشهر ده"}
            </p>
            {person.leaveDays > 0 && <p className="text-gray-400 mt-1">إجازة: {n(person.leaveDays)} يوم</p>}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <MonthCalendar person={person} />
          <button
            type="button"
            onClick={onToggleSalary}
            className={`self-start rounded-xl border px-4 py-1.5 font-bold text-[17px] ${
              showSalary ? "border-amber-400/60 bg-amber-400/15 text-amber-300" : "border-cardBorder bg-background/70 text-gray-200 hover:border-gray-500"
            }`}
          >
            💰 المرتب
          </button>
          {showSalary && <SalaryCard salary={salary} state={salaryState} />}
        </div>
      </div>
    </div>
  );
}

// لوحة تفاصيل قسم حضور: قايمة الموظفين، والضغط على اسم يفتح تفاصيله
// An attendance section's panel: the employee list; clicking a name opens that employee
export default function AttendanceDetailsPanel({ section, onClose }: { section: string; onClose: () => void }) {
  const { data, error } = useSWR<AttendanceDetails>(`/api/attendance/details?section=${encodeURIComponent(section)}`, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  useIdleClose(onClose);

  // المرتبات: بتتجاب بس بعد الزرار، ومن غير SWR عشان تتمسح من الذاكرة لما اللوحة تتقفل
  // Salaries: fetched only after the button, without SWR so they are gone from memory when the panel closes
  const [showSalary, setShowSalary] = useState(false);
  const [salaryState, setSalaryState] = useState<SalaryState>({ data: null, error: false });
  const salaryLoaded = salaryState.data !== null;
  useEffect(() => {
    if (!showSalary || salaryLoaded) return;
    let cancelled = false;
    setSalaryState({ data: null, error: false });
    fetch(`/api/salaries?section=${encodeURIComponent(section)}`, { cache: "no-store", credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SectionSalaries>;
      })
      .then((data) => !cancelled && setSalaryState({ data, error: false }))
      .catch(() => !cancelled && setSalaryState({ data: null, error: true }));
    return () => {
      cancelled = true;
    };
  }, [showSalary, salaryLoaded, section]);
  const toggleSalary = () => setShowSalary((v) => !v);

  const person = employeeId ? data?.people.find((p) => p.id === employeeId) : undefined;
  const pill = "flex items-center gap-2 rounded-full px-4 font-bold text-[18px] leading-[1.9]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full h-full max-w-[1880px] bg-card border border-cardBorder rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* العنوان وإجماليات القسم - header and the section totals */}
        <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-cardBorder">
          <Users size={26} className="text-brandOrange shrink-0" />
          <h2 className="font-extrabold text-white text-[26px] leading-[1.6] whitespace-nowrap">
            حضور {data?.section.label ?? ""}
          </h2>
          {data && <span className="text-gray-400 text-lg whitespace-nowrap">شهر {monthName(data.month)}</span>}
          <div className="ms-auto flex items-center gap-3 whitespace-nowrap">
            {data && (
              <>
                <span className={`${pill} bg-statusGreen/15 text-statusGreen`}>حاضر {n(data.section.present)}</span>
                <span className={`${pill} bg-statusRed/15 text-statusRed`}>غائب {n(data.section.absent)}</span>
                <span className={`${pill} bg-gray-500/20 text-gray-300`}>إجازة {n(data.section.leave)}</span>
                {!person && (
                  <button
                    type="button"
                    onClick={toggleSalary}
                    className={`${pill} border ${
                      showSalary ? "border-amber-400/60 bg-amber-400/15 text-amber-300" : "border-cardBorder bg-background/70 text-gray-200 hover:border-gray-500"
                    }`}
                  >
                    💰 المرتبات
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="p-2 rounded-xl border border-cardBorder bg-background/70 text-gray-300 hover:text-white hover:border-gray-500"
            >
              <X size={26} />
            </button>
          </div>
        </div>

        {/* المحتوى (بيعمل scroll جوه اللوحة) - content (scrolls inside the panel) */}
        <div className="flex-1 min-h-0 overflow-auto">
          {!data ? (
            <div className="h-full flex items-center justify-center text-xl text-gray-400">
              {error ? "غير متصل — جرب تاني بعد شوية" : "جاري تحميل التفاصيل..."}
            </div>
          ) : person ? (
            <EmployeeView
              person={person}
              onBack={() => setEmployeeId(null)}
              showSalary={showSalary}
              onToggleSalary={toggleSalary}
              salary={salaryState.data?.people.find((p) => p.id === person.id)}
              salaryState={salaryState}
            />
          ) : showSalary ? (
            <SectionSalaryList data={data} state={salaryState} onPick={setEmployeeId} />
          ) : (
            <>
              <NotPunchedToday data={data} />
              <SectionList data={data} onPick={setEmployeeId} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
