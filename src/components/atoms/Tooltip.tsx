"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/utils/helpers/cn";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-md",
      "data-[state=delayed-open]:data-[side=top]:animate-in data-[state=delayed-open]:data-[side=bottom]:animate-in",
      "data-[state=delayed-open]:data-[side=left]:animate-in data-[state=delayed-open]:data-[side=right]:animate-in",
      "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
      "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
