"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePolling } from "@/lib/usePolling";
import Header from "@/components/Header";
import AttendanceSection from "@/components/AttendanceSection";
import StockSection from "@/components/StockSection";
import FloorWorkersSection from "@/components/FloorWorkersSection";
import TreasurySection from "@/components/TreasurySection";
import PageNav from "@/components/PageNav";
import ProductionPage, { ProductionTarget } from "@/components/ProductionPage";
import ActivityFeed from "@/components/ActivityFeed";
import ProductionDetailsPanel from "@/components/ProductionDetailsPanel";
import ProductionMonthPanel from "@/components/ProductionMonthPanel";
import CharitySection from "@/components/CharitySection";
import CharityDetailsPanel, { type CharityPanelTarget } from "@/components/CharityDetailsPanel";
import SalesRepsSection from "@/components/SalesRepsSection";
import AttendanceDetailsPanel from "@/components/AttendanceDetailsPanel";
import AccountDetailsPanel from "@/components/AccountDetailsPanel";
import DistributorsSection from "@/components/DistributorsSection";
import WalletsSection from "@/components/WalletsSection";
import StockDetailsPanel, { StockPanelTarget } from "@/components/StockDetailsPanel";
import WhatsAppPage from "@/components/whatsapp/WhatsAppPage";
import WaSpotlight from "@/components/whatsapp/WaSpotlight";
import SuppliersPage from "@/components/SuppliersPage";
import SupplierDetailsPanel from "@/components/SupplierDetailsPanel";
import OperatorQrButton from "@/components/OperatorQrButton";
import { useLiveKilnExits, withLiveExits } from "@/lib/kiln-live";
import { ALERTS_ENABLED, sameExit, useChime, useKilnExitAlerts } from "@/lib/kiln-alert";
import { useWhatsAppAlerts, WaSpotGroup } from "@/lib/wa-alert";
import { useViewportFit, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/useViewportFit";
import { DashboardData, ProductionData } from "@/lib/types";
import { OfflineCard } from "@/components/OfflineBadge";
import { useLastGood } from "@/lib/useLastGood";
import { dashboardConfig } from "@/config/dashboard.config";

// لو الـ API رجّع error بنرمي عشان SWR يسيب آخر داتا سليمة - throw on an error status so SWR keeps the last good data
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const REFRESH_MS = dashboardConfig.erp.refreshSeconds * 1000;
// الإنتاج والأفران بيتحدث أسرع (كل production.refreshSeconds) - production refreshes faster
const PRODUCTION_REFRESH_MS = dashboardConfig.production.refreshSeconds * 1000;

// الصفحات الشغالة بس (enabled: false = متوقفة) - enabled pages only
const PAGES = dashboardConfig.pages.list.filter((page) => page.enabled !== false);

// الصفحة الجاية في التقليب التلقائي: بيعدي الصفحات اللي inRotation: false (بتتفتح بالأسهم والنقط بس)
// The next page for auto-rotation: skips inRotation: false pages (those open by arrows / dots only)
function nextInRotation(from: number): number {
  for (let step = 1; step <= PAGES.length; step++) {
    const index = (from + step) % PAGES.length;
    if (PAGES[index].inRotation !== false) return index;
  }
  return from;
}
// رقم حساب الخزنة (نفس حساب الكارت: "1110 - الخزينة - AC" -> "1110") - the treasury card's account number
const treasuryField = dashboardConfig.erp.treasury.balance;
const TREASURY_ACCOUNT_NUMBER = treasuryField.source === "erp" ? treasuryField.account.split(" - ")[0].trim() : "1110";

// مفتاح حفظ تثبيت الصفحة - localStorage key for the page pin
const PIN_KEY = "elsafwa:pinned";
// الإضاءة الخفيفة ورا الكروت - ambient light settings
const ambient = dashboardConfig.sizes.ambient;

// ?page=2 (رقم الصفحة) أو ?page=stock (اسمها) - page from the URL: 1-based number or page id
function pageFromUrl(): number {
  const param = new URLSearchParams(window.location.search).get("page");
  if (!param) return 0;
  const byId = PAGES.findIndex((page) => page.id === param);
  if (byId >= 0) return byId;
  const byNumber = parseInt(param, 10) - 1;
  return byNumber >= 0 && byNumber < PAGES.length ? byNumber : 0;
}

export default function Dashboard() {
  // الصفحة الحالية - current page index (data stays in SWR, so switching never refetches)
  const [pageIndex, setPageIndex] = useState(0);
  const pageId = PAGES[pageIndex]?.id;
  // تفاصيل الإنتاج مفتوحة - the production details panel target
  const [productionTarget, setProductionTarget] = useState<ProductionTarget | null>(null);

  // /api/dashboard بيغذي كل الصفحات ما عدا الإنتاج و IT، فبيقف وهما على الشاشة (أو والتاب مستخبي)
  // Polls every refreshSeconds without reloading (old data stays until new data arrives). It feeds every page except
  // production and IT, so it stops while those are on screen, and whenever the tab is hidden
  const { data: serverData, error } = usePolling<DashboardData>("/api/dashboard", fetcher, REFRESH_MS, pageId !== "production" && pageId !== "whatsapp" && pageId !== "suppliers", {
    // النت رجع = اسأل حالا - internet back = refetch right away
    revalidateOnReconnect: true,
    // يفضل يسأل وهو أوفلاين: الطلب بيفشل فتظهر "غير متصل" والأرقام القديمة فاضلة - keep polling offline so the badge shows
    refreshWhenOffline: true,
    // لو الطلب فشل: إعادة كل ~15 ثانية وبتطول لحد دقيقة، ومش بتقف أبدا - on failure retry from ~15 s backing off to 60 s, forever
    onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
      const delay = Math.min(60_000, 15_000 * 2 ** Math.min(retryCount - 1, 2));
      setTimeout(() => revalidate({ retryCount }), delay);
    },
  });

  // كل كارت بيحتفظ بآخر قيمة نجحت لوحده - every card keeps its own last good value
  const { view: data, cards } = useLastGood(serverData);

  // الإنتاج والأفران: طلب لوحده كل production.refreshSeconds وصفحة الإنتاج ظاهرة بس (أو تفاصيلها مفتوحة)، ولو فشل بتفضل آخر داتا مع "غير متصل"
  // Production: its own request every production.refreshSeconds, only while its page is shown (or its panel is open);
  // on failure the last data stays, marked offline
  const { data: productionRaw, error: productionError } = usePolling<ProductionData>(
    "/api/production",
    fetcher,
    PRODUCTION_REFRESH_MS,
    // تنبيه الطرحة الجديدة شغال = بيسأل على كل الصفحات - the new-exit alert on = polled on every page
    ALERTS_ENABLED || pageId === "production" || productionTarget !== null,
    { revalidateOnReconnect: true, refreshWhenOffline: true }
  );
  // جوه المصنع: الطرحات على طول من الإيجنت بتتدمج فوق بيانات ERPNext (برا المصنع = زي ما هي)
  // Inside the factory: live exits from the agent merged over the ERPNext data (outside = unchanged)
  const liveExits = useLiveKilnExits(ALERTS_ENABLED || pageId === "production" || productionTarget !== null);
  const production = useMemo(() => {
    if (!productionRaw) return null;
    const base = productionError ? { ...productionRaw, offline: true } : productionRaw;
    return withLiveExits(base, liveExits.exits);
  }, [productionRaw, productionError, liveExits.exits]);
  const [operatorQrOpen, setOperatorQrOpen] = useState(false);
  // لوحة "📊 ملخص الشهر" (زرار في هيدر صفحة الإنتاج) - the "📊 ملخص الشهر" panel (production page header button)
  const [monthSummaryOpen, setMonthSummaryOpen] = useState(false);
  // صفحة تانية = الـ QR واللوحة يتقفلوا (عشان التقليب ميفضلش واقف) - another page closes them (rotation never stays paused)
  useEffect(() => {
    if (pageId !== "production") {
      setOperatorQrOpen(false);
      setMonthSummaryOpen(false);
    }
  }, [pageId]);
  const closeMonthSummary = useCallback(() => setMonthSummaryOpen(false), []);
  // فرن / نوع من ملخص الشهر: تفاصيله يوم بيوم مكانه - a kiln / type from the month summary opens its day-by-day details
  const openFromMonth = useCallback((target: ProductionTarget) => {
    setMonthSummaryOpen(false);
    setProductionTarget(target);
  }, []);
  const closeProduction = useCallback(() => setProductionTarget(null), []);

  const [flashSection, setFlashSection] = useState<string | null>(null);
  const prevDataRef = useRef<DashboardData | null>(null);
  const cols = dashboardConfig.sizes.topRowColumns;
  const { slideMs, slideDistance } = dashboardConfig.sizes.pageNav;
  const autoRotate = dashboardConfig.pages.autoRotate;

  // بيزيد مع كل تقليب عشان العداد يبدأ من الأول حتى لو الصفحة هي هي - bumps on every switch so the timer restarts
  const [switchCount, setSwitchCount] = useState(0);
  // اتجاه آخر تقليب: 1 = الجاية (من تحت)، -1 = اللي فاتت (من فوق) - last switch direction: 1 next, -1 previous
  const [direction, setDirection] = useState<1 | -1>(1);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevPageRef = useRef(0);
  useEffect(() => setPageIndex(pageFromUrl()), []);
  // لوحة تفاصيل مفتوحة = التقليب واقف (والأسهم كمان) - a details panel is open: rotation (and arrow keys) paused
  const [salesDetailsOpen, setSalesDetailsOpen] = useState(false);
  // تفاصيل حدث من "اللي بيحصل دلوقتي" مفتوحة - an activity event's details are open
  const [activityDetailsOpen, setActivityDetailsOpen] = useState(false);
  // قسم الحضور المفتوح (من كروت الحضور في الرئيسية) - the open attendance section (from the main page cards)
  const [attendanceSection, setAttendanceSection] = useState<string | null>(null);
  const closeAttendance = useCallback(() => setAttendanceSection(null), []);
  // لوحة تفاصيل الخزنة (من كارت رصيد الخزنة) - the treasury details panel (from the treasury card)
  const [treasuryOpen, setTreasuryOpen] = useState(false);
  const closeTreasury = useCallback(() => setTreasuryOpen(false), []);
  // المحفظة المفتوحة (من كروت صفحة الخزن والمحافظ) - the open wallet (from the wallets page cards)
  const [wallet, setWallet] = useState<{ accountNumber: string; title: string } | null>(null);
  const closeWallet = useCallback(() => setWallet(null), []);
  // صندوق الصدقات المفتوح (أو كل الصناديق) - the open charity fund (or all funds)
  const [charityTarget, setCharityTarget] = useState<CharityPanelTarget | null>(null);
  const closeCharity = useCallback(() => setCharityTarget(null), []);
  // تفاصيل كارت في أرصدة المخازن - the open stock card details
  const [stockItem, setStockItem] = useState<StockPanelTarget | null>(null);
  const closeStockItem = useCallback(() => setStockItem(null), []);
  // المورد المفتوح (صفحة الموردين) - the open supplier (suppliers page)
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const closeSupplier = useCallback(() => setSupplierName(null), []);
  // شات واتساب مفتوح صفحة كاملة (صفحة واتساب) - a WhatsApp chat open full page (the WhatsApp page)
  const [waChatOpen, setWaChatOpen] = useState(false);
  // تثبيت الصفحة (محفوظ في المتصفح عشان يفضل بعد الريفرش، وقفل اللوحة مش بيلغيه)
  // Page pin, kept in localStorage so it survives a refresh (closing a panel never unpins)
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem(PIN_KEY) === "1");
    } catch {}
  }, []);
  const togglePin = useCallback(() => {
    setPinned((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  const paused =
    salesDetailsOpen || attendanceSection !== null || treasuryOpen || wallet !== null || stockItem !== null || productionTarget !== null || activityDetailsOpen || charityTarget !== null || waChatOpen || supplierName !== null || operatorQrOpen || monthSummaryOpen;

  // تنبيه طرحة جديدة: بيستنى لو لوحة تفاصيل مفتوحة - the new kiln exit alert; waits while a details panel is open
  const chime = useChime();
  const alert = useKilnExitAlerts(production, paused, chime.play);
  const alertOn = alert.current !== null;
  // تنبيه الواتساب: بعد الطرحة (الطرحة ليها الأولوية)، وبيستنى لو لوحة أو شات مفتوح - the WhatsApp alert (kiln first)
  const waAlert = useWhatsAppAlerts({ blocked: paused, kilnBusy: alertOn || alert.pending > 0, playChime: chime.playSoft });
  const waOn = waAlert.active;
  // الضغط على الكارت بيفتح الشات بتاعه في صفحة الواتساب - clicking the card opens its chat on the WhatsApp page
  const [waOpenRequest, setWaOpenRequest] = useState<{ group: WaSpotGroup; nonce: number } | null>(null);
  // الطرحة بآخر بياناتها (الوزن ممكن يوصل بعدين من ERPNext) - the exit with its latest values (ERPNext may add the weight later)
  const alertExit = useMemo(() => {
    const cur = alert.current;
    if (!cur) return null;
    return production?.exits.find((e) => sameExit(e, cur)) ?? cur;
  }, [alert.current, production]);

  const changePage = useCallback((index: number, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setPageIndex(index);
    setSwitchCount((count) => count + 1);
    const url = new URL(window.location.href);
    // اسم الصفحة مش رقمها، عشان لو الترتيب اتغير التلفزيون يفتح نفس الصفحة بعد الريفريش
    // The page id, not its number, so a reload after reordering still opens the same page
    url.searchParams.set("page", PAGES[index]?.id ?? String(index + 1));
    window.history.replaceState(null, "", url);
  }, []);

  // التنبيه: يروح لصفحة الإنتاج (حتى لو صفحة تانية متثبتة)، ولما يخلص يرجع للمتثبتة - the alert jumps to production
  // (even over a pinned page) and returns to the pinned page afterwards
  const productionIndex = PAGES.findIndex((p) => p.id === "production");
  const returnPageRef = useRef<number | null>(null);
  const wasAlertOn = useRef(false);
  useEffect(() => {
    if (productionIndex < 0) return;
    if (alertOn) {
      if (!wasAlertOn.current) returnPageRef.current = pinned && pageIndex !== productionIndex ? pageIndex : null;
      wasAlertOn.current = true;
      if (pageIndex !== productionIndex) changePage(productionIndex, 1);
    } else if (wasAlertOn.current) {
      wasAlertOn.current = false;
      const back = returnPageRef.current;
      returnPageRef.current = null;
      if (back !== null && pinned) changePage(back, -1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertOn, alert.current]);

  // تنبيه الواتساب (spotlight): يروح لصفحة الواتساب طول ما الكروت شغالة واللمعة، وبعدين يرجع للصفحة اللي كان عليها
  // (والمتثبتة بتفضل متثبتة). لو تنبيه طرحة جه في النص هو اللي بيكسب، والواتساب بيرجع بعده
  // The WhatsApp spotlight: on the WhatsApp page while cards play and the flash runs, then back to the previous page
  // (a pinned page stays pinned). A kiln alert in between wins; WhatsApp resumes after it
  const whatsappIndex = PAGES.findIndex((p) => p.id === "whatsapp");
  const waReturnRef = useRef<number | null>(null);
  const wasWaOn = useRef(false);
  useEffect(() => {
    if (whatsappIndex < 0) return;
    if (alertOn) {
      wasWaOn.current = false;
      waReturnRef.current = null;
      return;
    }
    if (waOn) {
      if (!wasWaOn.current) waReturnRef.current = pageIndex !== whatsappIndex ? pageIndex : null;
      wasWaOn.current = true;
      if (pageIndex !== whatsappIndex) changePage(whatsappIndex, 1);
    } else if (wasWaOn.current) {
      wasWaOn.current = false;
      const back = waReturnRef.current;
      waReturnRef.current = null;
      if (back !== null) changePage(back, -1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waOn, alertOn]);
  const openFromSpotlight = useCallback(
    (group: WaSpotGroup) => {
      // نفضل على صفحة الواتساب والشات مفتوح - stay on the WhatsApp page with the chat open
      waReturnRef.current = null;
      setWaChatOpen(true);
      waAlert.drop();
      setWaOpenRequest({ group, nonce: Date.now() });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waAlert.drop]
  );

  // الكيبورد: تحت / PageDown / الشمال = الجاية، فوق / PageUp / اليمين = اللي فاتت (وبتلف)
  // Keyboard: ArrowDown / PageDown / ArrowLeft = next, ArrowUp / PageUp / ArrowRight = previous (wraps around)
  useEffect(() => {
    const NEXT_KEYS = ["ArrowDown", "PageDown", "ArrowLeft"];
    const PREV_KEYS = ["ArrowUp", "PageUp", "ArrowRight"];
    const onKey = (e: KeyboardEvent) => {
      const step = NEXT_KEYS.includes(e.key) ? 1 : PREV_KEYS.includes(e.key) ? -1 : 0;
      if (paused || step === 0) return;
      // مش جوه خانة كتابة - not while typing in a field
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      e.preventDefault();
      changePage((pageIndex + step + PAGES.length) % PAGES.length, step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, paused, changePage]);

  // التقليب التلقائي: كل صفحة بمدتها - auto rotate, each page for its own duration
  // (the timer restarts after every switch, manual or automatic)
  useEffect(() => {
    const seconds = PAGES[pageIndex]?.durationSeconds;
    const next = nextInRotation(pageIndex);
    // التنبيه شغال = التقليب واقف، ولما يخلص العداد بيبدأ من الأول - alert on = rotation held; afterwards the timer restarts
    if (paused || pinned || alertOn || waOn || !autoRotate || next === pageIndex || !(seconds > 0)) return;
    const timer = setTimeout(() => changePage(next, 1), seconds * 1000);
    return () => clearTimeout(timer);
  }, [pageIndex, switchCount, paused, pinned, alertOn, waOn, autoRotate, changePage]);

  // حركة التقليب: الجديدة بتدخل من تحت (الجاية) أو من فوق (اللي فاتت)، والقديمة بتخرج عكسها وهي بتختفي.
  // "حركة أقل" في الجهاز: من غير حركة، ظهور تدريجي بس
  // Switch animation: the new page enters from below (next) or above (previous), the old one leaves the other
  // way while fading. prefers-reduced-motion: no movement, the fade only
  useEffect(() => {
    const previous = prevPageRef.current;
    prevPageRef.current = pageIndex;
    if (switchCount === 0 || previous === pageIndex) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const options: KeyframeAnimationOptions = { duration: slideMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
    const shift = direction * slideDistance;
    const entering = pageRefs.current[pageIndex]?.animate(
      [{ transform: `translateY(${shift}px)` }, { transform: "translateY(0)" }],
      options
    );
    const leaving = pageRefs.current[previous]?.animate(
      [{ transform: "translateY(0)" }, { transform: `translateY(${-shift}px)` }],
      options
    );
    return () => {
      entering?.finish();
      leaving?.finish();
    };
  }, [pageIndex, switchCount, direction, slideMs, slideDistance]);

  useEffect(() => {
    if (data && prevDataRef.current) {
      const prev = prevDataRef.current;

      // Check for changes in treasury balance
      if (data.treasury.balance !== prev.treasury.balance) {
        setFlashSection("treasury");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in management attendance
      if (data.attendance.management.present !== prev.attendance.management.present) {
        setFlashSection("attendance");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in workers attendance (with drivers, reps and guards)
      if (JSON.stringify(data.attendance) !== JSON.stringify(prev.attendance)) {
        setFlashSection("floorWorkers");
        setTimeout(() => setFlashSection(null), 500);
      }

      // Check for changes in charity funds
      if (JSON.stringify(data.charity) !== JSON.stringify(prev.charity)) {
        setFlashSection("charity");
        setTimeout(() => setFlashSection(null), 500);
      }
    }

    if (data) {
      prevDataRef.current = data;
    }
  }, [data]);

  // "غير متصل" بيظهر بس لو الجلب أو ERPNext فشل (مش وقت التحميل) - offline only when the fetch or ERPNext failed
  const isConnected = !error && !data?.erpOffline;

  const flashClass = (section: string) =>
    `min-h-0 ${flashSection === section ? "animate-flash" : ""}`;

  const renderPage = (id: string, data: DashboardData) => {
    switch (id) {
      case "main":
        return (
          <div
            className="grid gap-4 h-full"
            style={{
              gridTemplateColumns: `minmax(0,${cols.treasury}fr) minmax(0,${cols.management}fr) minmax(0,${cols.workers}fr) minmax(0,${cols.activity}fr)`,
              gridTemplateRows: "minmax(0,1fr)",
            }}
          >
            <div className={flashClass("treasury")}>
              {cards.treasury.missing ? (
                <OfflineCard title="رصيد الخزنة" />
              ) : (
                <TreasurySection
                  data={data.treasury}
                  offline={cards.treasury.offline}
                  onOpen={() => setTreasuryOpen(true)}
                />
              )}
            </div>
            <div className={flashClass("attendance")}>
              {cards.attendance.missing ? (
                <OfflineCard title="حضور الإدارة" />
              ) : (
                <AttendanceSection
                  data={data.attendance.management}
                  updatedAt={data.updatedAt}
                  offline={cards.attendance.offline}
                  onOpen={() => setAttendanceSection("management")}
                />
              )}
            </div>
            <div className={flashClass("floorWorkers")}>
              {cards.attendance.missing ? (
                <OfflineCard title="حضور عمال" />
              ) : (
                <FloorWorkersSection
                  data={data.attendance}
                  offline={cards.attendance.offline}
                  onOpenSection={setAttendanceSection}
                />
              )}
            </div>
            {/* اللي بيحصل دلوقتي (بيفضل شغال حتى والصفحة متقلبة) - the live feed (keeps running while pages rotate) */}
            <div className="min-h-0">
              <ActivityFeed active={pageId === "main"} onDetailsChange={setActivityDetailsOpen} />
            </div>
          </div>
        );
      case "production":
        return (
          <ProductionPage
            data={production}
            lan={liveExits.lan}
            onOpen={setProductionTarget}
            alertExit={alertExit}
            alertPending={alert.pending}
            onDismissAlert={alert.dismiss}
            active={pageId === "production"}
          />
        );
      case "stock":
        return <StockSection data={data.stock} className="h-full min-h-0" onOpenItem={setStockItem} />;
      case "sales":
        return <SalesRepsSection data={data.sales ?? null} onDetailsChange={setSalesDetailsOpen} />;
      case "distributors":
        return <DistributorsSection data={data.distributors ?? null} />;
      case "wallets":
        return <WalletsSection
            data={data.wallets ?? null}
            onOpenWallet={(card) => setWallet({ accountNumber: card.accountNumber, title: card.name })}
          />;
      case "suppliers":
        return <SuppliersPage active={pageId === "suppliers"} onOpen={setSupplierName} />;
      case "whatsapp":
        return (
          <WhatsAppPage
            active={pageId === "whatsapp"}
            onOverlayChange={setWaChatOpen}
            flash={waAlert.flash}
            openRequest={waOpenRequest}
            refreshKey={waAlert.activity}
          />
        );
      case "charity":
        return (
          <div className={`h-full ${flashClass("charity")}`}>
            <CharitySection data={data.charity} onOpen={setCharityTarget} />
          </div>
        );
      default:
        return null;
    }
  };

  // شاشة صغيرة (موبايل بالعرض): الصفحة على لوحة 1920×1080 متصغرة بـ scale. الشاشات الكبيرة مفيش أي تغيير
  // Small screens (phone landscape): the page on a 1920x1080 canvas scaled down. Large screens: unchanged
  const fit = useViewportFit();

  if (fit.portrait) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="text-6xl">📱</span>
        <p className="text-white text-2xl font-bold">لف الموبايل بالعرض</p>
      </div>
    );
  }

  const dashboard = (
    <div
      className={`${fit.scale ? "" : "relative h-screen "}flex flex-col overflow-hidden bg-background`}
      style={
        fit.scale
          ? {
              position: "absolute",
              left: "50%",
              top: "50%",
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `translate(-50%, -50%) scale(${fit.scale})`,
            }
          : undefined
      }
    >
      {/* إضاءة خفيفة ورا الكروت (CSS بس) - soft ambient glow behind the cards (CSS only) */}
      {ambient.enabled && (
        <div className="ambient-light" aria-hidden style={{ opacity: ambient.opacity }}>
          <span className="ambient-blob ambient-blob-1" />
          <span className="ambient-blob ambient-blob-2" />
          <span className="ambient-blob ambient-blob-3" />
        </div>
      )}

      <Header
        pinned={pinned}
        isConnected={isConnected}
        page={PAGES[pageIndex]}
        pageNumber={pageIndex + 1}
        pageCount={PAGES.length}
        pageTitles={PAGES.map((p) => p.title)}
        actions={
          <>
            {/* المتصفح مانع الصوت: ضغطة واحدة بتفعله - the browser blocks sound: one click enables it */}
            {chime.needsUnlock && (
              <button
                type="button"
                onClick={chime.unlock}
                // صفحة الإنتاج على شاشة أضيق من 1600: الزرار ده بيستخبى وبيظهر 🔔 صغير جوه عمود الأزرار (عشان الساعة متتغطاش)
                // On the production page under 1600 wide this one hides; a small 🔔 shows in the button stack instead
                className={`px-3 py-1.5 rounded-xl border border-brandOrange/60 bg-brandOrange/10 text-brandOrange text-sm font-bold whitespace-nowrap hover:bg-brandOrange/20 transition-colors ${
                  pageId === "production" ? "hidden min-[1600px]:inline-block" : ""
                }`}
                title="المتصفح مانع الصوت - اضغط عشان صوت الطرحة الجديدة يشتغل"
              >
                🔔 فعّل الصوت
              </button>
            )}
            {/* صفحة الإنتاج: "📱 شاشة الأوبريتر" وتحته "📊 ملخص الشهر" (فوق بعض، عشان الساعة والتاريخ يفضلوا باينين)
                The production page: the operator button with the month summary under it (stacked, so the clock stays visible) */}
            {pageId === "production" && (
              <div className="flex flex-col items-stretch gap-1">
                <OperatorQrButton open={operatorQrOpen} setOpen={setOperatorQrOpen} />
                <div className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => setMonthSummaryOpen(true)}
                    className="flex-1 px-2 min-[1600px]:px-3 py-1 bg-background border border-cardBorder rounded-xl hover:bg-cardBorder transition-colors text-[13px] min-[1600px]:text-[14px] leading-tight font-bold text-gray-200 whitespace-nowrap"
                    title="ملخص الشهر والإنتاج بالساعة"
                  >
                    📊 ملخص الشهر
                  </button>
                  {chime.needsUnlock && (
                    <button
                      type="button"
                      onClick={chime.unlock}
                      className="min-[1600px]:hidden px-2 rounded-xl border border-brandOrange/60 bg-brandOrange/10 text-[14px] leading-tight hover:bg-brandOrange/20"
                      title="فعّل الصوت — المتصفح مانع الصوت"
                      aria-label="فعّل الصوت"
                    >
                      🔔
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        }
        onPageChange={changePage}
        nav={<PageNav pages={PAGES} current={pageIndex} onChange={changePage} pinned={pinned} onTogglePin={togglePin} />}
      />

      <main className="relative flex-1 min-h-0 p-4 overflow-hidden">
        {data ? (
          // كل الصفحات فوق بعض والحالية بس اللي ظاهرة - pages are stacked; only the active one is visible
          <div className="relative h-full">
            {PAGES.map((page, index) => {
              const active = index === pageIndex;
              return (
                <div
                  key={page.id}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  aria-hidden={!active}
                  className={`absolute inset-0 transition-[opacity,visibility] ${
                    active ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  }`}
                  style={{ transitionDuration: `${slideMs}ms` }}
                >
                  {renderPage(page.id, data)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-xl">جاري تحميل البيانات...</p>
          </div>
        )}
      </main>

      {/* رسالة واتساب جديدة: الكارت الكبير - a new WhatsApp message: the big card */}
      <WaSpotlight spot={waAlert.current} pending={waAlert.pending} onDismiss={waAlert.dismiss} onOpen={openFromSpotlight} />
      {attendanceSection && <AttendanceDetailsPanel section={attendanceSection} onClose={closeAttendance} />}
      {treasuryOpen && (
        <AccountDetailsPanel accountNumber={TREASURY_ACCOUNT_NUMBER} title="رصيد الخزنة" mode="recent" onClose={closeTreasury} />
      )}
      {wallet && <AccountDetailsPanel accountNumber={wallet.accountNumber} title={wallet.title} mode="months" onClose={closeWallet} />}
      {charityTarget && <CharityDetailsPanel target={charityTarget} onClose={closeCharity} />}
      {supplierName && <SupplierDetailsPanel key={supplierName} name={supplierName} onClose={closeSupplier} />}
      {monthSummaryOpen && production && <ProductionMonthPanel data={production} onClose={closeMonthSummary} onOpen={openFromMonth} />}
      {productionTarget && production && (
        <ProductionDetailsPanel data={production} target={productionTarget} onClose={closeProduction} />
      )}
      {stockItem && <StockDetailsPanel key={`${stockItem.group}|${stockItem.name}|${stockItem.variant ?? ""}`} target={stockItem} onClose={closeStockItem} />}
    </div>
  );

  return fit.scale ? <div className="fixed inset-0 overflow-hidden bg-background">{dashboard}</div> : dashboard;
}
