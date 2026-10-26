# Smart Facial Recognition System

## First Page
![first page](first%20page.png)

## Second Page
![second page](second%20page.png)

## مراجعة الإنتاج (Production Audit)
أداة بتقرا بس من ERPNext (مش بتغير أي حاجة) وبتراجع الإنتاج يوم بيوم من حركات Stock Entry نوعها Manufacture،
عشان تلاقي الأيام اللي متسجلش فيها إنتاج، أو صنف غلط، أو كمية غريبة، أو حركة اتسجلت متأخر.

```bash
npm run audit:production -- --from 2026-10-01 --to today
npm run audit:production -- --from 2026-09-01 --to 2026-09-30
```

- `--from` و `--to` بالشكل `YYYY-MM-DD`، و `today` = النهارده بتوقيت مصر (من غيرهم: من أول الشهر لحد النهارده).
- بيستخدم نفس مفاتيح ERPNext اللي في `.env.local`.
- الناتج في فولدر `reports/`: ملف `production-audit.md` (الملخص والتحذيرات وجدول يوم بيوم والتفاصيل) و `production-audit.csv` (جدول يوم بيوم، بيتفتح في Excel).
- ⚠️ فولدر `reports/` في `.gitignore` ومينفعش يترفع على GitHub لأن الريبو public.
