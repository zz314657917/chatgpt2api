"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  LogIn,
  MoonStar,
  ShieldCheck,
  Sun,
} from "lucide-react";

import { AnnouncementNotifications } from "@/components/announcement-banner";
import { LoginPageImageStage } from "@/components/login-page-image-stage";
import { Button } from "@/components/ui/button";
import { fetchAuthProviders, type AuthProviders } from "@/lib/api";
import {
  applyColorTheme,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { useAppMeta } from "@/lib/use-app-meta";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";

const loginBackgroundClass =
  "bg-[#fff9fb] bg-[radial-gradient(rgba(20,86,240,0.12)_1px,transparent_1px),linear-gradient(145deg,#fff8fa_0%,#ffffff_48%,#f4f8ff_100%)] [background-position:0_0,center] [background-size:12px_12px,cover] dark:bg-[#090d16] dark:bg-[radial-gradient(rgba(96,165,250,0.16)_1px,transparent_1px),linear-gradient(145deg,#080b13_0%,#101827_52%,#070b12_100%)]";

const defaultLeafNetworkBrandName = "落叶创艺";
const defaultLeafNetworkLoginURL = "https://ai.3zapi.top/login";

export default function LoginPage() {
  const appMeta = useAppMeta();
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const authProviderRequestRef = useRef<Promise<AuthProviders> | null>(null);
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const [leafNetworkBrandName, setLeafNetworkBrandName] = useState(defaultLeafNetworkBrandName);
  const [leafNetworkLoginURL, setLeafNetworkLoginURL] = useState(defaultLeafNetworkLoginURL);
  const [authProviders, setAuthProviders] = useState<AuthProviders | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { isCheckingAuth } = useRedirectIfAuthenticated();

  const loadAuthProviders = useCallback(() => {
    if (!authProviderRequestRef.current) {
      authProviderRequestRef.current = fetchAuthProviders().finally(() => {
        authProviderRequestRef.current = null;
      });
    }
    return authProviderRequestRef.current;
  }, []);

  useEffect(() => {
    let active = true;
    void loadAuthProviders()
      .then((providers) => {
        if (!active) {
          return;
        }
        setAuthProviders(providers);
        const sub2api = providers.sub2api;
        const launchURL = String(sub2api?.launch_url || "").trim();
        const brandName = String(sub2api?.brand_name || "").trim();
        if (brandName) {
          setLeafNetworkBrandName(brandName);
        }
        if (sub2api?.enabled && launchURL) {
          setLeafNetworkLoginURL(launchURL);
        }
      })
      .catch(() => {
        // Keep the public fallback URL when provider discovery is unavailable.
      });
    return () => {
      active = false;
    };
  }, [loadAuthProviders]);

  const handleLeafNetworkLogin = useCallback(async () => {
    setIsRedirecting(true);
    let providers = authProviders;
    if (!providers) {
      try {
        providers = await loadAuthProviders();
        setAuthProviders(providers);
      } catch {
        // Fall through to the configured fallback URL.
      }
    }
    const launchURL = String(providers?.sub2api?.launch_url || "").trim();
    if (providers?.sub2api?.enabled && launchURL) {
      window.location.href = launchURL;
      return;
    }
    window.location.href = leafNetworkLoginURL;
  }, [authProviders, leafNetworkLoginURL, loadAuthProviders]);

  useEffect(() => {
    if (isCheckingAuth || isRedirecting) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleLeafNetworkLogin();
    }, 3000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [handleLeafNetworkLogin, isCheckingAuth, isRedirecting]);

  const handleThemeToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rect = themeToggleRef.current?.getBoundingClientRect();
    applyColorTheme(nextTheme, rect ? {
      origin: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    } : undefined);
    saveColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  if (isCheckingAuth || isRedirecting) {
    return (
      <div
        className={`${loginBackgroundClass} fixed inset-0 z-50 grid min-h-svh w-screen place-items-center overflow-hidden px-4 py-6`}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <LoaderCircle className="size-5 animate-spin text-[#45515e] dark:text-white/60" />
          <div className="space-y-1">
            <div className="text-sm font-semibold text-[#222222] dark:text-white">正在跳转至{leafNetworkBrandName}</div>
            <div className="text-xs text-[#6b7280] dark:text-white/50">登录或注册后会自动回到落叶创艺。</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${loginBackgroundClass} fixed inset-0 z-50 flex min-h-svh w-screen items-center justify-center overflow-y-auto px-4 py-6 font-login [align-items:safe_center] sm:px-6 lg:px-8`}
    >
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2 sm:right-6 sm:top-6">
        <AnnouncementNotifications target="login" className="size-9" />
        <Button
          ref={themeToggleRef}
          type="button"
          variant="outline"
          size="icon"
          className="relative rounded-full border-border/60 bg-background/80 shadow-sm backdrop-blur"
          onClick={handleThemeToggle}
          aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          title={theme === "dark" ? "浅色模式" : "深色模式"}
        >
          <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonStar className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">切换界面主题</span>
        </Button>
      </div>

      <div className="relative z-10 grid w-full max-w-[58rem] overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.12),0_10px_28px_rgba(44,30,116,0.08)] backdrop-blur transition-[min-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-white/10 dark:bg-[#111827]/92 dark:shadow-[0_30px_90px_rgba(2,6,23,0.58),0_12px_32px_rgba(2,6,23,0.32)] lg:min-h-[39rem] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <section className="flex min-h-[500px] flex-col justify-center px-6 py-8 sm:px-10 lg:px-12">
          <div className="flex flex-col gap-9 transition-[gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
            <div className="flex items-center gap-3">
              <img
                src="/logo.webp"
                alt=""
                aria-hidden="true"
                className="size-11 rounded-[16px] shadow-[0_12px_16px_-4px_rgba(36,36,36,0.12)]"
              />
              <div className="grid min-w-0 leading-none">
                <div className="truncate text-sm font-semibold tracking-[-0.02em] text-[#222222] dark:text-white">
                  落叶创艺
                </div>
                <div className="truncate text-[10px] font-medium tracking-[0.28em] text-[#8e8e93] uppercase dark:text-white/50">
                  Creative Studio
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfe7f1] bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-[#45515e] uppercase shadow-[0_4px_12px_rgba(24,40,72,0.05)] dark:border-white/10 dark:bg-white/8 dark:text-white/70 dark:shadow-[0_10px_26px_rgba(2,6,23,0.22)]">
                <ShieldCheck className="size-3.5 text-[#1456f0] dark:text-sky-300" />
                创作账号
              </div>
              <div className="flex flex-col gap-2 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
                <h1 className="text-[2.1rem] leading-[1.12] font-semibold tracking-[-0.04em] text-[#222222] transition-opacity duration-200 dark:text-white sm:text-[2.5rem]">
                  使用{leafNetworkBrandName}账号进入工作台
                </h1>
                <p className="max-w-[340px] text-sm leading-6 text-[#45515e] transition-opacity duration-200 dark:text-white/62">
                  一个账号即可管理额度、订阅和创作记录。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <Button
                type="button"
                variant="outline"
                className="relative h-12 w-full overflow-hidden rounded-[1.45rem] border-slate-300/85 bg-white/72 text-[#18181b] shadow-[0_12px_28px_rgba(148,163,184,0.18)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white/90 hover:text-[#18181b] hover:shadow-[0_16px_34px_rgba(148,163,184,0.22)] focus-visible:ring-slate-300/55 disabled:border-slate-200/80 disabled:bg-white/58 disabled:text-slate-500 disabled:opacity-100 disabled:shadow-none disabled:hover:translate-y-0 dark:border-white/15 dark:bg-white/12 dark:text-white dark:shadow-[0_14px_30px_rgba(2,6,23,0.32)] dark:hover:border-white/22 dark:hover:bg-white/16 dark:hover:text-white dark:hover:shadow-[0_18px_36px_rgba(2,6,23,0.38)] dark:disabled:border-white/10 dark:disabled:bg-white/8 dark:disabled:text-white/45"
                onClick={handleLeafNetworkLogin}
              >
                <span className="pointer-events-none absolute inset-x-4 top-1 h-3 rounded-full bg-white/75 blur-sm dark:bg-white/14" />
                <span className="pointer-events-none absolute inset-[1px] rounded-[1.35rem] border border-white/55 dark:border-white/10" />
                <span className="relative z-10 flex items-center justify-center gap-2 font-semibold tracking-[-0.01em]">
                  <LogIn className="size-4" />
                  登录或注册{leafNetworkBrandName}账号
                  <ArrowRight className="size-4" />
                </span>
              </Button>

              <p className="text-xs leading-5 text-[#6b7280] dark:text-white/50">
                将跳转至{leafNetworkBrandName}账号中心登录或注册。
              </p>
            </div>
          </div>
        </section>

        <section className="relative hidden overflow-hidden border-l border-[#e5e7eb] bg-[#f8fafc] dark:border-white/10 dark:bg-[#0c1320] lg:flex">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.48),transparent_38%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_38%)]" />
          <div className="relative flex flex-1 items-stretch justify-stretch">
            <LoginPageImageStage
              src={appMeta.login_page_image_url}
              mode={appMeta.login_page_image_mode}
              zoom={appMeta.login_page_image_zoom}
              positionX={appMeta.login_page_image_position_x}
              positionY={appMeta.login_page_image_position_y}
              fillParent
              frameClassName="rounded-none"
              imageClassName="rounded-none"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
