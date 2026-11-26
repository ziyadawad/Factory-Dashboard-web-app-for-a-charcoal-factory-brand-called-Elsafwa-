"use client";

// الطباعة الحرارية لتطبيق المناديب (المتصفح بس): الفاتورة بتترسم صورة على canvas (عربي RTL بخط Cairo، عشان الطابعات
// الصيني مش بتعرف تكتب عربي)، وبتتبعت ESC/POS raster (GS v 0) على Bluetooth (BLE) أو USB، حتة حتة.
// 58mm = 384 نقطة، 80mm = 576 نقطة (203 dpi). وفيه "طباعة عادية" (window.print) و"مشاركة PDF" لو مفيش طابعة
// Thermal printing for the rep app (browser only): the receipt is drawn as an image on a canvas (Arabic RTL in Cairo,
// since cheap printers can't render Arabic) and sent as ESC/POS raster (GS v 0) over Bluetooth (BLE) or USB, in chunks.
// 58 mm = 384 dots, 80 mm = 576 dots (203 dpi). Plus a normal print (window.print) and "share PDF" without a printer

import QRCode from "qrcode";
import { formatTime12 } from "./format";
import { RepReceipt } from "./rep-types";

export type PaperWidth = 58 | 80;
export type PrinterKind = "bluetooth" | "usb";
export type SavedPrinter = { kind: PrinterKind; id: string; name: string; vendorId?: number; productId?: number };

const SETTINGS_KEY = "elsafwa:rep:printer";
const PAPER_KEY = "elsafwa:rep:paper";
export const dotsFor = (paper: PaperWidth) => (paper === 80 ? 576 : 384);

export function loadPaper(): PaperWidth {
  try {
    return window.localStorage.getItem(PAPER_KEY) === "80" ? 80 : 58;
  } catch {
    return 58;
  }
}
export function savePaper(paper: PaperWidth) {
  try {
    window.localStorage.setItem(PAPER_KEY, String(paper));
  } catch {}
}
export function loadPrinter(): SavedPrinter | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as SavedPrinter) : null;
  } catch {
    return null;
  }
}
function savePrinter(p: SavedPrinter | null) {
  try {
    if (p) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(SETTINGS_KEY);
  } catch {}
}

// ===== أنواع Web Bluetooth / WebUSB (مش في lib.dom) - minimal Web Bluetooth / WebUSB types (not in lib.dom) =====
type BtCharacteristic = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};
type BtService = { getCharacteristics: () => Promise<BtCharacteristic[]> };
type BtServer = { connected: boolean; getPrimaryServices: () => Promise<BtService[]>; disconnect: () => void };
type BtDevice = { id: string; name?: string; gatt?: { connect: () => Promise<BtServer>; connected: boolean } };
type Bluetooth = { requestDevice: (o: unknown) => Promise<BtDevice>; getDevices?: () => Promise<BtDevice[]> };
type UsbEndpoint = { endpointNumber: number; direction: "in" | "out"; type: string };
type UsbInterface = { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } };
type UsbDevice = {
  productName?: string; vendorId: number; productId: number; opened: boolean; serialNumber?: string;
  configuration: { interfaces: UsbInterface[] } | null;
  open: () => Promise<void>; selectConfiguration: (n: number) => Promise<void>; claimInterface: (n: number) => Promise<void>;
  transferOut: (ep: number, data: BufferSource) => Promise<unknown>;
};
type Usb = { requestDevice: (o: unknown) => Promise<UsbDevice>; getDevices: () => Promise<UsbDevice[]> };

const nav = () => (typeof navigator === "undefined" ? {} : (navigator as unknown as { bluetooth?: Bluetooth; usb?: Usb }));
export const bluetoothSupported = () => !!nav().bluetooth;
export const usbSupported = () => !!nav().usb;

// خدمات BLE المشهورة في الطابعات الحرارية - well-known BLE services of thermal printers
const BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
];

type Link = { kind: "bluetooth"; ch: BtCharacteristic; server: BtServer } | { kind: "usb"; device: UsbDevice; ep: number };
let link: Link | null = null;

