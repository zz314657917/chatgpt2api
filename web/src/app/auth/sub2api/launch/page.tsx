"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { launchSub2API } from "@/lib/api";
import { authSessionFromLoginResponse, clearVerifiedAuthSession, setVerifiedAuthSession } from "@/lib/session";

const launchPromises = new Map<string, ReturnType<typeof launchSub2API>>();

function searchParams() {
  const search = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
  return new URLSearchParams(search);
}

function launchOnce(token: string) {
  const cached = launchPromises.get(token);
  if (cached) {
    return cached;
  }
  const promise = launchSub2API(token).finally(() => {
    launchPromises.delete(token);
  });
  launchPromises.set(token, promise);
  return promise;
}

export default function Sub2APILaunchPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const finishLaunch = async () => {
      const token = searchParams().get("token") || "";
      if (!token) {
        await clearVerifiedAuthSession();
        if (active) {
          setErrorMessage("启动链接缺少授权参数");
        }
        return;
      }

      try {
        const data = await launchOnce(token);
        const sessionToken = data.token || "";
        if (!sessionToken) {
          throw new Error("启动接口没有返回本地会话");
        }
        const session = authSessionFromLoginResponse(data, sessionToken);
        await setVerifiedAuthSession(session);
        toast.success("已进入生图工作台");
        const params = searchParams();
        const query = new URLSearchParams();
        if (params.get("ui_mode") === "embedded") {
          query.set("ui_mode", "embedded");
        }
        const target = query.toString() ? `/image?${query.toString()}` : "/image";
        navigate(target, { replace: true });
      } catch (error) {
        await clearVerifiedAuthSession();
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "启动失败");
        }
      }
    };

    void finishLaunch();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
      <Card className="w-full max-w-md rounded-[24px]">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          {errorMessage ? (
            <>
              <div className="flex size-12 items-center justify-center rounded-[16px] bg-rose-50 text-rose-600">
                <AlertCircle className="size-5" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold">进入失败</h1>
                <p className="break-words text-sm leading-6 text-stone-500">{errorMessage}</p>
              </div>
              <Button className="h-10 rounded-xl px-5" onClick={() => navigate("/login", { replace: true })}>
                返回登录
              </Button>
            </>
          ) : (
            <>
              <LoaderCircle className="size-6 animate-spin text-stone-400" />
              <div className="space-y-2">
                <h1 className="text-xl font-semibold">正在进入生图工作台</h1>
                <p className="text-sm text-stone-500">请稍候。</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
