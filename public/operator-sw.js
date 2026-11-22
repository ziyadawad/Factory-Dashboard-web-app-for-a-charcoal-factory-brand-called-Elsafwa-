// Service worker بسيط لشاشة الأوبريتر: عشان "Add to Home screen" يشتغل. مفيش كاش خالص (الأرقام لازم تبقى حية)
// Minimal service worker for the operator screen, so "Add to Home screen" works. No caching at all (numbers must be live)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // الشبكة بس (من غير respondWith = المتصفح بيكمل عادي) - network only (no respondWith = the browser carries on)
});