async function bluetoothLink(device: BtDevice): Promise<Link> {
  if (!device.gatt) throw new Error("الجهاز ده مش طابعة Bluetooth");
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  for (const s of services) {
    for (const ch of await s.getCharacteristics().catch(() => [] as BtCharacteristic[])) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) return { kind: "bluetooth", ch, server };
    }
  }
  server.disconnect();
  throw new Error("الطابعة دي مش بتقبل كتابة على BLE — لازم طابعة BLE (مش Bluetooth Classic بس)");
}

async function usbLink(device: UsbDevice): Promise<Link> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  for (const intf of device.configuration?.interfaces ?? []) {
    const ep = intf.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
    if (!ep) continue;
    await device.claimInterface(intf.interfaceNumber).catch(() => {});
    return { kind: "usb", device, ep: ep.endpointNumber };
  }
  throw new Error("مفيش مخرج طباعة في جهاز الـ USB ده");
}

// اختيار طابعة جديدة (لازم بعد ضغطة) - pick a new printer (needs a tap)
export async function pickPrinter(kind: PrinterKind): Promise<SavedPrinter> {
  if (kind === "bluetooth") {
    const bt = nav().bluetooth;
    if (!bt) throw new Error("المتصفح ده مفيهوش Bluetooth — استخدم Chrome على أندرويد");
    const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    link = await bluetoothLink(device);
    const saved = { kind, id: device.id, name: device.name || "طابعة Bluetooth" };
    savePrinter(saved);
    return saved;
  }
  const usb = nav().usb;
  if (!usb) throw new Error("المتصفح ده مفيهوش USB");
  const device = await usb.requestDevice({ filters: [] });
  link = await usbLink(device);
  const saved = { kind, id: `${device.vendorId}:${device.productId}:${device.serialNumber ?? ""}`, name: device.productName || "طابعة USB", vendorId: device.vendorId, productId: device.productId };
  savePrinter(saved);
  return saved;
}

export function forgetPrinter() {
  if (link?.kind === "bluetooth") link.server.disconnect();
  link = null;
  savePrinter(null);
}

// نرجع للطابعة المحفوظة من غير ما نسأل (لو المتصفح بيسمح) - reconnect to the saved printer without a prompt (if allowed)
async function ensureLink(): Promise<Link> {
  if (link?.kind === "bluetooth" && link.server.connected) return link;
  if (link?.kind === "usb" && link.device.opened) return link;
  const saved = loadPrinter();
  if (!saved) throw new NoPrinterError("مفيش طابعة متوصلة — اختار طابعة من الإعدادات");
  if (saved.kind === "bluetooth") {
    const devices = (await nav().bluetooth?.getDevices?.().catch(() => [])) ?? [];
    const device = devices.find((d) => d.id === saved.id);
    if (!device) throw new NoPrinterError("وصّل الطابعة تاني (اضغط \"اختار طابعة\")");
    link = await bluetoothLink(device);
    return link;
  }
  const devices = (await nav().usb?.getDevices().catch(() => [])) ?? [];
  const device = devices.find((d) => d.vendorId === saved.vendorId && d.productId === saved.productId);
  if (!device) throw new NoPrinterError("وصّل طابعة الـ USB تاني");
  link = await usbLink(device);
  return link;
}
export class NoPrinterError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(bytes: Uint8Array) {
  const l = await ensureLink();
  if (l.kind === "usb") {
    for (let i = 0; i < bytes.length; i += 4096) await l.device.transferOut(l.ep, bytes.slice(i, i + 4096));
    return;
  }
  // BLE: حتت صغيرة (أغلب الطابعات 20–180 بايت) مع راحة صغيرة عشان البافر ميفيضش - small chunks with a pause so the buffer never overflows
  const size = l.ch.properties.writeWithoutResponse ? 180 : 100;
  for (let i = 0; i < bytes.length; i += size) {
    const part = bytes.slice(i, i + size);
    if (l.ch.properties.writeWithoutResponse && l.ch.writeValueWithoutResponse) {
      await l.ch.writeValueWithoutResponse(part);
      await sleep(12);
    } else await l.ch.writeValue(part);
  }
}

// ===== الرسم - drawing =====
const FONT = '"Cairo Variable", "Cairo", Arial, sans-serif';
const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

