# إيجنت IT ← الداشبورد: شكل البيانات (IT agent → dashboard payload)

الإيجنت على جهاز IT في المصنع بيبعت حالة النت والشبكات والأجهزة والكاميرات لصفحة **IT والمراقبة**.
The agent on the factory IT PC sends the internet / network / device / camera status to the **IT والمراقبة** page.

## الإرسال (Sending)

```
POST https://<dashboard-domain>/api/it/status
Content-Type: application/json
x-it-secret: <IT_AGENT_SECRET>
```

- **مرة كل دقيقتين بالكتير**: ابعت لما حاجة تتغير بس، أو كل **دقيقتين** كنبضة (heartbeat) لو مفيش تغيير. السيرفر بيرفض أي تحديث أسرع من دقيقتين بـ `429` (والهيدر `Retry-After` = كام ثانية تستنى). لو مفيش تحديث **5 دقايق** الصفحة بتكتب "الإيجنت مش متصل".
  **At most one POST per 2 minutes**: send only when something changed, or every **2 minutes** as a heartbeat when nothing did. The server refuses anything faster with `429` (`Retry-After` = seconds to wait). After **5 minutes** without an update the page shows the agent as offline.
- **كل تحديث = الحالة كاملة**: `internet` و`routers` و`devices` و`cameras` بيتبدلوا بالموجود في آخر تحديث (أي حاجة مش مبعوتة بتختفي من الصفحة).
  **Every update is the full state**: `internet`, `routers`, `devices` and `cameras` are replaced by the latest update (anything left out disappears from the page).
- **`events` بس بتتجمع**: السيرفر بيضيف الجديد على القديم بالـ `id` (من غير تكرار)، وبيحتفظ بآخر 200 حدث وآخر 3 أيام. فابعت الأحداث الجديدة (أو آخر شوية) — نفس الـ `id` مش بيتكرر.
  **Only `events` accumulate**: merged by `id` (no duplicates), keeping the last 200 and the last 3 days. Send new events (or the last few) — a repeated `id` is ignored.
- أكبر حجم: 256 KB. Max size: 256 KB.
- الأوقات **ISO 8601 بالمنطقة الزمنية** (مثلا `2026-11-19T10:42:00+02:00`). Times are **ISO 8601 with an offset**.

### الردود (Responses)

| الكود | المعنى |
|---|---|
| `200` | `{ "ok": true, "receivedAt": "...", "storage": "redis" \| "memory", "counts": {...} }` |
| `400` | JSON غلط أو مفيش ولا جزء من الأجزاء — invalid JSON or no known section |
| `401` | `x-it-secret` غلط أو مش موجود — wrong or missing secret |
| `413` | أكبر من 256 KB — too large |
| `429` | أسرع من مرة كل دقيقتين، استنى `Retry-After` ثانية — faster than once per 2 minutes; wait `Retry-After` seconds |
| `503` | `IT_AGENT_SECRET` مش متظبط على السيرفر — the secret is not set on the server |

## القراية المحلية (LAN-first): `GET {cameraBaseUrl}/status.json`

صفحة IT بتسأل الإيجنت **على طول من المتصفح** كل 5 ثواني (مهلة 2 ثانية). لو رد، الصفحة بتاخد منه كل حاجة (النت، أهم الأجهزة، الأحداث) وبتكتب "📡 مباشر من الشبكة". لو مردش (برا المصنع) بترجع لـ `/api/it/status` وبتكتب "☁️ من السحابة".
The IT page asks the agent **directly from the browser** every 5 s (2 s timeout). If it answers, everything (internet, key devices, events) comes from it ("📡 مباشر من الشبكة"); otherwise the page falls back to `/api/it/status` ("☁️ من السحابة").

- الرد = **نفس شكل الـ POST بالظبط** (تحت)، أو `{ "data": { ... } }`. بيتنضف بنفس قواعد السيرفر.
  The body is **exactly the POST payload** below (or `{ "data": { ... } }`), sanitized with the same rules.
- `sentAt` = وقت آخر فحص عند الإيجنت؛ لو أقدم من 5 دقايق الصفحة بتكتب "الإيجنت مش متصل".
  `sentAt` = the agent's last check; older than 5 minutes = shown as agent offline.
- `events`: آخر الأحداث (مثلا آخر 50)، والصفحة بتجمعها بالـ `id`.
  `events`: the latest events (e.g. the last 50); the page merges them by `id`.
