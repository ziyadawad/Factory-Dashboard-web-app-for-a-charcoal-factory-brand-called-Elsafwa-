"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowRight, ChevronLeft, Users, X } from "lucide-react";
import { AttendanceDetails, DayStatus, EmployeeAttendance, PersonStatus } from "@/lib/types";
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
            className={`h-[62px] rounded-lg border flex flex-col items-center justify-center leading-tight ${CELL_STYLE[day.status]}`}
          >
            <span dir="ltr" className="font-numbers tabular-nums font-bold text-[18px]">
              {Number(day.date.slice(8))}
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
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-gray-500/60" /> إجازة / جمعة / إجازة رسمية</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded border border-cardBorder" /> لسه / قبل البصمة أو التعيين</span>
      </div>
    </div>
  );
}

// تفاصيل موظف - one employee
function EmployeeView({ person, onBack }: { person: EmployeeAttendance; onBack: () => void }) {
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
        <MonthCalendar person={person} />
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
            <EmployeeView person={person} onBack={() => setEmployeeId(null)} />
          ) : (
            <SectionList data={data} onPick={setEmployeeId} />
          )}
        </div>
      </div>
    </div>
  );
}
