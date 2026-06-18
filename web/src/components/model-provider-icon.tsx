"use client";

import { cn } from "@/lib/utils";
import { ProviderLogoIcon, type ProviderLogoKey } from "./provider-logo-icons";

type ModelProviderIconSize = "sm" | "md" | "lg";

type ModelProviderMeta = {
  label: string;
  logo?: ProviderLogoKey;
  mark: {
    sm: string;
    md: string;
    lg: string;
  };
  className: string;
};

const PROVIDER_FALLBACK: ModelProviderMeta = {
  label: "AI model",
  mark: {
    sm: "AI",
    md: "AI",
    lg: "AI",
  },
  className: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950",
};

const SIZE_CLASS_NAMES: Record<ModelProviderIconSize, string> = {
  sm: "size-5 min-w-5 text-[9px]",
  md: "size-7 min-w-7 text-[10px]",
  lg: "size-8 min-w-8 text-[11px]",
};

const LOGO_CLASS_NAMES: Record<ModelProviderIconSize, string> = {
  sm: "size-[18px]",
  md: "size-[22px]",
  lg: "size-7",
};

function normalizeModelText(model?: string, label?: string) {
  return `${model || ""} ${label || ""}`.toLowerCase();
}

function modelProviderMeta(model?: string, label?: string): ModelProviderMeta {
  const text = normalizeModelText(model, label);

  if (text.includes("claude") || text.includes("anthropic")) {
    return {
      label: "Claude",
      logo: "claude",
      mark: { sm: "C", md: "C", lg: "C" },
      className: "text-[#d97757]",
    };
  }

  if (text.includes("deepseek")) {
    return {
      label: "DeepSeek",
      logo: "deepseek",
      mark: { sm: "D", md: "DS", lg: "DS" },
      className: "text-[#4d6bfe]",
    };
  }

  if (text.includes("gemini") || text.includes("nano banana")) {
    return {
      label: "Gemini",
      logo: "gemini",
      mark: { sm: "G", md: "G", lg: "G" },
      className: "text-slate-950",
    };
  }

  if (text.includes("google")) {
    return {
      label: "Google",
      logo: "google",
      mark: { sm: "G", md: "G", lg: "G" },
      className: "text-slate-950",
    };
  }

  if (text.includes("moonshot") || text.includes("kimi") || text.includes("月之暗面")) {
    return {
      label: "Moonshot",
      logo: "moonshot",
      mark: { sm: "M", md: "MS", lg: "MS" },
      className: "text-slate-950 dark:text-slate-100",
    };
  }

  if (text.includes("vidu")) {
    return {
      label: "Vidu",
      logo: "vidu",
      mark: { sm: "V", md: "V", lg: "V" },
      className: "text-slate-950 dark:text-slate-100",
    };
  }

  if (text.includes("xai") || text.includes("grok")) {
    return {
      label: "xAI",
      logo: "xai",
      mark: { sm: "X", md: "xAI", lg: "xAI" },
      className: "text-slate-950 dark:text-slate-100",
    };
  }

  if (text.includes("kling") || text.includes("kwaipilot") || text.includes("kwai") || text.includes("快手") || text.includes("可灵")) {
    return {
      label: "Kuaishou",
      logo: "kuaishou",
      mark: { sm: "快", md: "快", lg: "快" },
      className: "text-[#1e37fc]",
    };
  }

  if (text.includes("zhipu") || text.includes("glm") || text.includes("智谱")) {
    return {
      label: "Zhipu",
      logo: "zhipu",
      mark: { sm: "智", md: "智", lg: "智" },
      className: "text-[#3859ff]",
    };
  }

  if (text.includes("qwen") || text.includes("通义") || text.includes("千问")) {
    return {
      label: "Qwen",
      logo: "alibaba",
      mark: { sm: "Q", md: "Q", lg: "Q" },
      className: "text-[#ff6003]",
    };
  }

  if (text.includes("aliyun") || text.includes("alibaba") || text.includes("阿里")) {
    return {
      label: "Alibaba",
      logo: "alibaba",
      mark: { sm: "阿", md: "阿", lg: "阿" },
      className: "text-[#ff6003]",
    };
  }

  if (text.includes("doubao") || text.includes("豆包") || text.includes("seed") || text.includes("volc") || text.includes("火山") || text.includes("bytedance") || text.includes("字节")) {
    return {
      label: "ByteDance",
      logo: "bytedance",
      mark: { sm: "豆", md: "豆", lg: "豆" },
      className: "text-[#325ab4]",
    };
  }

  if (text.includes("midjourney")) {
    return {
      label: "Midjourney",
      mark: { sm: "M", md: "MJ", lg: "MJ" },
      className: "bg-gradient-to-br from-pink-500 via-purple-500 to-slate-950 text-white",
    };
  }

  if (text.includes("flux") || text.includes("black forest")) {
    return {
      label: "Flux",
      mark: { sm: "F", md: "F", lg: "F" },
      className: "bg-gradient-to-br from-lime-300 via-emerald-500 to-slate-950 text-white",
    };
  }

  if (text.includes("gpt") || text.includes("openai") || /\bo[1-9]\b/.test(text)) {
    return {
      label: "OpenAI",
      logo: "openai",
      mark: { sm: "O", md: "OA", lg: "OA" },
      className: "text-slate-950 dark:text-slate-100",
    };
  }

  return PROVIDER_FALLBACK;
}

export function ModelProviderIcon({
  className,
  label,
  model,
  size = "md",
}: {
  className?: string;
  label?: string;
  model?: string;
  size?: ModelProviderIconSize;
}) {
  const provider = modelProviderMeta(model, label);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-none bg-transparent font-bold leading-none tracking-normal shadow-none ring-0",
        SIZE_CLASS_NAMES[size],
        provider.className,
        className,
      )}
      title={provider.label}
    >
      {provider.logo ? <ProviderLogoIcon logo={provider.logo} className={LOGO_CLASS_NAMES[size]} /> : provider.mark[size]}
    </span>
  );
}

export function ModelProviderOptionLabel({
  className,
  label,
  model,
  size = "sm",
}: {
  className?: string;
  label?: string;
  model?: string;
  size?: ModelProviderIconSize;
}) {
  const displayLabel = label || model || "";

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <ModelProviderIcon model={model} label={label} size={size} />
      <span className="min-w-0 truncate">{displayLabel}</span>
    </span>
  );
}
