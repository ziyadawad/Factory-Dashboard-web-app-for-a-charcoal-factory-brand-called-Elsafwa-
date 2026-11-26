"use client";

// طلبات تطبيق المناديب: 401 = الدخول خلص (نرجع لشاشة الرقم) - rep app requests: 401 = logged out (back to the PIN)
export class RepFetchError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) {
    super(message);
  }
  // ERPNext مش بيرد أو مفيش نت = الفاتورة تستنى في الطابور - ERPNext down or no network = queue the invoice
  get queueable() {
    return this.status === 0 || this.body.queue === true || this.status >= 500;
  }
}

export async function repFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      ...init,
      ...(init?.json !== undefined ? { method: init.method ?? "POST", body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    throw new RepFetchError("مفيش نت", 0, {});
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && !url.includes("/login")) {
    window.location.reload();
    throw new RepFetchError("login required", 401, body);
  }
  if (!res.ok) throw new RepFetchError(String(body.error ?? `HTTP ${res.status}`), res.status, body);
  return body as T;
}

export const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
