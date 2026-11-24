"use client";

// تقرير حضور موظف لشهر (صفحة A4 عرضي واحدة، خلفية بيضا للطباعة) بيتعمل في المتصفح ويتنزل PNG أو PDF
// One employee's monthly attendance report (one landscape A4 page, white print-friendly), built in the browser as PNG or PDF
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DayStatus, EmployeeAttendance, EmployeeDay, EmployeeSalary } from "@/lib/types";
import { formatDayName, formatNumber, formatTime12 } from "@/lib/format";
import { monthName } from "./SalesCommon";

// A4 عرضي بالبكسل (96dpi) - landscape A4 in px (96dpi)
const PAGE_W = 1123;
const PAGE_H = 794;

type Tone = { bg: string; border: string; text: string; note: string };

// ألوان فاتحة للطباعة - light print colours
const T = {
  page: "#ffffff",
  card: "#f6f8fb",
  border: "#d5dde8",
  text: "#0f172a",
  muted: "#4b5870",
  heading: "#1e293b",
  green: "#15803d",
  red: "#dc2626",
  amber: "#b45309",
  sky: "#0369a1",
  gray: "#6b7280",
  cell: {
    present: { bg: "#16A34A", border: "#128a3e", text: "#ffffff", note: "#ecfdf3" },
    absent: { bg: "#DC2626", border: "#b91c1c", text: "#ffffff", note: "#fff1f1" },
    half: { bg: "#F59E0B", border: "#d98a06", text: "#1f1300", note: "#3b2500" },
    friday: { bg: "#2563EB", border: "#1d4ed8", text: "#ffffff", note: "#eaf1ff" },
    off: { bg: "#9CA3AF", border: "#868e9b", text: "#ffffff", note: "#f8fafc" },
    empty: { bg: "#ffffff", border: "#d9e0ea", text: "#a3aec0", note: "#a3aec0" },
  } satisfies Record<string, Tone>,
};

