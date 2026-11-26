# كمبيوتر الـ IT ← الداشبورد: جروبات الواتساب (WhatsApp agent → dashboard)

الصفحة 7 **واتساب** بتعرض جروبات الواتساب. الكتابة من الشات **مقفولة بباسورد** (`WA_SEND_PASSWORD`)، والداشبورد
عمره ما بيكلم الواتساب بنفسه: الرسالة بتتحط في طابور، وكمبيوتر الـ IT هو اللي بيبعتها (القسم 4 تحت).
البرنامج على كمبيوتر الـ IT (مثلا whatsapp-web.js أو Baileys) بيقرا الجروبات ويبعت الرسايل والملفات للداشبورد.
Page 7 **واتساب** shows WhatsApp groups. Typing in a chat is **password-locked** (`WA_SEND_PASSWORD`) and the dashboard
never talks to WhatsApp itself: a message goes to an outbox and the IT PC sends it (section 4 below). A program on the
IT PC (e.g. whatsapp-web.js or Baileys) reads the groups and pushes messages and files to the dashboard.

## التخزين على Vercel (Storage) — مجاني

| | فين | ليه | متغير البيئة |
|---|---|---|---|
| الرسايل | **Neon Postgres** (Vercel → Storage → Create → Neon، الخطة Free) | بحث، صفحات، ومسح الأقدم من 90 يوم بسهولة | `DATABASE_URL` (بيتضاف لوحده) |
| الصور والملفات والفويس | **Vercel Blob** (Vercel → Storage → Create → Blob) | ملفات **private** (محدش يفتحها غير من الداشبورد بعد الدخول) وبتتمسح لوحدها بعد 30 يوم | `BLOB_READ_WRITE_TOKEN` (بيتضاف لوحده) |

الجداول بتتعمل لوحدها أول مرة. المدد في `config/dashboard.config.ts` ← `whatsapp.retentionDays` (`text: 90`، `media: 30`).
Tables are created automatically. Retention lives in `whatsapp.retentionDays` (text 90 days, media 30 days).

## الحماية (Security)

- الإرسال من كمبيوتر الـ IT بس: هيدر `x-it-secret` = `IT_AGENT_SECRET` (نفس سر الإيجنت والميزان).
  Pushing requires `x-it-secret` = `IT_AGENT_SECRET` (the same secret as the IT agent and the scale).
- القراية (`/api/wa/groups`، `/messages`، `/search`، `/media/{id}`) لازم كوكي الدخول بتاع الداشبورد — مفيش أي حاجة public.
  Reading needs the dashboard login cookie; nothing is public. Files are private Blobs streamed by the server.

## 1) الرسايل والجروبات: `POST /api/wa/ingest`

`Content-Type: application/json` — ابعت الجديد بس (كل 30 ثانية مثلا)، بحد أقصى 1000 رسالة و~4 MB في الطلب.
Send only what is new (e.g. every 30 s); at most 1000 messages and ~4 MB per request.
**`{}` فاضي = نبضة**: بيحدّث "آخر مزامنة من كمبيوتر الـ IT" (ابعتها كل دقيقة حتى لو مفيش جديد، وإلا الصفحة تكتب تحذير بعد 5 دقايق).
**An empty `{}` is a heartbeat**: send it every minute even with nothing new, or the page warns after 5 minutes.

```jsonc
{
  "groups": [
    {
      "id": "120363012345678901@g.us",   // ثابت - stable id (max 120)
      "name": "إدارة المصنع",
      "participants": 24,                 // اختياري - optional
      "pictureMediaId": "grp-120363012345678901-pic"  // اختياري: id ملف اترفع بـ /api/wa/upload - optional, an uploaded file id
    }
  ],
  "messages": [
    {
      "id": "3EB0C767D26A1B2C3D4E",       // ثابت ومميز (max 160). نفس الـ id تاني = تعديل أو مسح - same id again = edit / delete
      "groupId": "120363012345678901@g.us",
      "senderName": "أحمد محمد",
      "at": "2026-11-23T10:42:00+02:00",  // وقت الرسالة - message time (ISO)
      "type": "text",                     // text | image | video | audio | voice | document | sticker | system
      "text": "الطرحة الجاية الساعة 2",   // أو الـ caption بتاع الصورة - or the media caption (max 8000)
      "replyTo": { "id": "3EB0…", "senderName": "محمود", "text": "إمتى الطرحة الجاية؟" },  // اختياري - optional
      "media": { "id": "3EB0C767D26A1B2C3D4E" },  // اختياري: نفس الـ id اللي هيترفع بيه الملف - the id used in /upload
      "deleted": false                    // true = "الرسالة اتمسحت" - shown as deleted
    }
  ]
}
```

