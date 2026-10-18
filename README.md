# لوحة متابعة المصنع - الصفوة

لوحة متابعة في الوقت الفعلي لمصنع الفحم "الصفوة"، مصممة للعرض على شاشة التلفزيون في مكتب المدير التنفيذي.

## المميزات

- تحديث تلقائي كل 30 ثانية
- واجهة عربية كاملة (RTL)
- تصميم مظلم مناسب للشاشات الكبيرة
- حماية بكلمة مرور
- عرض بيانات المخزون، الأفران، الحضور، والخزنة
- إشعارات بصرية عند تغير البيانات

## التقنيات المستخدمة

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- SWR لجلب البيانات
- Recharts للرسوم البيانية
- Lucide React للأيقونات

## التشغيل محلياً

1. تثبيت المكتبات:
```bash
npm install
```

2. إنشاء ملف `.env.local` وإضافة المتغيرات:
```bash
cp .env.example .env.local
```

3. تعديل كلمة المرور في `.env.local`:
```
DASHBOARD_PASSWORD=your_password_here
```

4. تشغيل المشروع:
```bash
npm run dev
```

5. فتح المتصفح على: `http://localhost:3000`

## النشر على Vercel

1. رفع المشروع على GitHub
2. ربط المستودع بـ Vercel
3. إضافة متغيرات البيئة في إعدادات Vercel:
   - `DASHBOARD_PASSWORD`: كلمة مرور للوصول
   - `FACTORY_API_URL`: (اختياري) رابط API المصنع الحقيقي
   - `FACTORY_API_KEY`: (اختياري) مفتاح API إذا لزم الأمر

4. النقر على "Deploy"

## ربط البيانات الحقيقية

لربط اللوحة بنظام المصنع الحقيقي:

1. افتح الملف `lib/data-source.ts`
2. ابحث عن الدالة `getDashboardData()`
3. إذا تم تعيين `FACTORY_API_URL` في متغيرات البيئة، سيقوم النظام بجلب البيانات من هذا الرابط تلقائياً
4. تأكد من أن API يعيد البيانات بنفس الصيغة المحددة في `lib/types.ts`

### صيغة البيانات المطلوبة

يجب أن يعيد API كائن JSON بالصيغة التالية:

```typescript
{
  attendance: {
    present: number,
    absent: number,
    total: number,
    absentNames: string[]
  },
  stock: {
    products: [{
      id: string,
      name: string,
      quantity: number,
      unit: string,
      minimumThreshold: number,
      image?: string
    }],
    sacks: [{
      id: string,
      name: string,
      unit: string,
      icon?: string,
      fine: { quantity: number, minimumThreshold: number },   // ناعم
      coarse: { quantity: number, minimumThreshold: number }  // خشن
    }]
  },
  kilns: {
    working: number,
    maintenance: number,
    stopped: number,
    total: number,
    kilns: [{
      id: string,
      name: string,
      status: "working" | "maintenance" | "stopped"
    }]
  },
  floorWorkers: {
    present: number,
    total: number
  },
  treasury: {
    balance: number,
    todayChange?: number
  },
  updatedAt: string (ISO 8601)
}
```

## إضافة صور المنتجات

ضع صور المنتجات في مجلد `public/products/`:
- `quarter.png` - ربع كيلو
- `half.png` - نص كيلو
- `kilo.png` - كيلو
- `3kg.png` - 3 كيلو

ضع شعار الشركة في `public/logo.png`

## الأقسام

1. **حضور الإدارة**: يعرض عدد الحاضرين والغائبين مع رسم بياني دائري
2. **رصيد المخزن**: يعرض المنتجات المعبأة والشكاير مع الحد الأدنى لكل منتج
3. **الأفران**: يعرض حالة الأفران (شغالة/صيانة/متوقفة)
4. **عمال الأرضية**: يعرض عدد العمال الحاضرين اليوم
5. **رصيد الخزنة**: يعرض الرصيد الحالي بالجنيه المصري مع التغير اليومي

## تعديل البيانات والأحجام

للتعديل على الأرقام والأحجام المعروضة على اللوحة بدون لمس الكود البرمجي:

1. افتح الملف `config/dashboard.config.ts`
2. ستجد قسمين رئيسيين:
   - **البيانات (data)**: الأرقام المعروضة على الشاشة
   - **الأحجام (sizes)**: أحجام النصوص والصور والمكونات

### تعديل البيانات

في قسم `data` يمكنك تغيير:
- رصيد الخزنة (`treasury.balance` و `treasury.todayChange`)
- حضور الإدارة (`attendance.present`, `attendance.absent`, `attendance.absentNames`)
- عمال الأرضية (`floorWorkers.presentToday`, `floorWorkers.totalRegistered`)
- حالة الأفران (`kilns`) - عدّل الحالة لكل فرن بين "working" (شغالة)، "maintenance" (صيانة)، أو "stopped" (متوقفة)
- المنتجات (`stock.products`) - الكمية، الوحدة، الحد الأدنى
- الشكاير (`stock.sacks`) - الوحدة، والكمية والحد الأدنى لكل من الناعم (`fine`) والخشن (`coarse`)

**مثال**: لتغيير رصيد الخزنة إلى 2,000,000 جنيه:
```typescript
treasury: {
  balance: 2000000, // غير الرقم هنا
  todayChange: 15000,
}
```

### تعديل الأحجام

في قسم `sizes` يمكنك تغيير:
- حجم اللوجو والعناوين في الهيدر
- أحجام الأرقام في كل قسم
- حجم الدونت في قسم الحضور
- أحجام صور المنتجات
- أحجام النصوص في المخزون

**مثال**: لتكبير رقم رصيد الخزنة:
```typescript
treasury: {
  numberFontSize: 60, // زيادة الرقم من 48 إلى 60
}
```

كل قيمة عليها تعليق بالعربي يوضح وظيفتها وأين تظهر على الشاشة.

## الترخيص

مشروع خاص بشركة الصفوة
