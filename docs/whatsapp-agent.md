# كمبيوتر الـ IT ← الداشبورد: جروبات الواتساب (WhatsApp agent → dashboard)

الصفحة 7 **واتساب** بتعرض جروبات الواتساب **قراية بس** (مفيش أي كتابة أو إرسال من الداشبورد).
البرنامج على كمبيوتر الـ IT (مثلا whatsapp-web.js أو Baileys) بيقرا الجروبات ويبعت الرسايل والملفات للداشبورد.
Page 7 **واتساب** shows WhatsApp groups **read-only** (the dashboard never types or sends anything). A program on the
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

الرد: `{ "ok": true, "groups": 1, "messages": 1 }`. جروب لسه مبعتش اسمه بيظهر بالـ id لحد ما الاسم يوصل.

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
