// كاش الـ CDN بتاع Vercel لردود ERPNext: الطلبات المتكررة بتترد من الـ CDN من غير ما الـ function تشتغل
// s-maxage = الرد طازة كام ثانية، stale-while-revalidate = بعدها يترد القديم على طول والـ function بتتنادى مرة واحدة في الخلفية
// (مش لكل شاشة). المتصفح max-age=0 فبيسأل الـ CDN كل مرة (طلب CDN مش function invocation)
// Vercel CDN caching for ERPNext-backed responses: repeated requests are served by the CDN, not the function.
// s-maxage = fresh for this many seconds; stale-while-revalidate = afterwards the cached copy is served at once and the
// function is called once in the background (not once per screen). Browser max-age=0: it always asks the CDN (a CDN hit
// is not a function invocation). Never use this for a response that needs the login cookie: the CDN key ignores cookies.
export const MIN_CDN_SECONDS = 60;

export function cdnCache(seconds: number = MIN_CDN_SECONDS): Record<string, string> {
  const fresh = Math.max(1, Math.round(seconds));
  const stale = fresh * 5;
  return {
    "Cache-Control": `public, max-age=0, s-maxage=${fresh}, stale-while-revalidate=${stale}`,
    "CDN-Cache-Control": `max-age=${fresh}, stale-while-revalidate=${stale}`,
    "Vercel-CDN-Cache-Control": `max-age=${fresh}, stale-while-revalidate=${stale}`,
  };
}
