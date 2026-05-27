import { AnimatedRoutes } from "@/app/animated-routes";
import { TopNav } from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isCanvasPage = pathname === "/canvas";
  const isViewportWorkspacePage = pathname === "/canvas" || pathname === "/image" || pathname === "/image-manager";

  return (
    <main className={cn("bg-background text-foreground", isViewportWorkspacePage ? "h-dvh overflow-hidden" : "min-h-screen")}>
      <div
        className={cn(
          "flex w-full flex-col px-3 pt-2 pb-3 sm:px-5 lg:px-6",
          isCanvasPage ? "gap-3" : "gap-2",
          isViewportWorkspacePage
            ? "h-full min-h-0 max-w-none overflow-hidden"
            : "mx-auto min-h-screen max-w-[1440px]",
        )}
      >
        <TopNav />
        <AnimatedRoutes />
      </div>
    </main>
  );
}
