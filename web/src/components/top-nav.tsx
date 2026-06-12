"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Clock3, LogOut, MoonStar, Sun, UserCircle2, UserPlus, WalletCards } from "lucide-react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import webConfig from "@/constants/common-env";
import {
  AUTH_SESSION_CHANGE_EVENT,
  clearVerifiedAuthSession,
  getCachedAuthSession,
  getVerifiedAuthSession,
  refreshVerifiedAuthSession,
} from "@/lib/session";
import {
  canAccessPath,
  type StoredAuthSession,
} from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchAuthProviders, fetchSub2APIWalletSummary, logout, type BillingState } from "@/lib/api";
import { accountDisplayLabel, accountDisplayName } from "@/lib/session-display";
import { cn } from "@/lib/utils";
import {
  applyColorTheme,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";

const navItems = [
  { href: "/image", label: "创作台" },
  { href: "/canvas", label: "无限画布" },
  { href: "/ecommerce-suite", label: "电商套图" },
  { href: "/social", label: "社媒运营" },
  { href: "/image-manager", label: "素材库" },
];
const profileNavItem = { href: "/profile", label: "个人中心" };
const teamNavItem = { href: "/team", label: "团队空间" };
const PRIMARY_NAV_ID = "primary-navigation";
const NAV_ACTIVE_LAYOUT_ID = "top-nav-active-pill";
const QUOTA_REFRESH_EVENT = "chatgpt2api:quota-refresh";
const SESSION_REVALIDATE_INTERVAL_MS = 5000;
const WALLET_REFRESH_INTERVAL_MS = 8000;
const STUDIO_BRIDGE_APP_ID = "luoye-ai";
const SUB2API_SESSION_MESSAGE_TYPE = "sub2api:studio-bridge-session";
const SUB2API_SESSION_PROBE_REQUEST_TYPE = "sub2api:studio-bridge-session-probe";
const SUB2API_SESSION_PROBE_REFRESH_INTERVAL_MS = 5000;
const navActiveTransition: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.7,
};
const reducedNavActiveTransition: Transition = {
  duration: 0.01,
};
const ImageTaskQueue = lazy(() =>
  import("@/components/image-task-queue").then((module) => ({ default: module.ImageTaskQueue })),
);

function ImageTaskQueueLoading({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-9 rounded-full border-border bg-background px-2.5 text-muted-foreground shadow-none", className)}
      aria-label="加载任务队列"
      title="任务队列"
      disabled
    >
      <Clock3 className="size-4" />
      <span className="hidden text-xs font-medium xl:inline">任务队列</span>
    </Button>
  );
}

function formatBillingQuota(billing?: BillingState | null) {
  if (!billing) {
    return "--";
  }
  if (billing.unlimited) {
    return "无限";
  }
  if (billing.unit === "cny_milli") {
    return `¥${(Math.max(0, Number(billing.available) || 0) / 1000).toFixed(2)}`;
  }
  return String(Math.max(0, Number(billing.available) || 0));
}

function sessionQuotaLabel(session: StoredAuthSession | null) {
  return formatBillingQuota(session?.billing);
}

function formatWalletBalance(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value === undefined || value === null || value === "" ? "--" : String(value);
  }
  return Math.max(0, numeric).toFixed(2);
}

function normalizeExternalUserID(value: unknown) {
  return String(value ?? "").trim();
}

function sub2APIUserIDFromSession(session: StoredAuthSession) {
  const fromBinding = normalizeExternalUserID(session.sub2api?.sub2api_user_id);
  if (fromBinding) {
    return fromBinding;
  }
  const subjectID = normalizeExternalUserID(session.subjectId);
  return subjectID.toLowerCase().startsWith("sub2api:") ? subjectID.slice("sub2api:".length).trim() : "";
}

function resolveHTTPOrigin(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || typeof window === "undefined") {
    return "";
  }
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

