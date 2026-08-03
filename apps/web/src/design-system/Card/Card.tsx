import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Визуальное ревью 2026-08-03 ("более интересные карточки", плавные
  // hover-состояния) — приподнятие + более глубокая тень при наведении.
  // Опционально: статичные карточки-контейнеры формы не должны "прыгать"
  // при наведении, только кликабельные строки списка/карточки-сущности.
  interactive?: boolean;
}

// GarmentCard — базовый примитив (docs/UI_FOUNDATION.md, шаг 4), тот же
// .card/.card-pad, что и в apps/prototype, теперь как компонент с составными
// частями в духе shadcn (Header/Content/Footer), не только CSS-класс.
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[22px] border border-border bg-card shadow-card",
      interactive &&
        "transition-[transform,box-shadow] duration-[var(--animate-duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:shadow-hover active:translate-y-0 active:shadow-card",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-[15px] font-extrabold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-[12.5px] text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2 p-4 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
