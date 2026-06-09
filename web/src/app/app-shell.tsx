import { AnimatedRoutes } from "@/app/animated-routes";
import { TopNav } from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isCanvasPage = pathname === "/canvas";
  const isEmbeddedMode = new URLSearchParams(location.search).get("ui_mode") === "embedded";
  const isViewportWorkspacePage = pathname === "/canvas" || pathname === "/image" || pathname === "/image-manager" || pathname === "/social";
  const shellPadding = isEmbeddedMode && isViewportWorkspacePage
    ? "px-2 pt-2 pb-2 sm:px-2 lg:px-3"
    : "px-3 pt-2 pb-3 sm:px-5 lg:px-6";

  return (
    <main className={cn("bg-background text-foreground", isViewportWorkspacePage ? "h-dvh overflow-hidden" : "min-h-screen")}>
      <div
        className={cn(
          "flex w-full flex-col",
          shellPadding,
          isCanvasPage ? "gap-3" : "gap-2",
          isViewportWorkspacePage ? "h-full min-h-0 max-w-none overflow-hidden" : "min-h-screen",
        )}
      >
        <TopNav />
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
  );
}
