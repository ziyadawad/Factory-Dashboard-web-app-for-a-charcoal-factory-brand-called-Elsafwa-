// Service worker لتطبيق المناديب: "Add to Home screen" + الصفحة نفسها والصور تفتح من غير نت (الطابور في IndexedDB)
// الـ API عمره ما بيتكاش (الأرصدة والأسعار لازم تبقى حية)
// Rep app service worker: "Add to Home screen" + the page shell and images open offline (the queue lives in IndexedDB).
// The API is never cached (stock and prices must be live)
const CACHE = "rep-shell-v1";
const SHELL = ["/rep", "/rep/manifest.webmanifest", "/rep/logo-round.png", "/rep/icon-192.png", "/brand/logo-round.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("rep-shell-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isShell = url.pathname === "/rep";
  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/products/") || url.pathname.startsWith("/rep/") || url.pathname.startsWith("/brand/");
  if (!isShell && !isStatic) return;
  // الصفحة: النت الأول وبعدين الكاش. الملفات الثابتة: الكاش الأول - the page: network first; static files: cache first
  event.respondWith(
    isShell
      ? fetch(req)
          .then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          })
          .catch(() => caches.match(req).then((hit) => hit || Response.error()))
      : caches.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
              return res;
            })
        )
  );
});
