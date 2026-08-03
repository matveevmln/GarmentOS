import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

// GarmentButton — инженерная основа: паттерн shadcn/ui (cva-варианты +
// Radix Slot для asChild), фирменный вид — токены из
// design-system/Tokens/tokens.css (docs/UI_FOUNDATION.md). Замена .cta/
// .cta.secondary из apps/web/src/styles.css — тот же визуальный результат,
// теперь как переиспользуемый компонент с вариантами, а не голый CSS-класс
// на каждой кнопке.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[15px] text-[0.95rem] font-extrabold tracking-[-0.005em] transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--animate-duration-fast)] ease-[var(--ease-standard)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_10px_22px_-10px_var(--color-ring)] hover:opacity-90",
        secondary: "bg-card text-foreground border border-border hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        outline: "border border-border bg-transparent text-foreground hover:bg-secondary",
        ghost: "bg-transparent text-foreground hover:bg-secondary",
        link: "bg-transparent text-primary underline-offset-4 hover:underline shadow-none active:scale-100",
      },
      size: {
        default: "h-11 min-h-11 px-4 py-2 w-full",
        sm: "h-9 min-h-9 px-3 text-sm w-auto",
        lg: "h-12 min-h-12 px-6 text-base w-full",
        icon: "h-11 w-11 min-h-11 p-0",
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
          <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
