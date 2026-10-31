// ملف إعدادات الداشبورد - غير الأرقام هنا عشان تغير المظهر
// Dashboard settings file - edit the numbers here to change the dashboard appearance

import type {
  Batches,
  ConfigKiln,
  ConfigPackagedProduct,
  ConfigPackagingItem,
  ConfigPage,
  ConfigSack,
  ConfigVariant,
  ConfigWoodSubType,
  ConfigWoodType,
  ConfigErpField,
  ConfigErpSource,
  ConfigErpBatches,
  ConfigErpCharity,
  ConfigErpStockMap,
  ConfigAttendanceSection,
} from "@/lib/types";

export const dashboardConfig = {
  // ============================================================
  // الحضور: كل قسم بأكواد البصمة (Attendance Device ID في ERPNext)
  // Attendance: each section by device code (ERPNext Employee "Attendance Device ID")
  // - اكتب الكود لوحده (193) أو من لحد كده [1001, 1014] (الاتنين داخلين)
  // - اسم وحضور كل موظف من ERPNext: حاضر = بصمة النهارده أو Present / Half Day / Work From Home،
  //   إجازة = On Leave (مش بتتحسب في النسبة)، غائب = Absent أو مفيش لا بصمة ولا حضور
  // - أي حد حاضر النهارده وكوده مش هنا (أو مالوش كود) بيتحط لوحده في "عمال يومية"
  // - Active employees only; anyone present today whose code isn't listed (or has none) goes to "عمال يومية"
  // ============================================================
  attendance: {
    sections: {
      management: { label: "الإدارة", codes: [193, [1001, 1014]] } as ConfigAttendanceSection, // حضور الإدارة
      // مصنع إنتاج - 3 كروت فرعية جوه "حضور عمال" - production factory, 3 sub-cards inside the workers card
      production: { label: "عمال إنتاج", codes: [[1015, 1026]] } as ConfigAttendanceSection, // مصنع إنتاج — عمال إنتاج
      workshop: { label: "ورشة", codes: [[1027, 1029]] } as ConfigAttendanceSection, // مصنع إنتاج — ورشة
      operators: { label: "أوبريتر", codes: [[1040, 1045]] } as ConfigAttendanceSection, // مصنع إنتاج — أوبريتر
      packing: { label: "عمال تعبئة", codes: [[1030, 1039]] } as ConfigAttendanceSection, // عمال تعبئة
      saw: { label: "عمال منشار", codes: [] } as ConfigAttendanceSection, // عمال منشار (مفيش أكواد لسه - بيظهر 0 / 0)
      daily: { label: "عمال يومية", codes: [[1055, 1060]] } as ConfigAttendanceSection, // عمال يومية (+ أي حاضر مالوش قسم)
      // كروت لوحدها برّه "حضور عمال" ومش داخلة في إجمالي العمال - separate cards, not in the workers total
      drivers: { label: "سواقين", codes: [[1046, 1048]] } as ConfigAttendanceSection, // سواقين
      reps: { label: "مناديب", codes: [[1049, 1054]] } as ConfigAttendanceSection, // مناديب
      guards: { label: "غفر", codes: [[1061, 1063]] } as ConfigAttendanceSection, // غفر
    },
    factoryLabel: "مصنع إنتاج", // اسم الكارت اللي فيه عمال إنتاج والورشة والأوبريتر - factory card name
  },

  // ============================================================
  // الربط مع ERPNext - كل رقم بنختار هو جاي منين
  // ERPNext link - choose where each number comes from
  // source: "erp" = من ERPNext، source: "manual" = من الأرقام اللي في الجزء الأول تحت
  // لو ERPNext وقع بيفضل يظهر آخر رقم اتجاب، ولو مفيش يظهر رقم الكونفج، وتظهر علامة "غير متصل"
  // If ERPNext fails the last good value stays (or the config value), and the "غير متصل" badge shows
  // ============================================================

  erp: {
    refreshSeconds: 3, // كل كام ثانية الداشبورد يجيب بيانات جديدة من السيستم - how often the dashboard fetches new data

    treasury: {
      balance: { source: "erp", account: "1110 - الخزينة - AC" } as ConfigErpField, // رصيد الخزنة
      // الوارد = مجموع المدين والمنصرف = مجموع الدائن من GL Entry للحساب ده النهارده
      // incoming = sum(debit), outgoing = sum(credit) from today's GL Entry for this account
      incomingToday: { source: "erp", account: "1110 - الخزينة - AC" } as ConfigErpField, // الوارد النهارده
      outgoingToday: { source: "erp", account: "1110 - الخزينة - AC" } as ConfigErpField, // المنصرف النهارده
    },
    // الحضور دايما من ERPNext - التقسيم بالأكواد في attendance.sections فوق
    // Attendance always comes from ERPNext - sections by device code in attendance.sections above

    // الأفران = كل Workstation اسمه بيبدأ بـ "فرن" (مترتبين بالرقم)، فلو اتضاف "فرن 7" في ERPNext بيظهر لوحده
    // الحالة: Production = شغالة، Maintenance / Problem = صيانة، أي حاجة تانية (Off / Idle / Setup / فاضي) = متوقفة
    // لو ERPNext وقع بيفضل آخر نتيجة نجحت، ولو مفيش قايمة data.kilns تحت
    // Kilns = every Workstation whose name starts with "فرن", sorted by number; new ones appear automatically.
    // Production = working, Maintenance / Problem = maintenance, anything else = stopped.
    // ERPNext down: last good result, else the data.kilns list below
    kilns: { source: "erp" } as ConfigErpSource,

    // الطرحات اليوم (تحت الأفران) - كل حاجة بتتحدث كل refreshSeconds
    // خروج طرحات = سجلات "Kiln Exit": سجل لكل طرحة، فيه نوع الفحم (charcoal_type: برتقال / مانجا / جازورينا)
    // والفرن (kiln) ووقت الخروج (exit_time). بنعد بس اللي exit_time بتاعها النهارده بتوقيت القاهرة،
    // فالعداد بيتصفر لوحده أول كل يوم من غير ما حد يعمل حاجة. السجلات الملغية (Cancelled) مش بتتعد
    // يوزر الداشبورد لازم يبقى ليه صلاحية Read على Kiln Exit، وإلا الكارت يكتب "غير متصل"
    // لو ERPNext وقع بيفضل آخر رقم نجح مع "غير متصل"، ولو مفيش رقم قديم الكارت كله يكتب "غير متصل" (مش أصفار)
    // Batches: today's (Africa/Cairo) "Kiln Exit" records, so they reset daily on their own. On failure the
    // last good result stays with a "غير متصل" badge, else the card shows "غير متصل" (never fake zeros)
    batches: {
      source: "erp",
      exitsDoctype: "Kiln Exit", // خروج طرحات - سجل لكل طرحة
    } as ConfigErpBatches,

    // الصدقات (الصفحة 3) - كل حاجة بتتحدث كل refreshSeconds
    // كل عملية = سجل "Charity Transaction" (مش مربوط بالحسابات): fund = الصندوق، txn_type = "صرف" أو "إيداع" أو "رصيد افتتاحي"،
    // amount = المبلغ، txn_date = التاريخ، beneficiary = صُرفت لـ، details = التفاصيل
    // الرصيد = (الرصيد الافتتاحي + الإيداع) − الصرف من أول ما بدأ، وصرف اليوم/الشهر بتوقيت القاهرة
    // "رصيد افتتاحي" بيدخل في الرصيد بس: مش صرف ولا إيداع، ومش بيتحسب في صرف اليوم/الشهر ولا "آخر صرف"
    // funds = الصناديق بالترتيب اللي بتظهر بيه في الشبكة (يمين فوق، شمال فوق، يمين تحت، شمال تحت)
    // الأسامي لازم تبقى زي اختيارات خانة fund في ERPNext بالظبط، ولو غيرت اسم هناك غيره هنا
    // عملية في صندوق مش في القايمة دي مش بتتعد (وبتتكتب في اللوج)
    // يوزر الداشبورد لازم يبقى ليه صلاحية Read على Charity Transaction، وإلا الصفحة تكتب "غير متصل"
    // لو ERPNext وقع بتفضل آخر بيانات نجحت مع "غير متصل"، ولو مفيش الصفحة كلها تكتب "غير متصل" (مش أصفار)
    // Charity (page 3): one "Charity Transaction" record per operation. funds = the 4 funds in grid order,
    // spelled exactly like the fund Select options. On failure the last good data stays with "غير متصل",
    // else the page shows "غير متصل" (never fake zeros)
    charity: {
      doctype: "Charity Transaction",
      // الأسامي بتظهر على الشاشة زي ما هي مكتوبة هنا بالظبط - names are shown exactly as written
      funds: ["خزينة حصة التعبئة", "خزينة حصة الانتاج", "خزينة خارجية 1", "خزينة خارجية 2"],
    } as ConfigErpCharity,

    // أرصدة المخازن (الصفحة 2) - stock balances (page 2)
    // الرقم = مجموع actual_qty لكل الأصناف اللي في itemCodes (لو أكتر من صنف بيتجمعوا)
    // warehouses فاضية [] = كل مخازن الشركة، أو اكتب اسم المخزن بالظبط زي ERPNext مثلا ["مخزن منتج تام - تعبئة - AC"]
    // الأسماء (ربع كيلو، عادي، برتقال...) لازم تبقى زي اللي في data.stock تحت بالظبط، وأي اسم مش موجود هنا بيفضل يدوي
    // Names must match data.stock below exactly; anything not listed here stays manual
    // التفاصيل والأرصدة في docs/erp-mapping.md - details in docs/erp-mapping.md
    stock: {
      // المخازن دي حمولة عربيات ومش بتتحسب في رصيد المنتجات المعبأة (والكراتين بتاعتها)
      // عربية جديدة؟ ضيف اسم المخزن بتاعها هنا بالظبط زي ERPNext. الشكاير والمواد الخام مش بيتأثروا
      // Vehicle-load warehouses, excluded from packaged products only; add a new car by adding its warehouse name
      excludedWarehouses: [
        "مخزن سوزوكي 1 - AC",
        "مخزن سوزوكي 2 - AC",
        "مخزن سوزوكي 3 - AC",
        "مخزن سوزوكي 4 - AC",
        "مخزن الدبابة - AC",
      ] as string[],

      // المنتجات المعبأة: المنتج ← النوع - packaged: product -> variant
      packaged: {
        "ربع كيلو": {
          عادي: { source: "erp", itemCodes: ["باكت ربع"], warehouses: [] },
          كامل: { source: "erp", itemCodes: ["باكت ربع كامل"], warehouses: [] }, // مفيش كرتونة ربع في ERPNext
        },
        "نص كيلو": {
          عادي: { source: "erp", itemCodes: ["باكت نص"], warehouses: [] },
          كامل: { source: "erp", itemCodes: ["باكت نص كامل"], warehouses: [] }, // مفيش كرتونة نص في ERPNext
        },
        كيلو: {
          عادي: { source: "erp", itemCodes: ["باكت كيلو"], warehouses: [] },
          كامل: { source: "erp", itemCodes: ["كرتونة 1 كيلو"], warehouses: [] },
        },
        "2 كيلو": {
          عادي: { source: "erp", itemCodes: ["باكت 2 كيلو"], warehouses: [] },
          كامل: { source: "erp", itemCodes: ["كرتونة 2 كيلو"], warehouses: [] },
        },
        "3 كيلو": {
          عادي: { source: "erp", itemCodes: ["كيس 3 كيلو جازورينا"], warehouses: [] }, // مفيش كرتونة 3 كيلو
        },
      } as Record<string, ConfigErpStockMap>,

      // الشكاير: الشكارة ← النوع - sacks: sack -> variant
      sacks: {
        "شكاير برتقال": {
          ناعم: { source: "erp", itemCodes: ["شيكارة فحم برتقال ناعم"], warehouses: [] },
          خشن: { source: "erp", itemCodes: ["شيكارة فحم برتقال خشن"], warehouses: [] },
          مكمورة: { source: "erp", itemCodes: ["فحم برتقال مكمورة", "فحم برتقال مكمورة مصنع"], warehouses: [] },
        },
        "شكاير مانجو": {
          ناعم: { source: "erp", itemCodes: ["شيكارة فحم مانجة ناعم"], warehouses: [] },
          خشن: { source: "erp", itemCodes: ["شيكارة فحم مانجة خشن"], warehouses: [] },
        },
        "شكاير كازوارينا": {
          ناعم: { source: "erp", itemCodes: ["شيكارة فحم جازورينا ناعم"], warehouses: [] },
          خشن: { source: "erp", itemCodes: ["شيكارة فحم جازورينا خشن"], warehouses: [] },
          مكمورة: { source: "erp", itemCodes: ["فحم جازورينا مكمورة", "فحم جازورينا مكمورة مصنع"], warehouses: [] },
        },
      } as Record<string, ConfigErpStockMap>,

      // الأخشاب: باسم النوع أو النوع الفرعي (كازوارينا/توت/زيتون جوه بلدي) - wood: by type or sub-type name
      // الوحدة اللي بتظهر = وحدة أول صنف خشب في ERPNext - the unit shown is the first wood item's ERPNext unit
      wood: {
        برتقال: { source: "erp", itemCodes: ["خشب برتقال"], warehouses: [] },
        مانجو: { source: "erp", itemCodes: ["خشب مانجة"], warehouses: [] },
        جوافة: { source: "erp", itemCodes: ["خشب جوافة"], warehouses: [] },
        كازوارينا: { source: "erp", itemCodes: ["خشب جازورينا"], warehouses: [] },
        توت: { source: "erp", itemCodes: ["خشب توت"], warehouses: [] },
        زيتون: { source: "erp", itemCodes: ["خشب زايتون"], warehouses: [] },
        "بيت نار": { source: "erp", itemCodes: ["خشب بيت نار"], warehouses: [] },
      } as ConfigErpStockMap,

      // مواد التعبئة: الوحدة اللي بتظهر = وحدة الصنف في ERPNext - packaging: the unit shown is the ERPNext unit
      packaging: {
        "أكياس تعبئة": { source: "erp", itemCodes: ["اكياس تعبئة 60*70", "اكياس تعبئة 40*50"], warehouses: [] },
        "رولات ربع": { source: "erp", itemCodes: ["رول احمر"], warehouses: [] },
        "رولات نص": { source: "erp", itemCodes: ["رول ازرق"], warehouses: [] },
        "أكياس كيلو": { source: "erp", itemCodes: ["بوكس كيلو"], warehouses: [] },
        "أكياس 2 كيلو": { source: "erp", itemCodes: ["بوكس 2 كيلو"], warehouses: [] },
        "أكياس 3 كيلو": { source: "erp", itemCodes: ["بوكس 3 كيلو"], warehouses: [] },
        // بكر اللاصق: صنف "بكر لاصق" في ERPNext، الرصيد من كل المخازن والوحدة "عدد" من ERPNext
        "بكر لاصق": { source: "erp", itemCodes: ["بكر لاصق"], warehouses: [] },
      } as ConfigErpStockMap,
    },
  },

  // ============================================================
  // الصفحات - الداشبورد بقى كذا صفحة، والتنقل بالأسهم اللي فوق على الشمال أو أسهم الكيبورد
  // Pages - the dashboard has several pages (arrows at the top-left of the header or keyboard arrows)
  // ============================================================

  pages: {
    autoRotate: true, // true = الصفحات تتقلب لوحدها، false = تفضل ثابتة - true = pages switch by themselves
    // title = اسم الصفحة اللي بيظهر في نص الهيدر - title = page name shown in the center of the header
    // durationSeconds = الصفحة دي تفضل كام ثانية قبل ما تتقلب للي بعدها - seconds on screen before the next page
    // لو حد داس على الأسهم الصفحة بتتقلب والعداد بيبدأ من الأول - a manual switch restarts the timer
    // ترتيب الصفحات - عشان تفتح صفحة معينة على التلفزيون اكتب في اللينك ?page=2
    // Page order - open a specific page directly with ?page=2 in the URL
    list: [
      { id: "main", title: "الرئيسية", durationSeconds: 60 }, // الصفحة 1: الخزنة والحضور والأفران - page 1
      { id: "stock", title: "أرصدة المخازن", durationSeconds: 120 }, // الصفحة 2: المخازن - page 2
      { id: "charity", title: "الصدقات", durationSeconds: 30 }, // الصفحة 3: صناديق الصدقات - page 3
    ] as ConfigPage[],
  },

  // ============================================================
  // الجزء الأول: البيانات (الأرقام اللي بتظهر على الشاشة)
  // Part 1: DATA (the numbers shown on the screen)
  // ============================================================

  data: {
    // رصيد الخزنة - الباقي في الخزنة والوارد والمنصرف النهارده
    // Treasury balance - money in treasury plus today's incoming / outgoing
    // تغيير اليوم = الوارد − المنصرف (بيتحسب لوحده) - today's change = incoming − outgoing (calculated)
    treasury: {
      balance: 460607, // الرصيد الحالي بالجنيه - current balance in EGP
      incomingToday: 156729, // الوارد النهارده بالجنيه - money in today (EGP)
      outgoingToday: 12300, // المنصرف النهارده بالجنيه - money out today (EGP)
    },

    // الأفران - حالة كل فرن (بتُستخدم بس لو erp.kilns يدوي أو ERPNext مش بيرد)
    // Kilns - status of each kiln (used only when erp.kilns is manual or ERPNext is unreachable)
    kilns: [
      // الشكل ده يحدد حالة كل فرن - this defines each kiln's status
      // الحالات الممكنة: "working" (شغالة), "maintenance" (صيانة), "stopped" (متوقفة)
      // Possible statuses: "working", "maintenance", "stopped"
      { name: "فرن 1", status: "working" as const },
      { name: "فرن 2", status: "working" as const },
      { name: "فرن 3", status: "maintenance" as const },
      { name: "فرن 4", status: "maintenance" as const },
      { name: "فرن 5", status: "working" as const },
      { name: "فرن 6", status: "stopped" as const },
    ] as ConfigKiln[],

    // الطرحات اليوم (تحت الأفران في الصفحة الرئيسية) - بتُستخدم بس لو erp.batches يدوي (source: "manual")
    // Today's batches (under the kilns card) - used only when erp.batches is manual
    // الإجمالي بيتحسب لوحده - totals are calculated automatically
    batches: {
      out: { orange: 0, mango: 0, casuarina: 0 }, // خروج طرحات: برتقال / مانجا / جازورينا
    } as Pick<Batches, "out">,

    // ============================================================
    // رصيد المخازن (الصفحة 2) - المنتجات المعبأة والشكاير والمواد الخام (الخشب ومواد التعبئة)
    // Stock (page 2) - packaged products, sacks and raw materials (wood + packaging)
    // كل الإجماليات بتتحسب لوحدها - every total is calculated automatically
    // minimum = الحد الأدنى: لو أكبر من 0 والكمية وصلته أو أقل، الرقم بيقلب أحمر ويكتب "منخفض" والكارت بيبقى إطاره أحمر
    // minimum: if > 0 and quantity <= minimum, the number turns red ("منخفض") and the card gets a red border
    // ============================================================
    stock: {
      // المنتجات المعبأة - كل منتج متقسم أنواع (variants)، تقدر تزود نوع جديد بسطر جديد
      // Packaged products - each product has types (variants); add a type by adding a line
      packaged: [
        {
          name: "ربع كيلو", // اسم المنتج - product name
          unit: "باكت", // وحدة القياس - unit
          image: "/products/quarter.png", // مسار الصورة (لو مش موجودة بتظهر أيقونة) - image path (icon shown if missing)
          variants: [
            // label = اسم النوع، quantity = الكمية، minimum = الحد الأدنى - type name, quantity, minimum
            { label: "عادي", quantity: 2007, minimum: 0 },
            { label: "كامل", quantity: 500, minimum: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "نص كيلو",
          unit: "باكت",
          image: "/products/half.png",
          variants: [
            { label: "عادي", quantity: 2474, minimum: 0 },
            { label: "كامل", quantity: 600, minimum: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "كيلو",
          unit: "باكت",
          image: "/products/kilo.png",
          variants: [
            { label: "عادي", quantity: 716, minimum: 0 },
            { label: "كامل", quantity: 200, minimum: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "2 كيلو",
          unit: "باكت",
          image: "/products/2kg.png",
          variants: [
            { label: "عادي", quantity: 677, minimum: 0 },
            { label: "كامل", quantity: 150, minimum: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "3 كيلو",
          unit: "باكت",
          image: "/products/3kg.png",
          variants: [
            // نوع واحد بس - one type only
            { label: "عادي", quantity: 573, minimum: 0 },
          ] as ConfigVariant[],
        },
      ] as ConfigPackagedProduct[],

      // المواد الخام - الأخشاب ومواد التعبئة (بيظهروا بنفس اللون البني عشان يبانوا مجموعة واحدة)
      // Raw materials - wood and packaging materials (shown in the same brown color as one group)
      rawMaterials: {
        // أرصدة الخشب - كل نوع ليه رقم واحد، أو متقسم أنواع فرعية (subTypes) وإجماليه = مجموعهم
        // Wood balances - each type has one number, or is split into subTypes (its total = their sum)
        wood: {
          unit: "طن", // وحدة القياس - unit
          types: [
            { name: "برتقال", quantity: 120, minimum: 0 }, // name = النوع، quantity = الكمية، minimum = الحد الأدنى
            { name: "مانجو", quantity: 80, minimum: 0 },
            { name: "جوافة", quantity: 45, minimum: 0 },
            {
              name: "بلدي",
              // الأنواع الفرعية للبلدي - بلدي sub-types (بلدي total = their sum)
              subTypes: [
                { name: "كازوارينا", quantity: 60, minimum: 0 },
                { name: "توت", quantity: 30, minimum: 0 },
                { name: "زيتون", quantity: 25, minimum: 0 },
              ] as ConfigWoodSubType[],
            },
            { name: "بيت نار", quantity: 40, minimum: 0 },
          ] as ConfigWoodType[],
        },

        // مواد التعبئة - كل مادة ليها رقم واحد، تقدر تزود مادة جديدة بسطر جديد
        // Packaging materials - one number each; add a material by adding a line
        // name = اسم المادة، quantity = الكمية، unit = وحدة القياس، minimum = الحد الأدنى
        // icon = شكل الأيقونة: "plastic" (أكياس تعبئة)، "roll" (رول)، "bag" (كيس)، "tape" (بكر لاصق)
        // icon = icon shape: "plastic", "roll", "bag" or "tape"
        packaging: [
          { name: "أكياس تعبئة", quantity: 850, unit: "كجم", minimum: 0, icon: "plastic" },
          { name: "رولات ربع", quantity: 40, unit: "رول", minimum: 0, icon: "roll" },
          { name: "رولات نص", quantity: 35, unit: "رول", minimum: 0, icon: "roll" },
          { name: "أكياس كيلو", quantity: 5000, unit: "كيس", minimum: 0, icon: "bag" },
          { name: "أكياس 2 كيلو", quantity: 3000, unit: "كيس", minimum: 0, icon: "bag" },
          { name: "أكياس 3 كيلو", quantity: 2500, unit: "كيس", minimum: 0, icon: "bag" },
          { name: "بكر لاصق", quantity: 0, unit: "عدد", minimum: 0, icon: "tape" },
        ] as ConfigPackagingItem[],
      },

      // الشكاير - كل نوع شكاير متقسم أنواع (ناعم، خشن، مكمورة...) وتقدر تزود أو تشيل
      // Sacks - each sack type has variants (fine, coarse, ...); add or remove lines freely
      sacks: [
        {
          name: "شكاير برتقال", // اسم الشكاير - sack name
          unit: "شكارة", // وحدة القياس - unit
          variants: [
            { label: "ناعم", quantity: 766, minimum: 0 }, // label = النوع، quantity = الكمية، minimum = الحد الأدنى
            { label: "خشن", quantity: 520, minimum: 0 },
            { label: "مكمورة", quantity: 0, minimum: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "شكاير مانجو",
          unit: "شكارة",
          variants: [
            { label: "ناعم", quantity: 80, minimum: 0 },
            { label: "خشن", quantity: 204, minimum: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "شكاير كازوارينا",
          unit: "شكارة",
          variants: [
            { label: "ناعم", quantity: 1058, minimum: 0 },
            { label: "خشن", quantity: 82, minimum: 0 },
            { label: "مكمورة", quantity: 330, minimum: 0 },
          ] as ConfigVariant[],
        },
      ] as ConfigSack[],
    },
  },

  // ============================================================
  // الجزء الثاني: الأحجام (بالبكسل - عشان تغير الحجم)
  // Part 2: SIZES (in pixels - to change sizes)
  // ============================================================

  sizes: {
    // الهيدر - الجزء العلوي بتاع الصفحة
    // Header - top section of the page
    header: {
      logoHeight: 56, // ارتفاع اللوجو في بكسل - logo height in pixels
      titleFontSize: 24, // حجم عنوان "لوحة متابعة المصنع" - title font size
      subtitleFontSize: 14, // حجم كلمة "الصفوة" - subtitle font size
      clockFontSize: 30, // حجم الساعة - clock font size
      pageTitleFontSize: 28, // حجم اسم الصفحة الحالية في نص الهيدر - current page title (header center) font size
      pageTitleIconSize: 28, // حجم أيقونة اسم الصفحة - current page title icon size
      pageCounterFontSize: 11, // حجم "صفحة 1 من 2" تحت اسم الصفحة - "page X of Y" font size under the title
    },

    // أزرار التنقل بين الصفحات (فوق على الشمال في الهيدر) - page navigation buttons (header top-left)
    pageNav: {
      iconSize: 18, // حجم سهم التالي/السابق - next/previous arrow size
      fadeMs: 500, // مدة الاختفاء/الظهور بين الصفحات بالملي ثانية - fade duration between pages (ms)
    },

    // الكروت - البطاقات اللي بتظهر البيانات
    // Cards - the cards showing data
    cards: {
      cardPadding: 16, // المسافة داخل البطاقة من الحواف - padding inside card
      gap: 16, // المسافة بين البطاقات - gap between cards
      borderRadius: 16, // تقويس حواف البطاقة - card border radius
    },

    // عرض كروت الصف العلوي (نسب من عرض الصف) - top row card widths (fr ratios)
    // مجموعهم لازم يفضل 4 عشان الأفران تفضل بنفس العرض - keep the sum at 4 so the kilns card keeps its width
    topRowColumns: {
      treasury: 0.75, // رصيد الخزنة (أضيق) - treasury (narrower)
      management: 0.75, // حضور الإدارة (أضيق) - management attendance (narrower)
      workers: 1.5, // حضور عمال (أعرض) - workers attendance (wider)
      kilns: 1, // الأفران (نفس العرض) - kilns (same width)
    },

    // الخزنة - بطاقة رصيد الخزنة
    // Treasury - treasury balance card
    // المحتوى بيتوزع بالتساوي على طول الكارت - content is spread evenly over the card height
    treasury: {
      // الأرقام بتصغر لوحدها لو الكارت ضيق: الحجم = أصغر قيمة بين الـ Max والـ Scale% من عرض الكارت
      // Numbers shrink automatically on narrow cards: size = min(MaxSize px, Scale% of the card width)
      balanceMaxSize: 84, // أكبر حجم لرقم الرصيد الكبير بالبكسل - max balance number size (px)
      balanceScale: 17, // رقم الرصيد = 17% من عرض الكارت لو أصغر من الـ Max - balance size as % of card width
      currencyFontSize: 28, // حجم "ج.م" اللي تحت الرصيد - "ج.م" under the balance
      changeMaxSize: 26, // أكبر حجم لرقم تغيير اليوم (+144,429 ج.م) وأيقونته - max today's change badge size (px)
      changeScale: 7, // شارة التغيير = 7% من عرض الكارت لو أصغر من الـ Max - change badge size as % of card width
      changePaddingX: 20, // المسافة يمين وشمال جوه شارة التغيير - change badge horizontal padding
      changePaddingY: 10, // المسافة فوق وتحت جوه شارة التغيير - change badge vertical padding
      flowLabelMaxSize: 20, // أكبر حجم لكلمة "وارد اليوم" و "منصرف اليوم" - max incoming / outgoing label size (px)
      flowLabelScale: 12, // الكلمة = 12% من عرض المربع لو أصغر من الـ Max - label size as % of box width
      flowIconSize: 22, // حجم السهم اللي جنب "وارد اليوم" و "منصرف اليوم" - incoming / outgoing arrow icon size
      flowMaxSize: 38, // أكبر حجم لرقم الوارد والمنصرف بالبكسل - max incoming / outgoing number size (px)
      flowScale: 21, // رقم الوارد/المنصرف = 21% من عرض المربع لو أصغر من الـ Max - number size as % of box width
      flowCurrencyFontSize: 16, // حجم "ج.م" تحت رقم الوارد والمنصرف - "ج.م" under incoming / outgoing
      flowPadding: 10, // المسافة جوه مربع الوارد/المنصرف من كل ناحية - incoming / outgoing box padding (all sides)
      footerFontSize: 18, // حجم "رصيد الخزنة الحالي" اللي تحت - "رصيد الخزنة الحالي" footer
    },

    // الحضور - بطاقة حضور الإدارة مع الدونت
    // Attendance - management attendance card with donut chart
    // المحتوى بيتوزع بالتساوي على طول الكارت - content is spread evenly over the card height
    attendance: {
      donutSize: 170, // حجم الدونت بالبكسل (عرض وطول) - donut size in pixels (width = height)
      donutThickness: 18, // سماكة حلقة الدونت بالبكسل - donut ring thickness in pixels
      percentFontSize: 44, // حجم النسبة المئوية في وسط الدونت - percentage font size in donut center
      centerLabelFontSize: 18, // حجم "نسبة الحضور" اللي تحت النسبة - "نسبة الحضور" under the percentage
      countFontSize: 44, // حجم رقم الحاضر (أخضر) والغائب (أحمر) - present / absent number font size
      countLabelFontSize: 18, // حجم كلمة "حاضر" و "غائب" - "حاضر" / "غائب" label font size
      countPaddingY: 14, // المسافة فوق وتحت جوه مربع حاضر/غائب (كل ما تكبر المربع يطول) - vertical padding (bigger = taller box)
      listLabelFontSize: 16, // حجم كلمة "الحاضرين" / "الغائبين" / "لم يسجّلوا بعد" - list label font size
      chipFontSize: 16, // حجم الأسامي جوه الكبسولات - name chip font size
      minChipFontSize: 13, // لو الأسامي مش واخدة مكانها الخط بيصغر لحد كده، والأسامي عمرها ما بتستخبى - smallest chip size; names are never hidden
      chipPaddingX: 10, // المسافة يمين وشمال جوه الكبسولة - name chip horizontal padding
      chipPaddingY: 3, // المسافة فوق وتحت جوه الكبسولة - name chip vertical padding
    },

    // عمال الأرضية - بطاقة عمال الأرضية
    // Floor Workers - floor workers card
    floorWorkers: {
      groupTitleFontSize: 16, // حجم اسم القسم (عمال إنتاج، تعبئة...) - group name font size
      minGroupTitleFontSize: 11, // أصغر حجم لاسم القسم لو مش واخد مكانه (الاسم عمره ما بيتقص) - smallest group name size; names are never cut
      groupNumberFontSize: 20, // حجم رقم الحاضرين في كل قسم - present count font size per group
      nameChipFontSize: 12, // حجم أسماء العمال الحاضرين - present worker name chip font size
      minNameChipFontSize: 10, // أصغر حجم للأسماء لو مش كافية المساحة - smallest chip font size when names don't fit
      subGroupTitleFontSize: 14, // حجم اسم المجموعة جوه مصنع الإنتاج (عمال إنتاج، ورشة، أوبريتر) - sub-group name font size
      factoryRowHeight: 1.2, // ارتفاع صف مصنع الإنتاج بالنسبة لصف باقي الأقسام - factory row height vs the other groups' row
    },

    // الأفران - بطاقة الأفران
    // Kilns - kilns card
    kilns: {
      countFontSize: 30, // حجم أرقام الأعداد (شغالة/صيانة/متوقفة) - font size for count numbers
      kilnChipHeight: 32, // ارتفاع شريحة الفرن - kiln chip height
    },

    // الطرحات اليوم - بطاقة الطرحات تحت الأفران
    // Today's batches - batches card under the kilns
    batches: {
      tileFontSize: 30, // حجم رقم كل نوع (برتقال / مانجا / جازورينا) - per-type number font size
      totalFontSize: 30, // حجم رقم الإجمالي - total number font size
      exitRowHeight: 30, // ارتفاع كل سطر في قايمة الطرحات اللي خرجت (أصغر = سطور أكتر) - exit list row height (px)
      exitFontSize: 14, // حجم الكلام في قايمة الطرحات اللي خرجت - exit list font size
    },

    // رصيد المخازن (الصفحة 2) - stock page (page 2)
    stockPage: {
      // ارتفاع كل قسم بالنسبة للتانيين - each section's height relative to the others
      rowHeights: {
        finished: 1, // فوق: المنتجات المعبأة والشكاير - top: packaged products + sacks
        rawMaterials: 1.45, // تحت: قسم المواد الخام كله - bottom: the whole raw materials block
      },
      // عرض المنتجات المعبأة والشكاير في الصف اللي فوق (نسب من عرض الصف) - top row widths (ratios)
      topColumns: {
        packaged: 56, // المنتجات المعبأة (على اليمين) - packaged products (right)
        sacks: 44, // الشكاير (على الشمال) - sacks (left)
      },
      // ارتفاع الأخشاب ومواد التعبئة جوه قسم المواد الخام - wood vs packaging height inside raw materials
      rawMaterialsRows: {
        wood: 1.5, // الأخشاب - wood
        packaging: 0.7, // مواد التعبئة (كروتها فيها رقم واحد بس) - packaging materials (one number per card)
      },
      subGroupTitleFontSize: 17, // حجم عناوين "الأخشاب" و"مواد التعبئة" جوه المواد الخام - sub-group title font size
      sectionTitleFontSize: 22, // حجم عناوين الأقسام (المنتجات المعبأة، أرصدة الخشب، الشكاير) - section title font size
      imageWidth: 44, // عرض صورة المنتج - product image width
      imageHeight: 44, // ارتفاع صورة المنتج - product image height
      nameFontSize: 18, // حجم اسم الكارت (ربع كيلو، برتقال، شكاير مانجو...) - card name font size
      variantLabelFontSize: 13, // حجم اسم النوع (عادي، كامل، ناعم، خشن...) - type label font size
      minVariantLabelFontSize: 11, // أصغر حجم لاسم النوع لو مش واخد مكانه (بدل ما يتقص) - smallest type label size (instead of cutting it)
      numberFontSize: 30, // حجم رقم الكمية (بيصغر لوحده لو مش واخد العرض) - quantity font size (auto-shrinks to fit the width)
      singleNumberFontSize: 34, // حجم الرقم الكبير في الكروت اللي فيها رقم واحد (مواد التعبئة والخشب العادي) - big number in one-number cards
      subTypeNumberFontSize: 26, // حجم أرقام أنواع البلدي (كازوارينا/توت/زيتون) - بلدي sub-type numbers
      minNumberFontSize: 18, // أصغر حجم للرقم لما يصغر - smallest quantity font size when shrinking
      unitFontSize: 14, // حجم الوحدة الصغيرة جنب الرقم الكبير (كجم/رول/كيس/طن) - small unit next to the big number
    },

    // صف "الإجمالي" في كروت الصفحة 2 - the "الإجمالي" (total) rows on page 2
    page2: {
      totalFontSize: 30, // حجم رقم "الإجمالي" تحت كل كارت - card total number font size
      minTotalFontSize: 18, // أصغر حجم لرقم الإجمالي لو مش واخد مكانه - smallest total number size when it doesn't fit
      totalLabelFontSize: 16, // حجم كلمة "الإجمالي" - "الإجمالي" label font size
      totalUnitFontSize: 14, // حجم وحدة القياس جنب الإجمالي (باكت/طن/شكارة) - unit next to the total
      sectionTotalFontSize: 24, // حجم رقم "إجمالي الخشب" فوق قسم الخشب - wood grand total font size
      variantNumberMaxSize: 32, // أكبر حجم لأرقام الأنواع (عادي/كامل/ناعم/خشن...) - biggest variant number size
      variantNumberScale: 36, // نسبة الرقم من عرض العمود (كل ما تزود الرقم يكبر، لو زاد أوي ممكن الأرقام تتداخل) - number size as % of the column width
    },

    // الصدقات (الصفحة 3) - charity page (page 3)
    // الأرقام الكبيرة بتصغر لوحدها لو الكارت صغير (شاشة أقصر) - big numbers shrink by themselves on smaller cards
    charityPage: {
      summaryHeight: 84, // ارتفاع الشريط اللي فوق (إجمالي الأرصدة / صرف اليوم / صرف الشهر) - top summary strip height
      summaryNumberFontSize: 34, // حجم أرقام الشريط اللي فوق - summary numbers font size
      fundNameFontSize: 26, // حجم اسم الصندوق - fund name font size
      fundIconSize: 26, // حجم أيقونة الخزنة جنب اسم الصندوق - vault icon size
      monthOutFontSize: 18, // حجم "صرف الشهر" فوق على الشمال - "صرف الشهر" chip font size
      recentRowHeight: 32, // ارتفاع كل سطر في "آخر العمليات" - last operations row height (px)
      recentFontSize: 15, // حجم الكلام في "آخر العمليات" - last operations font size
    },

    // كروت الصناديق في الصفحة 3 - مربع "الرصيد" صغير في النص، وتحته "آخر العمليات" بياخد باقي الكارت
    // Page 3 fund cards: a compact centered "الرصيد" box; "آخر العمليات" fills the rest of the card
    page3: {
      balanceNumberSize: 64, // حجم رقم الرصيد بالبكسل (أخضر زي "إجمالي أرصدة الصدقات") - balance number size (px)
      balanceCurrencySize: 26, // حجم "ج.م" جنب رقم الرصيد - "ج.م" next to the balance number (px)
      balanceLabelFontSize: 20, // حجم كلمة "الرصيد" فوق الرقم - "الرصيد" label above the number
      // عدد العمليات في "آخر العمليات" (صرف وإيداع بس، الأحدث الأول) - لو زودته اتأكد إن الكارت لسه كافي على التلفزيون
      // How many operations "آخر العمليات" shows (صرف / إيداع only, newest first) - check the TV still fits if raised
      recentOpsCount: 4,
    },
  },

  // ============================================================
  // الجزء التالت: ألوان الصفحة 2 (رصيد المخازن)
  // Part 3: page 2 (stock) colors
  // ============================================================

  page2: {
    // إظهار سطر "الحد الأدنى" لما يكون 0 (false = يظهر بس لو فيه حد أدنى متحدد)
    // Show the "الحد الأدنى" line when the minimum is 0 (false = only when a real minimum is set)
    showZeroMinimum: false,

    // لون كل قسم: الخط الجانبي والأيقونة والخلفية الخفيفة وإطار الكروت ورقم الإجمالي
    // Each section's accent color: side bar, icon, faint background, card borders and total numbers
    // اكتب اللون بالشكل ده "#RRGGBB" - use the "#RRGGBB" format
    colors: {
      packaged: "#FF7A00", // المنتجات المعبأة (برتقالي) - packaged products (orange)
      sacks: "#10B981", // الشكاير (أخضر زمردي) - sacks (emerald green)
      rawMaterials: "#C8873A", // المواد الخام: الأخشاب ومواد التعبئة (بني خشبي) - raw materials: wood + packaging (wood brown)
    },
  },
};
