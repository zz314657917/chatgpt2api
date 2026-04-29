"use client";

import { LoaderCircle, PlugZap, Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { testProxy, type ProxyTestResult } from "@/lib/api";
import { cn } from "@/lib/utils";

import { useSettingsStore } from "../store";
import {
  SettingsCard,
  settingsInlineToggleClassName,
  settingsInputClassName,
  settingsPanelClassName,
} from "./settings-ui";

const LOG_LEVEL_OPTIONS = ["debug", "info", "warning", "error"];

export function ConfigCard() {
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] =
    useState<ProxyTestResult | null>(null);
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const setRefreshAccountIntervalMinute = useSettingsStore(
    (state) => state.setRefreshAccountIntervalMinute,
  );
  const setImageConcurrentLimit = useSettingsStore(
    (state) => state.setImageConcurrentLimit,
  );
  const setImageRetentionDays = useSettingsStore(
    (state) => state.setImageRetentionDays,
  );
  const setAutoRemoveInvalidAccounts = useSettingsStore(
    (state) => state.setAutoRemoveInvalidAccounts,
  );
  const setAutoRemoveRateLimitedAccounts = useSettingsStore(
    (state) => state.setAutoRemoveRateLimitedAccounts,
  );
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const setProxy = useSettingsStore((state) => state.setProxy);
  const setBaseUrl = useSettingsStore((state) => state.setBaseUrl);
  const saveConfig = useSettingsStore((state) => state.saveConfig);

  const handleTestProxy = async () => {
    const candidate = String(config?.proxy || "").trim();
    if (!candidate) {
      toast.error("请先填写代理地址");
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const data = await testProxy(candidate);
      setProxyTestResult(data.result);
      if (data.result.ok) {
        toast.success(
          `代理可用（${data.result.latency_ms} ms，HTTP ${data.result.status}）`,
        );
      } else {
        toast.error(`代理不可用：${data.result.error ?? "未知错误"}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试代理失败");
    } finally {
      setIsTestingProxy(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <SettingsCard
        icon={Settings2}
        title="系统配置"
        description="调整账号刷新、代理、图片任务和运行日志。"
      >
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      icon={Settings2}
      title="系统配置"
      description="调整账号刷新、代理、图片任务和运行日志。"
      action={
        <Button
          size="lg"
          onClick={() => void saveConfig()}
          disabled={isSavingConfig}
        >
          {isSavingConfig ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          保存
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <section className={settingsPanelClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">
                  基础参数
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  控制账号刷新节奏、图片访问和本地图片任务。
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="settings-refresh-interval">
                    账号刷新间隔
                  </FieldLabel>
                  <Input
                    id="settings-refresh-interval"
                    value={String(
                      config?.refresh_account_interval_minute || "",
                    )}
                    onChange={(event) =>
                      setRefreshAccountIntervalMinute(event.target.value)
                    }
                    placeholder="分钟"
                    className={settingsInputClassName}
                  />
                  <FieldDescription>单位分钟。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-base-url">
                    图片访问地址
                  </FieldLabel>
                  <Input
                    id="settings-base-url"
                    value={String(config?.base_url || "")}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://example.com"
                    className={settingsInputClassName}
                  />
                  <FieldDescription>图片结果访问前缀。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-image-concurrent-limit">
                    同时生成张数
                  </FieldLabel>
                  <Input
                    id="settings-image-concurrent-limit"
                    value={String(config?.image_concurrent_limit || "")}
                    onChange={(event) =>
                      setImageConcurrentLimit(event.target.value)
                    }
                    placeholder="4"
                    className={settingsInputClassName}
                  />
                  <FieldDescription>后台生成槽位数量。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="settings-image-retention-days">
                    图片自动清理
                  </FieldLabel>
                  <Input
                    id="settings-image-retention-days"
                    value={String(config?.image_retention_days || "")}
                    onChange={(event) =>
                      setImageRetentionDays(event.target.value)
                    }
                    placeholder="30"
                    className={settingsInputClassName}
                  />
                  <FieldDescription>删除多少天前的本地图片。</FieldDescription>
                </Field>
              </div>
            </section>

            <section className={settingsPanelClassName}>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    出站代理
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    留空表示不使用代理。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTestProxy()}
                  disabled={isTestingProxy}
                >
                  {isTestingProxy ? (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <PlugZap data-icon="inline-start" />
                  )}
                  测试代理
                </Button>
              </div>
              <Field>
                <FieldLabel htmlFor="settings-proxy">全局代理</FieldLabel>
                <Input
                  id="settings-proxy"
                  value={String(config?.proxy || "")}
                  onChange={(event) => {
                    setProxy(event.target.value);
                    setProxyTestResult(null);
                  }}
                  placeholder="http://127.0.0.1:7890"
                  className={settingsInputClassName}
                />
                {proxyTestResult ? (
                  <div
                    className={cn(
                      "rounded-[13px] border px-3 py-2 text-xs leading-5",
                      proxyTestResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-rose-200 bg-rose-50 text-rose-800",
                    )}
                  >
                    {proxyTestResult.ok
                      ? `代理可用：HTTP ${proxyTestResult.status}，用时 ${proxyTestResult.latency_ms} ms`
                      : `代理不可用：${proxyTestResult.error ?? "未知错误"}（用时 ${proxyTestResult.latency_ms} ms）`}
                  </div>
                ) : null}
              </Field>
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <section className={settingsPanelClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">
                  自动维护
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  账号异常或限流时自动从号池移除。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className={settingsInlineToggleClassName}>
                  <Checkbox
                    checked={Boolean(config?.auto_remove_invalid_accounts)}
                    onCheckedChange={(checked) =>
                      setAutoRemoveInvalidAccounts(Boolean(checked))
                    }
                  />
                  自动移除异常账号
                </label>
                <label className={settingsInlineToggleClassName}>
                  <Checkbox
                    checked={Boolean(config?.auto_remove_rate_limited_accounts)}
                    onCheckedChange={(checked) =>
                      setAutoRemoveRateLimitedAccounts(Boolean(checked))
                    }
                  />
                  自动移除限流账号
                </label>
              </div>
            </section>

            <section className={settingsPanelClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">
                  控制台日志级别
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  不选择时使用默认 info / warning / error。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                {LOG_LEVEL_OPTIONS.map((level) => (
                  <label key={level} className={settingsInlineToggleClassName}>
                    <Checkbox
                      checked={Boolean(config?.log_levels?.includes(level))}
                      onCheckedChange={(checked) =>
                        setLogLevel(level, Boolean(checked))
                      }
                    />
                    <span className="capitalize">{level}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
