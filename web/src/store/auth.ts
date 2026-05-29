"use client";

import localforage from "localforage";

import type { BillingState, Sub2APIBinding } from "@/lib/api";

export type AuthRole = "admin" | "user";

export type AuthMenuItem = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  order?: number;
  children?: AuthMenuItem[];
};

export type StoredAuthSession = {
  key: string;
  role: AuthRole;
  roleId?: string;
  roleName?: string;
  subjectId: string;
  name: string;
  provider?: string;
  creationConcurrentLimit: number;
  creationRpmLimit: number;
  billing?: BillingState | null;
  menuPaths: string[];
  apiPermissions: string[];
  menus: AuthMenuItem[];
  sub2api?: Sub2APIBinding | null;
};

export const AUTH_SESSION_STORAGE_KEY = "chatgpt2api_auth_session";

const authStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "auth",
});

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((item) => {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    out.push(text);
  });
  return out;
}

function normalizeMenus(value: unknown): AuthMenuItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<AuthMenuItem>;
    const path = String(candidate.path || "").trim();
    const label = String(candidate.label || "").trim();
    if (!path || !label) {
      return [];
    }
    return [{
      id: String(candidate.id || path).trim(),
      label,
      path,
      icon: String(candidate.icon || "").trim(),
      order: typeof candidate.order === "number" ? candidate.order : 0,
      children: normalizeMenus(candidate.children),
    }];
  });
}

function normalizeSession(value: unknown, fallbackKey = ""): StoredAuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredAuthSession>;
  const key = String(candidate.key || fallbackKey || "").trim();
  const role = candidate.role === "admin" || candidate.role === "user" ? candidate.role : null;
  const creationConcurrentLimit = Number(candidate.creationConcurrentLimit);
  const creationRpmLimit = Number(candidate.creationRpmLimit ?? 0);
  if (!key || !role || !Number.isFinite(creationConcurrentLimit) || creationConcurrentLimit < 0) {
    return null;
  }

  return {
    key,
    role,
    roleId: String(candidate.roleId || "").trim(),
    roleName: String(candidate.roleName || "").trim(),
    subjectId: String(candidate.subjectId || "").trim(),
    name: String(candidate.name || "").trim(),
    provider: String(candidate.provider || "").trim(),
    creationConcurrentLimit,
    creationRpmLimit: Number.isFinite(creationRpmLimit) && creationRpmLimit > 0 ? creationRpmLimit : 0,
    billing: normalizeBillingState(candidate.billing),
    menuPaths: normalizeStringList(candidate.menuPaths),
    apiPermissions: normalizeStringList(candidate.apiPermissions),
    menus: normalizeMenus(candidate.menus),
    sub2api: normalizeSub2APIBinding(candidate.sub2api),
  };
}

function normalizeSub2APIBinding(value: unknown): Sub2APIBinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Partial<Sub2APIBinding>;
  const ownerId = String(item.owner_id || "").trim();
  const sub2apiUserId = String(item.sub2api_user_id || "").trim();
  if (!ownerId || !sub2apiUserId) {
    return null;
  }
  return {
    owner_id: ownerId,
    sub2api_user_id: sub2apiUserId,
    user_email: String(item.user_email || "").trim(),
    user_name: String(item.user_name || "").trim(),
    api_key_id: String(item.api_key_id || "").trim(),
    api_key_name: String(item.api_key_name || "").trim(),
    api_key_last4: String(item.api_key_last4 || "").trim(),
    group_id: String(item.group_id || "").trim(),
    group_name: String(item.group_name || "").trim(),
    group_platform: String(item.group_platform || "").trim(),
    gateway_base_url: String(item.gateway_base_url || "").trim(),
    expires_at: String(item.expires_at || "").trim(),
    updated_at: String(item.updated_at || "").trim(),
    has_bound_api_key: Boolean(item.has_bound_api_key),
  };
}

function normalizeBillingState(value: unknown): BillingState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as BillingState;
  if (item.type !== "standard" && item.type !== "subscription") {
    return null;
  }
  return {
    ...item,
    unit: item.unit === "cny_milli" ? "cny_milli" : "image",
    unlimited: Boolean(item.unlimited),
    available: Math.max(0, Number(item.available) || 0),
  };
}

export function canAccessPath(session: StoredAuthSession | null | undefined, path: string) {
  if (!session) {
    return false;
  }
  if (path === "/profile") {
    return true;
  }
  if (session.role === "admin") {
    return true;
  }
  return session.menuPaths.includes(path);
}

export function hasAPIPermission(session: StoredAuthSession | null | undefined, method: string, path: string) {
  if (!session) {
    return false;
  }
  if (session.role === "admin") {
    return true;
  }
  return session.apiPermissions.includes(`${method.toLowerCase()}${path}`);
}

export function getDefaultRouteForSession(session: StoredAuthSession) {
  for (const path of ["/image", "/canvas", "/social", "/settings", ...session.menuPaths, "/profile"]) {
    if (canAccessPath(session, path)) {
      return path;
    }
  }
  return "/image";
}

export async function getStoredAuthSession() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeSession(await authStorage.getItem<StoredAuthSession>(AUTH_SESSION_STORAGE_KEY));
}

export async function getStoredSessionToken() {
  const session = await getStoredAuthSession();
  return session?.key ?? "";
}

export async function setStoredAuthSession(session: StoredAuthSession) {
  const normalizedSession = normalizeSession(session);
  if (!normalizedSession) {
    await clearStoredAuthSession();
    return;
  }

  await authStorage.setItem(AUTH_SESSION_STORAGE_KEY, normalizedSession);
}

export async function clearStoredAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  await authStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}
