import { AnimatedRoutes } from "@/app/animated-routes";
import { TopNav } from "@/components/top-nav";
import { MobileNavProvider } from "@/components/mobile-nav-provider";
import { UsageAnalyticsTracker } from "@/components/usage-analytics-tracker";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isCanvasPage = pathname === "/canvas";
  const isBeadsWorkbench = pathname.startsWith("/beads/");
  const isEmbeddedMode = new URLSearchParams(location.search).get("ui_mode") === "embedded";
  const isViewportWorkspacePage = pathname === "/canvas" || pathname === "/image" || pathname === "/image-arena" || pathname === "/ecommerce-suite" || pathname === "/image-manager" || pathname === "/social" || isBeadsWorkbench;
  const shellPadding = isEmbeddedMode && isViewportWorkspacePage
    ? "px-2 pt-2 pb-2 sm:px-2 lg:px-3"
    : "px-3 pt-2 pb-3 sm:px-5 lg:px-6";

  return (
    <MobileNavProvider>
      <UsageAnalyticsTracker />
      <main className={cn("bg-background text-foreground", isViewportWorkspacePage ? "h-dvh overflow-hidden" : "min-h-screen")}>
        <div
          className={cn(
            "flex w-full flex-col",
            shellPadding,
            isCanvasPage ? "gap-3" : "gap-2",
            isViewportWorkspacePage ? "h-full min-h-0 max-w-none overflow-hidden" : "min-h-screen",
          )}
        >
          <TopNav alignToShellTop={isViewportWorkspacePage} />
          <div
            className={cn(
              "flex w-full min-w-0 flex-col",
              isViewportWorkspacePage ? "min-h-0 flex-1 overflow-hidden" : "mx-auto max-w-[1440px]",
            )}
          >
            <AnimatedRoutes />
          </div>
        </div>
      </main>
    </MobileNavProvider>
  );
}
