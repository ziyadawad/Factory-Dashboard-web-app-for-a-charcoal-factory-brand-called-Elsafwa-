// بيانات تجريبية لصفحة IT والمراقبة (وضع المعاينة بس، لحد ما الإيجنت يبعت أول مرة)
// مستخدمة في components/ItPage.tsx بس - عمرها ما بتوصل لأي صفحة تانية ولا للـ API
// Sample data for the IT page (preview mode only, until the agent sends for the first time).
// Used by components/ItPage.tsx only - never reaches any other page or the API
import { ItCamera, ItDevice, ItEvent, ItRouter, ItSnapshot } from "./types";

const ago = (now: number, minutes: number) => new Date(now - minutes * 60_000).toISOString();

export function sampleItSnapshot(now: number): ItSnapshot {
  // اللاتنسي بيتغير شوية كل تحديث عشان يبان حي - latency wiggles a little so it looks alive
  const jitter = (base: number, seed: number) => Math.max(1, Math.round(base + Math.sin(now / 15_000 + seed) * base * 0.25));

  const routers: ItRouter[] = [
    { id: "r-main", name: "الراوتر الرئيسي (WE)", kind: "router", ip: "192.168.1.1", up: true, latencyMs: jitter(3, 1), internet: true, since: ago(now, 2 * 1440 + 310), uptimeTodayPct: 100 },
    { id: "r-backup", name: "راوتر احتياطي (Orange)", kind: "router", ip: "192.168.2.1", up: true, latencyMs: jitter(5, 2), internet: true, since: ago(now, 1440 + 75), uptimeTodayPct: 97.8 },
    { id: "ap-office", name: "أكسس المكاتب", kind: "ap", ip: "192.168.1.20", up: true, latencyMs: jitter(4, 3), internet: true, since: ago(now, 600), uptimeTodayPct: 99.6 },
    { id: "ap-store", name: "أكسس المخزن", kind: "ap", ip: "192.168.1.21", up: false, latencyMs: null, internet: false, since: ago(now, 14), uptimeTodayPct: 88.4 },
    { id: "ap-kilns", name: "أكسس الأفران", kind: "ap", ip: "192.168.1.22", up: true, latencyMs: jitter(9, 4), internet: true, since: ago(now, 245), uptimeTodayPct: 94.1 },
  ];

  const device = (id: string, name: string, type: ItDevice["type"], ip: string, up: boolean, latency: number, downMinutes = 0): ItDevice => ({
    id,
    name,
    type,
    ip,
    up,
    latencyMs: up ? jitter(latency, id.length) : null,
    lastSeen: up ? ago(now, 0) : ago(now, downMinutes),
    since: up ? ago(now, 480 + id.length * 37) : ago(now, downMinutes),
  });
  const devices: ItDevice[] = [
    device("fp-admin", "بصمة الإدارة", "fingerprint", "192.168.1.201", true, 6),
    device("fp-workers", "بصمة العمال", "fingerprint", "192.168.1.202", true, 8),
    device("nvr-1", "NVR الكاميرات (16 قناة)", "nvr", "192.168.1.100", true, 2),
    device("pr-accounts", "طابعة الحسابات", "printer", "192.168.1.150", true, 5),
    device("pr-barcode", "طابعة الباركود", "printer", "192.168.1.151", false, 0, 37),
    device("pc-accounts", "كمبيوتر الحسابات", "pc", "192.168.1.30", true, 1),
    device("pc-store", "كمبيوتر المخازن", "pc", "192.168.1.31", true, 2),
    device("pc-sales", "كمبيوتر المبيعات", "pc", "192.168.1.32", true, 1),
    device("pc-it", "كمبيوتر IT", "pc", "192.168.1.10", true, 1),
    device("scale-1", "ميزان البسكول", "scale", "192.168.1.60", true, 11),
    device("sw-core", "السويتش الرئيسي", "other", "192.168.1.2", true, 1),
    device("ups-1", "UPS غرفة السيرفر", "other", "192.168.1.5", true, 3),
  ];

  const cameras: ItCamera[] = [
    "البوابة الرئيسية",
    "ساحة الأفران",
    "المخزن 1",
    "المخزن 2",
    "صالة التعبئة",
    "المكاتب",
    "ساحة الخشب",
    "الميزان",
  ].map((name, index) => ({ id: `cam-${index + 1}`, name, online: index !== 6 }));

  const event = (id: string, minutes: number, kind: ItEvent["kind"], targetName: string, targetType: ItEvent["targetType"], ip: string): ItEvent => ({
    id,
    at: ago(now, minutes),
    kind,
    targetName,
    targetType,
    ip,
  });
  const events: ItEvent[] = [
    event("e1", 14, "down", "أكسس المخزن", "ap", "192.168.1.21"),
    event("e2", 37, "down", "طابعة الباركود", "printer", "192.168.1.151"),
    event("e3", 52, "up", "راوتر احتياطي (Orange)", "router", "192.168.2.1"),
    event("e4", 57, "down", "راوتر احتياطي (Orange)", "router", "192.168.2.1"),
    event("e5", 125, "up", "بصمة العمال", "fingerprint", "192.168.1.202"),
    event("e6", 128, "down", "بصمة العمال", "fingerprint", "192.168.1.202"),
    event("e7", 245, "up", "أكسس الأفران", "ap", "192.168.1.22"),
    event("e8", 251, "down", "أكسس الأفران", "ap", "192.168.1.22"),
  ];

  return {
    agent: { name: "معاينة", version: "" },
    sentAt: ago(now, 0),
    internet: { up: true, since: ago(now, 6 * 60 + 12), latencyMs: jitter(24, 5) },
    routers,
    devices,
    cameras,
    events,
  };
}

// صورة رمادي تجريبية لكاميرا (SVG) - مفيش أي صورة حقيقية في المعاينة - a gray placeholder frame (SVG); no real image in preview
export function sampleCameraFrame(name: string, index: number, tick: number): string {
  const seconds = String(tick % 60).padStart(2, "0");
  const shade = 46 + ((index * 23) % 30);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${shade},${shade + 4},${shade + 10})"/><stop offset="1" stop-color="rgb(${shade - 26},${shade - 24},${shade - 18})"/></linearGradient>
<pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="2"/></pattern>
</defs>
<rect width="1280" height="720" fill="url(#g)"/><rect width="1280" height="720" fill="url(#p)"/>
<path d="M0 560 L${300 + index * 40} ${380 - index * 6} L${760 + index * 20} 420 L1280 ${330 + index * 12} V720 H0 Z" fill="rgba(0,0,0,0.22)"/>
<rect x="${180 + index * 70}" y="${300 - index * 8}" width="${200 + index * 10}" height="${150 + index * 6}" rx="6" fill="rgba(255,255,255,0.06)"/>
<g fill="rgba(255,255,255,0.55)" font-family="monospace" font-size="30"><text x="36" y="58">CAM ${String(index + 1).padStart(2, "0")}</text><text x="1244" y="58" text-anchor="end">PREVIEW 00:00:${seconds}</text></g>
<text x="640" y="380" text-anchor="middle" fill="rgba(255,255,255,0.18)" font-family="sans-serif" font-size="64" font-weight="700">${name}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