function resolveSub2APIOrigin(...urls: unknown[]) {
  for (const url of urls) {
    const origin = resolveHTTPOrigin(url);
    if (origin) {
      return origin;
    }
  }
  return "";
}

function buildSub2APISessionProbeURL(origin: string, nonce: number) {
  if (!origin || typeof window === "undefined") {
    return "";
  }
  const params = new URLSearchParams({
    app_id: STUDIO_BRIDGE_APP_ID,
    parent_origin: window.location.origin,
    nonce: String(nonce),
  });
  return `${origin}/studio-bridge/session-probe?${params.toString()}`;
}

function ThemeToggleButton({
  theme,
  onToggle,
  className,
}: {
  theme: ColorTheme;
  onToggle: (button: HTMLButtonElement) => void;
  className?: string;
}) {
  const dark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative size-8 rounded-full", className)}
      onClick={(event) => onToggle(event.currentTarget)}
      aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
      title={dark ? "浅色模式" : "深色模式"}
    >
      <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <MoonStar className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">切换界面主题</span>
    </Button>
  );
}

type NavItem = {
  href: string;
  label: string;
};

function buildNavTarget(href: string, search: string) {
  const params = new URLSearchParams(search);
  if (params.get("ui_mode") !== "embedded") {
    return href;
  }
  return `${href}?ui_mode=embedded`;
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavPill({ item, pathname, search }: { item: NavItem; pathname: string; search: string }) {
  const active = isActivePath(pathname, item.href);
  const prefersReducedMotion = useReducedMotion();

  return (
    <NavLink
      to={buildNavTarget(item.href, search)}
      className={() =>
        cn(
          "relative isolate shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:text-sm",
          active
            ? "text-[#18181b] dark:text-accent-foreground"
            : "text-[#45515e] hover:bg-black/[0.05] hover:text-[#18181b] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
        )
      }
    >
      {active ? (
        <motion.span
          layoutId={NAV_ACTIVE_LAYOUT_ID}
          transition={prefersReducedMotion ? reducedNavActiveTransition : navActiveTransition}
          className="absolute inset-0 -z-10 rounded-full bg-black/[0.06] shadow-[inset_0_0_0_1px_rgba(20,86,240,0.08)] dark:bg-accent"
        />
      ) : null}
      <motion.span
        animate={{ scale: active && !prefersReducedMotion ? 1.03 : 1 }}
        transition={prefersReducedMotion ? reducedNavActiveTransition : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 block"
      >
        {item.label}
      </motion.span>
    </NavLink>
  );
}

function AccountMenu({
  session,
  roleLabel,
  availableQuota,
  walletQuota,
  rechargeURL,
  pathname,
  onLogout,
  onRefreshWallet,
}: {
  session: StoredAuthSession;
  roleLabel: string;
  availableQuota: string;
  walletQuota: string;
  rechargeURL: string;
  pathname: string;
  onLogout: () => Promise<void>;
  onRefreshWallet: (force?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const displayName = accountDisplayName(session, roleLabel === "管理员" ? roleLabel : "落叶创艺用户");
  const quotaLabel = walletQuota || availableQuota;
  const initial = (displayName.trim() || "U").slice(0, 1).toUpperCase();
  const usageActive = pathname === "/profile" && new URLSearchParams(window.location.search).get("tab") === "usage";
  const profileActive = isActivePath(pathname, profileNavItem.href) && !usageActive;
  const teamActive = pathname === "/team";
  const showTeamEntry = session.role === "user";

  const openRecharge = () => {
    if (rechargeURL) {
      window.open(rechargeURL, "_blank", "noopener,noreferrer");
      return;
    }
    window.open("https://ai.3zapi.top", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {showTeamEntry ? (
        <Link
          to={teamNavItem.href}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-sm font-medium shadow-none transition hover:bg-accent hover:text-accent-foreground",
            teamActive ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-foreground",
          )}
        >
          <UserPlus className="size-4" />
          <span className="hidden sm:inline">团队</span>
        </Link>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            onRefreshWallet();
          }
        }}
      >
        <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 gap-1.5 rounded-full px-2 pr-1.5 shadow-none",
            profileActive ? "border-[#1456f0]/30 bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "",
          )}
          aria-label="账号菜单"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
          <span className="hidden max-w-[92px] truncate lg:inline">{displayName}</span>
          <ChevronDown className="size-3.5" />
        </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-72 border-border bg-card p-2 text-card-foreground shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] dark:border-border dark:bg-card"
        >
          <div className="flex flex-col gap-2">
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                <div className="block truncate text-xs text-muted-foreground">
                  {accountDisplayLabel(session)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-muted/40 px-2 py-1.5">
              <div className="text-muted-foreground">角色</div>
              <div className="truncate font-medium text-foreground">{roleLabel}</div>
            </div>
            <div className="rounded-lg bg-muted/40 px-2 py-1.5">
              <div className="text-muted-foreground">余额</div>
              <div className="truncate font-medium text-foreground">{quotaLabel}</div>
            </div>
            <div className="rounded-lg bg-muted/40 px-2 py-1.5">
              <div className="text-muted-foreground">版本</div>
              <div className="truncate font-medium text-foreground">v{webConfig.appVersion}</div>
            </div>
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setOpen(false);
                openRecharge();
              }}
            >
              <WalletCards className="size-4" />
              充值
            </button>
            <Link
              to={`${profileNavItem.href}?tab=profile`}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground",
                profileActive ? "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "text-foreground",
              )}
              onClick={() => setOpen(false)}
            >
              <UserCircle2 className="size-4" />
              个人资料
            </Link>
            <Link
              to={`${profileNavItem.href}?tab=usage`}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground",
                usageActive ? "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "text-foreground",
              )}
              onClick={() => setOpen(false)}
            >
              <Clock3 className="size-4" />
              使用记录
            </Link>
            {showTeamEntry ? (
              <Link
                to={teamNavItem.href}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground",
                  teamActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-foreground",
                )}
                onClick={() => setOpen(false)}
              >
                <UserPlus className="size-4" />
                团队空间
              </Link>
            ) : null}
          </div>

          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            <LogOut className="size-4" />
            退出登录
          </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Sub2APISessionProbe({
  session,
  sub2APIOrigin,
  onConfirmed,
  onMismatch,
}: {
  session: StoredAuthSession;
  sub2APIOrigin: string;
  onConfirmed: () => void;
  onMismatch: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastProbeRefreshAtRef = useRef(0);
  const expectedUserID = sub2APIUserIDFromSession(session);
  const [probeNonce, setProbeNonce] = useState(() => Date.now());
  const probeURL = buildSub2APISessionProbeURL(sub2APIOrigin, probeNonce);

  const requestProbe = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastProbeRefreshAtRef.current < SUB2API_SESSION_PROBE_REFRESH_INTERVAL_MS) {
      return;
    }
    lastProbeRefreshAtRef.current = now;

    const targetWindow = iframeRef.current?.contentWindow;
    if (targetWindow && sub2APIOrigin) {
      targetWindow.postMessage(
        {
          type: SUB2API_SESSION_PROBE_REQUEST_TYPE,
          app_id: STUDIO_BRIDGE_APP_ID,
        },
        sub2APIOrigin,
      );
      return;
    }

    setProbeNonce(now);
  }, [sub2APIOrigin]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!sub2APIOrigin || event.origin !== sub2APIOrigin) {
        return;
      }
      const data = event.data as {
        type?: unknown;
        app_id?: unknown;
        authenticated?: unknown;
        user_id?: unknown;
        error?: unknown;
      } | null;
      if (!data || typeof data !== "object") {
        return;
      }
      if (data.type !== SUB2API_SESSION_MESSAGE_TYPE || data.app_id !== STUDIO_BRIDGE_APP_ID) {
        return;
      }
      if (data.error) {
        return;
      }
      if (data.authenticated !== true) {
        // Cross-site iframe probes can lose cookies even while the local studio session is still valid.
        return;
      }
      if (normalizeExternalUserID(data.user_id) === expectedUserID) {
        onConfirmed();
        return;
      }
      onMismatch();
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [expectedUserID, onConfirmed, onMismatch, sub2APIOrigin]);

  useEffect(() => {
    const refreshAfterReturn = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      requestProbe();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAfterReturn();
      }
    };

    window.addEventListener("focus", refreshAfterReturn);
    window.addEventListener("pageshow", refreshAfterReturn);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshAfterReturn);
      window.removeEventListener("pageshow", refreshAfterReturn);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestProbe]);

  useEffect(() => {
    lastProbeRefreshAtRef.current = 0;
    setProbeNonce(Date.now());
  }, [expectedUserID, sub2APIOrigin]);

  if (session.provider !== "sub2api" || !expectedUserID || !probeURL) {
    return null;
  }

  return (
    <iframe
      key={probeURL}
      ref={iframeRef}
      title="Sub2API 会话同步"
      src={probeURL}
      referrerPolicy="no-referrer"
      tabIndex={-1}
      aria-hidden="true"
      className="pointer-events-none fixed h-0 w-0 border-0 opacity-0"
      onLoad={() => requestProbe(true)}
    />
  );
}

