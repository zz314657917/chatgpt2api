"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type MobileBottomDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function MobileBottomDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  contentClassName,
}: MobileBottomDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "fixed inset-x-0 bottom-0 top-auto z-50 flex max-h-[86dvh] w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-t-[28px] rounded-b-none border-x-0 border-b-0 bg-background p-0 shadow-[0_-24px_80px_-34px_rgba(15,23,42,0.55)] sm:left-[50%] sm:w-[min(92vw,560px)] sm:translate-x-[-50%]",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/25" />
        <DialogHeader className="shrink-0 px-5 pt-4 pb-3">
          <DialogTitle className="text-base leading-6">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs leading-5">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]",
            contentClassName,
          )}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
