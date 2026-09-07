import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Command as CommandPrimitive } from "cmdk";
import { Icon } from "../Icons/Icon";
import { cn } from "../utils";

// GarmentCommandPalette (⌘K) — docs/DESIGN_SYSTEM_MAP.md §1/§3.4: паттерн
// Linear — не "поиск", а основная точка входа в частое действие. Здесь:
// быстрый переход между разделами без похода через нижнюю
// навигацию/верхние пилюли (Zero Input, docs/PRINCIPLES.md принцип 17).
// Список действий растёт по мере появления новых экранов — сейчас только
// навигация, создание сущностей добавится вместе с формами, которые их
// создают (не заранее, принцип 3).
const ACTIONS = [
  { to: "/workshops", label: "Цеха", icon: "factory" },
  { to: "/suppliers", label: "Поставщики", icon: "users" },
  { to: "/materials", label: "Материалы", icon: "layers" },
  { to: "/warehouses", label: "Склады", icon: "building" },
  { to: "/products", label: "Модели", icon: "box" },
  { to: "/purchase-orders", label: "Закупки", icon: "cash" },
  { to: "/production-orders", label: "Заказы пошива", icon: "scissors" },
];

// Открыть палитру снаружи — кнопкой «Быстрый переход» в верхней панели
// AppShell (docs/UI_MIGRATION_PLAN.md, этап 4). Через событие, а не через
// props: <CommandPalette /> висит в App.tsx выше Routes, а кнопка — внутри
// оболочки; поднимать состояние в App.tsx означало бы трогать роутинг.
// Контракт компонента (вызов без props) не меняется.
const OPEN_EVENT = "garmentos:command-palette-open";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    const onOpenRequest = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenRequest);
    };
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-overlay bg-black/45",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[14vh] z-overlay w-[calc(100%-32px)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[18px] border border-border bg-popover shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Быстрый переход</DialogPrimitive.Title>
          <CommandPrimitive className="flex flex-col" shouldFilter>
            <CommandPrimitive.Input
              autoFocus
              placeholder="Куда перейти? (модель, цех, заказ...)"
              className="h-13 w-full border-b border-border bg-transparent px-4 py-3.5 text-[1rem] outline-none placeholder:text-muted-foreground"
            />
            <CommandPrimitive.List className="max-h-80 overflow-y-auto p-2">
              <CommandPrimitive.Empty className="px-3 py-8 text-center text-[0.85rem] text-muted-foreground">
                Ничего не найдено
              </CommandPrimitive.Empty>
              {ACTIONS.map((action) => (
                <CommandPrimitive.Item
                  key={action.to}
                  value={action.label}
                  onSelect={() => {
                    void navigate(action.to);
                    setOpen(false);
                  }}
                  className="flex h-12 cursor-pointer select-none items-center gap-3 rounded-[12px] px-3 text-[0.92rem] font-medium text-foreground data-[selected=true]:bg-secondary"
                >
                  <Icon name={action.icon} style={{ width: 18, height: 18 }} />
                  {action.label}
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.List>
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[0.72rem] text-muted-foreground">
              <span>↑↓ навигация · Enter выбрать</span>
              <span>Esc закрыть</span>
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
