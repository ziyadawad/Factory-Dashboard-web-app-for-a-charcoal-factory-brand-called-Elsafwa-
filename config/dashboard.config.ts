// ملف إعدادات الداشبورد - غير الأرقام هنا عشان تغير المظهر
// Dashboard settings file - edit the numbers here to change the dashboard appearance

import type {
  Batch,
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
  ConfigErpStockMap,
  ConfigWorker,
} from "@/lib/types";

export const dashboardConfig = {
  // ============================================================
  // الربط مع ERPNext - كل رقم بنختار هو جاي منين
  // ERPNext link - choose where each number comes from
  // source: "erp" = من ERPNext، source: "manual" = من الأرقام اللي في الجزء الأول تحت
  // لو ERPNext وقع بيفضل يظهر آخر رقم اتجاب، ولو مفيش يظهر رقم الكونفج، وتظهر علامة "غير متصل"
  // If ERPNext fails the last good value stays (or the config value), and the "غير متصل" badge shows
  // ============================================================

  erp: {
    refreshSeconds: 60, // كل كام ثانية الداشبورد يجيب بيانات جديدة من السيستم - how often the dashboard fetches new data

    treasury: {
      balance: { source: "erp", account: "1110 - الخزينة - AC" } as ConfigErpField, // رصيد الخزنة
      // الوارد = مجموع المدين والمنصرف = مجموع الدائن من GL Entry للحساب ده النهارده
      // incoming = sum(debit), outgoing = sum(credit) from today's GL Entry for this account
      incomingToday: { source: "erp", account: "1110 - الخزينة - AC" } as ConfigErpField, // الوارد النهارده
      outgoingToday: { source: "erp", account: "1110 - الخزينة - AC" } as ConfigErpField, // المنصرف النهارده
    },
    // الحضور: كل شخص ليه employeeId في data.attendance و data.workers تحت
    // حاضر = Attendance النهارده (Draft أو Submitted) بحالة Present / Half Day / Work From Home، أو أي Employee Checkin النهارده
    // غايب = Attendance بحالة Absent / On Leave، أو مفيش أي تسجيل ليه
    // اللي مالوش employeeId بيفضل ياخد present اليدوي بتاعه
    // لو مفيش ولا تسجيل حضور في الشركة كلها النهارده: الكروت بتكتب "لم يتم تسجيل الحضور بعد" (ومحدش بيظهر غايب)
    // Attendance: present / absent per employeeId; people without an employeeId keep their manual present flag
    attendance: { source: "erp" } as ConfigErpSource, // حضور الإدارة
    workers: { source: "erp" } as ConfigErpSource, // عمال الأرضية (ومعاهم عمال اليومية)

    // الأفران يدوي: في ERPNext فيه Workstation واحد بس اسمه "تفحيم"، مش 6 أفران
    // Kilns stay manual: ERPNext has a single Workstation ("تفحيم"), not the 6 kilns
    kilns: { source: "manual" } as ConfigErpSource,

    // الطرحات النهارده = قيود Stock Entry نوعها Manufacture (Submitted) اللي صرفت خشب النهارده
    // النوع = أكبر خشب اتصرف (من غير fuelWood)، الوزن = كل الخشب اللي اتصرف بالطن، الوقت = posting_time
    // الفرن مش متسجل في ERPNext (خانة custom_الغرفة في Work Order فاضية)، فبيظهر "—"
    // Batches = today's submitted Manufacture Stock Entries that consumed wood; the kiln isn't in ERPNext
    batches: { source: "erp", fuelWood: ["بيت نار"] } as ConfigErpBatches,

    // أرصدة المخازن (الصفحة 2) - stock balances (page 2)
    // الرقم = مجموع actual_qty لكل الأصناف اللي في itemCodes (لو أكتر من صنف بيتجمعوا)
    // warehouses فاضية [] = كل مخازن الشركة، أو اكتب اسم المخزن بالظبط زي ERPNext مثلا ["مخزن منتج تام - تعبئة - AC"]
    // الأسماء (ربع كيلو، عادي، برتقال...) لازم تبقى زي اللي في data.stock تحت بالظبط، وأي اسم مش موجود هنا بيفضل يدوي
    // Names must match data.stock below exactly; anything not listed here stays manual
    // التفاصيل والأرصدة في docs/erp-mapping.md - details in docs/erp-mapping.md
    stock: {
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
      { id: "main", title: "الرئيسية", durationSeconds: 30 }, // الصفحة 1: الخزنة والحضور والأفران - page 1
      { id: "stock", title: "أرصدة المخازن", durationSeconds: 60 }, // الصفحة 2: المخازن - page 2
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

    // حضور الإدارة - العمال في الإدارة
    // Management attendance - office workers
    // كل واحد { name, employeeId, present }: name = الاسم اللي بيظهر، employeeId = ID الموظف في ERPNext،
    // present = يدوي (بيستخدم بس لو مالوش employeeId أو الحضور manual). الحاضر والغايب والنسبة بيتحسبوا لوحدهم
    // Each person { name, employeeId, present }; present is the manual value (used without an employeeId)
    attendance: {
      members: [
        { name: "حماده شاهين", employeeId: "حماده شحات محمد شاهين", present: true },
        { name: "يوسف عاطف", employeeId: "يوسف عاطف", present: true },
        { name: "زياد عوض", present: true }, // مش لاقيينه في ERPNext - not found in ERPNext
        { name: "ايه احمد", employeeId: "ايه احمد", present: true },
        { name: "طه على طه", employeeId: "طه علي طه", present: true },
        { name: "عايد عرموش", employeeId: "عايد عرموش", present: true },
        { name: "ايناس اشرف", employeeId: "ايناس إسماعيل عوض", present: true }, // محتمل: الإيناس الوحيدة بس الاسم التاني مختلف
        { name: "مى منسى", present: true }, // مش لاقيينها في ERPNext - not found in ERPNext
        { name: "فاطمه طلال", employeeId: "فاطمه طلال الصافورى", present: false },
        { name: "ناجى احمد بصير", employeeId: "ناجى احمد بصير على", present: true },
      ] as ConfigWorker[],
    },

    // عمال الأرضية - العمال على الأرض مقسمين حسب القسم
    // Floor workers - workers on the floor divided by department
    // كل مجموعة فيها members: كل عامل { name, employeeId, present }
    // - name = الاسم اللي بيظهر، employeeId = ID الموظف في ERPNext (لو لسه مش معروف سيبه)
    // - present = حاضر النهارده (true) ولا لأ (false)
    // - daily: true = عامل يومية: بيظهر في قسمه وكمان في خانة "عمال يومية"، ومتكتبوش مرتين
    // الإجمالي = عدد الأعضاء، والحاضر = اللي present بتاعهم true (بيتحسبوا لوحدهم)
    // الشخص بيتعد مرة واحدة في إجمالي مصنع الإنتاج وإجمالي الكارت (بالـ employeeId، ولو مفيش بالاسم)
    // Each person is listed ONCE; totals count each person once (by employeeId, else by name)
    workers: {
      // مصنع الإنتاج - متقسم 3 مجموعات، والرقم اللي في عنوانه بيتحسب لوحده
      // Production factory - split into 3 sub-groups; its header count is calculated
      productionFactory: {
        label: "مصنع إنتاج", // اسم القسم الكبير - section name
        groups: {
          production: {
            // عمال الإنتاج - production workers
            label: "عمال إنتاج", // اسم المجموعة - group name
            members: [
              { name: "الطيب", employeeId: "الطيب مصطفى محمد عبدالظاهر", present: true }, // محتمل: الوحيد اللي اسمه الأول الطيب (وظيفته مشرف انتاج)
              { name: "شعبان", employeeId: "شعبان السيد بيومى", present: true },
              { name: "محمود عابدين", employeeId: "محمود عابدين", present: true },
              { name: "فايز زكى", employeeId: "فايز  ذكى", present: true },
              // عامل يومية – بيظهر في خانة اليومية وفي قسمه
              { name: "عبدالناصر", employeeId: "عبدالناصر عبداللطيف", present: true, daily: true },
              { name: "عبدالظاهر", employeeId: "عبدالظاهر الطيب مصطفى", present: true }, // اتنقل من المنشار
              // عامل يومية – بيظهر في خانة اليومية وفي قسمه (مش لاقيينه في ERPNext لسه)
              { name: "هاشم نادر", present: true, daily: true },
            ] as ConfigWorker[],
          },
          workshop: {
            // الورشة - workshop workers
            label: "ورشة", // اسم المجموعة - group name
            members: [
              { name: "محمد عصام", employeeId: "محمد عصام صقر", present: true },
              // عامل يومية – بيظهر في خانة اليومية وفي قسمه (مش لاقيينه في ERPNext لسه)
              { name: "احمد حمدى", present: true, daily: true },
            ] as ConfigWorker[],
          },
          operators: {
            // الأوبريتر - machine operators
            label: "أوبريتر", // اسم المجموعة - group name
            members: [
              { name: "محمد حسين", employeeId: "محمد حسين محمود حسن", present: true },
              { name: "محمد الطيب", employeeId: "محمد الطيب", present: true },
              { name: "حسن فضيل", employeeId: "حسن محمد فضيل", present: true },
            ] as ConfigWorker[],
          },
        },
      },
      packing: {
        // عمال التعبئة - packing workers
        label: "عمال تعبئة", // اسم المجموعة - group name
        members: [
          { name: "طارق", employeeId: "طارق قاسم حسن منصور", present: true },
          { name: "رضا", employeeId: "رضا احمد سيد", present: true },
          { name: "زهراء", employeeId: "زهرة محمد الحسينى", present: true }, // محتمل: زهرة هي الوحيدة
          { name: "دنيا", employeeId: "دنيا حسن محمود", present: true },
          { name: "زينب", employeeId: "زينب احمد فريد", present: true },
          { name: "هويدا", employeeId: "هويدا السيد ابراهيم", present: true },
          { name: "ملك", employeeId: "ملك سعيد فتحي", present: true },
          { name: "جيهان", present: true }, // مش لاقيينه في ERPNext - not found in ERPNext
          { name: "جومانه", employeeId: "جومانا سعيد فتحي", present: true },
          { name: "سماح", employeeId: "سماح سعيد عامر", present: true },
          // عامل يومية – بيظهر في خانة اليومية وفي قسمه (مش لاقيينها في ERPNext لسه)
          { name: "وفاء فكرى", present: true, daily: true },
        ] as ConfigWorker[],
      },
      saw: {
        // عمال المنشار - saw workers
        label: "عمال منشار", // اسم المجموعة - group name
        members: [
          { name: "محمد حسن", present: true }, // مش لاقيينه في ERPNext - not found in ERPNext
        ] as ConfigWorker[],
      },
      drivers: {
        // السواقين - drivers
        label: "سواقين", // اسم المجموعة - group name
        members: [
          { name: "محمود القرش", employeeId: "محمود محمد عبده القرش", present: true },
          { name: "حماده فهمى", employeeId: "حماده فهمى إسماعيل", present: true },
          { name: "عبدالمقصود", employeeId: "محمد عبدالمقصود محمد", present: true }, // محتمل: السواق الوحيد اللي فيه عبدالمقصود
          { name: "اسلام", employeeId: "اسلام محمد عوض", present: true }, // محتمل: الإسلام الوحيد (وظيفته مندوب)
          { name: "كريم", employeeId: "كريم مدحت عوض", present: true },
          { name: "اليمنى", employeeId: "مصطفى خالد اليمني", present: true }, // محتمل: الوحيد اللي اسمه اليمني (وظيفته مندوب)
          { name: "محمود عز", present: true }, // مش لاقيينه في ERPNext - not found in ERPNext
          { name: "ابراهيم وصفى", employeeId: "إبراهيم محمد وصفى", present: true },
        ] as ConfigWorker[],
      },
      // عمال اليومية - أعضاءها هما اللي daily: true في كل الأقسام فوق (متكتبش أسماء هنا)
      // Daily workers - its members are everyone marked daily: true above (don't list names here)
      daily: {
        label: "عمال يومية", // اسم المجموعة - group name
      },
    },

    // الأفران - حالة كل فرن
    // Kilns - status of each kiln
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

    // الطرحات اليوم - كل طرحة طلعت من فرن النهارده (بتظهر تحت الأفران في الصفحة الرئيسية)
    // Today's batches - every batch out of a kiln today (shown under the kilns card)
    // الإجمالي وعدد الطرحات ووزن كل نوع بيتحسبوا لوحدهم - totals are calculated automatically
    // الترتيب مش مهم - الأحدث بيظهر الأول حسب الوقت - order doesn't matter, newest time shows first
    batches: {
      unit: "طن", // وحدة الوزن - weight unit
      list: [
        // kiln = اسم الفرن (لازم يبقى زي اسمه في الأفران عشان لون الحالة)، type = نوع الخشب، weight = الوزن، time = الوقت (24 ساعة)
        // kiln = kiln name (must match the kilns list for the status color), type = wood type, weight, time (24h "HH:MM")
        //{ kiln: "فرن 1", type: "برتقال", weight: 2.5, time: "08:30" },
       // { kiln: "فرن 2", type: "مانجو", weight: 1.8, time: "10:15" },
      //  { kiln: "فرن 5", type: "برتقال", weight: 2.2, time: "11:00" },
      //  { kiln: "فرن 1", type: "كازوارينا", weight: 3.1, time: "12:40" },
       // { kiln: "فرن 2", type: "جوافة", weight: 1.6, time: "13:20" },
       // { kiln: "فرن 5", type: "مانجو", weight: 2.0, time: "14:45" },
      ] as Batch[],
    },

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
      donutSize: 230, // حجم الدونت بالبكسل (عرض وطول) - donut size in pixels (width = height)
      donutThickness: 22, // سماكة حلقة الدونت بالبكسل - donut ring thickness in pixels
      percentFontSize: 52, // حجم النسبة المئوية في وسط الدونت - percentage font size in donut center
      centerLabelFontSize: 18, // حجم "نسبة الحضور" اللي تحت النسبة - "نسبة الحضور" under the percentage
      countFontSize: 44, // حجم رقم الحاضر (أخضر) والغائب (أحمر) - present / absent number font size
      countLabelFontSize: 18, // حجم كلمة "حاضر" و "غائب" - "حاضر" / "غائب" label font size
      countPaddingY: 14, // المسافة فوق وتحت جوه مربع حاضر/غائب (كل ما تكبر المربع يطول) - vertical padding (bigger = taller box)
      absentLabelFontSize: 18, // حجم كلمة "الغائبون:" - "الغائبون:" label font size
      nameFontSize: 18, // حجم أسماء الغايبين - absent name chips font size
      namePaddingX: 12, // المسافة يمين وشمال جوه اسم الغايب - name chip horizontal padding
      namePaddingY: 4, // المسافة فوق وتحت جوه اسم الغايب - name chip vertical padding
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
      totalFontSize: 24, // حجم رقم إجمالي الوزن وعدد الطرحات - total weight / batch count font size
      typeChipFontSize: 12, // حجم شرايح وزن كل نوع - per-type weight chip font size
      rowFontSize: 14, // حجم الكلام في صفوف الجدول - table row font size
      rowHeight: 34, // ارتفاع كل صف في الجدول (بالبكسل) - height of each table row (px)
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
