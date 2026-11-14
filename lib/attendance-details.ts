// تفاصيل الحضور: كل موظفين القسم وحضورهم الشهر ده (بتتجاب بس لما لوحة تتفتح، وكاش 60 ثانية)
// Attendance details: every employee of a section and their month (fetched only when a panel opens, 60 s cache)
// قراية بس من ERPNext - read-only from ERPNext
import { dashboardConfig } from "@/config/dashboard.config";
import { erpGet, erpToday } from "./erp";
import { AttendanceSectionKey, TodayAttendanceRows, displayNameOf, employeeStatuses, outsideMode, outsideStatus, splitBySection } from "./data-source";
import { toEnglishDigits } from "./format";
import { AttendanceDetails, DayStatus, EmployeeAttendance, EmployeeDay } from "./types";

const CACHE_MS = 60_000;
const PRESENT_STATUSES = ["Present", "Half Day", "Work From Home"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "2026-11-07" + n يوم - add n days to a date
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// أول يوم في أسبوع اليومية (السبت) اللي فيه التاريخ ده - the start (Saturday) of the daily-pay week holding this date
export function weekStartOf(date: string): string {
  const start = Math.max(0, WEEKDAYS.indexOf(dashboardConfig.salaries.dailyWeekStart));
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() - start + 7) % 7));
}

// أسبوع القبض الكاش (يومية العمال + إضافي الشهريين) - the cash-pay week (daily workers' pay + monthly overtime)
// يوم القبض كله = الأسبوع اللي خلص امبارح (اللي بيتقبض النهارده)؛ غير كده = من أول الأسبوع ده لحد النهارده
// On pay day (all day) = the week that ended yesterday (paid today); otherwise = this week so far
export function cashWeekOf(today: string): { start: string; end: string; paidToday: boolean } {
  const paidToday = weekdayOf(today) === dashboardConfig.salaries.dailyPayDay;
  const start = paidToday ? weekStartOf(addDays(today, -1)) : weekStartOf(today);
  return { start, end: addDays(start, 6), paidToday };
}

// أوائل الأسابيع اللي بتظهر في اللوحة: من أول أسبوع فيه أيام من الشهر (أو الأسبوع اللي بيظهر) لحد الأسبوع ده
// Week starts listed in the panel: from the first week touching the month (or the shown week) to this week
export function cashWeekStarts(today: string): string[] {
  const first = [weekStartOf(`${today.slice(0, 7)}-01`), cashWeekOf(today).start].sort()[0];
  const starts: string[] = [];
  for (let start = first; start <= weekStartOf(today); start = addDays(start, 7)) starts.push(start);
  return starts;
}

// أول يوم محتاجينه: أول الشهر، أو أول أسبوعه، أو أول الأسبوع اللي فات (للقبض) - the first day needed
export function rangeStartOf(today: string): string {
  const monthStart = `${today.slice(0, 7)}-01`;
  return [monthStart, weekStartOf(monthStart), addDays(weekStartOf(today), -7)].sort()[0];
}

type EmployeeRow = TodayAttendanceRows["employees"][number] & { date_of_joining: string | null; holiday_list: string | null };
type AttendanceRow = { employee: string; employee_name: string | null; status: string; attendance_date: string };
type CheckinRow = { employee: string; time: string; log_type: string | null };

type MonthRows = {
  today: string;
  employees: EmployeeRow[];
  attendance: AttendanceRow[];
  checkins: CheckinRow[];
  holidays: Map<string, Set<string>> | null; // اسم القايمة ← التواريخ (null = مفيش صلاحية) - list name -> dates
  defaultHolidayList: string | null;
};

async function list<T>(doctype: string, params: Record<string, unknown>): Promise<T[]> {
  const query: Record<string, string | number> = { limit_page_length: 0 };
  for (const [name, value] of Object.entries(params)) query[name] = typeof value === "string" ? value : JSON.stringify(value);
  return (await erpGet<{ data: T[] }>(`/api/resource/${encodeURIComponent(doctype)}`, query)).data;
}