- هيدرز لازمة (نفس `cameras.json`) - required headers (same as `cameras.json`):
  `Access-Control-Allow-Origin: https://<dashboard-domain>`، `Cache-Control: no-store`، وعلى طلب `OPTIONS`:
  `Access-Control-Allow-Private-Network: true` (Chrome بيطلبها لما موقع عام يكلم IP محلي - Chrome requires it when a public site calls a private IP).

## الشكل (Schema)

كل الأجزاء اختيارية، بس لازم واحد منهم على الأقل. أي حقل مش مكتوب هنا **بيترمي** (ومنها أي `password` أو رابط `rtsp`).
Every section is optional, but at least one is required. **Any field not listed here is dropped** (including any `password` or `rtsp` URL).

```jsonc
{
  "agent": { "name": "IT-PC", "version": "1.0.0" },        // اختياري - optional
  "sentAt": "2026-11-19T10:42:00+02:00",                   // ساعة جهاز الإيجنت - the agent PC's clock

  // النت (ping لـ 8.8.8.8 مثلا) - the internet (e.g. ping 8.8.8.8)
  "internet": {
    "up": true,
    "since": "2026-11-19T08:00:00+02:00",  // شغال / واقع من امتى - up / down since
    "latencyMs": 23                          // null لو واقع - null when down
  },

  // الراوترات والأكسس بوينت - routers and access points
  "routers": [
    {
      "id": "router-main",                 // ثابت ومميز - stable and unique (max 64)
      "name": "الراوتر الرئيسي (WE)",
      "kind": "router",                    // "router" | "ap"
      "ip": "192.168.1.1",
      "up": true,                          // بيرد على ping - answers ping
      "latencyMs": 2,                      // null لو واقع - null when down
      "internet": true,                    // فيه نت من خلاله؟ null = مش معروف - internet through it? null = unknown
      "since": "2026-11-17T09:12:00+02:00",// شغال / واقع من - up / down since
      "uptimeTodayPct": 99.6               // نسبة الشغل النهارده 0..100 - today's uptime %
    }
  ],

  // الأجهزة - devices
  "devices": [
    {
      "id": "zk-admin",
      "name": "بصمة الإدارة",
      "type": "fingerprint",               // "fingerprint" | "nvr" | "printer" | "pc" | "scale" | "other"
      "group": "critical",                 // "critical" (الأجهزة المهمة) | "staff" (أجهزة الموظفين) | "network" (الشبكات) | "other" (مبيظهرش)
      "monitor": false,                    // other بس: true = أحداثه تظهر في "آخر الأحداث" و"اللي بيحصل دلوقتي" - other only: true = its events are shown
      "ip": "192.168.1.201",
      "up": true,
      "latencyMs": 6,                      // null لو واقع - null when down
      "lastSeen": "2026-11-19T10:41:58+02:00", // آخر رد - last reply
      "since": "2026-11-19T07:30:00+02:00"     // شغال / واقع من - up / down since
    }
  ],

  // الكاميرات: id واسم وحالة بس. ممنوع أي باسورد أو رابط RTSP هنا
  // Cameras: id, name and status only. Never a password or an RTSP URL here
  "cameras": [
    { "id": "cam-01", "name": "البوابة الرئيسية", "online": true }  // id: حروف إنجليزي وأرقام و - و _ بس
  ],

  // الأحداث (فصل / رجع)، بتظهر في الصفحة وفي "اللي بيحصل دلوقتي" في الرئيسية
  // Events (down / up); shown on the page and in the main page live feed
  "events": [
    {
      "id": "router-main-down-20261119T104200",  // مميز - unique (max 80)
      "at": "2026-11-19T10:42:00+02:00",
      "kind": "down",                           // "down" | "up"
      "targetName": "الراوتر الرئيسي (WE)",
      "targetType": "router",                   // "internet" | "router" | "ap" | نوع جهاز - a device type
      "ip": "192.168.1.1"                       // اختياري - optional
    }
  ]
}
```

حدود: الاسم 120 حرف، الـ IP أو اسم الجهاز بس (حروف وأرقام و `. : - [ ]` — مفيش `user:pass@`)، 50 راوتر، 300 جهاز، 64 كاميرا، 200 حدث.
Limits: names 120 chars; `ip` must be a bare IP or host name (no `user:pass@`); 50 routers, 300 devices, 64 cameras, 200 events.

