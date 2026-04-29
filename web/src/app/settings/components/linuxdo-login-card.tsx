"use client";

import { Copy, LoaderCircle, LogIn, Save } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import webConfig from "@/constants/common-env";

import { useSettingsStore } from "../store";

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildRedirectUrlSuggestion(baseUrl: string) {
  const configuredBaseUrl = trimTrailingSlash(baseUrl);
  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/auth/linuxdo/oauth/callback`;
  }

  const apiUrl = trimTrailingSlash(webConfig.apiUrl || "");
  if (apiUrl) {
    return `${apiUrl}/auth/linuxdo/oauth/callback`;
  }

  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.origin}/auth/linuxdo/oauth/callback`;
}

function buildFrontendRedirectUrlSuggestion() {
  if (typeof window === "undefined") {
    return "/auth/linuxdo/callback";
  }
  return `${window.location.origin}/auth/linuxdo/callback`;
}

export function LinuxDoLoginCard() {
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const setLinuxDoEnabled = useSettingsStore((state) => state.setLinuxDoEnabled);
  const setLinuxDoClientId = useSettingsStore((state) => state.setLinuxDoClientId);
  const setLinuxDoClientSecret = useSettingsStore((state) => state.setLinuxDoClientSecret);
  const setLinuxDoRedirectUrl = useSettingsStore((state) => state.setLinuxDoRedirectUrl);
  const setLinuxDoFrontendRedirectUrl = useSettingsStore((state) => state.setLinuxDoFrontendRedirectUrl);
  const saveConfig = useSettingsStore((state) => state.saveConfig);

  const redirectUrlSuggestion = useMemo(
    () => buildRedirectUrlSuggestion(String(config?.base_url || "")),
    [config?.base_url],
  );
  const frontendRedirectUrlSuggestion = useMemo(() => buildFrontendRedirectUrlSuggestion(), []);
  const enabled = Boolean(config?.linuxdo_enabled);
  const secretConfigured = Boolean(config?.linuxdo_client_secret_configured);

  const handleUseSuggestedRedirectUrl = async () => {
    if (!redirectUrlSuggestion) {
      return;
    }
    setLinuxDoRedirectUrl(redirectUrlSuggestion);
    try {
      await navigator.clipboard.writeText(redirectUrlSuggestion);
      toast.success("回调地址已填入并复制");
    } catch {
      toast.success("回调地址已填入");
    }
  };

  const handleUseSuggestedFrontendRedirectUrl = async () => {
    if (!frontendRedirectUrlSuggestion) {
      return;
    }
    setLinuxDoFrontendRedirectUrl(frontendRedirectUrlSuggestion);
    try {
      await navigator.clipboard.writeText(frontendRedirectUrlSuggestion);
      toast.success("前端跳转地址已填入并复制");
    } catch {
      toast.success("前端跳转地址已填入");
    }
  };

  if (isLoadingConfig) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-10">
          <LoaderCircle className="size-5 animate-spin text-stone-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-950 text-white">
              <LogIn className="size-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Linuxdo 登录</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                配置 Linuxdo Connect OAuth 后，登录页会显示「使用 Linuxdo 登录」入口。
              </p>
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => setLinuxDoEnabled(Boolean(checked))}
            />
            启用登录
          </label>
        </div>

        {enabled ? (
          <div className="grid gap-4 border-t border-stone-100 pt-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-stone-700">Client ID</label>
              <Input
                value={String(config?.linuxdo_client_id || "")}
                onChange={(event) => setLinuxDoClientId(event.target.value)}
                placeholder="Linuxdo Connect Client ID"
                className="h-10 rounded-xl border-stone-200 bg-white font-mono text-sm"
              />
              <p className="text-xs text-stone-500">来自 Linuxdo Connect 应用后台。</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-stone-700">Client Secret</label>
              <Input
                type="password"
                value={String(config?.linuxdo_client_secret || "")}
                onChange={(event) => setLinuxDoClientSecret(event.target.value)}
                placeholder={secretConfigured ? "已配置，留空则保留当前密钥" : "Linuxdo Connect Client Secret"}
                className="h-10 rounded-xl border-stone-200 bg-white font-mono text-sm"
              />
              <p className="text-xs text-stone-500">
                {secretConfigured ? "仅在需要更换密钥时填写；保存后不会在页面回显。" : "启用 Linuxdo 登录时必须填写。"}
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm text-stone-700">后端 OAuth 回调地址</label>
              <Input
                value={String(config?.linuxdo_redirect_url || "")}
                onChange={(event) => setLinuxDoRedirectUrl(event.target.value)}
                placeholder="https://example.com/auth/linuxdo/oauth/callback"
                className="h-10 rounded-xl border-stone-200 bg-white font-mono text-sm"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-fit rounded-xl border-stone-200 bg-white px-3 text-stone-700"
                  onClick={() => void handleUseSuggestedRedirectUrl()}
                  disabled={!redirectUrlSuggestion}
                >
                  <Copy className="size-4" />
                  填入并复制建议地址
                </Button>
                {redirectUrlSuggestion ? (
                  <code className="break-all rounded-lg bg-stone-50 px-2 py-1 font-mono text-xs text-stone-600">
                    {redirectUrlSuggestion}
                  </code>
                ) : null}
              </div>
              <p className="text-xs text-stone-500">
                这个后端地址需要填写到 Linuxdo Connect 应用后台；不要填写前端的 /auth/linuxdo/callback 页面地址。
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm text-stone-700">前端登录完成页</label>
              <Input
                value={String(config?.linuxdo_frontend_redirect_url || "")}
                onChange={(event) => setLinuxDoFrontendRedirectUrl(event.target.value)}
                placeholder="/auth/linuxdo/callback"
                className="h-10 rounded-xl border-stone-200 bg-white font-mono text-sm"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-fit rounded-xl border-stone-200 bg-white px-3 text-stone-700"
                  onClick={() => void handleUseSuggestedFrontendRedirectUrl()}
                  disabled={!frontendRedirectUrlSuggestion}
                >
                  <Copy className="size-4" />
                  填入并复制当前前端地址
                </Button>
                {frontendRedirectUrlSuggestion ? (
                  <code className="break-all rounded-lg bg-stone-50 px-2 py-1 font-mono text-xs text-stone-600">
                    {frontendRedirectUrlSuggestion}
                  </code>
                ) : null}
              </div>
              <p className="text-xs text-stone-500">
                同源部署可保持 /auth/linuxdo/callback；本地 Vite 或前后端分离部署时填完整前端地址。
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
            onClick={() => void saveConfig()}
            disabled={isSavingConfig}
          >
            {isSavingConfig ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
