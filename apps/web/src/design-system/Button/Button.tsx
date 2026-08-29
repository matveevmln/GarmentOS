import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

// GarmentButton — визуальный слой перенесён из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2): компактная высота, радиус 6px,
// у основной кнопки — тёмная заливка с акцентной подсветкой снизу
// (inset box-shadow), а не сплошной акцентный фон.
//
// ВАЖНО: публичный API компонента НЕ меняется. Имена вариантов
// (default/secondary/destructive/outline/ghost/link), размеры
// (default/sm/lg/icon), asChild, forwardRef и проброс HTML-атрибутов
// остаются прежними — 39 вызовов на 12 страницах продолжают работать без
// правок. Прототип использовал другие имена (primary/secondary/ghost,
// sm/md); переименование потребовало бы переписать все страницы, что
// выходит за рамки этапа 2 и создаёт риск для бизнес-логики.
export const buttonVariants = cva(
  "btn-unset interactive focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium tracking-[-0.005em] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
  {
    variants: {
      variant: {
        // Основное действие: тёмная заливка + акцентная кромка снизу.
        default:
          "bg-foreground text-background shadow-[inset_0_-2px_0_0_color-mix(in_oklab,var(--primary)_75%,transparent)] hover:bg-foreground/88 active:bg-foreground/95",
        secondary:
          "border border-input bg-card text-foreground hover:border-primary/35 hover:bg-muted active:bg-muted",
        destructive:
          "border border-danger/25 bg-danger/[0.08] text-danger hover:bg-danger/[0.14]",
        outline:
          "border border-border bg-transparent text-foreground hover:border-primary/25 hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "bg-transparent text-primary underline-offset-4 hover:underline shadow-none",
      },
      size: {
        // Ширина НЕ меняется относительно прежнего поведения apps/web
        // (`w-full` у default и lg): этап 2 — только визуальный слой.
        // Вопрос «должна ли основная кнопка сжиматься по содержимому на
        // десктопе» вынесен владельцу проекта отдельно и решается на
        // этапах 4-8 вместе с раскладкой самих экранов.
        default: "h-10 min-h-10 w-full px-3.5 text-[13px] md:h-9 md:min-h-9",
        sm: "h-9 min-h-9 w-auto px-2.5 text-[12px] md:h-8 md:min-h-8",
        lg: "h-11 min-h-11 w-full px-5 text-[14px]",
        icon: "h-11 w-11 min-h-11 p-0 md:h-9 md:w-9 md:min-h-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  // docs/DESIGN_SYSTEM_MAP.md §4.2 — реальный пробел: между нажатием и
  // ответом сервера кнопка была доступна для повторного нажатия (риск
  // двойной отправки на медленной мобильной сети в цехе/на складе).
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, type = "button", children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

// IconButton — новый компонент из прототипа. На мобильном 44×44 (зона
// нажатия по рекомендации), на десктопе сжимается до 36×36.
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, active = false, type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        // btn-unset обязателен: у IconButton нет собственного фона, а
        // легаси-правило `button {}` в styles.css заливает такие кнопки
        // акцентным оранжевым (см. мост в tokens.css). Найдено на этапе 4,
        // когда IconButton впервые попал в верхнюю панель.
        "btn-unset interactive focus-ring inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted md:h-9 md:w-9",
        active && "border-primary/25 bg-primary/[0.08] text-primary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
