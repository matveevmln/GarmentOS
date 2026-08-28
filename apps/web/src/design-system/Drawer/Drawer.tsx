import type { ComponentPropsWithoutRef, HTMLAttributes } from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "../utils";

// GarmentDrawer/GarmentSheet — docs/DESIGN_SYSTEM_MAP.md §3.4/§6 (Tier
// B-now): мобильный bottom sheet вместо перехода на отдельную страницу
// (паттерн Telegram/Revolut, §1) — первый реальный сценарий: подтверждение
// приёмки партии/добавление фото без потери контекста текущего экрана.
// vaul — тот же автор экосистемы, что shadcn (уже зафиксирован в
// docs/UI_FOUNDATION.md), даёт drag-to-dismiss/фокус-ловушку бесплатно.
//
// Этап 3 миграции (docs/UI_MIGRATION_PLAN.md): переоформлен под визуальный
// язык прототипа — радиус 14px вместо 22px, стеклянная панель, затемнение
// цветом текста, а не чистым чёрным. КОНТРАКТ НЕ МЕНЯЕТСЯ.
//
// Прототип реализовал Drawer вручную ({open, onClose, title, children}) без
// ловушки фокуса, портала и drag-to-dismiss. Переход на него был бы
// функциональной регрессией, поэтому здесь оставлен vaul, а из прототипа
// взято только оформление. Одно расхождение осталось: на широком экране
// прототип показывает панель, приклеенную к правому краю во всю высоту, а
// здесь — плавающая карточка по центру. Направление у vaul задаётся на
// Root (`direction="right"`) и меняет все вызовы, поэтому вынесено
// владельцу проекта отдельным вопросом, а не решено молча.
export const Drawer = VaulDrawer.Root;
export const DrawerTrigger: typeof VaulDrawer.Trigger = VaulDrawer.Trigger;
export const DrawerClose: typeof VaulDrawer.Close = VaulDrawer.Close;

export function DrawerContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <VaulDrawer.Portal>
      <VaulDrawer.Overlay className="fixed inset-0 z-overlay bg-foreground/35 backdrop-blur-[2px]" />
      <VaulDrawer.Content
        className={cn(
          "glass-panel fixed inset-x-0 bottom-0 z-overlay flex max-h-[85vh] flex-col rounded-t-[14px] pb-[env(safe-area-inset-bottom)] outline-none",
          "sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:rounded-[14px]",
          className,
        )}
        {...props}
      >
        <VaulDrawer.Handle className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />
        {children}
      </VaulDrawer.Content>
    </VaulDrawer.Portal>
  );
}

export function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-border px-4 py-3", className)} {...props} />;
}

export function DrawerTitle({ className, ...props }: ComponentPropsWithoutRef<typeof VaulDrawer.Title>) {
  return <VaulDrawer.Title className={cn("text-[13px] font-semibold text-foreground", className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: ComponentPropsWithoutRef<typeof VaulDrawer.Description>) {
  return <VaulDrawer.Description className={cn("t-secondary", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 px-4 py-4 pt-3", className)} {...props} />;
}

/** Прокручиваемое тело панели между шапкой и подвалом — в прототипе это
 *  отдельный контейнер с `overflow-y-auto`, без него длинный список
 *  растягивает саму панель за пределы max-h. */
export function DrawerBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-y-auto px-4 py-4", className)} {...props} />;
}
