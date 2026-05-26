import axios, {AxiosError, type AxiosRequestConfig} from "axios";

import webConfig from "@/constants/common-env";
import {clearAuthenticatedImageCache} from "@/lib/authenticated-image";
import {clearStoredAuthSession, getStoredSessionToken} from "@/store/auth";

type RequestConfig = AxiosRequestConfig & {
    redirectOnUnauthorized?: boolean;
};

type ErrorPayload = {
    detail?: string | { error?: string | { message?: string } };
    error?: string | { message?: string };
    message?: string;
};

function errorMessageFromValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (!value || typeof value !== "object") {
        return "";
    }

    const item = value as { error?: unknown; message?: unknown };
    if (typeof item.message === "string") {
        return item.message;
    }
    return errorMessageFromValue(item.error);
}

const exactErrorTranslations: Record<string, string> = {
    "access_token is required": "缺少 access_token",
    "account not found": "账号不存在",
    "admin permission required": "需要管理员权限",
    "authorization is invalid": "授权信息无效",
    "canvas not found": "画布不存在",
    "canvas run not found": "画布运行记录不存在",
    "canvas service is unavailable": "画布服务不可用",
    "creation task not found": "创作任务不存在",
    "image file is required": "缺少图片文件",
    "image not found": "图片不存在",
    "invalid image path": "图片路径无效",
    "invalid json body": "请求体不是有效的 JSON",
    "invalid multipart form": "multipart 表单无效",
    "no available image quota": "当前没有可用的图片额度",
    "no update available": "当前没有可用更新",
    "permission denied": "权限不足",
    "prompt is required": "缺少提示词",
    "proxy url is required": "缺少代理地址",
    "role not found": "角色不存在",
    "server not found": "服务器不存在",
    "user balance insufficient": "用户余额不足",
    "user not found": "用户不存在",
    "user quota exceeded": "用户配额不足",
};

export function localizeErrorMessage(message: string): string {
    const trimmed = String(message || "").trim();
    if (!trimmed) {
        return "";
    }
    const normalized = trimmed.toLowerCase();
    if (exactErrorTranslations[trimmed]) {
        return exactErrorTranslations[trimmed];
    }
    if (exactErrorTranslations[normalized]) {
        return exactErrorTranslations[normalized];
    }
    if (normalized.includes("image generation request rejected by content policy")) {
        const reason = trimmed.includes(":") ? trimmed.slice(trimmed.indexOf(":") + 1).trim() : "";
        return reason ? `图片生成请求被内容安全策略拒绝：${reason}` : "图片生成请求被内容安全策略拒绝";
    }
    if (normalized.includes("upstream connection failed before tls handshake completed")) {
        return "上游连接在 TLS 握手前失败，请检查代理是否能访问 chatgpt.com，或更换代理";
    }
    if (normalized.includes("no images generated") && normalized.includes("model may have refused")) {
        return "没有生成图片，模型可能拒绝了这次请求，请调整提示词后重试";
    }
    if (normalized.includes("an error occurred while processing your request")) {
        const requestId = trimmed.match(/request id\s+([a-z0-9-]+)/i)?.[1];
        return requestId ? `上游处理请求失败，请稍后重试。请求 ID：${requestId}` : "上游处理请求失败，请稍后重试";
    }
    if (normalized.startsWith("unsupported image_generation model: ")) {
        return `不支持的 image_generation 模型：${trimmed.slice("unsupported image_generation model: ".length).trim()}`;
    }
    if (normalized.startsWith("download returned ")) {
        return `下载失败：HTTP ${trimmed.slice("download returned ".length).trim()}`;
    }
    if (normalized.startsWith("github api returned ")) {
        return trimmed
            .replace("GitHub API returned", "GitHub API 返回")
            .replace("latest GitHub Release was not found for", "未找到 latest GitHub Release：")
            .replace(
                "publish a GitHub Release with release archives, configure CHATGPT2API_UPDATE_REPO to the repository that contains releases, or ensure the GitHub token can read the repository",
                "请发布包含 Release 压缩包的 GitHub Release，或把 CHATGPT2API_UPDATE_REPO 配置为包含 Release 的仓库，并确认 GitHub Token 有读取权限",
            )
            .replace("GitHub API rate limit exhausted", "GitHub API 额度已耗尽")
            .replace("reset at", "重置时间")
            .replace("set CHATGPT2API_UPDATE_GITHUB_TOKEN to use authenticated GitHub API requests", "请设置 CHATGPT2API_UPDATE_GITHUB_TOKEN 使用已认证的 GitHub API 请求");
    }
    return trimmed;
}

const request = axios.create({
    baseURL: webConfig.apiUrl.replace(/\/$/, ""),
    withCredentials: true,
});

request.interceptors.request.use(async (config) => {
    const nextConfig = {...config};
    const sessionToken = await getStoredSessionToken();
    const headers = {...nextConfig.headers} as Record<string, string>;
    if (sessionToken && !headers.Authorization) {
        headers.Authorization = `Bearer ${sessionToken}`;
    }
    // oxlint-disable-next-line typescript/ban-ts-comment
    // @ts-expect-error
    nextConfig.headers = headers;
    return nextConfig;
});

request.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ErrorPayload>) => {
        const status = error.response?.status;
        const shouldRedirect = (error.config as RequestConfig | undefined)?.redirectOnUnauthorized !== false;
        if (status === 401 && shouldRedirect && typeof window !== "undefined") {
            // Avoid redirect loop — only redirect if not already on /login
            if (!window.location.pathname.startsWith("/login")) {
                clearAuthenticatedImageCache();
                await clearStoredAuthSession();
                window.location.replace("/login");
                // Return a never-resolving promise to prevent further error handling
                // while the browser navigates away
                return new Promise(() => {});
            }
        }

        const payload = error.response?.data;
        const message =
            errorMessageFromValue(payload?.detail) ||
            errorMessageFromValue(payload?.error) ||
            payload?.message ||
            error.message ||
            `请求失败 (${status || 500})`;
        return Promise.reject(new Error(localizeErrorMessage(message)));
    },
);

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    redirectOnUnauthorized?: boolean;
    signal?: AbortSignal;
};

export async function httpRequest<T>(path: string, options: RequestOptions = {}) {
    const {method = "GET", body, headers, redirectOnUnauthorized = true, signal} = options;
    const config: RequestConfig = {
        url: path,
        method,
        data: body,
        headers,
        redirectOnUnauthorized,
        signal,
    };
    const response = await request.request<T>(config);
    return response.data;
}
