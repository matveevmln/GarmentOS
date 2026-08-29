import { createContext, useContext, useEffect, useState } from "react";
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
// взято оформление и геометрия.
//
// Этап 4, решение владельца проекта: на широком экране панель приезжает от
// ПРАВОГО края и занимает всю высоту — как в прототипе; на мобильном
// остаётся нижним листом. Направление у vaul задаётся на Root, поэтому
// `Drawer` теперь не реэкспорт `VaulDrawer.Root`, а обёртка, которая сама
// выбирает направление по ширине экрана и сообщает его содержимому через
// контекст. Все свойства пробрасываются как были, поэтому существующие
// вызовы (<Drawer>, open/onOpenChange, DrawerTrigger, DrawerClose)
// продолжают работать без правок — контракт сохранён, а ловушка фокуса,
// портал и drag-to-dismiss остаются от vaul в обоих направлениях.

const WIDE_QUERY = "(min-width: 640px)";

const DrawerDirectionContext = createContext<"bottom" | "right">("bottom");

/** Направление зависит от ширины экрана. Отдельный хук, а не CSS: vaul
 *  считает жест и трансформацию по направлению, поэтому его нельзя задать
 *  одними классами. */
function useDrawerDirection(): "bottom" | "right" {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide ? "right" : "bottom";
}

export function Drawer(props: ComponentPropsWithoutRef<typeof VaulDrawer.Root>) {
  const direction = useDrawerDirection();
  return (
    <DrawerDirectionContext.Provider value={direction}>
      {/* key: при смене направления vaul пересобирает внутреннее состояние
          жеста — иначе после поворота экрана панель считает смещение по
          старой оси. */}
      <VaulDrawer.Root key={direction} direction={direction} {...props} />
    </DrawerDirectionContext.Provider>
  );
}

export const DrawerTrigger: typeof VaulDrawer.Trigger = VaulDrawer.Trigger;
export const DrawerClose: typeof VaulDrawer.Close = VaulDrawer.Close;

export function DrawerContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const direction = useContext(DrawerDirectionContext);
  return (
    <VaulDrawer.Portal>
      <VaulDrawer.Overlay className="fixed inset-0 z-overlay bg-foreground/35 backdrop-blur-[2px]" />
      <VaulDrawer.Content
        className={cn(
          "glass-panel fixed z-overlay flex flex-col outline-none",
          direction === "right"
            ? // Десктоп: панель во всю высоту у правого края.
              "inset-y-0 right-0 h-full w-[420px] max-w-[86vw] rounded-l-[14px]"
            : // Мобильный: нижний лист.
              "inset-x-0 bottom-0 max-h-[85vh] rounded-t-[14px] pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        {...props}
      >
        {direction === "bottom" ? (
          <VaulDrawer.Handle className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
        ) : null}
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
