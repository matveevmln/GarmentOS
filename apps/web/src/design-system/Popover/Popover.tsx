import type { ComponentPropsWithoutRef } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "../utils";

// GarmentPopover — docs/DESIGN_SYSTEM_MAP.md §3.8: формализация примитива,
// уже фактически используемого внутри Select/DatePicker — выделяется как
// самостоятельный компонент, а не второй раз пишется inline при следующем
// использовании (Combobox, GarmentUserMenu и т.д.).
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-popover rounded-[16px] border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
