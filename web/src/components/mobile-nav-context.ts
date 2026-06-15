import { createContext, useContext, type ReactNode } from "react";

export type MobileNavPanel = {
  title: ReactNode;
  description?: ReactNode;
  content: ReactNode;
};

export type MobileNavContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  panel: MobileNavPanel | null;
  setPanel: (panel: MobileNavPanel | null) => void;
  clearPanel: () => void;
};

export const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function useMobileNav() {
  const value = useContext(MobileNavContext);
  if (!value) {
    throw new Error("useMobileNav must be used within MobileNavProvider");
  }
  return value;
}
