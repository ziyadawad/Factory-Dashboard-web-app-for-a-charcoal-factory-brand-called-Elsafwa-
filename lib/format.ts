const numberFormatter = new Intl.NumberFormat("en-US");

// Always render numbers with English (Latin) digits, regardless of the browser locale
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

// Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits inside text coming from the data source
export function toEnglishDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Arabic month/day names with English digits
export const DATE_LOCALE = "ar-EG-u-nu-latn";

// "2026-10-31" -> "السبت 31/10" (التاريخ من غير ساعة فبنقراه UTC) - date only, so read it as UTC
export function formatDayName(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date || "—";
  const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(DATE_LOCALE, {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${day}/${month}`;
}

// ===== الوقت بنظام 12 ساعة بـ ص / م (بتوقيت القاهرة) في كل الداشبورد - 12-hour time with ص / م (Cairo) everywhere =====
// بياخد: "16:30" أو "16:30:05" (وقت القاهرة)، أو "2026-11-24 16:30:00" (وقت القاهرة من ERPNext)، أو ISO فيه Z / فرق توقيت
// أو Date / رقم (لحظة، بتتحول لوقت القاهرة). بيرجع "4:30 م". الرقم والـ ص/م جوه عزل RTL عشان يتعرض صح حتى جوه dir="ltr"
// (زي ساعة الهيدر). plain = من غير علامات العزل (للإكسيل)
// Accepts "16:30" / "16:30:05" (Cairo time), "2026-11-24 16:30:00" (Cairo time from ERPNext), an ISO string with Z /
// an offset, or a Date / number (an instant, converted to Cairo). Returns "4:30 م", wrapped in an RTL isolate so it
// reads right even inside dir="ltr" (like the header clock). plain = no isolate marks (for Excel)
const cairoHourMinute = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function formatTime12(value: string | Date | number | null | undefined, plain = false): string {
  if (value === null || value === undefined || value === "") return "";
  let hm: string | null = null;
  if (typeof value === "string") {
    const text = value.trim();
    const onlyTime = /^(\d{1,2}):(\d{2})/.exec(text);
    // تاريخ + وقت من غير منطقة زمنية = وقت القاهرة زي ما هو - a date + time without a zone = Cairo wall time as is
    const local = /^\d{4}-\d{2}-\d{2}[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text);
    if (onlyTime) hm = `${onlyTime[1]}:${onlyTime[2]}`;
    else if (local) hm = `${local[1]}:${local[2]}`;
    else {
      const d = new Date(text);
      if (!Number.isNaN(d.getTime())) hm = cairoHourMinute.format(d);
    }
  } else {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(d.getTime())) hm = cairoHourMinute.format(d);
  }
  if (!hm) return typeof value === "string" ? value : "";
  const [hRaw, m] = hm.split(":");
  const h = Number(hRaw) % 24;
  const text = `${h % 12 === 0 ? 12 : h % 12}:${m.padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
  return plain ? text : `⁧${text}⁩`;
}

// ساعة لوحدها بـ ص / م للرسوم ("6ص"، "2م") - an hour alone for chart axes
export const hourLabel12 = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "ص" : "م"}`;

// "2026-11-24 16:30" ← "2026-11-24 4:30 م" (التاريخ زي ما هو والساعة بـ ص / م) - the date as is, the time with ص / م
export function formatDateTime12(text: string | null | undefined): string {
  if (!text) return "";
  const date = /^\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
  const time = formatTime12(text);
  return date && time && time !== text ? `${date} ${time}` : text;
}
