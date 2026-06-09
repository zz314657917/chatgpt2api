"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, KeyRound, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  bindSub2APIKey,
  fetchSub2APIBinding,
  fetchSub2APIKeys,
  type Sub2APIBinding,
  type Sub2APIKeyOption,
} from "@/lib/api";
import { AUTH_SESSION_CHANGE_EVENT, getCachedAuthSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

export const SUB2API_BINDING_CHANGED_EVENT = "chatgpt2api:sub2api-binding-change";

type PickerState = {
  loading: boolean;
  binding: Sub2APIBinding | null;
  items: Sub2APIKeyOption[];
  error: string;
};

const initialState: PickerState = {
  loading: true,
  binding: null,
  items: [],
  error: "",
};

function bindingHasKey(binding: Sub2APIBinding | null | undefined) {
  return Boolean(binding?.has_bound_api_key);
}

function keyLabelFromBinding(binding: Sub2APIBinding | null | undefined) {
	if (!bindingHasKey(binding)) {
		return "选择创作通道";
	}
	return binding?.api_key_name?.trim() || "创作通道";
}

function keyLabel(item: Sub2APIKeyOption) {
	return item.name?.trim() || `通道 ${item.id}`;
}

function keyMeta(item: Sub2APIKeyOption) {
  return [item.group_name, item.group_platform].filter(Boolean).join(" · ");
}

function sub2APIKeysURL() {
  if (typeof document !== "undefined" && document.referrer) {
    return document.referrer;
  }
  return "/";
}

function useSub2APISession() {
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(() => getCachedAuthSession());

  useEffect(() => {
    const handleSessionChange = () => {
      setSession(getCachedAuthSession() ?? null);
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    };
  }, []);

  return session?.provider === "sub2api" ? session : null;
}

function useSub2APIKeyPicker(enabled: boolean, initialBinding?: Sub2APIBinding | null) {
  const [state, setState] = useState<PickerState>(() => ({
    ...initialState,
    binding: initialBinding ?? null,
  }));
  const [bindingKeyID, setBindingKeyID] = useState("");

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [bindingResult, keysResult] = await Promise.all([
        fetchSub2APIBinding(),
        fetchSub2APIKeys(),
      ]);
      setState({
        loading: false,
        binding: bindingResult.binding ?? keysResult.binding ?? null,
        items: keysResult.items,
        error: "",
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
				error: error instanceof Error ? error.message : "加载创作通道失败",
      }));
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleBindingChange = (event: Event) => {
      const binding = (event as CustomEvent<Sub2APIBinding>).detail;
      setState((current) => ({ ...current, binding }));
    };
    window.addEventListener(SUB2API_BINDING_CHANGED_EVENT, handleBindingChange);
    return () => {
      window.removeEventListener(SUB2API_BINDING_CHANGED_EVENT, handleBindingChange);
    };
  }, []);

  const bind = useCallback(async (apiKeyId: string) => {
    const cleanID = String(apiKeyId || "").trim();
    if (!cleanID) {
      return;
    }
    setBindingKeyID(cleanID);
    try {
      const result = await bindSub2APIKey(cleanID);
      setState((current) => ({ ...current, binding: result.binding, error: "" }));
      window.dispatchEvent(new CustomEvent(SUB2API_BINDING_CHANGED_EVENT, { detail: result.binding }));
			toast.success("已切换创作通道");
		} catch (error) {
			const message = error instanceof Error ? error.message : "切换创作通道失败";
      setState((current) => ({ ...current, error: message }));
      toast.error(message);
    } finally {
      setBindingKeyID("");
    }
  }, []);

  return { state, bindingKeyID, load, bind };
}

function KeyList({
  items,
  binding,
  bindingKeyID,
  onSelect,
}: {
  items: Sub2APIKeyOption[];
  binding: Sub2APIBinding | null;
  bindingKeyID: string;
  onSelect: (id: string) => void;
}) {
  const usableItems = items.filter((item) => item.supports_image_generation !== false);

  if (usableItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
				暂无可用创作通道
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-auto rounded-2xl border border-border bg-background p-1">
      {usableItems.map((item) => {
        const active = binding?.api_key_id === String(item.id);
        const loading = bindingKeyID === String(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-accent",
              active ? "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "text-foreground",
            )}
            disabled={loading}
            onClick={() => onSelect(String(item.id))}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{keyLabel(item)}</span>
							<span className="block truncate text-xs text-muted-foreground">{keyMeta(item) || "创作通道"}</span>
            </span>
            {active ? <Check className="size-4 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Sub2APIKeyMenu({ session }: { session: StoredAuthSession }) {
  const enabled = session.provider === "sub2api";
  const [open, setOpen] = useState(false);
  const { state, bindingKeyID, load, bind } = useSub2APIKeyPicker(enabled, session.sub2api);
  const label = useMemo(() => keyLabelFromBinding(state.binding ?? session.sub2api), [session.sub2api, state.binding]);

  if (!enabled) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
				<Button type="button" variant="outline" className="h-9 rounded-full px-2.5 shadow-none" aria-label="选择创作通道">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <KeyRound className="size-3.5" />
          </span>
          <span className="hidden max-w-[160px] truncate lg:inline">{label}</span>
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
						<div className="text-sm font-semibold text-foreground">创作通道</div>
            <div className="text-xs text-muted-foreground">当前账号绑定</div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void load()}>
            <RefreshCcw className="size-4" />
          </Button>
        </div>
        {state.loading ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
						正在加载创作通道
          </div>
        ) : (
          <div className="mt-3">
            <KeyList items={state.items} binding={state.binding} bindingKeyID={bindingKeyID} onSelect={(id) => void bind(id)} />
          </div>
        )}
        {state.error ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function Sub2APIKeyRequiredDialog() {
  const session = useSub2APISession();
  const enabled = Boolean(session);
  const { state, bindingKeyID, load, bind } = useSub2APIKeyPicker(enabled, session?.sub2api ?? null);
  const open = enabled && !state.loading && !bindingHasKey(state.binding);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !bindingHasKey(state.binding)) {
          return;
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-[min(92vw,520px)] rounded-[22px]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
					<DialogTitle>选择创作通道</DialogTitle>
					<DialogDescription>
						当前账号还没有可用的生图通道。选择后会保存到服务端，后续进入将自动沿用。
					</DialogDescription>
        </DialogHeader>
        {state.error ? (
          <div className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
        <KeyList items={state.items} binding={state.binding} bindingKeyID={bindingKeyID} onSelect={(id) => void bind(id)} />
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => window.open(sub2APIKeysURL(), "_top")}>
            返回控制台
          </Button>
          <Button type="button" variant="ghost" onClick={() => void load()}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
