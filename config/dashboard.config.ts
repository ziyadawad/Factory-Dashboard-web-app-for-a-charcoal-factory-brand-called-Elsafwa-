// ملف إعدادات الداشبورد - غير الأرقام هنا عشان تغير المظهر
// Dashboard settings file - edit the numbers here to change the dashboard appearance

import type {
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
  ConfigBatchType,
  ConfigErpCharity,
  ConfigErpStockMap,
  ConfigAttendanceSection,
} from "@/lib/types";

// ===== أنواع الخشب (الفحم): لون وأيقونة كل نوع - wood (charcoal) types: each one's color and icon =====
// القايمة دي هي production.types وهي نفسها erp.batches.types (الترتيب والأسامي التانية "aliases").
// الأيقونة: "orange" برتقانة بورقة، "mango" مانجاية، "guava" جوافة (نصها مقطوع)، "grill" شواية بنار (الجازورينا للشوي).
// أي نوع مش في القايمة بيظهر بنقطة رمادي (defaultTypeColor). اللون بالشكل "#RRGGBB"
// This list is production.types and also erp.batches.types (order and alternative spellings). Icons: "orange",
// "mango", "guava" (half cut), "grill" (a grill with a flame: جازورينا is for grilling). Unknown types get a gray dot
const PRODUCTION_TYPES: ConfigBatchType[] = [
  { label: "برتقال", color: "#F97316", icon: "orange" }, // برتقالي - orange
  { label: "مانجا", aliases: ["مانجو"], color: "#FACC15", icon: "mango" }, // أصفر - yellow
  { label: "جازورينا", aliases: ["كازوارينا", "كازورينا"], color: "#22C55E", icon: "grill" }, // أخضر - green
  { label: "جوافة", color: "#F43F5E", icon: "guava" }, // أحمر وردي - pink red
];
const DEFAULT_TYPE_COLOR = "#9CA3AF"; // نوع مش معروف: نقطة رمادي - an unknown type: a gray dot

