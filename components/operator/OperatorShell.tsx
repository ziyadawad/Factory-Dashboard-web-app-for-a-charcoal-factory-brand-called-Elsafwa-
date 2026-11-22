// الإطار المشترك: خلفية غامقة بإضاءة هادية، وscroll للصفحة كلها (الـ body في الداشبورد overflow hidden)
// The shared frame: dark background with a soft ambient glow, and a scrolling page (the dashboard body is overflow hidden)
export default function OperatorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[520px] rounded-full bg-brandOrange/20 blur-[120px]" />
        <div className="absolute -bottom-48 -left-24 h-[380px] w-[380px] rounded-full bg-brandBlue/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[300px] w-[300px] rounded-full bg-brandDeepOrange/10 blur-[110px]" />
      </div>
      <div className="relative mx-auto w-full max-w-[560px] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        {children}
      </div>
    </div>
  );
}