let logoPromise: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/rep/logo-round.png";
  });
  return logoPromise;
}

async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`400 24px ${FONT}`, "ا"), document.fonts.load(`800 24px ${FONT}`, "ا")]);
  } catch {}
}

// الفاتورة صورة أبيض وأسود بعرض الورق - the receipt as a black-and-white image the width of the paper
export async function renderReceipt(r: RepReceipt, paper: PaperWidth): Promise<HTMLCanvasElement> {
  await fontsReady();
  const W = dotsFor(paper);
  const s = W / 384; // المقاس على 58mm - sizes are tuned for 58 mm
  const M = Math.round(10 * s);
  const big = document.createElement("canvas");
  big.width = W;
  big.height = 1400 + r.items.length * 90 * s + 400;
  const c = big.getContext("2d")!;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, W, big.height);
  c.fillStyle = "#000";
  c.direction = "rtl";
  c.textBaseline = "top";
  let y = M;
  const font = (px: number, weight = 400) => (c.font = `${weight} ${Math.round(px * s)}px ${FONT}`);
  const line = (thick = 2) => {
    c.fillRect(M, y, W - 2 * M, Math.max(1, Math.round(thick * s)));
    y += Math.round(10 * s);
  };
  const center = (text: string, px: number, weight = 400) => {
    font(px, weight);
    c.textAlign = "center";
    c.fillText(text, W / 2, y);
    y += Math.round(px * s * 1.5);
  };
  // سطر: عنوان يمين وقيمة شمال - a row: label right, value left
  const row = (label: string, value: string, px = 20, weight = 400) => {
    font(px, weight);
    c.textAlign = "right";
    c.fillText(label, W - M, y);
    c.direction = "ltr";
    c.textAlign = "left";
    c.fillText(value, M, y);
    c.direction = "rtl";
    y += Math.round(px * s * 1.45);
  };

  const img = await logo();
  if (img) {
    const size = Math.round(110 * s);
    c.drawImage(img, (W - size) / 2, y, size, size);
    y += size + Math.round(6 * s);
  }
  center(r.companyName, 26, 800);
  if (r.temporary) {
    // فاتورة مؤقتة: شريط أسود بكلام أبيض - a temporary invoice: a black band with white text
    const h = Math.round(44 * s);
    c.fillRect(M, y, W - 2 * M, h);
    c.fillStyle = "#fff";
    font(20, 800);
    c.textAlign = "center";
    c.fillText("فاتورة مؤقتة — لسه ما اتسجلتش", W / 2, y + Math.round(6 * s));
    c.fillStyle = "#000";
    y += h + Math.round(8 * s);
  }
  if (r.cancelled) center("— ملغية —", 24, 800);
  line();
  center(`فاتورة رقم`, 18);
  font(22, 800);
  c.direction = "ltr";
  c.textAlign = "center";
  c.fillText(r.name, W / 2, y);
  c.direction = "rtl";
  y += Math.round(34 * s);
  // QR برقم الفاتورة - a QR of the invoice number
  const qr = QRCode.create(r.name, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = Math.max(2, Math.floor((150 * s) / n));
  const qx = Math.round((W - cell * n) / 2);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) c.fillRect(qx + j * cell, y + i * cell, cell, cell);
  y += cell * n + Math.round(10 * s);
  row("التاريخ", `${r.date}  ${formatTime12(r.time, true)}`, 19);
  row("المندوب", "", 19);
  y -= Math.round(19 * s * 1.45);
  font(19, 800);
  c.textAlign = "left";
  c.fillText(`${r.repName} — ${r.van}`, M, y);
  y += Math.round(19 * s * 1.45);
  font(19);
  c.textAlign = "right";
  c.fillText("العميل:", W - M, y);
  y += Math.round(19 * s * 1.4);
  center(r.customerName, 22, 800);
  line();

  // جدول الأصناف - the items table
  const xName = W - M;
  const xQty = Math.round(W * 0.46);
  const xRate = Math.round(W * 0.3);
  const xAmount = M;
  font(17, 800);
  c.textAlign = "right";
  c.fillText("الصنف", xName, y);
  c.textAlign = "center";
  c.fillText("كمية", xQty, y);
  c.fillText("سعر", xRate, y);
  c.textAlign = "left";
  c.fillText("إجمالي", xAmount, y);
  y += Math.round(28 * s);
  line(1);
  for (const it of r.items) {
    font(18, 700);
    c.textAlign = "right";
    // الاسم بياخد لحد عمود الكمية، والطويل بيكمل في سطر تاني - the name runs up to the qty column; long ones wrap
    const maxW = xName - xQty - Math.round(22 * s);
    const words = it.name.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (c.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    c.fillText(lines[0] ?? "", xName, y);
    font(18);
    c.direction = "ltr";
    c.textAlign = "center";
    c.fillText(nf(it.qty), xQty, y);
    c.fillText(nf(it.rate), xRate, y);
    c.textAlign = "left";
    c.fillText(nf(it.amount), xAmount, y);
    c.direction = "rtl";
    y += Math.round(28 * s);
    font(18, 700);
    c.textAlign = "right";
    for (const extra of lines.slice(1)) {
      c.fillText(extra, xName, y);
      y += Math.round(26 * s);
    }
  }
  line();
  if (r.discount > 0) {
    row("قبل الخصم", nf(r.subtotal), 19);
    row("الخصم", nf(r.discount), 19);
  }
  row("الإجمالي", `${nf(r.total)} ج.م`, 24, 800);
  row("المدفوع", nf(r.paid), 20);
  // طريقة الدفع (+ المحفظة / الحساب ورقم العملية) - the payment method (+ wallet / account and the transaction number)
  if (r.paymentMethod) {
    // طويل (المحفظة + الأرقام + رقم العملية): بيكمل في سطور - long (wallet + numbers + reference): wraps over lines
    font(17);
    c.textAlign = "right";
    const words = r.paymentMethod.split(" ");
    let cur = "";
    const lines: string[] = [];
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (c.measureText(next).width > W - 2 * M && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    for (const l of lines) {
      c.fillText(l, W - M, y);
      y += Math.round(17 * s * 1.5);
    }
    // أرقام فودافون كاش في سطر لوحده (من الشمال لليمين) - the Vodafone Cash numbers on their own line (LTR)
    if (r.paymentNumbers?.length) {
      font(18, 700);
      c.direction = "ltr";
      c.textAlign = "right";
      c.fillText(r.paymentNumbers.join("  /  "), W - M, y, W - 2 * M);
      c.direction = "rtl";
      y += Math.round(18 * s * 1.5);
    }
  } else if (r.paid <= 0) {
    font(17);
    c.textAlign = "right";
    c.fillText("آجل", W - M, y);
    y += Math.round(17 * s * 1.5);
  }
  row("الباقي", nf(r.remaining), 20, 800);
  if (r.previousBalance !== null || r.newBalance !== null) {
    line(1);
    if (r.previousBalance !== null) row("رصيد العميل قبل", nf(r.previousBalance), 19);
    if (r.newBalance !== null) row(r.balanceNote ?? "رصيد العميل بعد", nf(r.newBalance), 20, 800);
  }
  line();
  center(r.thanks, 24, 800);
  y += Math.round(10 * s);

  const out = document.createElement("canvas");
  out.width = W;
  out.height = Math.ceil(y);
  out.getContext("2d")!.drawImage(big, 0, 0);
  return out;
}

// أبيض وأسود بـ Floyd–Steinberg (اللوجو الملون بيطلع رمادي منقط مش بقعة سودا، والكلام بيفضل حاد)
// 1 = نقطة سودا - Black and white with Floyd–Steinberg dithering (the color logo prints as dotted gray, not a black blob;
// text stays sharp). 1 = a black dot
export function monoBits(canvas: HTMLCanvasElement): Uint8Array {
  const W = canvas.width;
  const H = canvas.height;
  const px = canvas.getContext("2d")!.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = px[i * 4 + 3] < 128 ? 255 : 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const bits = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const old = lum[i];
      const black = old < 128;
      bits[i] = black ? 1 : 0;
      const err = old - (black ? 0 : 255);
      if (x + 1 < W) lum[i + 1] += (err * 7) / 16;
      if (y + 1 < H) {
        if (x > 0) lum[i + W - 1] += (err * 3) / 16;
        lum[i + W] += (err * 5) / 16;
        if (x + 1 < W) lum[i + W + 1] += err / 16;
      }
    }
  }
  return bits;
}

