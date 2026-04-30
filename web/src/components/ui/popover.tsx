"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  arrowClassName,
  className,
  children,
  align = "center",
  showArrow = true,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  arrowClassName?: string;
  showArrow?: boolean;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] outline-none data-[side=bottom]:[&_[data-slot=popover-arrow]]:translate-y-px data-[side=left]:[&_[data-slot=popover-arrow]]:-translate-x-px data-[side=right]:[&_[data-slot=popover-arrow]]:translate-x-px data-[side=top]:[&_[data-slot=popover-arrow]]:-translate-y-px",
          className,
        )}
        {...props}
      >
        {children}
        {showArrow ? (
          <PopoverPrimitive.Arrow
            asChild
            data-slot="popover-arrow"
            width={12}
            height={6}
            className={cn(
              "overflow-visible fill-popover stroke-border",
              arrowClassName,
            )}
          >
            <svg viewBox="0 0 30 10" preserveAspectRatio="none">
              <polygon points="0,0 30,0 15,10" />
              <path
                d="M0 0L15 10L30 0"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </PopoverPrimitive.Arrow>
        ) : null}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
