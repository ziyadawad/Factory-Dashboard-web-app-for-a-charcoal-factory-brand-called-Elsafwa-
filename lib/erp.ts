// اتصال ERPNext - ERPNext connection
// السيرفر بس: المفاتيح بتتقري من process.env (من غير NEXT_PUBLIC_) فعمرها ما بتوصل للمتصفح
// Server only: keys are read from process.env (no NEXT_PUBLIC_ prefix) so they never reach the browser
// Only import this file from server code (lib/data-source.ts -> app/api/dashboard/route.ts)

const TIMEOUT_MS = 8000;

export class ErpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpError";
  }
}

function erpSettings() {
  const url = process.env.FACTORY_API_URL;
  const key = process.env.FACTORY_API_KEY;
  const secret = process.env.FACTORY_API_SECRET;
  if (!url || !key || !secret) {
    throw new ErpError("FACTORY_API_URL / FACTORY_API_KEY / FACTORY_API_SECRET are not all set");
  }
  return { baseUrl: url.replace(/\/+$/, ""), auth: `token ${key}:${secret}` };
}

// رابط مستند في ERPNext (للزرار "افتح في ERPNext") - a document's ERPNext desk link
export function erpDocUrl(doctype: string, name: string): string {
  const slug = doctype.toLowerCase().replace(/ /g, "-");
  return `${erpSettings().baseUrl}/app/${slug}/${encodeURIComponent(name)}`;
}

// GET على ERPNext ويرجع الـ JSON - GET from ERPNext and return the parsed JSON
// path مثلا "/api/method/frappe.auth.get_logged_user" - params بتتحط في الـ query string
export async function erpGet<T = unknown>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const { baseUrl } = erpSettings();
  const url = new URL(baseUrl + path);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  return erpRequest<T>(path, url, {});
}

// POST على ERPNext بـ JSON body - للطلبات الطويلة اللي مش هتيجي في الـ URL
// POST a JSON body to ERPNext - for requests too long to fit in a URL
export async function erpPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl } = erpSettings();
  return erpRequest<T>(path, new URL(baseUrl + path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// الأخطاء اللي تستاهل إعادة: مفيش رد / timeout / 429 / 5xx. الـ 401 و403 مش بيتعادوا (المفتاح أو الصلاحية غلط)
// Worth a retry: no answer / timeout / 429 / 5xx. 401 and 403 are never retried (bad key or missing permission)
const RETRY_DELAYS_MS = [400, 1200];

class RetryableError extends ErpError {}

async function erpRequest<T>(path: string, url: URL, init: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await erpAttempt<T>(path, url, init);
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt >= RETRY_DELAYS_MS.length) {
        throw error instanceof RetryableError ? new ErpError(error.message) : error;
      }
      console.warn(`[erp] ${error.message} - retry ${attempt + 1} in ${RETRY_DELAYS_MS[attempt]}ms`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function erpAttempt<T>(path: string, url: URL, init: RequestInit): Promise<T> {
  const { auth } = erpSettings();
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: auth, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `no answer after ${TIMEOUT_MS / 1000}s`
        : String(error);
    throw new RetryableError(`ERPNext ${path}: request failed (${reason})`);
  }

  const retryable = response.status === 429 || response.status >= 500;
  const Failure = retryable ? RetryableError : ErpError;
  const text = await response.text();
  let body: { exc_type?: string; exception?: string; message?: unknown } | undefined;
  try {
    body = JSON.parse(text);
  } catch {
    // مش JSON غالبا يبقى Cloudflare مش ERPNext - not JSON usually means Cloudflare, not ERPNext
    throw new Failure(
      `ERPNext ${path}: HTTP ${response.status}, response is not JSON (Cloudflare or wrong FACTORY_API_URL?)`
    );
  }

  if (!response.ok) {
    const detail = body?.exc_type || body?.exception || response.statusText;
    const hint =
      response.status === 401
        ? " - FACTORY_API_KEY / FACTORY_API_SECRET rejected (keys regenerated or API user disabled?)"
        : response.status === 403
          ? " - the API user has no read permission on this DocType"
          : "";
    throw new Failure(`ERPNext ${path}: HTTP ${response.status} (${detail})${hint}`);
  }

  console.log(`[erp] ${path} OK in ${Date.now() - started}ms at ${new Date().toISOString()}`);
  return body as T;
}

// نداء لـ whitelisted method وبيرجع الـ message - call a whitelisted method and return its message
export async function erpCall<T = unknown>(
  method: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const body = await erpGet<{ message: T }>(`/api/method/${method}`, params);
  return body.message;
}

// تاريخ النهارده بتوقيت مصر (YYYY-MM-DD) - today's date in Egypt time (the server may run in UTC)
// ERP_TODAY=2026-08-31 للتجربة بس (يعرض يوم قديم) - for testing only: show an older day
export function erpToday(): string {
  const override = process.env.ERP_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

// رصيد حساب لحد تاريخ = مجموع المدين - مجموع الدائن من GL Entry (غير الملغي)
// ERPNext بقى يرفض erpnext.accounts.utils.get_balance_on (403 "is not whitelisted") فبنحسبه بنفس الطريقة بنفسنا
// Account balance up to a date = sum(debit) - sum(credit) of non-cancelled GL Entries. ERPNext now rejects
// get_balance_on (403 "not whitelisted"), so we compute it the same way (same result for balance-sheet accounts)
export async function erpBalanceOn(account: string, date: string): Promise<number> {
  const { message } = await erpPost<{ message: { debit: number | null; credit: number | null }[] }>(
    "/api/method/frappe.client.get_list",
    {
      doctype: "GL Entry",
      filters: [
        ["account", "=", account],
        ["posting_date", "<=", date],
        ["is_cancelled", "=", 0],
      ],
      fields: ["sum(debit) as debit", "sum(credit) as credit"],
      limit_page_length: 0,
    }
  );
  const row = message?.[0];
  const balance = (row?.debit ?? 0) - (row?.credit ?? 0);
  if (!Number.isFinite(balance)) throw new ErpError(`${account}: balance is not a number`);
  return Math.round(balance * 100) / 100;
}
