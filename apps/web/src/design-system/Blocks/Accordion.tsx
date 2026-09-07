import { useState, type ReactNode } from "react";
import { cn } from "../utils";
import { IconChevronDown } from "../Icons/icons";

// Accordion — сворачиваемая секция (спецификация, история, вложения).
// Оформление перенесено из утверждённого прототипа дословно
// (docs/UI_MIGRATION_PLAN.md, этап 3), включая плавное раскрытие через
// утилиту `collapsible` из tokens.css (grid-template-rows, без замера
// высоты в JS).
export function Accordion({
  title,
  hint,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  /** Короткая справка справа от заголовка: количество, сумма, статус. */
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-[10px] border border-border bg-card transition-shadow duration-200", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="interactive focus-ring flex min-h-[48px] w-full items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left hover:bg-muted/45 active:bg-muted/60"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">{title}</span>
          {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
        </span>
        <IconChevronDown
          size={16}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <div className={cn("collapsible", open && "collapsible-open")}>
        <div>
          <div className="border-t border-border px-4 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