## الكاميرات (Cameras)

الكاميرات **مش** بتعدي على الداشبورد ولا على Vercel. المتصفح بيطلبها مباشرة من الإيجنت المحلي (`it.cameraBaseUrl` = `https://192.168.1.200:8443`)، فبتشتغل جوه المصنع بس.
Cameras never pass through the dashboard or Vercel: the browser loads them straight from the local agent, so they only work inside the factory.

| الطلب (Request) | الرد (Response) |
|---|---|
| `GET /cameras.json` | `[{ "id", "name", "nvr"?, "online"?, "stream"? }]` أو `{ "cameras": [...] }`. `nvr` = اسم شريحة الفلتر (مثلا "المصنع" / "التعبئة والمخزن")، `stream` = اسم الـ stream في go2rtc (مش موجود = `id`) |
| `GET /cameras/{id}/snapshot.jpg` | صورة الـ main stream (عرض كاميرا واحدة، وفي الصفحة الكاملة لو الفيديو فشل) |
| `GET /cameras/{id}/snapshot.jpg?stream=sub` | صورة الـ **sub-stream** الصغيرة (قناة X02 على الـ NVR، مثلا ISAPI `/Streaming/channels/{n}02/picture`) للشبكة والصور الصغيرة |
| `POST /api/webrtc?src={stream}` | go2rtc WebRTC (WHEP): الطلب SDP offer بـ `Content-Type: application/sdp`، والرد SDP answer |
| `WSS /api/ws?src={stream}` | go2rtc MSE (لو WebRTC فشل) |

- **CORS**: `cameras.json` و `/api/webrtc` لازم يرجعوا `Access-Control-Allow-Origin` بعنوان الداشبورد، و`/api/webrtc` لازم يرد على طلب `OPTIONS` (preflight) بـ `Access-Control-Allow-Methods: POST` و `Access-Control-Allow-Headers: Content-Type`. الصور مش محتاجة CORS.
  `cameras.json` and `/api/webrtc` must send `Access-Control-Allow-Origin` (and answer the `OPTIONS` preflight for `/api/webrtc`). Images need no CORS.
- **HTTPS بشهادة elsafwa-ca** على كل حاجة (ومنها الـ wss). HTTPS with the elsafwa-ca certificate everywhere, wss included.
- go2rtc ممكن يبقى على عنوان تاني: `it.streamBaseUrl` في الكونفج (فاضي = نفس `cameraBaseUrl`). go2rtc may live elsewhere: set `it.streamBaseUrl`.
- الصفحة الكاملة: WebRTC ← MSE ← صورة كل ثانية. الشبكة: sub-stream كل 4 ثواني، متوزعة، وللمربعات الظاهرة بس.
  Full page: WebRTC → MSE → a snapshot every second. Grid: sub-stream every 4 s, staggered, visible tiles only.
- **الباسورد عمره ما بيتبعت للداشبورد ولا بيتكتب في الكونفج.** No camera / NVR password ever reaches the dashboard or the config.

## طرحات الأفران على طول (Live kiln exits): `kiln_exit`

صفحة "الإنتاج والأفران" جوه المصنع بتقرا `{cameraBaseUrl}/status.json` كل 5 ثواني (مهلة 2 ثانية) وبتدور على أحداث `kiln_exit`،
فالطرحة اللي الأوبريتر وزنها بتظهر في "آخر وزنة" و"طرحات النهارده" على طول من غير ما تستنى ERPNext. برا المصنع = التحديث العادي.
Inside the factory the production page reads `{cameraBaseUrl}/status.json` every 5 s (2 s timeout) and picks up `kiln_exit`
events, so a weighed exit shows at once. Outside the factory it uses the normal refresh.

الأحداث بتتحط في `events` (جنب أحداث up/down) أو في ليستة `kilnExits` — الاتنين شغالين. خلّي أحداث النهارده كلها في الملف (أو آخر 200).
Put them in `events` (next to the up/down events) or in a `kilnExits` list — both work. Keep today's events in the file (or the last 200).

```json
{
  "id": "kx-20261121-094548-4",
  "kind": "kiln_exit",
  "at": "2026-11-21T07:45:48Z",
  "kiln": "فرن 4",
  "type": "برتقال",
  "netKg": 812.5,
  "fullKg": 1062.5,
  "emptyKg": 250,
  "trolley": "7",
  "room": "2",
  "erpName": "ugmjfqjt36"
}
```

