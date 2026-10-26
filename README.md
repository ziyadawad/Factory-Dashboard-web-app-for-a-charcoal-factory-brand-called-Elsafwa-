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

## مطابقة رصيد مخزن المنتج التام مع الإكسيل (Stock Reconciliation)
بيقرا بس من Stock Ledger Entry (مش بيغير حاجة) وبيطلع رصيد أول / الإنتاج / المنصرف / رصيد آخر بنفس شكل الإكسيل بتاعنا،
وتفصيل المنصرف (تحميل للعربيات، مرتجع، مبيعات، جرد…)، والمقارنة مع الإكسيل، وأسباب كل فرق.

```bash
npm run audit:stock -- --from 2026-10-01 --to best --match-from 2026-10-20
npm run audit:stock -- --from 2026-10-01 --to 2026-10-25 --warehouse "مخزن منتج تام - تعبئة - AC"
```

- `--to`: تاريخ `YYYY-MM-DD` أو `today` أو `best` (يدوّر على اليوم اللي أرقامه أقرب للإكسيل من `--match-from` لحد النهارده).
- أرقام الإكسيل في `reports/excel-input.json` (بيتعمل أول مرة، وبعد كده عدّل فيه الأرقام أو `toDate`).
- الناتج: `reports/stock-reconciliation.md` و `.xlsx` و `.pdf` — ومينفعش يترفع على GitHub.