export function TopNav({ alignToShellTop = false }: { alignToShellTop?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(() => getCachedAuthSession());
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [rechargeURL, setRechargeURL] = useState("");
  const [walletQuota, setWalletQuota] = useState("");
  const [sub2APIOrigin, setSub2APIOrigin] = useState("");
  const sessionIdentityKey = session ? `${session.provider || ""}:${session.subjectId}:${session.key}` : "";
  const sessionIdentityRef = useRef(sessionIdentityKey);
  const sessionRefreshInFlightRef = useRef<Promise<StoredAuthSession | null> | null>(null);
  const lastSessionRefreshAtRef = useRef(0);
  const walletRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastWalletRefreshAtRef = useRef(0);
  const externalSessionResetRef = useRef(false);

  const loadWallet = useCallback((force = false) => {
    const requestIdentityKey = sessionIdentityKey;
    if (!session || session.provider !== "sub2api") {
      setWalletQuota("");
      setRechargeURL("");
      setSub2APIOrigin("");
      return;
    }

    const now = Date.now();
    if (!force && now - lastWalletRefreshAtRef.current < WALLET_REFRESH_INTERVAL_MS) {
      return;
    }
    if (walletRefreshInFlightRef.current) {
      return;
    }

    lastWalletRefreshAtRef.current = now;
    const request = Promise.allSettled([fetchSub2APIWalletSummary(), fetchAuthProviders()])
      .then(([walletResult, providersResult]) => {
        if (sessionIdentityRef.current !== requestIdentityKey) {
          return;
        }
        const wallet = walletResult.status === "fulfilled" ? walletResult.value : null;
        const providers = providersResult.status === "fulfilled" ? providersResult.value : null;
        const walletBalance = wallet?.available ?? wallet?.balance;
        setWalletQuota(
          walletBalance !== undefined && walletBalance !== null && walletBalance !== ""
            ? formatWalletBalance(walletBalance)
            : "",
        );
        const sub2api = providers?.sub2api;
        const nextRechargeURL = String(wallet?.recharge_url || sub2api?.recharge_url || sub2api?.launch_url || "").trim();
        setRechargeURL(nextRechargeURL);
        setSub2APIOrigin(resolveSub2APIOrigin(nextRechargeURL, sub2api?.launch_url));
      })
      .catch(() => {
        if (sessionIdentityRef.current === requestIdentityKey) {
          setWalletQuota("");
          setRechargeURL("");
          setSub2APIOrigin("");
        }
      })
      .finally(() => {
        if (walletRefreshInFlightRef.current === request) {
          walletRefreshInFlightRef.current = null;
        }
      });
    walletRefreshInFlightRef.current = request;
  }, [session, sessionIdentityKey]);

  const refreshCurrentSession = useCallback((force = false) => {
    if (pathname === "/login" || pathname.startsWith("/auth/")) {
      return Promise.resolve(getCachedAuthSession() ?? null);
    }

    const now = Date.now();
    if (!force && now - lastSessionRefreshAtRef.current < SESSION_REVALIDATE_INTERVAL_MS) {
      return Promise.resolve(getCachedAuthSession() ?? null);
    }
    if (sessionRefreshInFlightRef.current) {
      return sessionRefreshInFlightRef.current;
    }

    lastSessionRefreshAtRef.current = now;
    const request = refreshVerifiedAuthSession()
      .then((nextSession) => {
        setSession(nextSession);
        if (!nextSession) {
          navigate("/login", { replace: true });
        }
        return nextSession;
      })
      .catch(() => getCachedAuthSession() ?? null)
      .finally(() => {
        if (sessionRefreshInFlightRef.current === request) {
          sessionRefreshInFlightRef.current = null;
        }
      });
    sessionRefreshInFlightRef.current = request;
    return request;
  }, [navigate, pathname]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (pathname === "/login") {
        if (!active) {
          return;
        }
        setSession(null);
        return;
      }

      const storedSession = await getVerifiedAuthSession();
      if (!active) {
        return;
      }
      setSession(storedSession);
    };

    void load();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const handleSessionChange = () => {
      setSession(getCachedAuthSession() ?? null);
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    };
  }, []);

  useEffect(() => {
    sessionIdentityRef.current = sessionIdentityKey;
    if (!session) {
      setWalletQuota("");
      setRechargeURL("");
      setSub2APIOrigin("");
      lastWalletRefreshAtRef.current = 0;
    }
    externalSessionResetRef.current = false;
  }, [session, sessionIdentityKey]);

  useEffect(() => {
    if (session) {
      loadWallet(true);
    }
  }, [loadWallet, session, sessionIdentityKey]);

  useEffect(() => {
    const refreshAfterReturn = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void refreshCurrentSession();
      loadWallet();
    };
    const refreshWallet = () => {
      loadWallet(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAfterReturn();
      }
    };

    window.addEventListener("focus", refreshAfterReturn);
    window.addEventListener("pageshow", refreshAfterReturn);
    window.addEventListener(QUOTA_REFRESH_EVENT, refreshWallet);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshAfterReturn);
      window.removeEventListener("pageshow", refreshAfterReturn);
      window.removeEventListener(QUOTA_REFRESH_EVENT, refreshWallet);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadWallet, refreshCurrentSession]);

  const handleSub2APISessionConfirmed = useCallback(() => {
    void refreshCurrentSession(true);
    loadWallet(true);
  }, [loadWallet, refreshCurrentSession]);

  const handleSub2APISessionMismatch = useCallback(() => {
    if (externalSessionResetRef.current) {
      return;
    }
    externalSessionResetRef.current = true;
    void logout()
      .catch(() => {
        // The local cookie might already be gone; clearing client state still matters.
      })
      .finally(() => clearVerifiedAuthSession())
      .finally(() => {
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Local logout should still complete if the server session cookie is already gone.
    }
    await clearVerifiedAuthSession();
    navigate("/login", { replace: true });
  };

  const handleThemeToggle = (button: HTMLButtonElement) => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rect = button.getBoundingClientRect();
    applyColorTheme(
      nextTheme,
      {
        force: true,
        origin: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      },
    );
    saveColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  if (pathname === "/login" || pathname === "/auth/linuxdo/callback" || session === undefined || !session) {
    return null;
  }

  const visibleNavItems = navItems.filter((item) => canAccessPath(session, item.href));
  const roleLabel = session.role === "admin" ? "管理员" : session.roleName || (session.provider === "linuxdo" ? "Linuxdo 用户" : "普通用户");
  const canAccessImageTasks = canAccessPath(session, "/image");
  const navToggleLabel = navCollapsed ? "展开导航栏" : "收起导航栏";
  const availableQuota = session.role === "user" ? sessionQuotaLabel(session) : "--";

  return (
    <>
      <Sub2APISessionProbe
        session={session}
        sub2APIOrigin={sub2APIOrigin}
        onConfirmed={handleSub2APISessionConfirmed}
        onMismatch={handleSub2APISessionMismatch}
      />
      <header className={cn("sticky z-40 rounded-[24px] border border-border bg-card/90 shadow-[0_0_22.576px_rgba(44,74,116,0.09)] backdrop-blur dark:border-border dark:bg-card/92", alignToShellTop ? "top-0" : "top-2")}>
      <div className="flex min-h-14 flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-4">
        <div className="flex min-w-0 items-center justify-between gap-2 lg:justify-start">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "font-display h-9 max-w-[190px] justify-start rounded-full px-1.5 pr-2 text-[15px] font-semibold text-[#18181b] shadow-none hover:bg-black/[0.04] hover:text-[#1456f0] sm:max-w-none dark:text-foreground dark:hover:text-sky-300",
              navCollapsed ? "bg-black/[0.04] text-[#1456f0] dark:bg-accent dark:text-sky-300" : "",
            )}
            aria-controls={PRIMARY_NAV_ID}
            aria-expanded={!navCollapsed}
            aria-label={navToggleLabel}
            title={navToggleLabel}
            onClick={() => setNavCollapsed((collapsed) => !collapsed)}
          >
            <img
              src="/logo.webp"
              alt=""
              aria-hidden="true"
              className="size-7 rounded-[10px] shadow-[0_4px_10px_rgba(184,90,127,0.16)]"
            />
            <span className="truncate">落叶创艺</span>
            {navCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </Button>
          <div className="ml-auto flex shrink-0 items-center gap-1 lg:hidden">
            <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} />
            {canAccessImageTasks ? (
              <Suspense fallback={<ImageTaskQueueLoading className="size-8 px-0" />}>
                <ImageTaskQueue className="size-8 px-0" />
              </Suspense>
            ) : null}
            <AccountMenu
              session={session}
              roleLabel={roleLabel}
              availableQuota={availableQuota}
              walletQuota={walletQuota}
              rechargeURL={rechargeURL}
              pathname={pathname}
              onLogout={handleLogout}
              onRefreshWallet={loadWallet}
            />
          </div>
        </div>
        <nav
          id={PRIMARY_NAV_ID}
          aria-label="主导航"
          className={cn(
            "hide-scrollbar -mx-1 min-w-0 gap-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 scroll-px-1 touch-pan-x [-webkit-overflow-scrolling:touch] lg:mx-0 lg:flex-1 lg:justify-center lg:gap-1.5 lg:px-0 lg:pb-0",
            navCollapsed ? "hidden" : "flex",
          )}
        >
          {visibleNavItems.map((item) => (
            <NavPill key={item.href} item={item} pathname={pathname} search={location.search} />
          ))}
        </nav>
        <div className="hidden items-center justify-end gap-1.5 lg:flex">
          <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} />
          {canAccessImageTasks ? (
            <Suspense fallback={<ImageTaskQueueLoading />}>
              <ImageTaskQueue />
            </Suspense>
          ) : null}
          <AccountMenu
            session={session}
            roleLabel={roleLabel}
            availableQuota={availableQuota}
            walletQuota={walletQuota}
            rechargeURL={rechargeURL}
            pathname={pathname}
            onLogout={handleLogout}
            onRefreshWallet={loadWallet}
          />
        </div>
      </div>
      </header>
    </>
  );
}