الرد: `{ "ok": true, "groups": { "received": 1, "saved": 1 }, "messages": { "received": 1, "saved": 1, "rejected": 0 }, "reasons": {} }`.
جروب لسه مبعتش اسمه بيظهر بالـ id لحد ما الاسم يوصل.
The reply says how many were received / saved / rejected and why.

**أشكال تانية مقبولة** (من مكتبات الواتساب على طول) - **other accepted shapes** (straight from WhatsApp libraries):

| الحقل | بيتقري من |
|---|---|
| `id` | `id` (نص أو `{ "_serialized": "…" }`)، `messageId`، `key.id` |
| `groupId` | `groupId`، `chatId`، `remoteJid`، `key.remoteJid`، `chat.id`، أو `from` / `to` اللي آخره `@g.us` |
| `at` | `at`، `timestamp`، `messageTimestamp`، `t` — ISO أو epoch **بالثواني أو بالملي ثانية** |
| الراسل | `senderName`، `pushName`، `notifyName`، `sender.name`، وإلا رقم `author` / `participant` |
| النص | `text`، `body`، `caption`، `message` |
| النوع | `chat`→text، `ptt`→voice، `revoked`→اتمسحت، `image` / `video` / `audio` / `document` / `sticker` |
| الملف | `media.id`، `mediaId`، أو `hasMedia: true` (= نفس `id` الرسالة في `/upload`) |
| الرد | `replyTo`، `quotedMsg`، `quoted` |
| الجروبات | `groups` أو `chats`؛ الاسم `name` / `subject`؛ الأعضاء رقم أو ليستة |

**لو اتبعت رسايل ومفيش ولا واحدة اتحفظت = `422`** وفي الرسالة السبب وأسامي الحقول اللي وصلت (مش 200)، و"آخر مزامنة" مش بتتحرك.
لو الداتابيز فشلت = `500`. **When messages were sent but none could be saved the reply is `422`** with the reasons and
the field names received (never 200), and the last sync does not move. A database failure is `500`.

## 3) الحالة: `GET /api/wa/status` (هيدر `x-it-secret`)

```json
{ "database": "neon-postgres", "counts": { "groups": 26, "messages": 48, "media": 3 },
  "latestReceivedAt": "…", "latestMessageAt": "…", "lastSyncAt": "…",
  "lastIngest": { "at": "…", "groups": {…}, "messages": { "received": 10, "saved": 10, "rejected": 0 }, "reasons": {}, "sampleRejectedKeys": null } }
```
عدد الصفوف في Postgres وآخر طلب (اتبعت كام / اتحفظ كام / ليه اترفض). Row counts in Postgres and the last request.

## 2) الملفات: `POST /api/wa/upload`

الـ body = **الملف نفسه** (مش JSON ولا multipart)، وهيدرز:
The body is the **raw file** (not JSON or multipart), with headers:

| هيدر | |
|---|---|
| `x-it-secret` | السر - the secret |
| `x-media-id` | نفس `media.id` في الرسالة (أو `pictureMediaId` للجروب) - the same id as in the message |
| `Content-Type` | مثلا `image/jpeg`، `audio/ogg`، `application/pdf` |
| `x-file-name` | اسم الملف بـ `encodeURIComponent` (اختياري) - the file name, URI-encoded (optional) |

