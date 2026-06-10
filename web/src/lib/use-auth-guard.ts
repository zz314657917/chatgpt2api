"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  canAccessPath,
  getDefaultRouteForSession,
  type AuthRole,
  type StoredAuthSession,
} from "@/store/auth";
import { AUTH_SESSION_CHANGE_EVENT, getCachedAuthSession, getVerifiedAuthSession } from "@/lib/session";

type UseAuthGuardResult = {
  isCheckingAuth: boolean;
  session: StoredAuthSession | null;
};

export function useAuthGuard(allowedRoles?: AuthRole[], requiredPath?: string): UseAuthGuardResult {
  const navigate = useNavigate();
  const [session, setSession] = useState<StoredAuthSession | null>(() => getCachedAuthSession() ?? null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => getCachedAuthSession() === undefined);
  const allowedRolesKey = (allowedRoles || []).join(",");

  useEffect(() => {
    let active = true;
    const roleList = allowedRolesKey ? (allowedRolesKey.split(",") as AuthRole[]) : [];

    const applySession = (storedSession: StoredAuthSession | null) => {
      if (!active) {
        return;
      }

      if (!storedSession) {
        setSession(null);
        setIsCheckingAuth(false);
        navigate("/login", { replace: true });
        return;
      }

      if (roleList.length > 0 && !roleList.includes(storedSession.role)) {
        setSession(storedSession);
        setIsCheckingAuth(false);
        navigate(getDefaultRouteForSession(storedSession), { replace: true });
        return;
      }

      if (requiredPath && !canAccessPath(storedSession, requiredPath)) {
        setSession(storedSession);
        setIsCheckingAuth(false);
        navigate(getDefaultRouteForSession(storedSession), { replace: true });
        return;
      }

      setSession(storedSession);
      setIsCheckingAuth(false);
    };

    const load = async () => {
      applySession(await getVerifiedAuthSession());
    };
    const handleSessionChange = () => {
      applySession(getCachedAuthSession() ?? null);
    };

    void load();
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    };
  }, [allowedRolesKey, navigate, requiredPath]);

  return { isCheckingAuth, session };
}

export function useRedirectIfAuthenticated() {
  const navigate = useNavigate();
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => getCachedAuthSession() !== null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const storedSession = await getVerifiedAuthSession();
      if (!active) {
        return;
      }

      if (storedSession) {
        navigate(getDefaultRouteForSession(storedSession), { replace: true });
        return;
      }

      setIsCheckingAuth(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [navigate]);

  return { isCheckingAuth };
}