| الحقل | معناه |
|---|---|
| `id` | ثابت ومش بيتكرر لكل طرحة. Stable and unique per exit. |
| `at` | وقت الوزن ISO. Weighing time, ISO. |
| `kiln` / `type` | زي ERPNext بالظبط (`فرن 4`، `برتقال`). Spelled exactly like ERPNext. |
| `netKg` | الصافي = ممتلئ − فاضي (لو مش موجود بيتحسب). Net = full − empty (computed when missing). |
| `fullKg` / `emptyKg` | ممتلئ / فاضي بالكيلو. Full / empty in kg. |
| `trolley` / `room` | الترول / الغرفة. |
| `erpName` | اختياري: اسم سجل Kiln Exit بعد ما يتعمل في ERPNext. Optional: the Kiln Exit record name once created. |

- من غير `erpName` الداشبورد بيربط الحدث بسجل ERPNext لو نفس الفرن وفرق الوقت ≤ 3 دقايق، والناقص في السجل (الوزن، ممتلئ، فاضي، الترول، الغرفة) بيتكمّل من الحدث.
  Without `erpName` the event is matched to the ERPNext record with the same kiln within 3 minutes; the record's missing values are filled from the event.
- **ERPNext**: لو عايز الأرقام دي تفضل بعد ما الحدث يتمسح، ضيف في Kiln Exit الحقول `weight_kg` (الصافي) و`full_weight_kg` و`empty_weight_kg` و`trolley` و`room` (الأسامي في `erp.batches` في الكونفج). أي حقل موجود بيتقري لوحده.
  To keep the numbers in ERPNext add those fields to Kiln Exit (names in `erp.batches`); any that exist are read automatically.
- **WebSocket (اختياري)**: لو الإيجنت عنده WebSocket بيبعت كل `kiln_exit` أول ما يحصل (حدث واحد، أو `{events:[…]}`)، حط مساره في `production.liveWsPath` (مثلا `"/ws"`). لو وقع الصفحة بترجع لـ status.json.
  Optional: an agent WebSocket pushing each `kiln_exit`; set its path in `production.liveWsPath`. If it drops the page falls back to status.json.
- نفس شروط `status.json` اللي فوق: CORS و`Access-Control-Allow-Private-Network: true`. Same CORS / PNA headers as above.
- شاشة الأوبريتر: `it.operatorUrl` = `https://192.168.1.200:8443/operator` (زرار "📱 شاشة الأوبريتر" في صفحة الإنتاج بيفتح QR ليها).

## على السيرفر (Server setup, Vercel)

1. **`IT_AGENT_SECRET`**: سر طويل عشوائي (مثلا 40 حرف) في Vercel → Settings → Environment Variables، ونفس القيمة في الإيجنت.
   A long random secret in Vercel env vars, and the same value in the agent.
2. **التخزين (Storage)**: من غير Redis آخر تحديث بيتحفظ في ذاكرة السيرفر بس، وده **مش كفاية على Vercel**: الـ functions بتنام (cold start) وكل route ليها نسخة لوحدها، فالصفحة ممكن متشوفش آخر تحديث، والأحداث مش هتوصل لـ "اللي بيحصل دلوقتي".
   Without Redis the latest update lives only in server memory, which is **not enough on Vercel**: functions cold-start and each route runs separately, so the page may miss updates and events won't reach the live feed.
   **فعّل Upstash Redis** من Vercel → Storage / Marketplace → Upstash (الخطة المجانية كفاية). بيضيف لوحده `KV_REST_API_URL` و`KV_REST_API_TOKEN` (أو `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) — الكود بيقرا الاتنين، ومفيش أي حاجة تتنصب.
   **Enable Upstash Redis** from Vercel → Storage / Marketplace (free tier is enough). It adds the env vars automatically; the code reads either pair, nothing to install.
   رد الـ POST فيه `"storage": "redis"` لما يشتغل. The POST response says `"storage": "redis"` once it works.
3. غيّر صفحة `it` لـ `inRotation: true` لو عايزها في التقليب التلقائي.
   Set the `it` page to `inRotation: true` to add it to auto-rotation.

## مثال curl (Example)

```bash
curl -X POST "https://<dashboard-domain>/api/it/status" \
  -H "Content-Type: application/json" \
  -H "x-it-secret: $IT_AGENT_SECRET" \
  --data @status.json
```
