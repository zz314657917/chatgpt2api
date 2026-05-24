import { AnimatedRoutes } from "@/app/animated-routes";
import { TopNav } from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

export function AppShell() {
  const location = useLocation();
  const isCanvasPage = location.pathname.replace(/\/+$/, "") === "/canvas";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        className={cn(
          "flex min-h-screen w-full flex-col gap-2 px-3 py-3 sm:px-5 lg:px-6",
          isCanvasPage ? "max-w-none" : "mx-auto max-w-[1440px]",
        )}
      >
        <TopNav />
        <AnimatedRoutes />
      </div>
    </main>
  );
}
