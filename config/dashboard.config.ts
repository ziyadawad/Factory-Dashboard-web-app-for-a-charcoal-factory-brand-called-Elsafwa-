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
} from "@/lib/types";

export const dashboardConfig = {
  // ============================================================
  // الصفحات - الداشبورد بقى كذا صفحة، والتنقل بالأسهم اللي فوق على الشمال أو أسهم الكيبورد
  // Pages - the dashboard has several pages (arrows at the top-left of the header or keyboard arrows)
  // ============================================================

  pages: {
    autoRotateSeconds: 0, // كل كام ثانية الصفحة تتقلب لوحدها (0 = مقفول) - auto switch every N seconds (0 = off)
    // title = اسم الصفحة اللي بيظهر في نص الهيدر - title = page name shown in the center of the header
    // ترتيب الصفحات - عشان تفتح صفحة معينة على التلفزيون اكتب في اللينك ?page=2
    // Page order - open a specific page directly with ?page=2 in the URL
    list: [
      { id: "main", title: "الرئيسية" }, // الصفحة 1: الخزنة والحضور والأفران - page 1
      { id: "stock", title: "أرصدة المخازن" }, // الصفحة 2: المخازن - page 2
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
    attendance: {
      present: 9, // عدد الحاضرين - number of present workers
      absent: 1, // عدد الغائبين - number of absent workers
      absentNames: [
        // أسماء الغائبين - names of absent workers
        "فاطمه طلال ",
      ] as string[],
    },

    // عمال الأرضية - العمال على الأرض مقسمين حسب القسم
    // Floor workers - workers on the floor divided by department
    // عدد الحاضرين في كل قسم = عدد الأسماء في presentNames (بيتحسب لوحده، متكتبوش بإيدك)
    // Present count of each group = presentNames.length (calculated automatically)
    workers: {
      // مصنع الإنتاج - متقسم 3 مجموعات، والرقم اللي في عنوانه = مجموع التلاتة (بيتحسب لوحده)
      // Production factory - split into 3 sub-groups; its header shows their sum (calculated)
      productionFactory: {
        label: "مصنع إنتاج", // اسم القسم الكبير - section name
        groups: {
          production: {
            // عمال الإنتاج - production workers
            label: "عمال إنتاج", // اسم المجموعة - group name
            total: 5, // الإجمالي المسجل في المجموعة - total registered
            presentNames: [
              // أسماء العمال الحاضرين - names of present workers
              "الطيب",
              "شعبان",
              "محمود عابدين",
              "فايز زكى",
              "عبدالناصر",

            ] as string[],
          },
          workshop: {
            // الورشة - workshop workers
            label: "ورشة", // اسم المجموعة - group name
            total: 3, // الإجمالي المسجل في المجموعة - total registered
            presentNames: [
              // أسماء العمال الحاضرين (أمثلة - غيرها) - present names (samples, replace them)
              "عم عيد",
              "محمد عصام",
              " احمد حمدى ",
            ] as string[],
          },
          operators: {
            // الأوبريتر - machine operators
            label: "أوبريتر", // اسم المجموعة - group name
            total: 3, // الإجمالي المسجل في المجموعة - total registered
            presentNames: [
              // أسماء العمال الحاضرين (أمثلة - غيرها) - present names (samples, replace them)

              "محمد حسين",
              "محمد الطيب",
              " حسن فضيل",
            ] as string[],
          },
        },
      },
      packing: {
        // عمال التعبئة - packing workers
        label: "عمال تعبئة", // اسم المجموعة - group name
        total: 10, // الإجمالي المسجل في القسم - total registered in department
        presentNames: [
          // أسماء العمال الحاضرين - names of present workers
          "طارق",
          "رضا",
          "زهراء",
          "دنيا",
          "زينب",
          "هويدا",
          "ملك",
          "جيهان",
          "جومانه",
          "سماح",
        ] as string[],
      },
      saw: {
        // عمال المنشار - saw workers
        label: "عمال منشار", // اسم المجموعة - group name
        total: 2, // الإجمالي المسجل في القسم - total registered in department
        presentNames: [
          // أسماء العمال الحاضرين - names of present workers
          "محمد حسن",
          "عبدالظاهر",
        ] as string[],
      },
      drivers: {
        // السواقين - drivers
        label: "سواقين", // اسم المجموعة - group name
        total: 7, // الإجمالي المسجل في القسم - total registered in department
        presentNames: [
          // أسماء العمال الحاضرين - names of present workers
          "محمود القرش",
          "حماده فهمى",
          "عبدالمقصود",
          " اسلام",
          " كريم",
          "اليمنى",
          "محمود عز",
          " ابراهيم وصفى",
        ] as string[],
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
        // icon = شكل الأيقونة: "plastic" (بلاستيك)، "roll" (رول)، "bag" (كيس)
        // icon = icon shape: "plastic", "roll" or "bag"
        packaging: [
          { name: "بلاستيك", quantity: 850, unit: "كجم", minimum: 0, icon: "plastic" },
          { name: "رولات ربع", quantity: 40, unit: "رول", minimum: 0, icon: "roll" },
          { name: "رولات نص", quantity: 35, unit: "رول", minimum: 0, icon: "roll" },
          { name: "أكياس كيلو", quantity: 5000, unit: "كيس", minimum: 0, icon: "bag" },
          { name: "أكياس 2 كيلو", quantity: 3000, unit: "كيس", minimum: 0, icon: "bag" },
          { name: "أكياس 3 كيلو", quantity: 2500, unit: "كيس", minimum: 0, icon: "bag" },
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
      numberFontSize: 84, // حجم رقم الرصيد الكبير - big balance number font size
      currencyFontSize: 28, // حجم "ج.م" اللي تحت الرصيد - "ج.م" under the balance
      changeFontSize: 26, // حجم رقم تغيير اليوم (+144,429 ج.م) وأيقونته - today's change badge text + icon
      changePaddingX: 20, // المسافة يمين وشمال جوه شارة التغيير - change badge horizontal padding
      changePaddingY: 10, // المسافة فوق وتحت جوه شارة التغيير - change badge vertical padding
      flowLabelFontSize: 20, // حجم كلمة "وارد اليوم" و "منصرف اليوم" - incoming / outgoing label font size
      flowIconSize: 22, // حجم السهم اللي جنب "وارد اليوم" و "منصرف اليوم" - incoming / outgoing arrow icon size
      flowNumberFontSize: 38, // حجم رقم الوارد والمنصرف - incoming / outgoing number font size
      flowCurrencyFontSize: 16, // حجم "ج.م" تحت رقم الوارد والمنصرف - "ج.م" under incoming / outgoing
      flowPaddingX: 6, // المسافة يمين وشمال جوه مربع الوارد/المنصرف - incoming / outgoing box horizontal padding
      flowPaddingY: 18, // المسافة فوق وتحت جوه مربع الوارد/المنصرف (كل ما تكبر المربع يطول) - vertical padding (bigger = taller box)
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
