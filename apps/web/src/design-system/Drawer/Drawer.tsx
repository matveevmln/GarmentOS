import type { ComponentPropsWithoutRef, HTMLAttributes } from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "../utils";

// GarmentDrawer/GarmentSheet — docs/DESIGN_SYSTEM_MAP.md §3.4/§6 (Tier
// B-now): мобильный bottom sheet вместо перехода на отдельную страницу
// (паттерн Telegram/Revolut, §1) — первый реальный сценарий: подтверждение
// приёмки партии/добавление фото без потери контекста текущего экрана.
// vaul — тот же автор экосистемы, что shadcn (уже зафиксирован в
// docs/UI_FOUNDATION.md), даёт drag-to-dismiss/фокус-ловушку бесплатно.
export const Drawer = VaulDrawer.Root;
export const DrawerTrigger: typeof VaulDrawer.Trigger = VaulDrawer.Trigger;
export const DrawerClose: typeof VaulDrawer.Close = VaulDrawer.Close;

export function DrawerContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <VaulDrawer.Portal>
      <VaulDrawer.Overlay className="fixed inset-0 z-overlay bg-black/45" />
      <VaulDrawer.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-overlay flex max-h-[85vh] flex-col rounded-t-[22px] border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-lg outline-none",
          "sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:rounded-[22px] sm:border",
          className,
        )}
        {...props}
      >
        <VaulDrawer.Handle className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        {children}
      </VaulDrawer.Content>
    </VaulDrawer.Portal>
  );
}

export function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pb-2", className)} {...props} />;
}

export function DrawerTitle({ className, ...props }: ComponentPropsWithoutRef<typeof VaulDrawer.Title>) {
  return <VaulDrawer.Title className={cn("text-base font-extrabold text-foreground", className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: ComponentPropsWithoutRef<typeof VaulDrawer.Description>) {
  return <VaulDrawer.Description className={cn("text-[13px] text-muted-foreground", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 p-5 pt-3", className)} {...props} />;
}