// المعاينة = نفس اللي هيتطبع بالظبط - the preview = exactly what prints
export function monoPreview(canvas: HTMLCanvasElement): string {
  const bits = monoBits(canvas);
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  const img = ctx.createImageData(out.width, out.height);
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out.toDataURL("image/png");
}

// canvas ← أوامر ESC/POS (GS v 0 raster) بشرايح 128 سطر - canvas → ESC/POS (GS v 0 raster) in 128-row stripes
export function escposFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const W = canvas.width;
  const H = canvas.height;
  const bytesPerRow = Math.ceil(W / 8);
  const bits = monoBits(canvas);
  const parts: number[] = [0x1b, 0x40]; // ESC @ = init
  const STRIPE = 128;
  for (let top = 0; top < H; top += STRIPE) {
    const rows = Math.min(STRIPE, H - top);
    parts.push(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff);
    for (let yy = top; yy < top + rows; yy++) {
      for (let b = 0; b < bytesPerRow; b++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = b * 8 + bit;
          if (x < W && bits[yy * W + x]) byte |= 0x80 >> bit;
        }
        parts.push(byte);
      }
    }
  }
  parts.push(0x1b, 0x64, 0x04); // ESC d 4 = 4 سطور فاضية - feed 4 lines
  parts.push(0x1d, 0x56, 0x42, 0x00); // GS V B = قص (اللي مفيهاش قطاعة بتتجاهله) - cut (ignored without a cutter)
  return Uint8Array.from(parts);
}

