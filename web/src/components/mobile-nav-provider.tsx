"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { MobileNavContext, type MobileNavPanel } from "@/components/mobile-nav-context";

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<MobileNavPanel | null>(null);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const clearPanel = useCallback(() => setPanel(null), []);
  const value = useMemo(
    () => ({
      open,
      setOpen,
      openDrawer,
      closeDrawer,
      panel,
      setPanel,
      clearPanel,
    }),
    [clearPanel, closeDrawer, open, openDrawer, panel],
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}
