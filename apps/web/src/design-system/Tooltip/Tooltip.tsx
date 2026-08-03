import type { ComponentPropsWithoutRef } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../utils";

// GarmentTooltip — docs/DESIGN_SYSTEM_MAP.md §4.3: иконки статусов не
// объясняли себя при наведении/долгом нажатии (нарушение UX_PRINCIPLES.md
// §9 — понятность без обучения). Radix Tooltip — фокус/hover/долгое
// нажатие на touch уже встроены, стилизация наша.
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-popover rounded-[10px] bg-foreground px-2.5 py-1.5 text-[0.78rem] font-medium text-background shadow-lg",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
