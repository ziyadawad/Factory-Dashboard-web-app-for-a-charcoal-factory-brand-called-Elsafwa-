"use client";

// تقرير حضور موظف لشهر (صفحة A4 واحدة) بيتعمل في المتصفح ويتنزل PNG أو PDF
// One employee's monthly attendance report (one A4 page), built in the browser and downloaded as PNG or PDF
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DayStatus, EmployeeAttendance, EmployeeDay, EmployeeSalary } from "@/lib/types";
import { formatDayName, formatNumber, formatTime12 } from "@/lib/format";
import { monthName } from "./SalesCommon";

// عرض صفحة A4 بالبكسل (96dpi) - an A4 page width in px (96dpi)
const PAGE_W = 794;
const PAGE_H = 1123;

type Tone = { bg: string; border: string; text: string; note: string };
type Theme = {
  page: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  green: string;
  red: string;
  amber: string;
  sky: string;
  gray: string;
  cell: { present: Tone; absent: Tone; half: Tone; friday: Tone; off: Tone; empty: Tone };
};

// PNG غامق (زي اللوحة)، PDF فاتح للطباعة - PNG dark (like the panel), PDF light for printing
const DARK: Theme = {
  page: "#0b1220",
  card: "#141d2f",
  border: "#2b3a55",
  text: "#ffffff",
  muted: "#9aa8bf",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  sky: "#38bdf8",
  gray: "#9ca3af",
  cell: {
    present: { bg: "#123d26", border: "#22c55e", text: "#ffffff", note: "#c7d2e0" },
    absent: { bg: "#4a1717", border: "#ef4444", text: "#ffffff", note: "#fecaca" },
    half: { bg: "#47300c", border: "#f59e0b", text: "#ffffff", note: "#fde68a" },
    friday: { bg: "#0d3a55", border: "#38bdf8", text: "#ffffff", note: "#bae6fd" },
    off: { bg: "#283244", border: "#56637a", text: "#d1d5db", note: "#aeb7c6" },
    empty: { bg: "transparent", border: "#2b3a55", text: "#5b6880", note: "#5b6880" },
  },
};

const LIGHT: Theme = {
  page: "#ffffff",
  card: "#f6f8fb",
  border: "#cfd8e3",
  text: "#0f172a",
  muted: "#526079",
  green: "#15803d",
  red: "#dc2626",
  amber: "#b45309",
  sky: "#0369a1",
  gray: "#6b7280",
  cell: {
    present: { bg: "#dcfce7", border: "#16a34a", text: "#0f172a", note: "#166534" },
    absent: { bg: "#fee2e2", border: "#dc2626", text: "#0f172a", note: "#991b1b" },
    half: { bg: "#fef3c7", border: "#d97706", text: "#0f172a", note: "#92400e" },
    friday: { bg: "#e0f2fe", border: "#0284c7", text: "#0f172a", note: "#075985" },
    off: { bg: "#e5e7eb", border: "#9ca3af", text: "#374151", note: "#4b5563" },
    empty: { bg: "#ffffff", border: "#e2e8f0", text: "#b6c0cf", note: "#b6c0cf" },
  },
};

