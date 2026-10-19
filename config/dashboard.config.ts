// ملف إعدادات الداشبورد - غير الأرقام هنا عشان تغير المظهر
// Dashboard settings file - edit the numbers here to change the dashboard appearance

export const dashboardConfig = {
  // ============================================================
  // الجزء الأول: البيانات (الأرقام اللي بتظهر على الشاشة)
  // Part 1: DATA (the numbers shown on the screen)
  // ============================================================

  data: {
    // رصيد الخزنة - الباقي في الخزنة والتغيير في اليوم
    // Treasury balance - money in treasury and today's change
    treasury: {
      balance: 316178, // الرصيد الحالي بالجنيه - current balance in EGP
      todayChange: 0, // التغيير في اليوم (موجب للزيادة، سالب للنقصان) - today's change (positive for increase, negative for decrease)
    },

    // حضور الإدارة - العمال في الإدارة
    // Management attendance - office workers
    attendance: {
      present: 8, // عدد الحاضرين - number of present workers
      absent: 2, // عدد الغائبين - number of absent workers
      absentNames: [
        // أسماء الغائبين - names of absent workers
        " ايناس اشرف",
        "فاطمه طلال ",
      ],
    },

    // عمال الأرضية - العمال على الأرض مقسمين حسب القسم
    // Floor workers - workers on the floor divided by department
    // عدد الحاضرين في كل قسم = عدد الأسماء في presentNames (بيتحسب لوحده، متكتبوش بإيدك)
    // Present count of each group = presentNames.length (calculated automatically)
    workers: {
      production: {
        // عمال الإنتاج - production workers
        label: "عمال إنتاج", // اسم المجموعة - group name
        total: 9, // الإجمالي المسجل في القسم - total registered in department
        presentNames: [
          // أسماء العمال الحاضرين - names of present workers
          "الطيب",
          "شعبان",
          "محمود عابدين",
          "فايز زكى",
          "عبدالظاهر",
          "عبدالناصر",
          " احمد حمدى ",
          "محمد حسين",
          "محمد الطيب",
          " حسن فضيل",
        ],
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
        ],
      },
      saw: {
        // عمال المنشار - saw workers
        label: "عمال منشار", // اسم المجموعة - group name
        total: 2, // الإجمالي المسجل في القسم - total registered in department
        presentNames: [
          // أسماء العمال الحاضرين - names of present workers
          "محمد حسن",
          "عبدالظاهر",
        ],
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
        ],
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
    ],

    // المخزون - المنتجات والشكاير
    // Stock - products and sacks
    stock: {
      // المنتجات المعبأة - packaged products
      products: [
        {
          name: "ربع كيلو", // اسم المنتج - product name
          quantity: 2007, // الكمية الحالية - current quantity
          unit: "باكت", // وحدة القياس - unit of measurement
          minimum: 0, // الحد الأدنى - minimum threshold
          image: "/products/quarter.png", // مسار الصورة - image path
        },
        {
          name: "نص كيلو",
          quantity: 2474,
          unit: "باكت",
          minimum: 0,
          image: "/products/half.png",
        },
        {
          name: "كيلو",
          quantity: 716,
          unit: "باكت",
          minimum: 0,
          image: "/products/kilo.png",
        },
        {
          name: "2 كيلو", // اسم المنتج - product name
          quantity: 677, // الكمية الحالية - current quantity
          unit: "باكت", // وحدة القياس - unit of measurement
          minimum: 0, // الحد الأدنى - minimum threshold
          image: "/products/2kg.png", // مسار الصورة (لو مش موجودة بتظهر أيقونة مكانها) - image path (icon shown if missing)
        },
        {
          name: "3 كيلو",
          quantity: 573,
          unit: "باكت",
          minimum: 0,
          image: "/products/3kg.png",
        },
      ],

      // الشكاير - sacks
      // كل نوع شكاير متقسم نصين: ناعم (fine) وخشن (coarse)، ولكل نص كمية وحد أدنى
      // Each sack type is split into 2 halves: fine (ناعم) and coarse (خشن), each with its own quantity and minimum
      // fine = ناعم ، coarse = خشن ، quantity = الكمية ، minimum = الحد الأدنى
      sacks: [
        { name: "شكاير برتقال",   unit: "شكارة", fine: { quantity: 814, minimum: 0 }, coarse: { quantity: 490, minimum: 0 } }, // ناعم: الكمية والحد الأدنى - خشن: الكمية والحد الأدنى
        { name: "شكاير مانجو",    unit: "شكارة", fine: { quantity: 66, minimum: 0 }, coarse: { quantity: 101, minimum: 0 } },
        { name: "شكاير كازوارينا", unit: "شكارة", fine: { quantity: 1058, minimum: 0 }, coarse: { quantity: 82, minimum: 0 } },
      ],
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
    },

    // الكروت - البطاقات اللي بتظهر البيانات
    // Cards - the cards showing data
    cards: {
      topRowHeight: "1.2fr", // ارتفاع الصف العلوي بالنسبة للصف السفلي - top row height relative to bottom row
      warehouseHeight: "1fr", // ارتفاع قسم المخزن - warehouse section height
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
    treasury: {
      numberFontSize: 48, // حجم الرقم الكبير اللي بي الباقي - big number font size
    },

    // الحضور - بطاقة حضور الإدارة مع الدونت
    // Attendance - management attendance card with donut chart
    attendance: {
      donutSize: 128, // حجم الدونت الثابت بالبكسل - fixed donut size in pixels (128px x 128px)
      donutThickness: 13, // سماكة الدونت بالبكسل - donut thickness in pixels (ring thickness)
      percentFontSize: 28, // حجم النسبة المئوية في وسط الدونت - percentage font size in donut center
      labelFontSize: 12, // حجم كلمات "حاضر" و "غائب" - font size for "present" and "absent" labels
    },

    // عمال الأرضية - بطاقة عمال الأرضية
    // Floor Workers - floor workers card
    floorWorkers: {
      groupTitleFontSize: 16, // حجم اسم القسم (عمال إنتاج، تعبئة...) - group name font size
      groupNumberFontSize: 20, // حجم رقم الحاضرين في كل قسم - present count font size per group
      nameChipFontSize: 12, // حجم أسماء العمال الحاضرين - present worker name chip font size
      minNameChipFontSize: 10, // أصغر حجم للأسماء لو مش كافية المساحة - smallest chip font size when names don't fit
    },

    // الأفران - بطاقة الأفران
    // Kilns - kilns card
    kilns: {
      countFontSize: 30, // حجم أرقام الأعداد (شغالة/صيانة/متوقفة) - font size for count numbers
      kilnChipHeight: 32, // ارتفاع شريحة الفرن - kiln chip height
    },

    // المنتجات - بطاقات المنتجات في المخزن
    // Products - product cards in warehouse
    products: {
      imageWidth: 48, // عرض صورة المنتج - product image width
      imageHeight: 48, // ارتفاع صورة المنتج - product image height
      nameFontSize: 18, // حجم اسم المنتج - product name font size
      numberFontSize: 36, // حجم رقم الكمية - quantity number font size
      sackNumberFontSize: 28, // حجم أرقام الناعم والخشن في كروت الشكاير
      unitFontSize: 14, // حجم وحدة القياس (باكت/شكارة) - unit font size
      sectionTitleFontSize: 18, // حجم عناوين الأقسام ("المنتجات المعبأة" و "الشكاير") - section title font size
    },
  },
};
