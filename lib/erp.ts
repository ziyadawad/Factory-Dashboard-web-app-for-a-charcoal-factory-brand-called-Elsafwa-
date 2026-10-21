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

// GET على ERPNext ويرجع الـ JSON - GET from ERPNext and return the parsed JSON
// path مثلا "/api/method/frappe.auth.get_logged_user" - params بتتحط في الـ query string
export async function erpGet<T = unknown>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const { baseUrl, auth } = erpSettings();
  const url = new URL(baseUrl + path);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `no answer after ${TIMEOUT_MS / 1000}s`
        : String(error);
    throw new ErpError(`ERPNext ${path}: request failed (${reason})`);
  }

  const text = await response.text();
  let body: { exc_type?: string; exception?: string; message?: unknown } | undefined;
  try {
    body = JSON.parse(text);
  } catch {
    // مش JSON غالبا يبقى Cloudflare مش ERPNext - not JSON usually means Cloudflare, not ERPNext
    throw new ErpError(
      `ERPNext ${path}: HTTP ${response.status}, response is not JSON (Cloudflare or wrong FACTORY_API_URL?)`
    );
  }

  if (!response.ok) {
    const detail = body?.exc_type || body?.exception || response.statusText;
    throw new ErpError(`ERPNext ${path}: HTTP ${response.status} (${detail})`);
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
export function erpToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}