export const dashboardConfig = {
  // ============================================================
  // الحضور: كل قسم بأكواد البصمة (Attendance Device ID في ERPNext)
  // Attendance: each section by device code (ERPNext Employee "Attendance Device ID")
  // - اكتب الكود لوحده (193) أو من لحد كده [1001, 1014] (الاتنين داخلين)
  // - اسم وحضور كل موظف من ERPNext: حاضر = بصمة النهارده أو Present / Half Day / Work From Home،
  //   إجازة = On Leave (مش بتتحسب في النسبة)، غائب = Absent أو مفيش لا بصمة ولا حضور
  // - أي حد حاضر النهارده وكوده مش هنا (أو مالوش كود) بيتحط لوحده في "عمال يومية"
  // - وأي موظف Active مالوش قسم (لا بالكود ولا بالفرع) والـ ctc بتاعه <= salaries.dailyRateMaxCtc بيتحط في
  //   "عمال يومية" على طول، حتى قبل أول بصمة (فالعامل الجديد مش محتاج يتكتب كوده هنا)
  // - Active employees only; anyone present today whose code isn't listed (or has none) goes to "عمال يومية";
  //   so does any Active employee with no section (by code or branch) whose ctc <= salaries.dailyRateMaxCtc,
  //   even before his first punch (a new daily worker needs no config change)
  // ============================================================
  attendance: {
    sections: {
      management: { label: "الإدارة", codes: [193, [1001, 1014]] } as ConfigAttendanceSection, // حضور الإدارة
      // مصنع إنتاج - 3 كروت فرعية جوه "حضور عمال" - production factory, 3 sub-cards inside the workers card
      production: { label: "عمال إنتاج", codes: [[1015, 1026]] } as ConfigAttendanceSection, // مصنع إنتاج — عمال إنتاج
      workshop: { label: "ورشة", codes: [[1027, 1029]] } as ConfigAttendanceSection, // مصنع إنتاج — ورشة
      operators: { label: "أوبريتر", codes: [[1040, 1045]] } as ConfigAttendanceSection, // مصنع إنتاج — أوبريتر
      packing: { label: "عمال تعبئة", codes: [[1030, 1039]] } as ConfigAttendanceSection, // عمال تعبئة
      daily: {
        label: "عمال يومية",
        codes: [
          [1055, 1060],
          1066, // احمد ابراهيم (ميجا) — HR-EMP-00209
        ],
      } as ConfigAttendanceSection, // عمال يومية (+ أي حاضر مالوش قسم، + salaries.dailyRateMaxCtc)
      // كروت لوحدها برّه "حضور عمال" ومش داخلة في إجمالي العمال - separate cards, not in the workers total
      drivers: { label: "سواقين", codes: [[1046, 1048]] } as ConfigAttendanceSection, // سواقين
      reps: { label: "مناديب", codes: [[1049, 1054]] } as ConfigAttendanceSection, // مناديب
      guards: { label: "غفر", codes: [[1061, 1063]] } as ConfigAttendanceSection, // غفر
      // خارج البصمة: مالوش أكواد، الناس فيه من outsideBiometric تحت - no codes: its people come from outsideBiometric
      outside: { label: "خارج البصمة", codes: [] } as ConfigAttendanceSection, // خارج البصمة
    },
    // ===== خارج البصمة: موظفين مش على جهاز البصمة (Employee ID ← الطريقة) =====
    // - "fixed": حاضر دايما، وبياخد مرتبه كامل حتى لو غاب (عمره ما بيتخصم منه غياب)
    // - "default_present": حاضر كل يوم شغل من غير بصمة، وغائب بس لو الـ HR سجّل له Attendance بحالة Absent اليوم ده
    //   (On Leave = إجازة)
    // - مش بيتحسبوا في أي قسم تاني، وعمرهم ما بيظهروا في "مبصمش النهارده"
    // ===== Outside the biometric: employees not on the device (Employee ID -> mode) =====
    // - "fixed": always present, full salary even when absent (never an absence deduction)
    // - "default_present": present every working day with no punch; absent only when HR submits an Attendance
    //   with status Absent for that day (On Leave = leave)
    // - never counted in any other section, never listed as "not punched today"
    outsideBiometric: {
      "محمد عبدالمقصود محمد": "fixed", // محمد عبدالمقصود محمد - سواق (كود 1046)
      "فضل عمرو فضل": "default_present", // فضل عمرو فضل
      "صلاح عبدالراحمن": "default_present", // صلاح محمد عبدالرحمن — برّه المصنع
      "إسماعيل السيد إسماعيل": "fixed", // الحاج أشرف عوض — رئيس مجلس الإدارة
    } as Record<string, "fixed" | "default_present">,
    // اسم العرض بدل اسم ERPNext (Employee ID ← الاسم) في الكروت واللوحات والمرتبات وكشف الإكسيل.
    // لوحة التفاصيل بتكتب اسم ERPNext تحته في سطر صغير
    // Display name instead of the ERPNext name (Employee ID -> name) on cards, panels, salaries and the Excel sheet;
    // the details panel shows the ERPNext name under it in a small line
    displayNames: {
      "إسماعيل السيد إسماعيل": "الحاج أشرف عوض", // الحاج أشرف عوض — رئيس مجلس الإدارة
    } as Record<string, string>,
    // مستبعدين من الحضور خالص (مش حاضر ولا غائب ولا في أي إجمالي) - اكتب Employee ID من ERPNext
    // Excluded from attendance entirely (not present, not absent, in no total) - ERPNext Employee IDs
    excludedEmployees: [
      "HR-EMP-00197", // عيد صقر (كود 1027)
      "HR-EMP-00201", // فاطمة محمد هاشم (كود 1057)
      "احمد حمدي ابراهيم", // احمد حمدي ابراهيم (كود 1059)
      // محمد عبدالمقصود محمد (سواق، كود 1046) اتنقل لـ "خارج البصمة" (outsideBiometric) - moved to outsideBiometric
    ],
    factoryLabel: "مصنع إنتاج", // اسم الكارت اللي فيه عمال إنتاج والورشة والأوبريتر - factory card name
    // الفرع (Branch في ERPNext) ← القسم: بيتستخدم بس لو كود البصمة مش في الجدول فوق أو فاضي
    // (اللي كوده فاضي بيتحط بالفرع بس لو حاضر النهارده، عشان الغايبين من غير كود ميملوش الكروت)
    // لو لا الكود ولا الفرع اتطابقوا، الحاضر بيروح "عمال يومية" زي الأول
    // الأسامي بتتطابق بعد التوحيد (أ/إ/آ = ا، ة = ه، ى = ي، والمسافات) فـ"مصنع الإنتاج" = "مصنع الانتاج"
    // عشان تضيف فرع: "اسم الفرع": "اسم القسم" (management / production / workshop / operators / packing / daily / drivers / reps / guards / outside)
    // Branch -> section, used only when the device code is empty or not in the table above
    branchSections: {
      "مصنع التعبئة": "packing", // مصنع التعبئة ← عمال تعبئة
      "مصنع الإنتاج": "production", // مصنع الإنتاج ← مصنع إنتاج / عمال إنتاج
    } as Record<string, string>,
    // ===== القسم من البايو (أول قاعدة، قبل كود البصمة والفرع) =====
    // ملف الموظف في ERPNext ← تاب Profile ← Bio / Cover Letter: لو فيه اسم قسم أو كلمة من دول، الموظف بيروح القسم ده
    // - بيتشال الـ HTML وبيتوحد العربي (أ/إ/آ = ا، ة = ه، ى = ي، والمسافات) قبل المقارنة، فـ"الغفر" = "غفر"
    // - اسم القسم نفسه (label) بيتطابق لوحده، والكلمات هنا زيادة عليه
    // - لو أكتر من كلمة اتطابقت، الأطول هي اللي بتكسب ("عمال يوميه" قبل "يوميه")
    // - لو البايو مفيهوش ولا كلمة: القواعد القديمة (كود البصمة ← الفرع ← قاعدة اليومية)
    // - "خارج البصمة" من البايو = default_present (حاضر إلا لو اتسجل Absent)، إلا لو مكتوب في outsideBiometric فوق
    // ===== Section from the bio (FIRST rule, before the device code and the branch) =====
    // Employee -> Profile tab -> Bio / Cover Letter: a section label or one of these words puts him in that section
    // (HTML stripped, Arabic normalized; the longest match wins; no match -> the old rules)
    bioSections: {
      management: ["اداره", "الاداره"], // الإدارة
      production: ["انتاج", "عمال انتاج"], // عمال إنتاج
      workshop: ["ورشه"], // ورشة
      operators: ["اوبريتر", "اوبراتور"], // أوبريتر
      packing: ["تعبئه", "تعبيه"], // عمال تعبئة
      drivers: ["سواق", "سائق"], // سواقين
      reps: ["مندوب", "مناديب"], // مناديب
      daily: ["يوميه"], // عمال يومية
      guards: ["غفر", "غفير"], // غفر
      outside: ["خارج البصمه"], // خارج البصمة
    } as Record<string, string[]>,

    // ===== تفاصيل الحضور (الضغط على كارت حضور) - attendance details (click an attendance card) =====
    // أول يوم البصمة اشتغلت فيه (أول Employee Checkin في ERPNext). الأيام اللي قبله مش بتتحسب حضور ولا غياب
    // First day of the biometric (the first Employee Checkin in ERPNext); earlier days count as neither present nor absent
    trackingStartDate: "2026-10-28",
    // أيام الإجازة الأسبوعية (بالإنجليزي): مش بتتحسب غياب ولا حضور. مثال يومين: ["Friday", "Saturday"]
    // Weekly day(s) off (English day names): never counted as absent or present
    weeklyOff: ["Friday"] as string[],
    // نص يوم: لو الموظف بصم بصمة واحدة بس في اليوم وكانت قبل الساعة دي = نص يوم غياب (في المرتب، والتقويم بيعلّم عليه)
    // النهارده مش بيتحسب نص يوم لأن اليوم لسه مخلصش. Attendance بحالة "Half Day" = نص يوم برضه
    // Half day: a single punch that day before this time = half a day absent (salary; marked on the calendar).
    // Today never counts (the day isn't over). An Attendance marked "Half Day" also counts as half
    // ⚠️ مقفول دلوقتي: من 28/10 لـ 8/11 ‏82% من أيام الموظفين فيها بصمة واحدة بس (معظمهم مش بيبصموا انصراف)،
    // فلو اشتغل هيخصم نص يوم من أغلب الناس كل يوم. خليه true لما البصمة تبقى حضور + انصراف
    // OFF for now: 82% of employee-days (Oct 28 - Nov 8) have a single punch (most never punch out), so it would
    // dock half a day from almost everyone. Set true once people punch in and out
    halfDay: { enabled: false, singlePunchBefore: "12:00" },
  },

  // ============================================================
  // المرتبات (جوه لوحة تفاصيل الحضور بس، بزرار "💰 المرتب") - للإدارة، قراية بس من ERPNext
  // Salaries (only inside the attendance details panel, behind the "💰 المرتب" button) - read-only
  // - عمرها ما بتظهر على الشاشة الرئيسية ولا في اللف، وبتتجاب من /api/salaries بس لما الزرار يتداس
  // - الأجر الشامل = base + custom_allowance من آخر Salary Structure Assignment (نفس معادلة Ts في ERPNext)،
  //   ولو مفيش هيكل: Cost to Company (ctc) من ملف الموظف. ولو الاتنين موجودين ومختلفين بيظهر تحذير
  // - المرتب لحد النهارده = (الشامل ÷ daysPerMonth) × الأيام اللي عدّت (بالجمعة، من التعيين لو بعد أول الشهر) − خصم الغياب
  //   (أيام الجمعة اللي في الكشف الورق مش متسجلة في ERPNext)
  // - خصم الغياب = الشامل ÷ daysPerMonth × أيام الغياب (من البصمة، بنفس قواعد لوحة الحضور + نص اليوم فوق؛
  //   الإجازة في غير يوم الجمعة بتتخصم زي الغياب، والجمعة عمرها ما بتتحسب غياب)
  // - السلف = Loan Disbursement على advancesAccount للموظف الشهر ده (من GL Entry)
  //   + Employee Advance المدفوعة الشهر ده (لو اليوزر يقدر يقراها)
  // - قسط القرض = Loan Repayment على نفس الحساب الشهر ده لسلف اتصرفت قبل الشهر ده (سلف الشهر نفسه محسوبة فوق)
  // - الإضافات والخصومات = كل Additional Salary متسجلة (submitted) والـ payroll_date في الشهر ده:
  //   Earning بتتزود و Deduction بتتخصم، وبتدخل في "المرتب لحد النهارده" و"الصافي المتوقع"
  // - Salary Adjustment (DocType مخصوص، submitted بس): مكافأة بتتزود، خصم بيتخصم (اللي تاريخها في الشهر ده)،
  //   والقسط بيتخصم monthly_installment كل شهر من شهر تاريخه لحد ما total_amount يخلص (آخر شهر الباقي بس)
  // - الإضافي = كل إضافي (Salary Adjustment، submitted) تاريخه في الشهر ده، اتصرف ولا لأ (حقل paid مش بيتقري)؛
  //   مش داخل في "المرتب النهائي"، و"الإجمالي مع الإضافي" = المرتب النهائي + الإضافي
  // - عمال اليومية: اليومية من ملف الموظف (dailyRateField). العامل يبقى يومية لو اليومية > 0 ومالوش مرتب شهري
  //   (أو هيكله من dailyStructures، أو في قسم عمال يومية من غير مرتب). المرتب النهائي = أيام الحضور × اليومية
  //   − الخصومات (خصم Salary Adjustment الشهر ده) + المكافآت. أيام الحضور = نفس قواعد الحضور (نص اليوم = 0.5)
  // - لحد النهارده = الشامل ÷ 30 × الأيام اللي عدّت − الغياب − الخصومات (خصم + سلف) − قسط الشهر + المكافآت
  // - الصافي المتوقع = الشامل − الغياب − الخصومات − قسط الشهر + المكافآت
  //   Salary Adjustment (custom, submitted only): مكافأة added, خصم subtracted (dated this month); قسط subtracts
  //   monthly_installment every month from the month of its date until total_amount is paid. إضافي is paid in cash:
  //   overtime = every إضافي dated this month (paid or not); never in the final salary, added in "total with overtime".
  //   Daily workers: rate from Employee.<dailyRateField>; final = present days × rate − خصم + مكافأة (this month)
  // - التأمينات: مش متسجلة في ERPNext بشكل يتقري = 0 ومكتوب "يدوي"
  // Salary = base + custom_allowance of the latest assignment; absence = salary / daysPerMonth × absent days
  // (biometric, same rules as the attendance panel); advances = Loan Disbursements on advancesAccount this month;
  // (+ paid Employee Advances when readable); loan installment = Loan Repayments this month of loans disbursed before
  // this month; every submitted Additional Salary with payroll_date this month: Earning added, Deduction subtracted;
  // insurance = manual
  // ============================================================
  salaries: {
    daysPerMonth: 30,
    // هياكل المرتبات اللي معناها عامل يومية (اليومية حسابها خارجي) - structures that mean a daily worker
    dailyStructures: ["عمال يومية"] as string[],
    // حقل اليومية في ملف الموظف (Employee) - the daily rate field on Employee
    dailyRateField: "custom_اليومية",
    // بدل الجمعة: الجمعة إجازة أسبوعية، واللي يشتغلها (بصمة واحدة على الأقل أو Attendance حاضر) بياخد يوم زيادة
    // فوق مرتبه: بدل الجمعة = عدد الجمع × (الأجر الشامل ÷ fridayDayRateDivisor)، ونص اليوم (نفس قاعدة halfDay) = 0.5.
    // بيتزود على المرتب النهائي (والإجمالي مع الإضافي) ومالوش دعوة بالغياب (الجمعة عمرها ما بتتحسب غياب).
    // للشهريين بس: خارج البصمة "fixed" مش داخلين، وعمال اليومية الجمعة عندهم يوم عادي × اليومية (من غير دبل)
    // Friday pay: Friday is the weekly holiday; working it (a punch or a Present Attendance) earns an extra day on top
    // of the salary: count × (salary ÷ fridayDayRateDivisor), half day = 0.5. Added to the final salary, never to
    // absence. Monthly staff only: "fixed" outside-the-biometric excluded; daily workers get it as a normal day
    fridayWorkPay: true,
    fridayDayRateDivisor: 30,
    // أقصى ctc (Cost to Company في ملف الموظف) لعامل يومية: الموظف اللي مالوش قسم (لا كود ولا فرع) والـ ctc بتاعه
    // أقل من أو يساوي ده بيتحط في "عمال يومية" تلقائي حتى قبل أول بصمة. 0 = اللي مالوش مرتب شهري بس
    // The highest ctc of a daily worker: an employee with no section (no code, no branch) and ctc <= this goes to
    // "عمال يومية" automatically, even before his first punch. 0 = only those with no monthly salary
    dailyRateMaxCtc: 0,
    // عمال اليومية بيتقبضوا كاش يوم dailyPayDay عن الأسبوع اللي فات كله (من dailyWeekStart لليوم اللي قبله)
    // يعني السبت بيقبضوا من السبت اللي قبله للجمعة. الجمعة بتتحسب بس لو بصم فعلا، ونص اليوم = 0.5
    // عمود "مستحق هذا الأسبوع": يوم القبض كله (لحد 23:59) بيفضل يعرض الأسبوع اللي خلص (اللي بيتقبض النهارده)،
    // ومن اليوم اللي بعده بيبدأ الأسبوع الجديد (من يوم القبض) من الصفر
    // "مستحق هذا الأسبوع": all of pay day (until 23:59) still shows the week that just ended (paid that day);
    // from the next day the new week (starting on pay day) starts from zero
    // إضافي الشهريين بيتقبض كاش بنفس الأسبوع ونفس القاعدة (عمود "إضافي هذا الأسبوع")، ومش داخل في المرتب النهائي
    // Monthly staff overtime is paid in cash on the same week and rule ("إضافي هذا الأسبوع"), never in the final salary
    // Daily workers are paid in cash on dailyPayDay for the previous full week (dailyWeekStart → the day before it):
    // Saturday pays Saturday → Friday. A Friday counts only when he actually punched; half day = 0.5
    dailyPayDay: "Saturday",
    dailyWeekStart: "Saturday",
    advancesAccount: "1620 - سلف الموظفيين - AC", // حساب سلف الموظفين - employee advances account
    // مكونات Additional Salary: أي مكون مش مكتوب هنا قيمته فلوس على طول، والإشارة من نوعه (Earning + / Deduction −)
    // Additional Salary components: any component not listed here is a direct amount; the sign comes from its type
    additionalSalary: {
      // المبلغ عدد أيام: × الشامل ÷ الرقم ده (زي معادلات ERPNext) - the amount is a number of days: × Ts / this number
      dayComponents: {
        "عدد ايام الاضافي": 30,
        "عدد ايام الجزاء": 30,
        "عدد ايام الجزاء عمال يومية": 6,
      } as Record<string, number>,
      // المبلغ عدد ساعات: × الأساسي ÷ 30 ÷ 8 (زي ERPNext) - the amount is a number of hours: × base / 30 / 8
      hourComponents: ["عدد ساعات التأخير"] as string[],
      // متتحسبش: الغياب بيتخصم من البصمة فوق (عشان ميتخصمش مرتين) - skipped: absence already comes from the fingerprint
      skipComponents: ["عدد ايام الغياب", "قيمة الغياب", "عدد ايام الغياب عمال يومية", "قيمة الغياب عمال يومية"] as string[],
      // الاسم اللي بيظهر في اللوحة (غير كده بيظهر اسم المكون) - short label shown in the panel (else the component name)
      labels: {
        "عدد ايام الاضافي": "إضافي",
        "قيمة الاضافي": "إضافي",
        "عدد ايام الجزاء": "جزاء",
        "قيمة الجزاء": "جزاء",
        "عدد ساعات التأخير": "تأخير",
        "قيمة ساعات التأخير": "تأخير",
        "حوافز": "حوافز",
        "ضريبة شهرية": "ضريبة",
      } as Record<string, string>,
    },
    cacheSeconds: 0, // 0 = من غير كاش: أي تعديل في ERPNext يظهر على طول - 0 = no cache: ERPNext edits show at once
  },

  // ============================================================
  // الربط مع ERPNext - كل رقم بنختار هو جاي منين
  // ERPNext link - choose where each number comes from
  // source: "erp" = من ERPNext، source: "manual" = من الأرقام اللي في الجزء الأول تحت
  // لو ERPNext وقع بيفضل يظهر آخر رقم اتجاب، ولو مفيش يظهر رقم الكونفج، وتظهر علامة "غير متصل"
  // If ERPNext fails the last good value stays (or the config value), and the "غير متصل" badge shows
  // ============================================================

  erp: {
    // كل 60 ثانية الشاشة بتجيب البيانات الجديدة من غير ما الصفحة تعمل reload (الشاشة الكاملة بتفضل شغالة)
    // والتاب المستخبي أو صفحة مش ظاهرة (IT / الإنتاج) مبيسألش خالص - a hidden tab or an off-screen page never polls
    // Every 60 s the screen fetches fresh data without reloading the page (fullscreen stays on)
    refreshSeconds: 60,
    // السيرفر (والـ CDN) بيكلم ERPNext مرة واحدة بالكتير كل الثواني دي (أقل حاجة 60 عشان حد Vercel Hobby)
    // The server (and the CDN) calls ERPNext at most once per this many seconds (60 minimum: Vercel Hobby limits)
    cacheSeconds: 60,

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

    // الإنتاج والأفران (الصفحة 2 + كارت "إنتاج النهارده" في الرئيسية) - بيتحدث كل production.refreshSeconds
    // خروج طرحات = سجلات "Kiln Exit": سجل لكل طرحة، فيه نوع الفحم (charcoal_type: برتقال / مانجا / جازورينا / جوافة)
    // والفرن (kiln = Workstation) ووقت الخروج (exit_time) والوزن بالكيلو (weight_kg). النهارده / الشهر بتوقيت القاهرة
    // فالأرقام بتتصفر لوحدها. السجلات الملغية (Cancelled) مش بتتعد. سجل من غير وزن (القديم) بيتعد طرحة
    // ويتكتب "بدون وزن" ومش بيدخل في الأطنان ولا متوسط الوزن
    // يوزر الداشبورد لازم يبقى ليه صلاحية Read على Kiln Exit، وإلا الصفحة تكتب "غير متصل"
    // لو ERPNext وقع بيفضل آخر رقم نجح مع "غير متصل"، ولو مفيش الكارت يكتب "غير متصل" (مش أصفار)
    // Production: "Kiln Exit" records (one per batch) with charcoal_type, kiln, exit_time and weight_kg.
    // Today / this month are in Cairo time. A record with no weight (old ones) counts as a batch, shows
    // "بدون وزن" and is left out of the tons and the average weight. On failure the last good result stays
    // with a "غير متصل" badge, else "غير متصل" (never fake zeros)
    batches: {
      source: "erp",
      exitsDoctype: "Kiln Exit", // سجل لكل ترول (الطرحة = 2 أو 3 ترولات بنفس batch_id)
      typeField: "charcoal_type", // نوع الفحم (Select) - the charcoal type field
      // الوزن بالكيلو (Float). لو الحقل لسه مش موجود في الـ DocType كل الطرحات بتبقى "بدون وزن" لحد ما يتضاف
      // Weight in kg (Float). While the DocType has no such field every batch shows "بدون وزن" until it is added
      weightField: "weight_kg",
      // ممتلئ / فاضي / الترول / الغرفة (بتظهر في تفاصيل الطرحة). أي حقل مش موجود في الـ DocType بيتساب فاضي
      // Full / empty / trolley / room (shown in the exit details). A field the DocType lacks is simply left empty
      fullWeightField: "gross_kg", // الوزن ممتلئ (كجم)
      emptyWeightField: "وزن_الترول_الفاضي_كجم", // وزن الترول الفاضي (كجم) - اسم الحقل في ERPNext عربي
      trolleyField: "trolley",
      roomField: "room",
      // الطرحة: batch_id (Data "الطرحة") بيربط ترولات نفس الطرحة، وbatch_size (Int "عدد الترولات") 2 أو 3
      // السجلات اللي من غيرهم (القديمة) بتتجمع بقاعدة production.batchWindowMinutes / maxTrolleysPerBatch
      // The batch: batch_id (Data) links the trolleys of one batch, batch_size (Int) = 2 or 3.
      // Records without them (older ones) are grouped by the production.batchWindowMinutes / maxTrolleysPerBatch rule
      batchIdField: "batch_id",
      batchSizeField: "batch_size",
      // الأنواع بتتقري من خيارات charcoal_type في الـ DocType نفسه، فأي نوع جديد بيظهر لوحده بـ defaultTypeColor
      // واللي هنا بيحدد الترتيب واللون للأنواع المعروفة (الأسامي بتتطابق بعد توحيد الحروف: ة = ه، أ = ا ...)
      // Types are read from the DocType's charcoal_type options, so a new option shows up on its own with
      // defaultTypeColor; this list sets the order and color of the known ones (names matched after normalizing)
      types: PRODUCTION_TYPES, // الألوان والأيقونات فوق خالص (PRODUCTION_TYPES) - colors and icons at the top of this file
      defaultTypeColor: DEFAULT_TYPE_COLOR, // لون أي نوع جديد مش في القايمة (رمادي) - any new type not listed (gray)
      optionsCacheMinutes: 10, // كل قد ايه نقرا خيارات النوع من ERPNext - how often to re-read the options
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
      // ===== صدقات الخزنة اللي بتتسجل لوحدها (Server Scripts في reports/erpnext-scripts/charity-auto.md) =====
      // مستند خزنة (Payment Entry / Journal Entry / سطر صدقات في Expense Claim) يبقى صدقة لو فيه سطر على
      // accounts.charityAccounts (5222 - صدقات) وفي نفس الوقت دخل أو خرج من treasuryAccounts.
      // الصندوق من كلام المستند (البيان / الملاحظات / المرجع / اسم الحساب) بعد توحيد العربي، بالكلمات دي.
      // لو مفيش كلمة (أو أكتر من صندوق) مفيش حاجة بتتسجل، وبيظهر على الداشبورد "⚠ صدقة من غير صندوق".
      // ⚠️ لو غيرت الكلمات هنا لازم تولّد السكربتات تاني وتلزقها في ERPNext عشان يفضلوا زي بعض
      // Treasury charity recorded automatically (Server Scripts): a voucher is charity when it has a line on
      // accounts.charityAccounts AND moves money in/out of treasuryAccounts. The fund comes from the voucher text
      // (normalized Arabic) by these words; no word (or several funds) = nothing created, listed as "صدقة من غير صندوق"
      auto: {
        treasuryAccounts: ["1110 - الخزينة - AC"], // الخزنة - the treasury
        // من التاريخ ده بس بيتعرض "صدقة من غير صندوق" (يوم ما السكربتات اتلزقت) - only from this date
        since: "2026-11-17",
        fundWords: {
          "خزينة حصة الانتاج": ["انتاج"], // خزينة حصة الانتاج
          "خزينة حصة التعبئة": ["تعبئه", "تعبيه"], // خزينة حصة التعبئة
          // خارجية 1 / خارجيه1 / خارجيه١ / خارجي 1 كلهم واحد (المسافة والأرقام العربي مش بيفرقوا)
          "خزينة خارجية 1": ["خارجيه 1", "خارجي 1"], // خزينة خارجية 1
          "خزينة خارجية 2": ["خارجيه 2", "خارجي 2"], // خزينة خارجية 2
        } as Record<string, string[]>,
      },
      // ===== صدقات مصروفات الموظفين (Expense Claim) =====
      // كل سطر في جدول expenses نوعه من الأنواع دي في Expense Claim متسجل (docstatus = 1) = صرف صدقة:
      // التاريخ = expense_date، المبلغ = sanctioned_amount (أو amount)، التفاصيل = description، والصندوق من الـ description
      // بنفس كلمات fundWords فوق. لو مفيش صندوق بيظهر في "⚠ صدقة من غير صندوق" (من auto.since)
      // لو فيه Charity Transaction بنفس الصندوق والمبلغ والتاريخ ±1 يوم بيتحسب مرة واحدة (سجل الصدقات) و"⚠ متسجلة مرتين"
      // Expense Claim charity: each submitted "expenses" row of these types is one صرف (fund from its description).
      // No fund = listed under "صدقة من غير صندوق"; a matching Charity Transaction (fund, amount, date ±1) counts once
      expenseClaimTypes: ["صدقات"] as string[],
      // من التاريخ ده بس بيتحسب في الأرصدة: اللي قبله داخل في الرصيد الافتتاحي (1/10/2026)
      // Counted in the balances from this date only: anything earlier is inside the opening balance (1 Oct 2026)
      expenseClaimSince: "2026-10-01",
    } as ConfigErpCharity,

    // أرصدة المخازن (الصفحة 2) - stock balances (page 2)
    // الرقم = مجموع actual_qty لكل الأصناف اللي في itemCodes (لو أكتر من صنف بيتجمعوا)
    // warehouses فاضية [] = كل مخازن الشركة، أو اكتب اسم المخزن بالظبط زي ERPNext مثلا ["مخزن منتج تام - تعبئة - AC"]
    // الأسماء (ربع كيلو، عادي، برتقال...) لازم تبقى زي اللي في data.stock تحت بالظبط، وأي اسم مش موجود هنا بيفضل يدوي
    // Names must match data.stock below exactly; anything not listed here stays manual
    // التفاصيل والأرصدة في docs/erp-mapping.md - details in docs/erp-mapping.md
    stock: {
      // المخازن دي حمولة عربيات ومش بتتحسب في رصيد المنتجات المعبأة (والكراتين بتاعتها)
      // عربية جديدة؟ ضيف اسم المخزن بتاعها هنا بالظبط زي ERPNext. وبرّه رصيد الشكاير الرئيسي كمان، والمواد الخام مش بيتأثروا
      // Vehicle-load warehouses, excluded from packaged products and from the sacks' MAIN stock; raw materials unaffected
      excludedWarehouses: [
        "مخزن سوزوكي 1 - AC",
        "مخزن سوزوكي 2 - AC",
        "مخزن سوزوكي 3 - AC",
        "مخزن سوزوكي 4 - AC",
        "مخزن الدبابة - AC",
      ] as string[],

      // مخازن القطاعي (الشكاير بس): نفس أصناف الشكاير بالظبط، بس متخزنة في مخزن القطاعي
      // رقم الشكارة الكبير والإجمالي = المخزن الرئيسي بس (من غير القطاعي ومن غير المخازن المستبعدة فوق)
      // والقطاعي بيظهر لوحده: سطر صغير "قطاعي X" تحت كل نوع و"+ قطاعي Y" جنب الإجمالي
      // اكتب اسم المخزن بالظبط زي ERPNext (لاحظ "قطاعى" بالألف المقصورة). الحد الأدنى بيتقارن بالرئيسي بس
      // Retail warehouses (sacks only): same sack items, kept in the retail warehouse. The big sack numbers and the
      // total = MAIN only (no retail, no excludedWarehouses); retail is shown on its own. Low stock compares MAIN only
      retailWarehouses: ["مخزن قطاعى - انتاج - AC"] as string[],

      // true = القطاعي بيظهر على كروت الشكاير (سطر "قطاعي X" + "+ قطاعي Y")
      // false = الكارت زي الأول بالظبط (بأرقام الرئيسي بس) والقطاعي يظهر جوه لوحة التفاصيل بس
      // true = retail shown on the sack cards; false = the card looks exactly as before (MAIN numbers), retail only in the panel
      // متقفل: على شاشة 1366x768 كبسولة "+ قطاعي" بتزق رقم الإجمالي برّه الكارت - off: at 1366x768 the chip pushes the total out
      showRetailOnCard: false,

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
      // warehouses فاضية = كل المخازن ما عدا retailWarehouses وexcludedWarehouses (القطاعي بيتحسب لوحده)
      // empty warehouses = every warehouse except retailWarehouses and excludedWarehouses (retail is counted separately)
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
  // الإنتاج والأفران - صفحة الإنتاج وكارت "إنتاج النهارده" في الرئيسية (البيانات من erp.batches و erp.kilns)
  // Production - the production page and the main page "إنتاج النهارده" card (data from erp.batches and erp.kilns)
  // ============================================================

  production: {
    refreshSeconds: 30, // الشاشة بتسأل كل 30 ثانية (وصفحة الإنتاج ظاهرة بس) - every 30 s, only while the production page is shown
    cacheSeconds: 60, // السيرفر والـ CDN بيكلموا ERPNext مرة كل 60 ثانية بالكتير - ERPNext is asked at most once per 60 s
    // رسم الإنتاج بالساعة النهارده: من الساعة دي لحد الساعة دي (طرحة قبل/بعد كده بتدخل في أول/آخر عمود)
    // Today's hourly chart: from this hour to this hour (exits outside go into the first / last bar)
    hourFrom: 6,
    hourTo: 22,
    // ===== الطرحة = 2 أو 3 ترولات من نفس الفرن (كل وزنة = ترول واحد) =====
    // السجلات القديمة من غير batch_id بتتجمع كده: نفس الفرن (ونفس الغرفة لو مكتوبة) وكل ترول خارج في حدود
    // batchWindowMinutes دقيقة من الترول اللي قبله = نفس الطرحة، وبحد أقصى maxTrolleysPerBatch ترول في الطرحة.
    // وفي شاشة الأوبريتر: الطرحة بتفضل "مفتوحة" (الوزنة الجاية بتروحلها) لحد ما تكمل أو يعدي الوقت ده من آخر ترول
    // A batch = 2 or 3 trolleys from one kiln (each weighing = one trolley). Older records without batch_id group by:
    // same kiln (+ same room when set), each trolley within batchWindowMinutes of the previous one, at most
    // maxTrolleysPerBatch trolleys. On the operator screen a batch stays open until full or this long after its last trolley
    batchWindowMinutes: 15, // دقايق بين ترول والتاني في نفس الطرحة - minutes between trolleys of one batch
    // ترتيب الطرحة في اليوم (بالوقت): "الطرحة الأولى"، "الطرحة التانية"... وبعد آخر كلمة "الطرحة 11"، "الطرحة 12"
    // A batch's order in its day (by time); past the end of this list "الطرحة 11", "الطرحة 12"...
    // ألوان وأيقونات الأنواع (كروت الطرحات، آخر وزنة، التفاصيل، ملخص الشهر، شاشة الأوبريتر، التنبيه) - من PRODUCTION_TYPES فوق
    // Type colors and icons (batch cards, last weighing, details, month summary, operator app, alert) - PRODUCTION_TYPES above
    types: PRODUCTION_TYPES,
    defaultTypeColor: DEFAULT_TYPE_COLOR,
    batchOrdinals: ["الأولى", "التانية", "التالتة", "الرابعة", "الخامسة", "السادسة", "السابعة", "التامنة", "التاسعة", "العاشرة"],
    maxTrolleysPerBatch: 3, // أكبر عدد ترولات في الطرحة (الأوبريتر بيختار من 2 لحد كده) - most trolleys per batch (operator picks 2..this)
    glowSeconds: 6, // كارت "آخر وزنة" بينور كام ثانية لما طرحة جديدة تخرج - how long "آخر وزنة" glows on a new exit
    // جوه المصنع: أحداث "kiln_exit" على طول من الإيجنت ({it.cameraBaseUrl}/status.json كل liveSeconds، مهلة liveTimeoutMs)
    // فالطرحة الجديدة بتظهر في "آخر وزنة" و"طرحات النهارده" على طول. برا المصنع = التحديث العادي (refreshSeconds)
    // liveWsPath: لو الإيجنت عنده WebSocket (مثلا "/ws") المتصفح بيشترك فيه، ولو وقع بيرجع لـ status.json. null = status.json بس
    // Inside the factory: "kiln_exit" events straight from the agent ({it.cameraBaseUrl}/status.json every liveSeconds,
    // timeout liveTimeoutMs), so a new exit shows in "آخر وزنة" and "طرحات النهارده" at once. Outside = the normal refresh.
    // liveWsPath: when the agent has a WebSocket (e.g. "/ws") the browser subscribes to it, falling back to status.json
    // when it drops. null = status.json only
    liveSeconds: 5,
    liveTimeoutMs: 2000,
    liveWsPath: null as string | null,
    // ===== تنبيه طرحة جديدة (على كل الصفحات) =====
    // كل ترول جديد (من الإيجنت على الشبكة، أو التحديث العادي برا المصنع) والكارت بيوري تقدم الطرحة بتاعته: صوت قصير (public/sounds/kiln-exit.wav)،
    // والشاشة بتروح لصفحة "الإنتاج والأفران" وتقف عليها alertHoldSeconds مع كارت كبير للطرحة، وبعدين التقليب بيكمل
    // (ولو كانت صفحة تانية متثبتة بترجعلها). كذا طرحة مع بعض = ورا بعض alertQueueSeconds لكل واحدة وصوت لكل طرحة.
    // مش بيشتغل أول ما الصفحة تفتح (الطرحات اللي بعد كده بس)، ولو لوحة تفاصيل مفتوحة بيستنى لحد ما تتقفل
    // New kiln exit alert (all pages): a chime, jump to the production page and hold it alertHoldSeconds with a big
    // card, then rotation resumes (or returns to the pinned page). Several at once = one after another,
    // alertQueueSeconds each, one chime per exit. Never on first load; waits while a details panel is open
    alertEnabled: true,
    alertVolume: 0.8, // 0 - 1
    alertHoldSeconds: 30,
    alertQueueSeconds: 5,
    alertSound: "/sounds/kiln-exit.wav",
    // مقاسات الكارت بالبكسل (ثابتة) - the card's sizes in px (fixed)
    // batchFontSize = سطر تقدم الطرحة "طرحة فرن 3 — ترول 2 من 3" وشرايح الترولات - the batch progress line and trolley chips
    alertCard: { width: 860, titleFontSize: 54, weightFontSize: 110, unitFontSize: 34, chipFontSize: 30, labelFontSize: 18, batchFontSize: 26 },
  },

  // ============================================================
  // اللي بيحصل دلوقتي - كارت الأحداث في الرئيسية (العمود اللي على الشمال)
  // The live activity feed - the main page card (left column)
  // كل 30 ثانية الشاشة بتسأل عن الجديد، وأي حاجة اتعملت بعد ما الصفحة فتحت بتظهر في الصندوق الكبير اللي فوق
  // وبتنبض pulseCount مرة، وبعدين بتنزل للقايمة. لو جم كذا حدث مع بعض بيستنوا دورهم واحد ورا التاني
  // Every 30 s the screen asks for anything new; each event created after the page opened shows in the big box
  // on top, pulses pulseCount times, then slides into the list. Several at once wait their turn, one after another
  // ============================================================

  // ============================================================
  // حسابات فلاتر "سلف" و"صدقات" في لوحة تفاصيل الخزنة والمحافظ
  // Accounts behind the "سلف" and "صدقات" filters in the treasury / wallet details panel
  // ============================================================
  accounts: {
    // حساب سلف الموظفين (القروض والسلف للموظفين). قروض البنوك (24xx) مش هنا لأنها قروض على الشركة
    // The employee advances / loans account. Bank loans (24xx) are not here: they are the company's own loans
    advanceAccounts: ["1620 - سلف الموظفيين - AC"] as string[],
    // حساب الصدقات: أي قيد على الخزنة / المحفظة في نفس المستند بتاعه سطر على الحساب ده يتحسب صدقة
    // The charity account: a cash entry whose voucher also has a line on this account counts as charity
    charityAccounts: ["5222 - صدقات - AC"] as string[],
  },

  activity: {
    refreshSeconds: 30, // الشاشة بتسأل كل 30 ثانية (والرئيسية ظاهرة بس) - every 30 s, only while the main page is shown
    cacheSeconds: 30, // السيرفر والـ CDN بيكلموا ERPNext مرة كل 30 ثانية بالكتير - ERPNext is asked at most once per 30 s
    // أنواع الأحداث اللي بتظهر (امسح أي نوع مش عايزه):
    // money = وارد ومنصرف الخزنة وكل المحافظ، kiln = طرحة خرجت، sales = فواتير البيع والمرتجعات،
    // stock = أذون المخزن (صرف / إضافة / تحويل / تصنيع)، charity = الصدقات، salary = تسويات المرتبات (النوع والاسم بس، من غير مبلغ)
    // Event types shown (remove any you don't want): money = treasury and wallet moves, kiln = kiln exits,
    // sales = sales invoices and returns, stock = stock entries, charity = charity, salary = salary adjustments (no amounts)
    // it = جهاز أو راوتر فصل / رجع (من إيجنت IT، البيانات الحقيقية بس، عمرها ما بتبقى تجريبية) - it = device down / up (real agent data only)
    enabledTypes: ["money", "kiln", "sales", "stock", "charity", "salary", "it"] as ("money" | "kiln" | "sales" | "stock" | "charity" | "salary" | "it")[],
    pulseCount: 5, // الحدث الجديد بينبض كام مرة قبل ما ينزل للقايمة - how many times a new event pulses before it moves down
    pulseSeconds: 1, // مدة النبضة الواحدة بالثواني - one pulse, in seconds
    listSize: 8, // عدد الأحداث في القايمة تحت الصندوق (الأحدث فوق) - events kept in the list under the box (newest on top)
  },

  // ============================================================
  // الصفحات - الداشبورد بقى كذا صفحة، والتنقل بالأسهم اللي فوق على الشمال أو أسهم الكيبورد
  // Pages - the dashboard has several pages (arrows at the top-left of the header or keyboard arrows)
  // ============================================================

  // ============================================================
  // IT والمراقبة (آخر صفحة) - الشبكات والأجهزة والكاميرات من إيجنت على جهاز IT في المصنع
  // الإيجنت بيبعت POST /api/it/status كل شوية (الشكل في docs/it-agent-payload.md) بالهيدر x-it-secret = IT_AGENT_SECRET
  // IT & monitoring (last page) - networks, devices and cameras from an agent on the factory IT PC. The agent POSTs to
  // /api/it/status (schema in docs/it-agent-payload.md) with header x-it-secret = env IT_AGENT_SECRET
  // ============================================================
  it: {
    // "أهم الأجهزة": كل جهاز هنا = جزء في الدايرة بلونه، وسطر تحتها. زوّد جهاز = جزء جديد لوحده
    // name = الاسم اللي يظهر، type = الأيقونة (fingerprint بصمة / pc كمبيوتر / printer طابعة / nvr / scale ميزان / other)
    // ip = عنوان الجهاز: فاضي = يظهر "متصل" مؤقتا. لما تكتب الـ ip والإيجنت يبعت الجهاز ده، الحالة بتبقى حقيقية
    //      (مفصول = الجزء بيحمر وبينبض، والسطر يكتب "مفصول من X د")
    // color = لون الجزء والسطر
    // "أهم الأجهزة": each device here = one coloured ring segment plus a row under the ring; add one = a new segment.
    // ip empty = shown as online (placeholder); once set and the agent reports that IP, the real status is used
    criticalDevices: [
      { name: "البصمة", type: "fingerprint", ip: "", color: "#A78BFA" }, // بنفسجي - violet
      { name: "كمبيوتر IT", type: "pc", ip: "", color: "#3B82F6" }, // أزرق - blue
      { name: "الطابعة", type: "printer", ip: "", color: "#F97316" }, // برتقالي - orange
    ] as { name: string; type: "fingerprint" | "nvr" | "printer" | "pc" | "scale" | "other"; ip: string; color: string }[],
    // الإيجنت بيبعت مرة كل دقيقتين بالكتير (السيرفر بيرفض أسرع من كده بـ 429) - the agent posts at most once per 2 minutes
    agentMinPostSeconds: 120,
    agentOfflineSeconds: 300, // مفيش تحديث من الإيجنت المدة دي (أكتر من دقيقتين ونص) = "الإيجنت مش متصل" - no update for this long = agent offline
    refreshSeconds: 60, // الشاشة بتسأل كل 60 ثانية (وصفحة IT ظاهرة بس) - every 60 s, only while the IT page is shown
    // الإيجنت المحلي: المتصفح بيجيب {cameraBaseUrl}/cameras.json والصور {cameraBaseUrl}/cameras/{id}/snapshot.jpg على طول
    // (مش من Vercel)، فالكاميرات بتشتغل جوه المصنع بس. لازم HTTPS بشهادة elsafwa-ca متسطبة. مفيش باسورد في الرابط ده أبدا
    // The local agent: the browser fetches {cameraBaseUrl}/cameras.json and {cameraBaseUrl}/cameras/{id}/snapshot.jpg
    // directly (not via Vercel), so cameras only work inside the factory. HTTPS with the elsafwa-ca cert installed.
    // Never a password in this URL
    cameraBaseUrl: "https://192.168.1.200:8443",
    // go2rtc للفيديو المباشر (WebRTC ثم MSE) في الصفحة الكاملة: {streamBaseUrl}/api/webrtc?src=… و /api/ws?src=…
    // فاضي = نفس cameraBaseUrl. لو فشل، الصفحة الكاملة بترجع لصور كل ثانية
    // go2rtc for live video (WebRTC, then MSE) in full page: {streamBaseUrl}/api/webrtc?src=… and /api/ws?src=….
    // Empty = same as cameraBaseUrl. On failure the full page falls back to a snapshot every second
    streamBaseUrl: "",
    // شاشة الأوبريتر على الإيجنت (زرار "📱 شاشة الأوبريتر" في صفحة الإنتاج بيفتح QR ليها)
    // The operator screen on the agent ("📱 شاشة الأوبريتر" on the production page opens a QR code for it)
    // دلوقتي صفحة /operator في الداشبورد نفسه (شغالة من أي مكان) - now the dashboard's own /operator page (works anywhere)
    operatorUrl: "https://elsafwadashboard.vercel.app/operator",
    // الحالة من الشبكة المحلية الأول: المتصفح بيسأل {cameraBaseUrl}/status.json على طول كل localStatusSeconds (مهلة
    // localStatusTimeoutMs). لو رد = كل حاجة منه ("📡 مباشر من الشبكة")، ولو فشل (برا المصنع) = /api/it/status ("☁️ من السحابة")
    // LAN first: the browser asks {cameraBaseUrl}/status.json directly every localStatusSeconds (timeout localStatusTimeoutMs).
    // If it answers it is used for everything; if not (outside the factory) the page falls back to /api/it/status
    localStatusSeconds: 5,
    localStatusTimeoutMs: 2000,
    liveVideo: true, // false = الصفحة الكاملة صور بس من غير فيديو - false = full page uses snapshots only
    cameraLayouts: [1, 4, 6, 9, 16, 32], // اختيارات العرض في هيدر الكاميرات - the layout choices in the cameras header
    defaultCameraLayout: 4, // أول مرة (بعد كده بيتفتكر في المتصفح) - first time (then remembered in the browser)
    cameraRotateSeconds: 8, // عرض كاميرا واحدة: بتتقلب كل 8 ثواني - single layout: switches camera every 8 s
    cameraPageSeconds: 15, // عرض الشبكة: الصفحة بتتقلب كل 15 ثانية - grid layout: the page of cameras switches every 15 s
    cameraRefreshSeconds: 2, // عرض كاميرا واحدة: الصورة (main) كل 2 ثانية - single layout: main snapshot every 2 s
    gridRefreshSeconds: 2, // الشبكة: صورة الـ sub-stream كل 2 ثانية (متوزعة مش كلها مع بعض) - grid: sub-stream every 2 s, staggered
    viewerSnapshotSeconds: 1, // الصفحة الكاملة لو الفيديو فشل: صورة كل ثانية - full page fallback: a snapshot every second
    // أسامي الـ NVR في شرايح الفلتر (اسم الـ nvr في cameras.json ← الاسم اللي يظهر). مش مكتوب = يظهر زي ما هو
    // NVR names on the filter chips (nvr value in cameras.json → label shown). Missing = shown as is
    nvrLabels: {} as Record<string, string>,
    eventsShown: 8, // أكتر عدد أحداث في "آخر الأحداث" (بيقل لو المكان مش كفاية) - most events listed (fewer when tight)
  },

  pages: {
    autoRotate: true, // true = الصفحات تتقلب لوحدها، false = تفضل ثابتة - true = pages switch by themselves
    // title = اسم الصفحة اللي بيظهر في نص الهيدر - title = page name shown in the center of the header
    // durationSeconds = الصفحة دي تفضل كام ثانية قبل ما تتقلب للي بعدها - seconds on screen before the next page
    // لو حد داس على الأسهم الصفحة بتتقلب والعداد بيبدأ من الأول - a manual switch restarts the timer
    // ترتيب الصفحات - عشان تفتح صفحة معينة على التلفزيون اكتب في اللينك ?page=2
    // Page order - open a specific page directly with ?page=2 in the URL
    list: [
      { id: "main", title: "الرئيسية", durationSeconds: 60 }, // الصفحة 1: الخزنة والحضور وإنتاج النهارده - page 1
      { id: "stock", title: "أرصدة المخازن", durationSeconds: 60 }, // الصفحة 2: المخازن - page 2
      { id: "production", title: "الإنتاج والأفران", durationSeconds: 60 }, // الصفحة 3: الإنتاج والأفران - page 3
      { id: "sales", title: "مبيعات المناديب", durationSeconds: 60 }, // الصفحة 4: مبيعات المناديب - page 4
      { id: "wallets", title: "الخزن والمحافظ", durationSeconds: 60 }, // الصفحة 5: الخزن والمحافظ - page 5
      { id: "charity", title: "الصدقات", durationSeconds: 60 }, // الصفحة 6 (الأخيرة): صناديق الصدقات - page 6 (last)
      // IT والمراقبة: في الأسهم والنقط بس، والتقليب التلقائي بيعديها لحد ما الإيجنت يتربط (inRotation: true وقتها)
      // IT & monitoring: arrows/dots only, skipped by auto-rotation until the agent is connected (then inRotation: true)
      { id: "it", title: "IT والمراقبة", durationSeconds: 60, enabled: true, inRotation: false },
      // متوقفة — غيّرها لـ true لو عايز ترجّعها
      { id: "distributors", title: "الموزعين", durationSeconds: 60, enabled: false }, // الموزعين - distributors (disabled)
    ] as ConfigPage[],
  },

  // ============================================================
  // الخزن والمحافظ (الصفحة 5) - كاش / فودافون كاش / فوري، قراية بس من ERPNext
  // Cash wallets / Vodafone Cash / Fawry (page 5), read-only from ERPNext
  // - الرصيد = رصيد الحساب النهارده بنفس طريقة كارت الخزنة في الصفحة 1 (get_balance_on)
  // - وارد اليوم = مجموع المدين، منصرف اليوم = مجموع الدائن من GL Entry للحساب النهارده (بتوقيت القاهرة)
  // - آخر حركة = آخر قيد GL Entry للحساب (مدين = وارد، دائن = منصرف)
  // - كل محفظة بتتربط برقم الحساب (account_number) في شركة company، مش بالاسم. لو الرقم لسه مش موجود في ERPNext
  //   الكارت بيكتب "مش مربوط بحساب في ERPNext" ولما الحساب يتعمل بيتربط لوحده
  // - kind: "cash" = محفظة كاش (أيقونة محفظة وفلوس)، "fawry" = ماكينة دفع (أيقونة ماكينة وكارت)
  // - لو ERPNext وقع بيفضل آخر رقم نجح مع "غير متصل"، ولو مفيش الكارت يكتب "غير متصل" (مش أصفار)
  // Balance = get_balance_on as of today (same as the page 1 treasury card); today's in/out = GL Entry
  // debit/credit today; last movement = the latest GL Entry. Each wallet is linked by its ERPNext
  // account_number in `company`; a number that doesn't exist yet shows "not linked" and links itself once
  // created. On failure the last good value stays with "غير متصل" (never fake zeros)
  // ============================================================
  wallets: {
    cacheSeconds: 60, // السيرفر بيكلم ERPNext مرة كل 60 ثانية بالكتير - ERPNext is asked at most once per 60 s
    company: "ALSafwa Coal", // الشركة اللي بندوّر فيها على أرقام الحسابات - the company whose account numbers are used
    // بالترتيب اللي بتظهر بيه: 1 يمين فوق، 2 النص فوق، 3 شمال فوق، 4 يمين تحت، 5 النص تحت، 6 شمال تحت
    // Display order (RTL): 1 top-right, 2 top-middle, 3 top-left, 4 bottom-right, 5 bottom-middle, 6 bottom-left
    // label = الاسم اللي بيظهر على الشاشة بالظبط، accountNumber = رقم الحساب في دليل الحسابات
    // label = the name shown on screen exactly, accountNumber = the account number in the Chart of Accounts
    accounts: [
      { label: "كاش الحاج أشرف", accountNumber: "1112", kind: "cash" }, // 1112 - كاش الحاج اشرف - AC
      { label: "كاش أ. حمادة", accountNumber: "1111", kind: "cash" }, // 1111 - كاش حمادة شاهين - AC
      { label: "كاش زياد عوض", accountNumber: "1119", kind: "cash" }, // 1119 - كاش زياد عوض - AC
      // لسه مش متعمل في ERPNext - الكارت بيكتب "مش مربوط" لحد ما يتعمل - not created yet; shows "not linked" until it exists
      { label: "كاش يوسف عاطف", accountNumber: "1120", kind: "cash" },
      { label: "كاش كريم عوض", accountNumber: "1113", kind: "cash" }, // 1113 - كاش كريم عوض - AC (اسمه في ERPNext "كاش محمود عوض")
      { label: "فوري", accountNumber: "1114", kind: "fawry" }, // 1114 - ماكينة فوري - AC
    ] as { label: string; accountNumber: string; kind: "cash" | "fawry" }[],
  },

  // ============================================================
  // المبيعات (صفحة مبيعات المناديب وصفحة الموزعين) - من فواتير البيع (Sales Invoice) المعتمدة بس
  // Sales (reps page and distributors page) - from submitted Sales Invoices only
  // - الفترة = الشهر ده من يوم 1 لحد النهارده بتوقيت القاهرة، والمرتجعات (is_return) بتتطرح لوحدها
  // - الرقم بالباكت: كل وحدة من أصناف المنتجات المعبأة = باكت (زي صفحة المخازن، الكرتونة "كامل" = باكت)
  //   ولو صنف لازم يتحسب بأكتر من باكت اكتبه في packetsPerUnit
  // - البيانات بتتجاب من ERPNext مرة كل cacheSeconds (البيع بيتسجل تاني يوم)، ولو ERPNext وقع بتفضل آخر
  //   بيانات نجحت مع "غير متصل"، ولو مفيش الكارت يكتب "غير متصل" (مش أصفار)
  // Period = this month (Cairo) to today, returns subtracted. Packets: one unit of a packaged item = one packet
  // (like the stock page); override in packetsPerUnit. Fetched once per cacheSeconds; on failure the last good
  // data stays with "غير متصل", else the card shows "غير متصل" (never fake zeros)
  // ============================================================
  sales: {
    cacheSeconds: 60, // البيانات بتتجاب من ERPNext مرة كل 60 ثانية بالكتير - fetch from ERPNext at most once per 60s
    monthlyTarget: 1000, // تارجت الشهر لكل مندوب بالباكت (تقدر تغيره لمندوب لوحده بـ target) - monthly target per rep (packets)
    // المديونية برّه: الرقم بيبقى أحمر لو فيه فاتورة مفتوحة أقدم من كده (بالأيام) - debt turns red past this many days
    debtWarningDays: 30,

    // المنتجات بالترتيب اللي بتظهر بيه: label = الاسم القصير على الشاشة، stockName = اسمه في erp.stock.packaged فوق
    // (أكواد الأصناف بتتاخد من هناك، فلو صنف جديد اتضاف للمخازن بيتحسب هنا لوحده)
    // Products in display order: label = short name on screen, stockName = its name in erp.stock.packaged (item codes come from there)
    products: [
      { label: "ربع", stockName: "ربع كيلو" },
      { label: "نص", stockName: "نص كيلو" },
      { label: "كيلو", stockName: "كيلو" },
      { label: "2 كيلو", stockName: "2 كيلو" },
      { label: "3 كيلو", stockName: "3 كيلو" },
    ] as { label: string; stockName: string }[],

    // الكراتين (الصف التاني في كارت المندوب): عدد الكراتين بوحدة الصنف نفسه (مش متحولة لباكت)
    // الكود بيتاخد من النوع "كامل" في erp.stock.packaged[stockName]. الكراتين دي متحسبة في إجمالي الباكت زي ما هي
    // Cartons (second chip row on a rep card): count in the item's own unit (not converted). The item code comes from
    // the "كامل" variant of erp.stock.packaged[stockName]; they still count in the packet total as before
    cartons: [
      { label: "ربع كامل", stockName: "ربع كيلو" }, // باكت ربع كامل
      { label: "نص كامل", stockName: "نص كيلو" }, // باكت نص كامل
      { label: "كرتونة 1 كيلو", stockName: "كيلو" }, // كرتونة 1 كيلو
      { label: "كرتونة 2 كيلو", stockName: "2 كيلو" }, // كرتونة 2 كيلو
    ] as { label: string; stockName: string }[],

    // كام باكت في الوحدة لصنف معين (لو مش مكتوب = 1). ERPNext مفيهوش تحويل من كرتونة لباكت،
    // فـ"كرتونة 1 كيلو" و"كرتونة 2 كيلو" بيتحسبوا باكت واحد زي صفحة المخازن. مثال: "كرتونة 1 كيلو": 10
    // Packets per stock unit for an item (missing = 1). ERPNext has no carton -> packet conversion, so cartons count as 1
    packetsPerUnit: {} as Record<string, number>,

    // المناديب: كل مندوب بالعربية بتاعته. الفاتورة بتتحسب للمندوب حسب مخزن العربية اللي اتباع منه
    // (warehouse في سطور الفاتورة)، لأن Sales Person في الفواتير مش متسجل بانتظام
    // name = اسمه على الشاشة، van = اسم العربية، warehouse = اسم المخزن بالظبط زي ERPNext، target = تارجت مختلف (اختياري)
    // Reps: an invoice counts for the rep whose van warehouse it was sold from (Sales Person is not filled reliably)
    reps: [
      { name: "ابراهيم وصفى", van: "سوزوكي 4", warehouse: "مخزن سوزوكي 4 - AC" },
      { name: "كريم عوض", van: "سوزوكي 2", warehouse: "مخزن سوزوكي 2 - AC" },
      { name: "اسلام عوض", van: "سوزوكي 3", warehouse: "مخزن سوزوكي 3 - AC" },
      { name: "مصطفى اليمنى", van: "سوزوكي 1", warehouse: "مخزن سوزوكي 1 - AC" },
      // تارجت شهر معين لمندوب: monthTargets: { "2026-10": 1200 } - a month-specific target for a rep
    ] as { name: string; van: string; warehouse: string; target?: number; monthTargets?: Record<string, number> }[],

    // الموزعين: سحب كل موزع = فواتير البيع بتاعته (Customer). customer = الـ ID بتاع العميل في ERPNext بالظبط
    // الترتيب من اليمين: featured = العمود الأول (الكارت الكبير بطول الصفحة)، fullHeight = عمود لوحده بطول الصفحة،
    // والباقي في العمود الأخير فوق بعض. لو customer فاضي الكارت بيكتب "مش مربوط"
    // Distributors: what each one took = their Sales Invoices. customer = the exact ERPNext Customer ID.
    // Columns right to left: featured (biggest, full height), fullHeight cards, then the rest stacked in the last column
    distributors: [
      { name: "عمرو خاطر", customer: "عمرو خاطر", featured: true }, // العمود 1 - column 1
      { name: "محمد عادل حمزه", customer: "محمد عادل حمزة", fullHeight: true }, // العمود 2 - column 2
      { name: "اسامه شبرا", customer: "اسامه شبرا" }, // العمود 3 فوق - column 3 top
      // فيه كمان عميل "حماده العزباوي تعبئة" - لو عايز تجمعهم قولّي - there is also a "حماده العزباوي تعبئة" customer
      { name: "حماده العزباوى", customer: "حماده العزباوي" }, // العمود 3 تحت - column 3 bottom
    ] as { name: string; customer: string; featured?: boolean; fullHeight?: boolean }[],
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

    // ============================================================
    // رصيد المخازن (الصفحة 2) - المنتجات المعبأة والشكاير والمواد الخام (الخشب ومواد التعبئة)
    // Stock (page 2) - packaged products, sacks and raw materials (wood + packaging)
    // كل الإجماليات بتتحسب لوحدها - every total is calculated automatically
    // الحد الأدنى لكل رقم في ملف config/stock-min.ts - every minimum is in config/stock-min.ts
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
            // label = اسم النوع، quantity = الكمية - type name, quantity
            { label: "عادي", quantity: 2007 },
            { label: "كامل", quantity: 500 },
          ] as ConfigVariant[],
        },
        {
          name: "نص كيلو",
          unit: "باكت",
          image: "/products/half.png",
          variants: [
            { label: "عادي", quantity: 2474 },
            { label: "كامل", quantity: 600 },
          ] as ConfigVariant[],
        },
        {
          name: "كيلو",
          unit: "باكت",
          image: "/products/kilo.png",
          variants: [
            { label: "عادي", quantity: 716 },
            { label: "كامل", quantity: 200 },
          ] as ConfigVariant[],
        },
        {
          name: "2 كيلو",
          unit: "باكت",
          image: "/products/2kg.png",
          variants: [
            { label: "عادي", quantity: 677 },
            { label: "كامل", quantity: 150 },
          ] as ConfigVariant[],
        },
        {
          name: "3 كيلو",
          unit: "باكت",
          image: "/products/3kg.png",
          variants: [
            // نوع واحد بس - one type only
            { label: "عادي", quantity: 573 },
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
            { name: "برتقال", quantity: 120 }, // name = النوع، quantity = الكمية
            { name: "مانجو", quantity: 80 },
            { name: "جوافة", quantity: 45 },
            {
              name: "بلدي",
              // الأنواع الفرعية للبلدي - بلدي sub-types (بلدي total = their sum)
              subTypes: [
                { name: "كازوارينا", quantity: 60 },
                { name: "توت", quantity: 30 },
                { name: "زيتون", quantity: 25 },
              ] as ConfigWoodSubType[],
            },
            { name: "بيت نار", quantity: 40 },
          ] as ConfigWoodType[],
        },

        // مواد التعبئة - كل مادة ليها رقم واحد، تقدر تزود مادة جديدة بسطر جديد
        // Packaging materials - one number each; add a material by adding a line
        // name = اسم المادة، quantity = الكمية، unit = وحدة القياس
        // icon = شكل الأيقونة: "plastic" (أكياس تعبئة)، "roll" (رول)، "bag" (كيس)، "tape" (بكر لاصق)
        // icon = icon shape: "plastic", "roll", "bag" or "tape"
        packaging: [
          { name: "أكياس تعبئة", quantity: 850, unit: "كجم", icon: "plastic" },
          { name: "رولات ربع", quantity: 40, unit: "رول", icon: "roll" },
          { name: "رولات نص", quantity: 35, unit: "رول", icon: "roll" },
          { name: "أكياس كيلو", quantity: 5000, unit: "كيس", icon: "bag" },
          { name: "أكياس 2 كيلو", quantity: 3000, unit: "كيس", icon: "bag" },
          { name: "أكياس 3 كيلو", quantity: 2500, unit: "كيس", icon: "bag" },
          { name: "بكر لاصق", quantity: 0, unit: "عدد", icon: "tape" },
        ] as ConfigPackagingItem[],
      },

      // الشكاير - كل نوع شكاير متقسم أنواع (ناعم، خشن، مكمورة...) وتقدر تزود أو تشيل
      // Sacks - each sack type has variants (fine, coarse, ...); add or remove lines freely
      sacks: [
        {
          name: "شكاير برتقال", // اسم الشكاير - sack name
          unit: "شكارة", // وحدة القياس - unit
          variants: [
            { label: "ناعم", quantity: 766 }, // label = النوع، quantity = الكمية
            { label: "خشن", quantity: 520 },
            { label: "مكمورة", quantity: 0 },
          ] as ConfigVariant[],
        },
        {
          name: "شكاير مانجو",
          unit: "شكارة",
          variants: [
            { label: "ناعم", quantity: 80 },
            { label: "خشن", quantity: 204 },
          ] as ConfigVariant[],
        },
        {
          name: "شكاير كازوارينا",
          unit: "شكارة",
          variants: [
            { label: "ناعم", quantity: 1058 },
            { label: "خشن", quantity: 82 },
            { label: "مكمورة", quantity: 330 },
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
      // نقط الصفحات تحت اسم الصفحة (نقطة لكل صفحة شغالة، والحالية أعرض وبرتقاني) - page dots under the title
      pageDotSize: 8, // النقط الرمادي - the gray dots
      pageDotActiveWidth: 22, // عرض نقطة الصفحة الحالية - the current page pill width
      pageNumberFontSize: 17, // حجم "1 / 6" جنب النقط - the "1 / 6" number next to the dots
    },

    // أزرار التنقل بين الصفحات (فوق على الشمال في الهيدر) - page navigation buttons (header top-left)
    pageNav: {
      iconSize: 18, // حجم سهم الجاية/اللي فاتت - next/previous arrow size
      // التقليب: الصفحة الجاية بتطلع من تحت واللي فاتت بتنزل من فوق (مع ظهور تدريجي)
      // Page switch: the next page slides in from below, the previous one from above (with a fade)
      slideMs: 420, // مدة الحركة بالملي ثانية - slide duration (ms)
      slideDistance: 56, // المسافة اللي الصفحة بتتحركها بالبكسل - slide distance (px)
    },

    // الإضاءة الخفيفة ورا الكروت (بقع نور برتقالي وأزرق بتتحرك ببطء شديد) - soft ambient glow behind the cards
    ambient: {
      enabled: true, // true = شغالة، false = مقفولة خالص - on/off
      opacity: 0.18, // قوة الإضاءة من 0 لـ 1 (كل ما تكبر تبان أكتر، متعديش 0.3 عشان الكلام) - intensity 0..1 (keep under 0.3)
    },

    // الكروت - البطاقات اللي بتظهر البيانات
    // Cards - the cards showing data
    cards: {
      cardPadding: 16, // المسافة داخل البطاقة من الحواف - padding inside card
      gap: 16, // المسافة بين البطاقات - gap between cards
      borderRadius: 16, // تقويس حواف البطاقة - card border radius
    },

    // عرض كروت الصف العلوي (نسب من عرض الصف) - top row card widths (fr ratios)
    topRowColumns: {
      treasury: 0.62, // رصيد الخزنة (أضيق) - treasury (narrower)
      management: 0.68, // حضور الإدارة (أضيق) - management attendance (narrower)
      workers: 2.1, // حضور عمال (الأعرض، خد مكان الأفران والطرحات عشان كل الأسامي تبان) - workers attendance (widest)
      activity: 0.6, // كارت "اللي بيحصل دلوقتي" - the live activity card
    },

    // الخزنة - بطاقة رصيد الخزنة
    // Treasury - treasury balance card
    // المحتوى بيتوزع بالتساوي على طول الكارت - content is spread evenly over the card height
    treasury: {
      // الأرقام بتصغر لوحدها لو الكارت ضيق: الحجم = أصغر قيمة بين الـ Max والـ Scale% من عرض الكارت
      // Numbers shrink automatically on narrow cards: size = min(MaxSize px, Scale% of the card width)
      // رقم الرصيد = min(balanceMaxSize px, balanceScale cqi) - cqi = 1% من عرض كارت الخزنة نفسه
      // balance size = min(balanceMaxSize px, balanceScale cqi), cqi = 1% of the treasury card width
      balanceMaxSize: 92, // أكبر حجم لرقم الرصيد الكبير بالبكسل - max balance number size (px)
      balanceScale: 19, // رقم الرصيد = 19% من عرض الكارت (كان 17) - balance size as % of card width (was 17)
      balanceBaseLength: 10, // لو الرقم أطول من 10 حروف (زي 1,262,928.63) بيصغر بالنسبة عشان مايعدّيش الكارت - longer numbers shrink to stay inside
      currencyFontSize: 28, // حجم "ج.م" اللي تحت الرصيد - "ج.م" under the balance
      changeMaxSize: 26, // أكبر حجم لرقم تغيير اليوم (+144,429 ج.م) وأيقونته - max today's change badge size (px)
      changeScale: 7, // شارة التغيير = 7% من عرض الكارت لو أصغر من الـ Max - change badge size as % of card width
      changePaddingX: 20, // المسافة يمين وشمال جوه شارة التغيير - change badge horizontal padding
      changePaddingY: 10, // المسافة فوق وتحت جوه شارة التغيير - change badge vertical padding
      // "وارد اليوم" فوق و"منصرف اليوم" تحته، كل واحد بعرض الكارت. الأحجام = min(Max px, Scale cqi)
      // و cqi = 1% من عرض كارت الخزنة نفسه، والسهم على قد الكلمة
      // incoming on top of outgoing, each full card width; sizes = min(Max px, Scale cqi), cqi = 1% of the
      // treasury card width; the arrow follows the label size
      flowLabelMaxSize: 30, // أكبر حجم لكلمة "وارد اليوم" و "منصرف اليوم" - max incoming / outgoing label size (px)
      flowLabelScale: 9, // الكلمة = 9% من عرض الكارت - label size as % of card width
      flowMaxSize: 56, // أكبر حجم لرقم الوارد والمنصرف بالبكسل - max incoming / outgoing number size (px)
      flowScale: 15, // رقم الوارد/المنصرف = 15% من عرض الكارت - number size as % of card width
      flowBaseLength: 9, // لو الرقم أطول من 9 حروف (زي 12,156,729) بيصغر بالنسبة - longer numbers shrink to stay inside
      flowCurrencyMaxSize: 26, // أكبر حجم لـ "ج.م" تحت رقم الوارد والمنصرف - max "ج.م" size under incoming / outgoing
      flowCurrencyScale: 7, // "ج.م" = 7% من عرض الكارت - "ج.م" size as % of card width
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
      minGroupTitleFontSize: 11, // أصغر حجم لاسم القسم لو مش واخد مكانه (الاسم عمره ما بيتقص) - smallest group name size; names are never cut
      // باقي مقاسات "حضور عمال" في sizes.page1 تحت - the other "حضور عمال" sizes are in sizes.page1 below
    },

    // كارت "اللي بيحصل دلوقتي" في الرئيسية - the main page live activity card
    activityCard: {
      spotlightHeight: 190, // ارتفاع الصندوق الكبير اللي فوق - the big box on top (px)
      spotlightAmountFontSize: 34, // المبلغ في الصندوق الكبير - the amount in the big box
      spotlightTitleFontSize: 18, // عنوان الحدث في الصندوق الكبير - the event title in the big box
      rowHeight: 58, // ارتفاع كل سطر في القايمة - each list row (px)
      rowFontSize: 14, // حجم الكلام في القايمة - list text size
      // شاشة أضيق من 1600 (لابتوب 1366): نفس المقاسات أصغر - screens under 1600 wide (1366 laptop): smaller
      compact: {
        spotlightHeight: 150,
        spotlightAmountFontSize: 24,
        spotlightTitleFontSize: 14,
        rowHeight: 46,
        rowFontSize: 12,
      },
    },

    // صفحة الإنتاج والأفران - the production page
    productionPage: {
      kpiTonsFontSize: 104, // رقم "إنتاج النهارده" (الأكبر، في عمود الشمال تحت آخر وزنة) - the biggest KPI (left column)
      kpiFontSize: 38, // الكروت الـ 3 الصغيرة تحته (الطرحات، متوسط الطرحة، الشهر) - the 3 small cards under it
      kpiSmallHeight: 126, // ارتفاع صف الكروت الـ 3 الصغيرة - the small cards row height
      kilnTonsFontSize: 28, // أطنان كل فرن - each kiln's tons
      kilnStatFontSize: 18, // عدد الطرحات وساعة آخر خروج تحت رسمة الفرن - exits count and last exit time under the kiln drawing
      kilnChipFontSize: 15, // شارة الحالة (شغالة / صيانة / متوقفة) - the status chip
      // شاشة أضيق من 1600 (لابتوب 1366×768): نفس المقاسات أصغر - screens under 1600 wide (1366x768 laptop): smaller
      compact: {
        kpiTonsFontSize: 68,
        kpiFontSize: 24,
        kpiSmallHeight: 88,
        kilnTonsFontSize: 20,
        kilnStatFontSize: 13,
        kilnChipFontSize: 12,
      },
    },

    // صفحة الإنتاج: "آخر وزنة" (فوق الشمال) و"طرحات النهارده" (الكارت الكبير في النص)، كله بالبكسل
    // لو عمود الشمال ضيق أوي (أضيق من 340 بكسل) أرقام "آخر وزنة" بتصغر خطوة واحدة عشان متطلعش برّه الكارت
    // The production page: "آخر وزنة" (top left) and "طرحات النهارده" (the big middle card), all in px.
    // If the left column gets very narrow (under 340 px) the "آخر وزنة" sizes step down once so nothing overflows
    production: {
      // ===== "آخر وزنة": الوزن الكبير، وتحته سطور: ترول · دخلت فرن — غرفة · النوع · الساعة ومن قد ايه · الطرحة
      // "آخر وزنة": the big weight, then lines: trolley · kiln — room · type · time and how long ago · the batch
      lastTitleFontSize: 26, // عنوان "آخر وزنة" (عريض) - the card title (bold)
      lastIconSize: 32, // أيقونة الميزان - the scale icon
      lastWeightFontSize: 84, // الوزن الكبير "563 كجم" - the big weight
      lastNoWeightFontSize: 36, // "بدون وزن" مكان الرقم (رمادي) - "بدون وزن" instead of the number (gray)
      lastLineFontSize: 27, // السطور تحت الوزن - the lines under the weight
      // ===== طرحات النهارده: كارت لكل طرحة بيملا ارتفاعه (طرحة واحدة = المساحة كلها، اتنين = النص، ...)، وفيه:
      // سطر العنوان (الطرحة الأولى · الساعة · الفرن · الغرفة · النوع · المجموع) ورسمة لكل ترول وتحتها رقمه ووزنه.
      // لو الطرحات أكتر من اللي ياخد مكانه (كل واحدة batchRowMin على الأقل): الأحدث وتحتهم "+N طرحة تانية"
      // Today's batches: one card per batch filling the height (1 batch = the whole area, 2 = half each, ...) with a
      // title line and one drawing per trolley with its number and weight. More than fit (batchRowMin each): newest + "+N"
      batchRowMin: 190, // أقل ارتفاع لكارت الطرحة - minimum batch card height
      batchTitleFontSize: 26, // "الطرحة الأولى"
      batchTimeFontSize: 30, // الساعة - the time
      batchKilnFontSize: 24, // شرايح "فرن 4" و"غرفة 1" الخضرا (نفس المقاس) - the green kiln and room chips (same size)
      batchTypeFontSize: 26, // النوع بأيقونته (الكلمة كاملة) - the type with its icon (full word)
      batchTotalFontSize: 36, // المجموع "1,715 كجم" - the total
      // تحت كل ترول "ترول 6" و"610 كجم": بيكبروا مع ارتفاع الكارت بين الرقمين دول - under each trolley: grows with the
      // card height between these two sizes
      trolleyLabelMin: 18,
      trolleyLabelMax: 30,
      batchMoreFontSize: 20, // "+N طرحة تانية"
      // شاشة أضيق من 1600 (لابتوب 1366×768): نفس الحاجات أصغر - screens under 1600 wide (1366x768 laptop): smaller
      compact: {
        lastTitleFontSize: 20,
        lastIconSize: 24,
        lastWeightFontSize: 52,
        lastNoWeightFontSize: 26,
        lastLineFontSize: 17,
        batchRowMin: 140,
        batchTitleFontSize: 16,
        batchTimeFontSize: 19,
        batchKilnFontSize: 15,
        batchTypeFontSize: 16,
        batchTotalFontSize: 22,
        trolleyLabelMin: 13,
        trolleyLabelMax: 22,
        batchMoreFontSize: 15,
      },
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
        packaged: 52, // المنتجات المعبأة (على اليمين) - packaged products (right)
        sacks: 48, // الشكاير + مخزن القطاعي (على الشمال) - sacks + the retail card (left)
      },
      // عرض كل كارت جوه قسم الشكاير بالنسبة لبعض (بالترتيب: برتقال، مانجو، كازوارينا، مخزن القطاعي)
      // مانجو أضيق عشان فيه نوعين بس - each card's width inside the sacks section (orange, mango, casuarina, retail)
      sackColumns: [1, 0.7, 1, 0.88],
      // تعويض أرقام الأنواع عن تضييق الكروت فوق (الرقم بيتحسب من عرض العمود): الرقم مضروب في المعامل ده عشان يفضل نفس حجمه قبل التضييق
      // ولو رقم مش واخد مكانه بيصغر 1px لوحده لحد ما يدخل، فعمره ما بيتقص
      // Variant-number boost for the narrower top cards (numbers follow the column width): the number is multiplied by this
      // so it keeps its pre-narrowing size. A number that doesn't fit still steps down 1px at a time, so it's never cut
      packagedNumberBoost: 1.055, // المنتجات المعبأة - packaged products
      sackNumberBoost: [1.09, 1.66, 1.09], // برتقال، مانجو، كازوارينا - orange, mango, casuarina
      // كروت الصف اللي فوق (المعبأة والشكاير والقطاعي) أضيق، فالمسافات جواها أقل عشان أرقام الإجمالي تفضل بنفس حجمها
      // The top-row cards are narrower, so their inner spacing is smaller and the total numbers keep their size
      topCardPaddingX: 7, // المسافة يمين وشمال جوه الكارت (العادي 10) - card left/right padding (normally 10)
      topCardTotalGap: 4, // المسافة بين كلمة "الإجمالي" والرقم (العادي 8) - gap between "الإجمالي" and its number (normally 8)
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
      // كروت الشكاير لما القطاعي ظاهر عليها (erp.stock.showRetailOnCard) - عشان نعمل مكان للسطر الصغير من غير ما الكارت يطول
      // Sack cards while retail is shown on them - frees room for the small line without making the card taller
      // كارت "مخزن القطاعي" في قسم الشكاير - the "مخزن القطاعي" card in the sacks section
      retailCard: {
        iconSize: 20, // أيقونة العنوان الصغير ("القطاعي") - the small header icon
        maxItems: 2, // أكتر عدد أصناف تحت العمودين (بيقل لوحده لو المكان مش كفاية) - most item rows (fewer when tight)
        itemFontSize: 12, // سطر الصنف ("برتقال خشن 15") - item row font size
        minTotalFontSize: 12, // أصغر حجم لرقم الإجمالي لو الوحدتين مش واخدين مكانهم - smallest total size when both units don't fit
        hideTotalUnitBelow: 130, // لو صف الإجمالي أضيق من كده كلمة "باكت" / "شكارة" بتستخبى - hide the unit words in a narrower total row
      },
      sackRetail: {
        nameFontSize: 16, // اسم الكارت (العادي nameFontSize فوق) - card name (normally nameFontSize)
        iconFontSize: 24, // حجم أيقونة الفاكهة 🍊🥭🌲 (العادي 30) - fruit icon size (normally 30)
        paddingTop: 6, // المسافة فوق جوه الكارت (العادي 10) - card top padding (normally 10)
        rowGap: 3, // المسافة بين صف الأنواع وصف الإجمالي (العادي 6) - gap between the variant row and the total row (normally 6)
        retailFontSize: 12, // سطر "قطاعي X" تحت كل رقم - the "قطاعي X" line under each number
        chipFontSize: 12, // كبسولة "+ قطاعي Y" جنب الإجمالي - the "+ قطاعي Y" chip next to the total
      },
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

    // كارت "حضور عمال" في الصفحة 1 - the "حضور عمال" card on page 1
    // ارتفاع مصنع الإنتاج والجزء اللي تحته بالنسبة لبعض (مش بكسل) - factory vs bottom area height, as ratios (not px)
    page1: {
      // الطول بيتقسم على قد الأسامي (حاضر + غائب) في كل قسم، ومفيش scroll خالص:
      // لو قسم لسه مش واخد مكانه، خط الأسامي فيه هو بس بيصغر لحد minWorkerChipFontSize، والأسامي عمرها ما بتستخبى
      // Heights follow each section's names (present + absent), no scroll anywhere: if a section still doesn't
      // fit, only that section's chip font shrinks, down to minWorkerChipFontSize; names are never hidden
      minWorkerChipFontSize: 14, // أصغر حجم لأسامي العمال - smallest worker name size (px)

      // مقاسات الكلام جوه "حضور عمال" (بكسل) - text sizes inside "حضور عمال" (px)
      workerChipFontSize: 20, // حجم أسامي العمال (حاضر وغائب) - لو كتير بتعمل scroll جوه الكارت - worker name chips (present and absent)
      workerChipPaddingX: 10, // المسافة يمين وشمال جوه الكبسولة - chip horizontal padding
      workerChipPaddingY: 2, // المسافة فوق وتحت جوه الكبسولة - chip vertical padding
      workerChipLineHeight: 1.3, // ارتفاع سطر الكبسولة بالنسبة لحجم الخط (أصغر = سطور أكتر) - chip line height vs font size
      workerTitleFontSize: 20, // اسم القسم (مصنع إنتاج، عمال تعبئة، سواقين...) - section name
      workerSubTitleFontSize: 18, // اسم المجموعة جوه مصنع الإنتاج (عمال إنتاج، ورشة، أوبريتر) - factory sub-group name
      workerNumberFontSize: 26, // رقم الحاضرين في كل قسم - present count per section
      workerTotalFontSize: 17, // "/ الإجمالي" جنب رقم الحاضرين - "/ total" next to the present count
      workerAbsentLabelFontSize: 16, // كلمة "غائب" في أول سطر الأسامي الحمرا - the red "غائب" label
      workerBoxPadding: 10, // المسافة جوه كل قسم (تعبئة، يومية، سواقين...) - padding inside each section box
      workerNestedBoxPadding: 8, // المسافة جوه أقسام مصنع الإنتاج - padding inside the factory sub-boxes

      // شاشة أضيق من compactMaxWidth (زي 1366): نفس المقاسات اللي فوق بس أصغر شوية عشان الأسامي ماتتقصش
      // Screens narrower than compactMaxWidth (e.g. 1366): the same sizes as above, a bit smaller so names aren't cut
      compactMaxWidth: 1599,
      compact: {
        // أصغر حجم لأسامي العمال على الشاشة الضيقة - smallest worker name size on narrow screens (px)
        minWorkerChipFontSize: 14,
        workerChipFontSize: 17,
        workerChipPaddingX: 4,
        workerChipPaddingY: 0,
        workerChipLineHeight: 1.2,
        workerTitleFontSize: 15,
        workerSubTitleFontSize: 14,
        workerNumberFontSize: 20,
        workerTotalFontSize: 13,
        workerAbsentLabelFontSize: 13,
        workerBoxPadding: 6,
        workerNestedBoxPadding: 5,
      },
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

    // مبيعات المناديب (الصفحة 3) - reps sales page
    salesPage: {
      summaryHeight: 64, // ارتفاع الشريط اللي فوق (إجمالي الشهر مقابل التارجت) - top summary strip height
      summaryNumberFontSize: 32, // حجم أرقام الشريط اللي فوق - summary numbers font size
      nameFontSize: 30, // حجم اسم المندوب - rep name font size
      vanFontSize: 15, // حجم اسم العربية (سوزوكي 4) - van chip font size
      monthNumberFontSize: 64, // حجم رقم مبيعات الشهر - month packets number size (px)
      labelFontSize: 16, // حجم العناوين الصغيرة (مبيعات الشهر، آخر يوم بيع...) - small labels
      lastDayNumberFontSize: 30, // حجم رقم باكتات آخر يوم بيع - last selling day packets size
      infoFontSize: 16, // حجم سطر التارجت وآخر يوم بيع - target line and last selling day
      progressHeight: 14, // سُمك شريط التارجت - target progress bar thickness
      percentFontSize: 22, // حجم نسبة التارجت - target percentage size
      chipFontSize: 16, // حجم كبسولات المنتجات (ربع / نص / كيلو...) - product chips font size
      cardGap: 12, // المسافة بين أجزاء الكارت - space between the parts of a card
      debtNumberFontSize: 22, // حجم رقم المديونية برّه (تحت آخر يوم بيع) - outstanding debt number (under the last selling day)
      debtBoxGap: 6, // المسافة بين خانة آخر يوم بيع وخانة المديونية - gap between the last-day box and the debt box
      // دايرة نسبة التارجت (زي دونت الحضور): برتقاني تحت التارجت، أخضر ولامع لو وصل - target ring (like the attendance donut)
      donutSize: 150, // حجم الدايرة بالبكسل (عرض = طول) - ring size in px (width = height)
      donutThickness: 16, // سُمك الدايرة - ring thickness
      donutPercentFontSize: 38, // حجم النسبة في نص الدايرة - percentage in the middle of the ring
      donutLabelFontSize: 14, // حجم كلمة "من التارجت" تحت النسبة - "من التارجت" under the percentage
      // لو الكارت أقصر من كده (شاشة لابتوب 1366×768) بتتطبق المقاسات الأصغر دي. التلفزيون مش بيتأثر
      // Cards shorter than this (a 1366x768 laptop) use the smaller sizes below. The TV is not affected
      compactBelowCardHeight: 330,
      compact: {
        donutSize: 104,
        donutThickness: 12,
        donutPercentFontSize: 26,
        donutLabelFontSize: 11,
        nameFontSize: 24,
        vanFontSize: 13,
        monthNumberFontSize: 50,
        labelFontSize: 14,
        lastDayNumberFontSize: 22,
        infoFontSize: 14,
        progressHeight: 10,
        percentFontSize: 18,
        chipFontSize: 14,
        cardGap: 6,
        debtNumberFontSize: 17,
        debtBoxGap: 4,
      },
    },

    // الموزعين (الصفحة 4) - distributors page
    distributorsPage: {
      summaryHeight: 64, // ارتفاع الشريط اللي فوق - top summary strip height
      summaryNumberFontSize: 32, // حجم أرقام الشريط اللي فوق - summary numbers font size
      featuredWidth: 1.15, // عرض عمود الموزع الكبير بالنسبة لكل عمود من التانيين (1 = نفس العرض) - featured column width vs each other column
      nameFontSize: 28, // حجم اسم الموزع - distributor name font size
      featuredNameFontSize: 40, // حجم اسم الموزع الكبير - featured name font size
      tallNameFontSize: 34, // حجم اسم الموزع اللي في عمود لوحده (fullHeight) - name size of a fullHeight card
      packetsFontSize: 56, // حجم رقم سحب الشهر بالباكت - month packets number size (px)
      featuredPacketsFontSize: 96, // حجم رقم سحب الشهر في الكارت الكبير - featured month packets size (px)
      tallPacketsFontSize: 80, // حجم رقم سحب الشهر في كارت fullHeight - month packets size in a fullHeight card
      amountFontSize: 22, // حجم المبلغ بالجنيه - amount size
      featuredAmountFontSize: 34, // حجم المبلغ في الكارت الكبير - featured amount size
      tallAmountFontSize: 30, // حجم المبلغ في كارت fullHeight - amount size in a fullHeight card
      labelFontSize: 16, // حجم العناوين الصغيرة - small labels
      infoFontSize: 17, // حجم عدد الطلبيات وآخر طلبية - orders count / last order text
      chipFontSize: 16, // حجم كبسولات المنتجات - product chips font size
      featuredChipFontSize: 20, // حجم كبسولات المنتجات في الكارت الكبير - featured product chips
      tallChipFontSize: 18, // حجم كبسولات المنتجات في كارت fullHeight - product chips in a fullHeight card
      lateDays: 10, // لو آخر طلبية من أكتر من كده يوم تظهر برتقاني كتحذير - last order older than this many days shows orange
      cardGap: 12, // المسافة بين أجزاء الكارت - space between the parts of a card
      // لو الكروت الصغيرة أقصر من كده (شاشة لابتوب 1366×768) بتتطبق المقاسات الأصغر دي. التلفزيون مش بيتأثر
      // Small cards shorter than this (a 1366x768 laptop) use the smaller sizes below. The TV is not affected
      compactBelowCardHeight: 330,
      compact: {
        nameFontSize: 22,
        featuredNameFontSize: 32,
        packetsFontSize: 44,
        featuredPacketsFontSize: 80,
        amountFontSize: 18,
        featuredAmountFontSize: 28,
        labelFontSize: 14,
        infoFontSize: 14,
        chipFontSize: 14,
        featuredChipFontSize: 17,
        tallNameFontSize: 28,
        tallPacketsFontSize: 64,
        tallAmountFontSize: 24,
        tallChipFontSize: 15,
        cardGap: 6,
      },
    },

    // الخزن والمحافظ (الصفحة 5) - wallets page
    // الأرقام = min(Max px, Scale cqi) و cqi = 1% من عرض الكارت نفسه، فالرقم عمره ما بيخرج برّه الكارت
    // Numbers = min(Max px, Scale cqi), cqi = 1% of the card's own width, so a number never overflows its card
    wallets: {
      summaryHeight: 76, // ارتفاع الشريط اللي فوق (إجمالي الخزن والمحافظ) - top strip height
      summaryNumberFontSize: 44, // حجم رقم الإجمالي - total number size
      summaryFlowFontSize: 24, // حجم وارد/منصرف اليوم في الشريط اللي فوق - today's in/out in the top strip
      nameMaxSize: 34, // أكبر حجم لاسم المحفظة - max wallet name size (px)
      nameScale: 6.5, // اسم المحفظة = 6.5% من عرض الكارت لو أصغر - name size as % of card width
      iconSize: 68, // حجم رسمة المحفظة / ماكينة فوري - wallet / Fawry picture size (px)
      balanceLabelFontSize: 18, // حجم كلمة "الرصيد" - "الرصيد" label
      balanceMaxSize: 72, // أكبر حجم لرقم الرصيد - max balance number size (px)
      balanceScale: 12, // رقم الرصيد = 12% من عرض الكارت لو أصغر - balance size as % of card width
      flowMaxSize: 30, // أكبر حجم لرقم الوارد / المنصرف - max incoming / outgoing number size (px)
      flowScale: 5.5, // رقم الوارد / المنصرف = 5.5% من عرض الكارت لو أصغر - in/out number size as % of card width
      flowLabelFontSize: 18, // حجم كلمة "وارد اليوم" / "منصرف اليوم" - in/out label
      lastMoveMaxSize: 17, // أكبر حجم لسطر "آخر حركة" - max "آخر حركة" line size
      lastMoveScale: 3.1, // سطر "آخر حركة" = 3.1% من عرض الكارت لو أصغر - "آخر حركة" size as % of card width
      cardGap: 12, // المسافة بين أجزاء الكارت - space between the parts of a card
      // لو الكارت أقصر من كده (شاشة لابتوب 1366×768) بتتطبق المقاسات الأصغر دي. التلفزيون مش بيتأثر
      // Cards shorter than this (a 1366x768 laptop) use the smaller sizes below. The TV is not affected
      compactBelowCardHeight: 400,
      compact: {
        nameMaxSize: 24,
        iconSize: 40,
        balanceLabelFontSize: 14,
        balanceMaxSize: 48,
        flowMaxSize: 20,
        flowLabelFontSize: 14,
        lastMoveMaxSize: 14,
        cardGap: 4,
      },
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
  // شاشة الأوبريتر (/operator): تسجيل الطرحات من الموبايل - من أي مكان
  // The operator screen (/operator): registering kiln exits from a phone, from anywhere
  // ============================================================
  // - الدخول برقم سري 4 أرقام في متغير البيئة OPERATOR_PIN (بيتشيك على السيرفر)، والكوكي 30 يوم
  // - الوزنات المستنية: الإيجنت بيبعت POST /api/scale/pending (x-it-secret) وبتتخزن في Upstash Redis 24 ساعة
  // - الوزن المباشر: الإيجنت بيبعته لـ POST /api/scale/live والموبايل بيقراه من Vercel (من أي مكان، من غير الشبكة المحلية)
  // - Login with the 4-digit OPERATOR_PIN env var (checked on the server), cookie for 30 days
  // - Pending weighings: the agent POSTs /api/scale/pending (x-it-secret), kept in Upstash Redis for 24 h
  // - Live weight: the agent POSTs /api/scale/live and phones read it from Vercel (anywhere, no LAN)
  operator: {
    // الأفران بالترتيب: الزرار بيكتب الرقم، والقيمة اسم الـ Workstation في ERPNext بالظبط
    // Kilns in order: the button shows the number, the value is the exact ERPNext Workstation name
    kilns: ["فرن 1", "فرن 2", "فرن 3", "فرن 4", "فرن 5", "فرن 6"],
    rooms: ["1", "2"], // نفس خيارات حقل room - same as the room Select options
    // حقول Kiln Exit: الصافي من erp.batches.weightField، والممتلئ/الفاضي من fullWeightField/emptyWeightField
    // manualField = Check "اتكتب بالإيد" (لو مش موجود في الـ DocType مش بيتكتب - ضيفه من Customize Form)
    // Kiln Exit fields: net / gross / tare from erp.batches; manualField is a Check written only if the DocType has it
    manualField: "manual_entry",
    trolleyDoctype: "Trolley", // trolley_no (رقم) + empty_weight_kg (الوزن الفاضي)
    pendingPollSeconds: 3, // كل قد ايه بنسأل على الوزنات المستنية والصفحة مفتوحة وظاهرة - while open and visible
    todayPollSeconds: 30, // "آخر الطرحات" - the today list
    pendingTtlHours: 24, // الوزنة المستنية بتتمسح لوحدها بعد كده - a pending weighing expires after this
    duplicateTrolleyMinutes: 10, // تحذير لو نفس الترول اتسجل في آخر كام دقيقة - warn if the trolley was saved this recently
    // الوزن المباشر من /api/scale/live (الإيجنت بيبعته لـ Vercel) - مفيش أي طلب على شبكة المصنع من الموبايل
    // Live weight from /api/scale/live (the agent posts it to Vercel) - the phone never calls the factory LAN
    livePollSeconds: 2, // كل قد ايه والصفحة ظاهرة - how often, while the page is visible
    liveStaleSeconds: 60, // مفيش تحديث من الإيجنت من المدة دي = "الميزان مش متصل" - no update for this long = disconnected
    maxKg: 5000, // أكبر وزن مقبول - the largest accepted weight
    pinMaxTries: 5, // غلطات الرقم السري المسموحة لكل جهاز (IP)… - wrong PINs allowed per IP…
    pinLockMinutes: 15, // …في الوقت ده، وبعدها بيتقفل لحد ما يخلص - …within this window, then locked until it ends
    sessionDays: 30,
  },

  // ============================================================
  // الجزء التالت: ألوان الصفحة 2 (رصيد المخازن)
  // Part 3: page 2 (stock) colors
  // ============================================================

  page2: {
    // لون كل قسم: الخط الجانبي والأيقونة والخلفية الخفيفة وإطار الكروت ورقم الإجمالي
    // Each section's accent color: side bar, icon, faint background, card borders and total numbers
    // اكتب اللون بالشكل ده "#RRGGBB" - use the "#RRGGBB" format
    colors: {
      packaged: "#FF7A00", // المنتجات المعبأة (برتقالي) - packaged products (orange)
      sacks: "#10B981", // الشكاير (أخضر زمردي) - sacks (emerald green)
      retail: "#8B5CF6", // كارت مخزن القطاعي (بنفسجي، برّه إطار الشكاير) - the retail warehouse card (violet, outside the sacks frame)
      retailText: "#C4B5FD", // أرقام وكلام كارت القطاعي (بنفسجي فاتح) - the retail card's numbers and labels (light violet)
      rawMaterials: "#C8873A", // المواد الخام: الأخشاب ومواد التعبئة (بني خشبي) - raw materials: wood + packaging (wood brown)
    },
  },
};