const WEEK_HEADER = ["السبت", "الأحد", "الاتنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const CELL_NOTE: Partial<Record<DayStatus, string>> = { absent: "غائب", leave: "إجازة", off: "جمعة", holiday: "إجازة رسمية" };
const FONT = "'Cairo Variable', 'Cairo Numbers', Arial, sans-serif";

const num = (value: number) => (
  <span dir="ltr" style={{ fontVariantNumeric: "tabular-nums" }}>
    {formatNumber(Math.round(value * 100) / 100)}
  </span>
);

// "شهر نوفمبر 2026"
export const reportMonth = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`;

// اسم ملف آمن - a safe file name
export const reportFileName = (name: string, month: string, ext: "png" | "pdf") =>
  `حضور-${name}-${monthName(month)}-${month.slice(0, 4)}.${ext}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ");

function dayTone(day: EmployeeDay, open: boolean, t: Theme): Tone {
  if (day.fridayWork) return t.cell.friday;
  if (day.half) return t.cell.half;
  if (open) return t.cell.empty;
  if (day.status === "present") return t.cell.present;
  if (day.status === "absent") return t.cell.absent;
  if (day.status === "leave" || day.status === "off" || day.status === "holiday") return t.cell.off;
  return t.cell.empty;
}

function Calendar({ person, openToday, t }: { person: EmployeeAttendance; openToday: string | null; t: Theme }) {
  const first = person.days[0]?.date;
  const offset = first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 1) % 7 : 0; // السبت = 0
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {WEEK_HEADER.map((d) => (
        <p key={d} style={{ textAlign: "center", color: t.muted, fontWeight: 700, fontSize: 14, margin: 0 }}>
          {d}
        </p>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <div key={`pad-${i}`} />
      ))}
      {person.days.map((day) => {
        const open = day.date === openToday && day.status === "absent";
        const tone = dayTone(day, open, t);
        const note = day.fridayWork
          ? "جمعة شغل"
          : day.firstPunch && day.status !== "future"
            ? formatTime12(day.firstPunch)
            : open
              ? "النهارده"
              : CELL_NOTE[day.status] ?? "";
        const half = day.half || day.fridayWork === 0.5;
        return (
          <div
            key={day.date}
            style={{
              height: 58,
              borderRadius: 8,
              border: `1.5px solid ${tone.border}`,
              background: tone.bg,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.25,
            }}
          >
            <span dir="ltr" style={{ fontWeight: 800, fontSize: 18, color: tone.text }}>
              {Number(day.date.slice(8))}
              {half && <span style={{ fontSize: 13, color: tone.note }}> ½</span>}
            </span>
            {note && (
              <span dir={day.firstPunch && !day.fridayWork ? "ltr" : undefined} style={{ fontSize: 12, fontWeight: 600, color: tone.note }}>
                {note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Legend({ t }: { t: Theme }) {
  const item = (tone: Tone, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <i style={{ width: 14, height: 14, borderRadius: 4, background: tone.bg, border: `1.5px solid ${tone.border}`, display: "inline-block" }} />
      {label}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13, color: t.muted, marginTop: 10 }}>
      {item(t.cell.present, "حاضر (وقت أول بصمة)")}
      {item(t.cell.absent, "غائب")}
      {item(t.cell.half, "نص يوم")}
      {item(t.cell.friday, "جمعة شغل")}
      {item(t.cell.off, "إجازة / جمعة / إجازة رسمية")}
      {item(t.cell.empty, "لسه / قبل البصمة أو التعيين")}
    </div>
  );
}

function SalaryBox({ salary, t }: { salary: EmployeeSalary | undefined; t: Theme }) {
  const box = { border: `1.5px solid ${t.amber}`, borderRadius: 12, background: t.card, padding: "10px 16px" } as const;
  if (!salary || salary.kind === "none") {
    return (
      <div style={box}>
        <p style={{ margin: 0, color: t.amber, fontWeight: 800, fontSize: 16 }}>💰 المرتب</p>
        <p style={{ margin: 0, color: t.muted }}>المرتب مش متسجل في السيستم</p>
      </div>
    );
  }
  const daily = salary.kind === "daily";
  const rows: [string, number, "" | "+" | "−", string][] = [
    daily
      ? [`اليومية (${formatNumber(salary.dailyRate)} × ${formatNumber(salary.presentDays)} يوم)`, salary.dailyRate * salary.presentDays, "", t.text]
      : ["الأجر الشامل", salary.total, "", t.text],
    ["خصم الغياب", salary.absence, "−", t.red],
    ["الخصومات", salary.deductions, "−", t.red],
    ["السلف", salary.advanceTotal, "−", t.red],
    ["الأقساط", salary.installments, "−", t.red],
    ["المكافآت", salary.bonuses, "+", t.green],
  ];
  if (salary.friday.amount > 0) rows.push(["بدل الجمعة", salary.friday.amount, "+", t.sky]);
  rows.push(["الإضافي (بيتقبض كاش لوحده)", salary.overtime.total, "+", t.sky]);
  return (
    <div style={box}>
      <p style={{ margin: "0 0 4px", color: t.amber, fontWeight: 800, fontSize: 16 }}>💰 المرتب — لحد يوم التقرير</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24 }}>
        {rows.map(([label, value, sign, color]) => (
          <p
            key={label}
            style={{ margin: 0, display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${t.border}`, padding: "3px 0", fontSize: 14 }}
          >
            <span style={{ color: t.muted }}>{label}</span>
            <span dir="ltr" style={{ fontWeight: 700, color: value ? color : t.muted }}>
              {value && sign ? `${sign} ` : ""}
              {formatNumber(Math.round(value * 100) / 100)}
            </span>
          </p>
        ))}
      </div>
      <p style={{ margin: "6px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: t.text }}>المرتب النهائي</span>
        <span style={{ fontWeight: 800, fontSize: 26, color: t.green }}>
          {num(salary.earned)} <span style={{ fontSize: 15, color: t.muted }}>ج.م</span>
        </span>
      </p>
    </div>
  );
}

export function AttendanceReport({
  person,
  month,
  openToday,
  salary,
  includeSalary,
  dark,
}: {
  person: EmployeeAttendance;
  month: string;
  openToday: string | null;
  salary?: EmployeeSalary;
  includeSalary: boolean;
  dark: boolean;
}) {
  const t = dark ? DARK : LIGHT;
  const fridays = person.days.reduce((s, d) => s + (d.fridayWork ?? 0), 0);
  const halves = person.days.filter((d) => d.half).length;
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  const stat = (label: string, value: number, color: string) => (
    <div style={{ flex: 1, background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 12, textAlign: "center", padding: "6px 4px" }}>
      <p style={{ margin: 0, fontSize: 32, fontWeight: 800, lineHeight: 1.3, color: value ? color : t.muted }}>{num(value)}</p>
      <p style={{ margin: 0, fontSize: 14, color: t.muted, fontWeight: 600 }}>{label}</p>
    </div>
  );
  const info = (label: string, value: string | null, ltr = false) => (
    <span style={{ display: "inline-flex", gap: 6, background: t.card, border: `1px solid ${t.border}`, borderRadius: 999, padding: "0 12px" }}>
      <span style={{ color: t.muted }}>{label}</span>
      <span dir={ltr ? "ltr" : undefined} style={{ color: t.text, fontWeight: 700 }}>
        {value || "—"}
      </span>
    </span>
  );
  return (
    <div
      dir="rtl"
      style={{
        width: PAGE_W,
        minHeight: PAGE_H,
        boxSizing: "border-box",
        padding: "28px 34px 22px",
        background: t.page,
        color: t.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* الهيدر - header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: `2px solid ${t.border}`, paddingBottom: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, color: t.muted, fontWeight: 700 }}>تقرير حضور — شهر {reportMonth(month)}</p>
          <p style={{ margin: 0, fontSize: 27, fontWeight: 800, lineHeight: 1.5 }}>{person.name}</p>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 14, lineHeight: 2 }}>
        {info("كود البصمة", person.code, true)}
        {info("Employee ID", person.id, true)}
        {info("القسم", person.section)}
      </div>

      {/* الملخص - summary */}
      <div style={{ display: "flex", gap: 10 }}>
        {stat("أيام الحضور", person.presentDays, t.green)}
        {stat("أيام الغياب", person.absentDays, t.red)}
        {stat("إجازة", person.leaveDays, t.gray)}
        {stat("جمع اشتغلها", fridays, t.sky)}
        {stat("نص يوم", halves, t.amber)}
      </div>

      {/* التقويم - calendar */}
      <div>
        <Calendar person={person} openToday={openToday} t={t} />
        <Legend t={t} />
      </div>

      {/* أيام الغياب - absent days */}
      <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "8px 16px" }}>
        <p style={{ margin: 0, fontWeight: 800, color: t.muted, fontSize: 15 }}>أيام الغياب</p>
        <p style={{ margin: 0, lineHeight: 1.9, fontSize: 15, fontWeight: 600, color: person.absentDates.length ? t.red : t.muted }}>
          {person.absentDates.length ? person.absentDates.map(formatDayName).join("، ") : "مفيش غياب الشهر ده"}
        </p>
      </div>

      {includeSalary && <SalaryBox salary={salary} t={t} />}

      {/* الفوتر - footer */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          justifyContent: "space-between",
          borderTop: `1px solid ${t.border}`,
          paddingTop: 8,
          fontSize: 12,
          color: t.muted,
        }}
      >
        <span>
          تاريخ التقرير: <span dir="ltr">{date}</span> — {formatTime12(now)}
        </span>
        <span style={{ fontWeight: 700 }}>لوحة متابعة الصفوة</span>
      </div>
    </div>
  );
}

// ===== التصدير - export =====
type ReportInput = { person: EmployeeAttendance; salary?: EmployeeSalary };
type Common = { month: string; openToday: string | null; includeSalary: boolean };

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
async function renderEach(
  items: ReportInput[],
  common: Common,
  dark: boolean,
  shot: (node: HTMLElement, i: number) => Promise<void>
) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    for (let i = 0; i < items.length; i++) {
      flushSync(() => root.render(<AttendanceReport {...items[i]} {...common} dark={dark} />));
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

// PNG غامق لموظف واحد - one employee as a dark PNG
export async function exportPng(item: ReportInput, common: Common) {
  const { toPng, getFontEmbedCSS } = await import("html-to-image");
  await renderEach([item], common, true, async (node) => {
    const fontEmbedCSS = await getFontEmbedCSS(node);
    const url = await toPng(node, { pixelRatio: 2, fontEmbedCSS, backgroundColor: DARK.page });
    download(url, reportFileName(item.person.name, common.month, "png"));
  });
}

// PDF فاتح A4 طولي، صفحة لكل موظف - a light A4 portrait PDF, one page per employee
export async function exportPdf(items: ReportInput[], common: Common, fileTitle: string, onProgress?: (done: number) => void) {
  const [{ toJpeg, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pixelRatio = items.length > 1 ? 1.6 : 2;
  let fontEmbedCSS: string | null = null;
  await renderEach(items, common, false, async (node, i) => {
    fontEmbedCSS ??= await getFontEmbedCSS(node);
    const url = await toJpeg(node, { pixelRatio, quality: 0.92, fontEmbedCSS, backgroundColor: LIGHT.page });
    // صفحة واحدة: لو التقرير أطول من A4 بيصغر عشان يدخل - one page: a taller report is scaled down to fit
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const scale = Math.min(210 / w, 297 / h);
    const mmW = w * scale;
    const mmH = h * scale;
    if (i > 0) pdf.addPage();
    pdf.addImage(url, "JPEG", (210 - mmW) / 2, 0, mmW, mmH);
    onProgress?.(i + 1);
  });
  pdf.save(reportFileName(fileTitle, common.month, "pdf"));
}
