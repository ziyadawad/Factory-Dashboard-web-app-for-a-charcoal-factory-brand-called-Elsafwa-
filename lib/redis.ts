// Upstash Redis REST (نفس الـ API بتاع Vercel KV) - السيرفر بس
// Upstash Redis REST (same API as Vercel KV) - server only

// ===== التخزين: Upstash Redis REST (نفس الـ API بتاع Vercel KV) - storage: Upstash Redis REST (same API as Vercel KV) =====
// تكامل Upstash في Vercel بيضيف KV_REST_API_URL / KV_REST_API_TOKEN (أو UPSTASH_REDIS_REST_*)، وأحيانا بـ prefix
// زي STORAGE_KV_REST_API_URL لو اتختار prefix وقت الربط. أي واحد منهم بيشتغل (التوكن اللي read-only مبيتاخدش)
// The Vercel Upstash integration adds KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*), sometimes with a
// custom prefix such as STORAGE_KV_REST_API_URL. Any of them works (the read-only token is never used)
function envEndingWith(suffix: string): string | undefined {
  const key = Object.keys(process.env).find((k) => k.endsWith(suffix) && process.env[k]);
  return key ? process.env[key] : undefined;
}

export function redisSettings() {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    envEndingWith("UPSTASH_REDIS_REST_URL") ||
    envEndingWith("KV_REST_API_URL")
  )?.trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    envEndingWith("UPSTASH_REDIS_REST_TOKEN") ||
    envEndingWith("KV_REST_API_TOKEN")
  )?.trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export async function redis<T>(command: (string | number)[]): Promise<T | null> {
  const settings = redisSettings();
  if (!settings) return null;
  const response = await fetch(settings.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`redis HTTP ${response.status}`);
  const body = (await response.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(`redis ${body.error}`);
  return body.result ?? null;
}