const WEEK_HEADER = ["السبت", "الأحد", "الاتنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const CELL_NOTE: Partial<Record<DayStatus, string>> = { absent: "غائب", leave: "إجازة", off: "جمعة", holiday: "إجازة رسمية" };
const FONT = "'Cairo Variable', 'Cairo Numbers', Arial, sans-serif";

const fmt = (value: number) => formatNumber(Math.round(value * 100) / 100);

// "نوفمبر 2026"
export const reportMonth = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`;

// اسم ملف آمن - a safe file name
export const reportFileName = (name: string, month: string, ext: "png" | "pdf") =>
  `حضور-${name}-${monthName(month)}-${month.slice(0, 4)}.${ext}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ");

function dayTone(day: EmployeeDay, open: boolean): Tone {
  if (day.fridayWork) return T.cell.friday;
  if (day.half) return T.cell.half;
  if (open) return T.cell.empty;
  if (day.status === "present") return T.cell.present;
  if (day.status === "absent") return T.cell.absent;
  if (day.status === "leave" || day.status === "off" || day.status === "holiday") return T.cell.off;
  return T.cell.empty;
}

// التقويم بيملا العمود كله (الصفوف 1fr) - the calendar fills its whole column (rows are 1fr)
function Calendar({ person, openToday }: { person: EmployeeAttendance; openToday: string | null }) {
  const first = person.days[0]?.date;
  const offset = first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 1) % 7 : 0; // السبت = 0
  const weeks = Math.ceil((offset + person.days.length) / 7);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {WEEK_HEADER.map((d) => (
          <p key={d} style={{ textAlign: "center", color: T.heading, fontWeight: 800, fontSize: 14, margin: 0 }}>
            {d}
          </p>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${weeks}, 1fr)`, gap: 6 }}>
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {person.days.map((day) => {
          const open = day.date === openToday && day.status === "absent";
          const tone = dayTone(day, open);
          const punch = !day.fridayWork && !!day.firstPunch && day.status !== "future";
          const note = day.fridayWork ? "جمعة شغل" : punch ? formatTime12(day.firstPunch) : open ? "النهارده" : CELL_NOTE[day.status] ?? "";
          const half = day.half || day.fridayWork === 0.5;
          return (
            <div
              key={day.date}
              style={{
                borderRadius: 8,
                border: `1.5px solid ${tone.border}`,
                background: tone.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1.3,
              }}
            >
              <span dir="ltr" style={{ fontWeight: 800, fontSize: 20, color: tone.text }}>
                {Number(day.date.slice(8))}
                {half && <span style={{ fontSize: 14, color: tone.note }}> ½</span>}
              </span>
              {note && (
                <span dir={punch ? "ltr" : undefined} style={{ fontSize: 13, fontWeight: 700, color: tone.note }}>
                  {note}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const item = (tone: Tone, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <i style={{ width: 14, height: 14, borderRadius: 4, background: tone.bg, border: `1.5px solid ${tone.border}`, display: "inline-block" }} />
      {label}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12.5, color: T.muted }}>
      {item(T.cell.present, "حاضر (وقت أول بصمة)")}
      {item(T.cell.absent, "غائب")}
      {item(T.cell.half, "نص يوم")}
      {item(T.cell.friday, "جمعة شغل")}
      {item(T.cell.off, "إجازة / جمعة / إجازة رسمية")}
      {item(T.cell.empty, "لسه / قبل البصمة أو التعيين")}
    </div>
  );
}

type Row = [label: string, value: number, sign: "" | "+" | "−", color: string, unit?: string];

// ملخص المرتب (نفس أرقام لوحة المرتب) - the salary summary (same numbers as the salary panel)
// salary: undefined = مش متسجل، null = المرتبات مش متاحة - undefined = not recorded, null = salaries unavailable
function SalaryBox({ salary }: { salary: EmployeeSalary | null | undefined }) {
  const box = {
    flex: 1,
    minHeight: 0,
    border: `2.5px solid ${T.amber}`,
    borderRadius: 12,
    background: "#fffbf3",
    padding: "10px 16px",
    display: "flex",
    flexDirection: "column",
  } as const;
  const title = <p style={{ margin: "0 0 4px", color: "#92400e", fontWeight: 900, fontSize: 18 }}>💰 ملخص المرتب</p>;
  if (!salary || salary.kind === "none") {
    return (
      <div style={box}>
        {title}
        <p style={{ margin: "auto 0", textAlign: "center", color: T.muted, fontSize: 16, fontWeight: 600 }}>
          {salary === null ? "المرتبات مش متاحة دلوقتي" : salary?.kind === "daily" ? "اليومية مش متسجلة" : "المرتب مش متسجل في السيستم"}
        </p>
      </div>
    );
  }
  const daily = salary.kind === "daily";
  const week = daily ? salary.weeks.find((w) => w.shown) : undefined;
  const rows: Row[] = daily
    ? [
        ["قيمة اليوم (اليومية)", salary.dailyRate, "", T.text, " ج.م / يوم"],
        ["أيام الحضور", salary.presentDays, "", T.green],
        ["أيام الغياب", salary.absentDays, "", T.red],
        ["أجر الأيام (الأيام × اليومية)", salary.presentDays * salary.dailyRate, "", T.text],
        ["الخصومات", salary.deductions, "−", T.red],
        ["السلف", salary.advanceTotal, "−", T.red],
        ["المكافآت", salary.bonuses, "+", T.green],
        ["الإضافي (بيتقبض كاش لوحده)", salary.overtime.total, "+", T.sky],
      ]
    : [
        ["الأجر الشامل", salary.total, "", T.text],
        ["قيمة اليوم (الشامل ÷ 30)", salary.perDay, "", T.text, " ج.م / يوم"],
        ["أيام الغياب", salary.absentDays, "", T.red],
        ["خصم الغياب", salary.absence, "−", T.red],
        ["الخصومات", salary.deductions, "−", T.red],
        ["السلف", salary.advanceTotal, "−", T.red],
        ["الأقساط", salary.installments, "−", T.red],
        ["المكافآت", salary.bonuses, "+", T.green],
        ...(salary.friday.amount > 0 ? ([["بدل الجمعة", salary.friday.amount, "+", T.sky]] as Row[]) : []),
        ["الإضافي (بيتقبض كاش لوحده)", salary.overtime.total, "+", T.sky],
      ];
  return (
    <div style={box}>
      {title}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
        {rows.map(([label, value, sign, color, unit]) => (
          <p
            key={label}
            style={{ margin: 0, display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, padding: "2px 0", fontSize: 15 }}
          >
            <span style={{ color: T.heading, fontWeight: 600 }}>{label}</span>
            <span dir="ltr" style={{ fontWeight: 800, color: value ? color : T.muted }}>
              {value && sign ? `${sign} ` : ""}
              {fmt(value)}
              {unit && <span dir="rtl">{unit}</span>}
            </span>
          </p>
        ))}
        {week && (
          <p style={{ margin: 0, display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 15 }}>
            <span style={{ color: T.text, fontWeight: 700 }}>
              مستحق الأسبوع ({formatDayName(week.start)} ← {formatDayName(week.end)})
            </span>
            <span dir="ltr" style={{ fontWeight: 800, color: T.green }}>
              {fmt(week.total)}
            </span>
          </p>
        )}
      </div>
      <div
        style={{
          marginTop: 6,
          borderRadius: 10,
          background: "#16A34A",
          border: "2px solid #128a3e",
          padding: "2px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 900, fontSize: 20, color: "#ffffff" }}>المرتب حتى الآن</span>
        <span style={{ fontWeight: 900, fontSize: 34, color: "#ffffff", lineHeight: 1.5 }}>
          <span dir="ltr">{fmt(salary.earned)}</span> <span style={{ fontSize: 16, color: "#e7f8ee" }}>ج.م</span>
        </span>
      </div>
    </div>
  );
}

export function AttendanceReport({
  person,
  month,
  openToday,
  salary,
}: {
  person: EmployeeAttendance;
  month: string;
  openToday: string | null;
  salary: EmployeeSalary | null | undefined;
}) {
  // قيمة اليوم: الشامل ÷ 30 (زي لوحة المرتب)، أو اليومية لعمال اليومية - the day value (the daily rate for daily workers)
  const dayValue = !salary || salary.kind === "none" ? 0 : salary.kind === "daily" ? salary.dailyRate : salary.perDay;
  const fridays = person.days.reduce((s, d) => s + (d.fridayWork ?? 0), 0);
  const halves = person.days.filter((d) => d.half).length;
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  const stat = (label: string, value: number, color: string) => (
    <div
      style={{ background: T.card, border: `1.5px solid ${T.border}`, borderTop: `6px solid ${color}`, borderRadius: 12, textAlign: "center", padding: "0 4px 2px" }}
    >
      <p dir="ltr" style={{ margin: 0, fontSize: 30, fontWeight: 900, lineHeight: 1.4, color: value ? color : T.muted }}>
        {fmt(value)}
      </p>
      <p style={{ margin: 0, fontSize: 12.5, color: T.heading, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</p>
    </div>
  );
  const info = (label: string, value: string | null, ltr = false) => (
    <span style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap", background: T.card, border: `1px solid ${T.border}`, borderRadius: 999, padding: "0 12px" }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span dir={ltr ? "ltr" : undefined} style={{ color: T.text, fontWeight: 700 }}>
        {value || "—"}
      </span>
    </span>
  );
  return (
    <div
      dir="rtl"
      style={{
        width: PAGE_W,
        height: PAGE_H,
        boxSizing: "border-box",
        padding: "20px 28px 14px",
        background: T.page,
        color: T.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      {/* الهيدر - header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: `2px solid ${T.border}`, paddingBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={58} height={58} style={{ width: 58, height: 58, objectFit: "contain" }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, color: T.heading, fontWeight: 800 }}>تقرير حضور — شهر {reportMonth(month)}</p>
          <p style={{ margin: 0, fontSize: 25, fontWeight: 800, lineHeight: 1.45 }}>{person.name}</p>
        </div>
        <div style={{ marginInlineStart: "auto", flexShrink: 0, display: "flex", gap: 8, fontSize: 14, lineHeight: 2 }}>
          {info("كود البصمة", person.code, true)}
          {dayValue > 0 && (
            <span
              style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap", background: "#fff7e6", border: `1.5px solid ${T.amber}`, borderRadius: 999, padding: "0 12px" }}
            >
              <span style={{ color: "#92400e", fontWeight: 700 }}>قيمة اليوم</span>
              <span style={{ color: T.text, fontWeight: 800 }}>
                <span dir="ltr">{fmt(dayValue)}</span> ج.م / يوم
              </span>
            </span>
          )}
          {info("Employee ID", person.id, true)}
          {info("القسم", person.section)}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
        {/* الملخص والمرتب (اليمين) - summary + salary (right) */}
        <div style={{ width: 430, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {stat("أيام الحضور", person.presentDays, T.green)}
            {stat("أيام الغياب", person.absentDays, T.red)}
            {stat("إجازة", person.leaveDays, T.gray)}
            {stat("جمع اشتغلها", fridays, T.sky)}
            {stat("نص يوم", halves, T.amber)}
          </div>
          <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "4px 14px" }}>
            <p style={{ margin: 0, fontWeight: 900, color: T.heading, fontSize: 14 }}>أيام الغياب</p>
            <p style={{ margin: 0, lineHeight: 1.7, fontSize: 14, fontWeight: 600, color: person.absentDates.length ? T.red : T.muted }}>
              {person.absentDates.length ? person.absentDates.map(formatDayName).join("، ") : "مفيش غياب الشهر ده"}
            </p>
          </div>
          <SalaryBox salary={salary} />
        </div>

        {/* التقويم (الشمال) - calendar (left) */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Calendar person={person} openToday={openToday} />
        </div>
      </div>

      {/* الفوتر - footer */}
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.border}`, paddingTop: 6, fontSize: 12, color: T.muted }}>
        <span>
          تاريخ التقرير: <span dir="ltr">{date}</span> — {formatTime12(now)}
        </span>
        <span style={{ fontWeight: 700 }}>لوحة متابعة الصفوة</span>
      </div>
    </div>
  );
}

