// حضور المناديب النهارده (لعربية الخط على صفحة العملاء وكروت المناديب) بنفس قواعد كروت الحضور:
// بصمة النهارده (Employee Checkin) أو Attendance بحالة Present / Half Day / Work From Home. المندوب ← الموظف من sales.reps[].employee
// Today's rep attendance (the route van on the customers page and the reps cards), same rules as the attendance cards:
// a check-in today or an Attendance of Present / Half Day / Work From Home. Rep → employee from sales.reps[].employee
import { dashboardConfig } from "@/config/dashboard.config";
import { employeeStatuses, loadTodayAttendance } from "./data-source";
import type { RepPresence } from "./types";

const CACHE_MS = 60_000;
let cache: { at: number; value: Record<string, RepPresence> } | null = null;
let loading: Promise<Record<string, RepPresence>> | null = null;

async function load(): Promise<Record<string, RepPresence>> {
  const rows = await loadTodayAttendance();
  const statuses = employeeStatuses(rows);
  // أول بصمة لكل موظف النهارده (الوقت بتوقيت القاهرة زي ما ERPNext كاتبه) - each employee's first punch today (Cairo time)
  const first = new Map<string, string>();
  for (const c of rows.checkins) {
    const t = String(c.time);
    const was = first.get(c.employee);
    if (!was || t < was) first.set(c.employee, t);
  }
  const out: Record<string, RepPresence> = {};
  for (const rep of dashboardConfig.sales.reps) {
    if (!rep.employee) continue;
    out[rep.id] = { present: statuses.get(rep.employee) === "present", since: first.get(rep.employee) ?? null };
  }
  return out;
}

export async function repAttendance(): Promise<Record<string, RepPresence>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  loading ??= load()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
