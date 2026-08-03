import type { ComponentPropsWithoutRef } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { cn } from "../utils";

// GarmentDropdownMenu — docs/DESIGN_SYSTEM_MAP.md §3.4/§6.4: hover-only меню
// действий в ListCard (паттерн Notion, "..." виден только при наведении) +
// GarmentUserMenu (Tier B-later) строится поверх того же примитива.
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-popover min-w-[180px] rounded-[14px] border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { variant?: "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex h-10 cursor-pointer select-none items-center gap-2 rounded-[10px] px-2.5 text-[0.88rem] font-medium outline-none",
        "data-[highlighted]:bg-secondary",
        variant === "destructive" ? "text-destructive data-[highlighted]:bg-destructive/10" : "text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenuSeparator = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) => (
  <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
);
