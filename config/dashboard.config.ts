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
      balance: 800000, // الرصيد الحالي بالجنيه - current balance in EGP
      todayChange: 15000, // التغيير في اليوم (موجب للزيادة، سالب للنقصان) - today's change (positive for increase, negative for decrease)
    },

    // حضور الإدارة - العمال في الإدارة
    // Management attendance - office workers
    attendance: {
      present: 9, // عدد الحاضرين - number of present workers
      absent: 1, // عدد الغائبين - number of absent workers
      absentNames: [
        // أسماء الغائبين - names of absent workers
        " ايناس اشرف",
      ],
    },

    // عمال الأرضية - العمال على الأرض
    // Floor workers - workers on the floor
    floorWorkers: {
      presentToday: 25, // عدد الحاضرين اليوم - number present today
      totalRegistered: 50, // الإجمالي المسجل - total registered workers
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
          quantity: 1500, // الكمية الحالية - current quantity
          unit: "باكت", // وحدة القياس - unit of measurement
          minimum: 0, // الحد الأدنى - minimum threshold
          image: "/products/quarter.png", // مسار الصورة - image path
        },
        {
          name: "نص كيلو",
          quantity: 1200,
          unit: "باكت",
          minimum: 0,
          image: "/products/half.png",
        },
        {
          name: "كيلو",
          quantity: 800,
          unit: "باكت",
          minimum: 0,
          image: "/products/kilo.png",
        },
        {
          name: "3 كيلو",
          quantity: 450,
          unit: "باكت",
          minimum: 0,
          image: "/products/3kg.png",
        },
      ],

      // الشكاير - sacks
      sacks: [
        {
          name: "شكاير برتقال", // اسم النوع - type name
          quantity: 150, // الكمية الحالية - current quantity
          unit: "شكارة", // وحدة القياس - unit of measurement
          minimum: 0, // الحد الأدنى - minimum threshold
        },
        {
          name: "شكاير مانجو",
          quantity: 150,
          unit: "شكارة",
          minimum: 0,
        },
        {
          name: "شكاير كازوارينا",
          quantity: 160,
          unit: "شكارة",
          minimum: 300,
        },
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

    // الخزنة - بطاقة رصيد الخزنة
    // Treasury - treasury balance card
    treasury: {
      numberFontSize: 48, // حجم الرقم الكبير اللي بي الباقي - big number font size
    },

    // الحضور - بطاقة حضور الإدارة مع الدونت
    // Attendance - management attendance card with donut chart
    attendance: {
      donutSize: 100, // حجم الدونت - donut size (affects inner/outer radius calculation)
      donutThickness: 24, // سماكة الدونت - donut thickness (outerRadius - innerRadius)
      percentFontSize: 30, // حجم النسبة المئوية في وسط الدونت - percentage font size in donut center
      labelFontSize: 12, // حجم كلمات "حاضر" و "غائب" - font size for "present" and "absent" labels
    },

    // عمال الأرضية - بطاقة عمال الأرضية
    // Floor Workers - floor workers card
    floorWorkers: {
      numberFontSize: 80, // حجم الرقم الكبير لعدد العمال - big number font size for worker count
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
      unitFontSize: 14, // حجم وحدة القياس (باكت/شكارة) - unit font size
      sectionTitleFontSize: 18, // حجم عناوين الأقسام ("المنتجات المعبأة" و "الشكاير") - section title font size
    },
  },
};