export async function printReceipt(r: RepReceipt, paper: PaperWidth = loadPaper()) {
  const canvas = await renderReceipt(r, paper);
  await send(escposFromCanvas(canvas));
}

// "طباعة عادية": صفحة فيها صورة الفاتورة + window.print - a normal print: a page with the receipt image + window.print
export async function printNormally(r: RepReceipt, paper: PaperWidth = loadPaper()) {
  const canvas = await renderReceipt(r, paper);
  const url = canvas.toDataURL("image/png");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><style>@page{size:${paper}mm auto;margin:0}body{margin:0}img{width:${paper}mm;display:block}</style></head><body><img src="${url}"></body></html>`
  );
  doc.close();
  await new Promise((resolve) => {
    const img = doc.querySelector("img");
    if (img?.complete) resolve(null);
    else img?.addEventListener("load", () => resolve(null));
    setTimeout(resolve, 1500);
  });
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 60_000);
}

// "مشاركة PDF" (واتساب مثلا)، ولو المتصفح مش بيشارك ملفات بينزل - share as a PDF (e.g. WhatsApp), else download
export async function sharePdf(r: RepReceipt, paper: PaperWidth = loadPaper()) {
  const canvas = await renderReceipt(r, paper);
  const { jsPDF } = await import("jspdf");
  const height = (canvas.height / canvas.width) * paper;
  const pdf = new jsPDF({ unit: "mm", format: [paper, height] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, paper, height);
  const blob = pdf.output("blob");
  const file = new File([blob], `فاتورة-${r.name}.pdf`, { type: "application/pdf" });
  const share = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (share.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `فاتورة ${r.name}` }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

// فاتورة تجربة - a test receipt
export function testReceipt(repName: string, van: string, companyName: string, thanks: string): RepReceipt {
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(now);
  return {
    name: "TEST-0001", temporary: false, date, time, repName, van, customerName: "طباعة تجربة",
    items: [
      { name: "ربع كيلو", qty: 10, rate: 25, amount: 250 },
      { name: "كرتونة 2 كيلو", qty: 2, rate: 310.5, amount: 621 },
    ],
    subtotal: 871, discount: 0, total: 871, paid: 500, remaining: 371, paymentMethod: "فودافون كاش — كاش كريم عوض · رقم 123456", paymentNumbers: ["01097012948"],
    previousBalance: 1000, newBalance: 1371,
    companyName, thanks,
  };
}