- أكبر ملف **4 MB** (حد Vercel للطلب 4.5 MB). الأكبر (فيديوهات طويلة) يتساب أو يتبعت مصغّر.
  At most **4 MB** per file (Vercel's request limit is 4.5 MB); skip or downscale bigger ones.
- ممكن الملف يترفع قبل أو بعد الرسالة. لحد ما يترفع الرسالة بتكتب "الملف مش متاح".
  The file may come before or after its message; until then the bubble says the file is unavailable.

## 4) الإرسال من الداشبورد: `GET /api/wa/outbox` و `PATCH /api/wa/outbox` (هيدر `x-it-secret`)

اسأل **كل 5 ثواني** (بس لو الواتساب متوصل). Poll **every 5 seconds** (only while WhatsApp is connected).

```jsonc
// GET /api/wa/outbox?limit=10  ←  الأقدم الأول - oldest first
{ "items": [
  { "id": 42, "groupId": "120363012345678901@g.us", "groupName": "جروب كريم عوض",
    "text": "الطلبية جاهزة",                       // نص بس - text only
    "reply": { "id": "3EB0…", "sender": "كريم", "text": "الطلبية امتى؟" },  // أو null: ابعتها رد (quoted) على الرسالة دي
    "senderLabel": "لوحة الإدارة", "status": "pending", "createdAt": "…" }
] }
```

- اللي بيرجع "متاخد" لمدة 60 ثانية: لو ما بعتش الـ PATCH في الوقت ده بيرجع تاني (يعني الإيجنت وقع في النص).
  **ابعت كل واحدة مرة واحدة بس** واحفظ الـ ids اللي بعتها لحد ما الـ PATCH ينجح.
  Each returned item is claimed for 60 s; without a PATCH by then it is offered again. **Send each id once** and
  remember the sent ids until the PATCH succeeds.
- رسالة فضلت مستنية أكتر من `whatsapp.outboxMaxAgeMinutes` (30 دقيقة) بتتلغي (`failed` / `expired`) ومش بترجع.
  A message pending longer than `outboxMaxAgeMinutes` (30) is cancelled and never offered.

بعد الإرسال - after sending:

```jsonc
// PATCH /api/wa/outbox   (واحدة أو list - one item or a list)
{ "id": 42, "status": "sent", "messageId": "3EB0C767D26A1B2C3D4E" }   // messageId = id الرسالة في الواتساب (مهم)
{ "id": 43, "status": "failed", "error": "group not found" }
```

`messageId` لازم يبقى **نفس الـ id** اللي الرسالة هترجع بيه في `/api/wa/ingest`، عشان الشات يعرضها مرة واحدة بعلامة ✓.
`messageId` must be the **same id** the message comes back with in `/api/wa/ingest`, so the chat shows it once with ✓.
الرد: `{ "ok": true, "updated": 1 }` (رسالة مش `pending` بتتساب). The reply counts updated items (non-pending are skipped).

الحدود والباسورد على السيرفر (`whatsapp.sendLimits`: رسالة كل 10 ثواني، 30 في الساعة). كل محاولة بتتسجل في "سجل الإرسال".
Limits and the password are enforced on the server; every attempt is logged in "سجل الإرسال".

## الردود (Responses)

| | |
|---|---|
| `200` | اتحفظ - saved |
| `400` | الشكل غلط - bad payload |
| `401` | السر غلط أو مش موجود - bad or missing `x-it-secret` |
| `413` | كبير أوي - too large |
| `503` | `DATABASE_URL` / `BLOB_READ_WRITE_TOKEN` / `IT_AGENT_SECRET` مش متظبط - storage or secret not set up |

## مثال curl (Example)

```bash
curl -X POST https://elsafwadashboard.vercel.app/api/wa/ingest \
  -H "x-it-secret: $IT_AGENT_SECRET" -H "Content-Type: application/json" \
  -d '{"groups":[{"id":"g1@g.us","name":"إدارة المصنع","participants":24}],"messages":[{"id":"m1","groupId":"g1@g.us","senderName":"أحمد","at":"2026-11-23T10:42:00+02:00","type":"text","text":"تمام"}]}'

curl -X POST https://elsafwadashboard.vercel.app/api/wa/upload \
  -H "x-it-secret: $IT_AGENT_SECRET" -H "x-media-id: m2" -H "Content-Type: application/pdf" \
  -H "x-file-name: %D8%A7%D9%84%D9%81%D8%A7%D8%AA%D9%88%D8%B1%D8%A9.pdf" --data-binary @invoice.pdf
```
