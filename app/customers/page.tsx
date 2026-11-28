import type { Metadata } from "next";
import CustomersPage from "@/components/customers/CustomersPage";

// صفحة "👥 العملاء": برّه تقليب التلفزيون، بتتفتح من زرار في صفحة مبيعات المناديب (ورا الـ middleware زي الداشبورد)
// The "👥 العملاء" page: outside the TV rotation, opened from the reps sales page (behind the middleware like the dashboard)
export const metadata: Metadata = {
  title: "العملاء - الصفوة",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CustomersPage />;
}
