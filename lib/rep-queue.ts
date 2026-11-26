"use client";

// طابور الفواتير على الموبايل (IndexedDB): لو ERPNext مش بيرد الفاتورة بتتحفظ هنا وتتطبع "مؤقتة"، وبتتبعت لوحدها بعدين.
// نفس الـ uuid = السيرفر عمره ما بيعملها مرتين (حتى لو اتبعتت والرد ضاع)
// The phone's invoice queue (IndexedDB): when ERPNext doesn't answer, the invoice is kept here, printed "مؤقتة" and sent
// later on its own. The same uuid = the server never makes it twice (even if it was saved and the reply was lost)
import { RepInvoiceRequest, RepReceipt } from "./rep-types";

export type QueuedInvoice = {
  uuid: string;
  request: RepInvoiceRequest;
  receipt: RepReceipt; // النسخة المؤقتة اللي اتطبعت - the temporary copy that was printed
  status: "waiting" | "failed";
  error?: string;
  tries: number;
  createdAt: string;
};

const DB = "elsafwa-rep";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "uuid" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function queued(): Promise<QueuedInvoice[]> {
  try {
    const all = await run<QueuedInvoice[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedInvoice[]>);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}
export const putQueued = (item: QueuedInvoice) => run("readwrite", (s) => s.put(item));
export const dropQueued = (uuid: string) => run("readwrite", (s) => s.delete(uuid));

export function newUuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// إرسال الطابور: اللي اتسجل بيتشال، واللي ERPNext رفضه (مش "مش بيرد") بيتعلم عليه failed
// Flush the queue: saved ones are removed; ones ERPNext refused (not "not answering") are marked failed
export async function flushQueue(onSaved?: (item: QueuedInvoice, receipt: RepReceipt) => void): Promise<{ sent: number; left: number }> {
  const list = (await queued()).filter((q) => q.status === "waiting");
  let sent = 0;
  for (const item of list) {
    try {
      const res = await fetch("/api/rep/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // من الطابور: التكرار اتأكد قبل كده على الموبايل - from the queue: the duplicate was already confirmed on the phone
        body: JSON.stringify({ ...item.request, confirmDuplicate: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { receipt?: RepReceipt; error?: string; queue?: boolean };
      if (res.ok && body.receipt) {
        await dropQueued(item.uuid);
        sent++;
        onSaved?.(item, body.receipt);
        continue;
      }
      if (res.status === 401 || body.queue || res.status >= 500) break; // لسه مش متاح - not available yet
      await putQueued({ ...item, status: "failed", error: body.error ?? `HTTP ${res.status}`, tries: item.tries + 1 });
    } catch {
      break; // مفيش نت - no network
    }
  }
  return { sent, left: (await queued()).length };
}