// Holiday List لو الـ API user يقدر يقراها (لو 403 بنكمل بالإجازة الأسبوعية من الكونفج بس)
// Holiday Lists when the API user may read them (on 403 we go on with the config weekly off only)
async function loadHolidays(names: string[]): Promise<Map<string, Set<string>> | null> {
  const result = new Map<string, Set<string>>();
  try {
    for (const name of names) {
      const { data } = await erpGet<{ data: { holidays?: { holiday_date: string }[] } }>(
        `/api/resource/Holiday%20List/${encodeURIComponent(name)}`
      );
      result.set(name, new Set((data.holidays ?? []).map((h) => String(h.holiday_date).slice(0, 10))));
    }
    return result;
  } catch (error) {
    console.warn("[erp] Holiday List not readable, using attendance.weeklyOff only:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function loadMonth(today: string): Promise<MonthRows> {
  const { trackingStartDate } = dashboardConfig.attendance;
  // من أول الأسبوع اللي فيه أول الشهر (أو الأسبوع اللي فات) عشان أسابيع اليومية - from the first daily-pay week
  const rangeStart = rangeStartOf(today);
  const from = trackingStartDate > rangeStart ? trackingStartDate : rangeStart;
  const [employees, attendance, checkins, companies] = await Promise.all([
    list<EmployeeRow>("Employee", {
      filters: [["status", "=", "Active"]],
      fields: ["name", "employee_name", "attendance_device_id", "department", "designation", "branch", "ctc", "date_of_joining", "holiday_list"],
    }),
    list<AttendanceRow>("Attendance", {
      filters: [["attendance_date", ">=", rangeStart], ["attendance_date", "<=", today], ["docstatus", "=", 1]],
      fields: ["employee", "employee_name", "status", "attendance_date"],
    }),
    list<CheckinRow>("Employee Checkin", {
      filters: [["time", ">=", `${from} 00:00:00`], ["time", "<=", `${today} 23:59:59`]],
      fields: ["employee", "time", "log_type"],
      order_by: "time asc",
    }),
    list<{ default_holiday_list: string | null }>("Company", { fields: ["default_holiday_list"] }).catch(() => []),
  ]);
  const defaultHolidayList = companies.find((c) => c.default_holiday_list)?.default_holiday_list ?? null;
  const names = Array.from(
    new Set([defaultHolidayList, ...employees.map((e) => e.holiday_list)].filter((n): n is string => !!n))
  );
  const holidays = await loadHolidays(names);
  return { today, employees, attendance, checkins, holidays, defaultHolidayList };
}

// الوقت في ERPNext بتوقيت مصر - ERPNext times are Africa/Cairo
const dayOf = (time: string) => String(time).slice(0, 10);
const punchOf = (time: string) => String(time).slice(11, 16);

// أيام الشهر من 1 لآخره - every date of the month
function monthDates(today: string): string[] {
  const [year, month] = today.split("-").map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${today.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`);
}

export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

function build(rows: MonthRows, key: AttendanceSectionKey): AttendanceDetails {
  const { today } = rows;
  const config = dashboardConfig.attendance;
  const weeklyOff = new Set(config.weeklyOff);

  // 1) نفس قسمة الكروت بالظبط على بيانات النهارده - the cards' exact split on today's rows
  const todayRows: TodayAttendanceRows = {
    employees: rows.employees,
    attendance: rows.attendance.filter((a) => dayOf(a.attendance_date) === today),
    checkins: rows.checkins.filter((c) => dayOf(c.time) === today),
  };
  const people = splitBySection(todayRows)[key];
  const todayStatuses = employeeStatuses(todayRows);

  // 2) أول بصمة لكل موظف كل يوم، وسجل Attendance لكل يوم - first punch per employee per day, Attendance per day
  const firstPunch = new Map<string, string>();
  const punchCount = new Map<string, number>(); // عدد البصمات في اليوم (لنص اليوم) - punches per day (half-day rule)
  for (const c of rows.checkins) {
    const k = `${c.employee}|${dayOf(c.time)}`;
    const t = punchOf(c.time);
    const previous = firstPunch.get(k);
    if (!previous || t < previous) firstPunch.set(k, t);
    punchCount.set(k, (punchCount.get(k) ?? 0) + 1);
  }
  const halfMarked = new Set(rows.attendance.filter((a) => a.status === "Half Day").map((a) => `${a.employee}|${dayOf(a.attendance_date)}`));
  const { halfDay } = config;
  const marked = new Map<string, "present" | "leave" | "absent">();
  for (const a of rows.attendance) {
    const k = `${a.employee}|${dayOf(a.attendance_date)}`;
    const status = PRESENT_STATUSES.includes(a.status) ? "present" : a.status === "On Leave" ? "leave" : "absent";
    const previous = marked.get(k);
    if (previous === "present" || (previous === "leave" && status === "absent")) continue;
    marked.set(k, status);
  }

  const byId = new Map(rows.employees.map((e) => [e.name, e]));
  const attendanceNames = new Map(rows.attendance.map((a) => [a.employee, a.employee_name]));
  const dates = monthDates(today);
  // الأيام اللي قبل أول الشهر في أسابيع اليومية - the days before the month in the daily-pay weeks
  const leadDates: string[] = [];
  for (let d = rangeStartOf(today); d < dates[0]; d = addDays(d, 1)) leadDates.push(d);

  const result: EmployeeAttendance[] = people.map((person) => {
    const employee = byId.get(person.id);
    const joined = employee?.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : "";
    // مبيتحسبش قبل التعيين ولا قبل البصمة - nothing counts before joining or before the biometric started
    const startsAt = joined > config.trackingStartDate ? joined : config.trackingStartDate;
    const holidayList = employee?.holiday_list || rows.defaultHolidayList;
    const holidays = holidayList ? rows.holidays?.get(holidayList) : undefined;
    // خارج البصمة: حاضر من غير بصمة (fixed دايما، default_present إلا لو اتسجل غياب)
    // Outside the biometric: present without a punch (fixed always; default_present unless marked absent)
    const mode = outsideMode(person.id);

    const dayFor = (date: string): EmployeeDay => {
      const punch = firstPunch.get(`${person.id}|${date}`) ?? null;
      const mark = marked.get(`${person.id}|${date}`);
      let status: DayStatus;
      if (date > today) status = "future";
      else if (date < startsAt) status = "none";
      else if (weeklyOff.has(weekdayOf(date))) status = "off";
      else if (holidays?.has(date)) status = "holiday";
      else if (mode) status = outsideStatus(mode, mark);
      else if (punch || mark === "present") status = "present";
      else if (mark === "leave") status = "leave";
      else status = "absent";
      // نص يوم: Attendance "Half Day" أو بصمة واحدة بس قبل halfDay.singlePunchBefore (مش النهارده) - half day
      const k = `${person.id}|${date}`;
      const half =
        status === "present" &&
        halfDay.enabled &&
        date < today &&
        (halfMarked.has(k) || (punchCount.get(k) === 1 && !!punch && punch < halfDay.singlePunchBefore));
      // جمعة اشتغلها: بصمة أو Attendance حاضر يوم الإجازة الأسبوعية (مش لـ "fixed")، ونص اليوم بنفس القاعدة
      // A worked Friday: a punch or a Present Attendance on the weekly day off (never "fixed"); half by the same rule
      const offWorked = status === "off" && mode !== "fixed" && (!!punch || mark === "present");
      const offHalf =
        offWorked &&
        halfDay.enabled &&
        date < today &&
        (halfMarked.has(k) || (punchCount.get(k) === 1 && !!punch && punch < halfDay.singlePunchBefore));
      return {
        date,
        status,
        firstPunch: punch,
        ...(half ? { half: true } : {}),
        ...(offWorked ? { fridayWork: offHalf ? (0.5 as const) : (1 as const) } : {}),
      };
    };
    const days = dates.map(dayFor);
    const count = (status: DayStatus) => days.filter((d) => d.status === status).length;
    const erpName = toEnglishDigits(employee?.employee_name || attendanceNames.get(person.id) || person.id)
      .replace(/\s+/g, " ")
      .trim();
    const displayName = displayNameOf(person.id);
    return {
      id: person.id,
      code: employee?.attendance_device_id ? toEnglishDigits(String(employee.attendance_device_id)).trim() : null,
      // اسم العرض من الكونفج لو موجود (واسم ERPNext في erpName) - the config display name if any (ERPNext name in erpName)
      name: displayName ?? erpName,
      ...(displayName && displayName !== erpName ? { erpName } : {}),
      section: config.sections[key].label,
      today: outsideMode(person.id) ? person.status : todayStatuses.get(person.id) ?? person.status,
      todayFirstPunch: firstPunch.get(`${person.id}|${today}`) ?? null,
      presentDays: count("present"),
      absentDays: count("absent"),
      leaveDays: count("leave"),
      absentDates: days.filter((d) => d.status === "absent").map((d) => d.date),
      days,
      leadDays: leadDates.map(dayFor),
    };
  });

  // الغايب النهارده الأول وبعدين بالاسم - absent today first, then by name
  result.sort((a, b) => Number(b.today === "absent") - Number(a.today === "absent") || a.name.localeCompare(b.name, "ar"));
  // مبصمش النهارده: من غير بصمة ولا أي Attendance متسجل النهارده (Active بس، ومش يوم إجازة)
  // Not punched today: no checkin and no submitted Attendance today (Active only, not on a day off)
  // اليوم بتاع كل موظف من التقويم (جمعة / إجازة رسمية / قبل التعيين = مش في القايمة)
  // Each person's own calendar cell for today (off / holiday / before joining = not listed)
  const todayOff = weeklyOff.has(weekdayOf(today));
  const notPunchedToday = result
    .filter((p) => byId.has(p.id) && !outsideMode(p.id) && !firstPunch.has(`${p.id}|${today}`) && !marked.has(`${p.id}|${today}`))
    .filter((p) => p.days.find((d) => d.date === today)?.status === "absent")
    .map((p) => ({ id: p.id, code: p.code, name: p.name }));
  const present = people.filter((p) => p.status === "present").length;
  const leave = people.filter((p) => p.status === "leave").length;
  return {
    month: today.slice(0, 7),
    today,
    section: { key, label: config.sections[key].label, present, leave, absent: people.length - present - leave },
    trackingStartDate: config.trackingStartDate,
    weeklyOff: config.weeklyOff,
    holidayListsRead: rows.holidays !== null,
    notPunchedToday,
    todayOff,
    erpUrl: erpOrigin(),
    people: result,
  };
}

// أصل ERPNext بس (من غير مفاتيح) - the ERPNext origin only (never the keys)
function erpOrigin(): string | null {
  try {
    return process.env.FACTORY_API_URL ? new URL(process.env.FACTORY_API_URL).origin : null;
  } catch {
    return null;
  }
}

export const isAttendanceSection = (key: string): key is AttendanceSectionKey =>
  Object.prototype.hasOwnProperty.call(dashboardConfig.attendance.sections, key);

// طلب واحد لكل الأقسام، كاش 60 ثانية - one ERPNext round for every section, cached 60 s
let cached: { at: number; rows: MonthRows } | null = null;
let inFlight: Promise<MonthRows> | null = null;

export async function attendanceDetails(key: AttendanceSectionKey): Promise<AttendanceDetails> {
  const today = erpToday();
  let rows = cached && cached.rows.today === today && Date.now() - cached.at < CACHE_MS ? cached.rows : null;
  if (!rows) {
    inFlight ??= loadMonth(today)
      .then((loaded) => {
        cached = { at: Date.now(), rows: loaded };
        return loaded;
      })
      .finally(() => (inFlight = null));
    rows = await inFlight;
  }
  return build(rows, key);
}
