"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

import { recordAnalyticsEvents, type UsageAnalyticsEvent } from "@/lib/api";

const TRACKED_PATHS = new Set([
  "/image",
  "/canvas",
  "/ecommerce-suite",
  "/social",
  "/image-manager",
  "/team",
  "/profile",
]);
const FLUSH_INTERVAL_MS = 10000;
const STAY_HEARTBEAT_MS = 15000;
const MAX_BATCH_SIZE = 40;

function normalizeTrackedPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  for (const path of TRACKED_PATHS) {
    if (normalized === path || normalized.startsWith(`${path}/`)) {
      return path;
    }
  }
  return "";
}

export function UsageAnalyticsTracker() {
  const location = useLocation();
  const trackedPath = useMemo(() => normalizeTrackedPath(location.pathname), [location.pathname]);
  const currentPathRef = useRef(trackedPath);
  const queueRef = useRef<UsageAnalyticsEvent[]>([]);
  const clickCountRef = useRef(0);
  const lastVisibleAtRef = useRef(0);

  const flush = useCallback(async () => {
    const events = queueRef.current.splice(0, MAX_BATCH_SIZE);
    if (events.length === 0) {
      return;
    }
    try {
      await recordAnalyticsEvents(events);
    } catch {
      // Analytics is best-effort and must never block the product workflow.
    }
  }, []);
  const flushQueueRef = useRef(flush);
  flushQueueRef.current = flush;

  const enqueue = useCallback((event: UsageAnalyticsEvent) => {
    queueRef.current.push(event);
    if (queueRef.current.length >= MAX_BATCH_SIZE) {
      void flushQueueRef.current();
    }
  }, []);

  const flushClicks = useCallback(() => {
    const path = currentPathRef.current;
    const count = clickCountRef.current;
    if (!path || count <= 0) {
      clickCountRef.current = 0;
      return;
    }
    clickCountRef.current = 0;
    enqueue({ type: "page_click", path, count, occurred_at: new Date().toISOString() });
  }, [enqueue]);

  const flushStay = useCallback(() => {
    const path = currentPathRef.current;
    const lastVisibleAt = lastVisibleAtRef.current;
    if (!path || !lastVisibleAt || document.visibilityState !== "visible") {
      lastVisibleAtRef.current = document.visibilityState === "visible" ? Date.now() : 0;
      return;
    }
    const now = Date.now();
    const durationMS = Math.max(0, now - lastVisibleAt);
    lastVisibleAtRef.current = now;
    if (durationMS < 1000) {
      return;
    }
    enqueue({ type: "page_stay", path, duration_ms: durationMS, occurred_at: new Date(now).toISOString() });
  }, [enqueue]);

  useEffect(() => {
    flushStay();
    flushClicks();
    currentPathRef.current = trackedPath;
    lastVisibleAtRef.current = document.visibilityState === "visible" && trackedPath ? Date.now() : 0;
    if (trackedPath) {
      enqueue({ type: "page_view", path: trackedPath, occurred_at: new Date().toISOString() });
    }
    void flush();
  }, [enqueue, flush, flushClicks, flushStay, trackedPath]);

  useEffect(() => {
    const handleClick = () => {
      if (currentPathRef.current && document.visibilityState === "visible") {
        clickCountRef.current += 1;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushStay();
        flushClicks();
        void flush();
        return;
      }
      lastVisibleAtRef.current = currentPathRef.current ? Date.now() : 0;
    };
    const handlePageHide = () => {
      flushStay();
      flushClicks();
      const events = queueRef.current.splice(0);
      if (events.length > 0) {
        const payload = JSON.stringify({ events });
        const url = "/api/analytics/events";
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(url, blob);
        } else {
          void recordAnalyticsEvents(events);
        }
      }
    };
    const stayTimer = window.setInterval(() => {
      flushStay();
    }, STAY_HEARTBEAT_MS);
    const flushTimer = window.setInterval(() => {
      flushClicks();
      void flush();
    }, FLUSH_INTERVAL_MS);

    document.addEventListener("click", handleClick, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.clearInterval(stayTimer);
      window.clearInterval(flushTimer);
      flushStay();
      flushClicks();
      void flush();
    };
  }, [flush, flushClicks, flushStay]);

  return null;
}