// ===== التصدير - export =====
type ReportInput = { person: EmployeeAttendance; salary: EmployeeSalary | null | undefined };
type Common = { month: string; openToday: string | null };

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// بيرسم التقارير واحد واحد في div برا الشاشة ويرجّع صورة لكل واحد
// Renders the reports one by one in an off-screen div and hands back an image of each
async function renderEach(items: ReportInput[], common: Common, shot: (node: HTMLElement, i: number) => Promise<void>) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    for (let i = 0; i < items.length; i++) {
      flushSync(() => root.render(<AttendanceReport {...items[i]} {...common} />));
      const node = host.firstElementChild as HTMLElement;
      await document.fonts.ready;
      await Promise.all(Array.from(node.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)));
      await shot(node, i);
    }
  } finally {
    root.unmount();
    host.remove();
  }
}

// PNG لموظف واحد (1123×794 × 2) - one employee as a PNG (1123×794 at ×2)
export async function exportPng(item: ReportInput, common: Common) {
  const { toPng, getFontEmbedCSS } = await import("html-to-image");
  await renderEach([item], common, async (node) => {
    const fontEmbedCSS = await getFontEmbedCSS(node);
    const url = await toPng(node, { pixelRatio: 2, fontEmbedCSS, backgroundColor: T.page, width: PAGE_W, height: PAGE_H });
    download(url, reportFileName(item.person.name, common.month, "png"));
  });
}

// PDF A4 عرضي، صفحة لكل موظف - a landscape A4 PDF, one page per employee
export async function exportPdf(items: ReportInput[], common: Common, fileTitle: string, onProgress?: (done: number) => void) {
  const [{ toJpeg, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const pixelRatio = items.length > 1 ? 1.6 : 2;
  let fontEmbedCSS: string | null = null;
  await renderEach(items, common, async (node, i) => {
    fontEmbedCSS ??= await getFontEmbedCSS(node);
    const url = await toJpeg(node, { pixelRatio, quality: 0.92, fontEmbedCSS, backgroundColor: T.page, width: PAGE_W, height: PAGE_H });
    if (i > 0) pdf.addPage("a4", "landscape");
    pdf.addImage(url, "JPEG", 0, 0, 297, 210);
    onProgress?.(i + 1);
  });
  pdf.save(reportFileName(fileTitle, common.month, "pdf"));
}
