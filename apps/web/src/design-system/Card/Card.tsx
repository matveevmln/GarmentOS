import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Кликабельные карточки/строки списка мягко реагируют на наведение;
  // статичные контейнеры формы не «прыгают».
  interactive?: boolean;
}

// GarmentCard — визуальный слой перенесён из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2): радиус 12px вместо 22px, плотная
// поверхность surface-card + surface-grad (лёгкий градиент сверху вниз),
// тень появляется только при наведении у интерактивных карточек.
//
// Публичный API сохранён: Card + CardHeader/CardTitle/CardDescription/
// CardContent/CardFooter, проброс div-атрибутов, forwardRef. В прототипе
// CardHeader принимал props {title, hint, action} — другой контракт;
// переход на него потребовал бы переписать 21 вызов на страницах, это
// делается на этапах 5-8 вместе с самими экранами.
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "surface-card surface-grad rounded-[12px] transition-[box-shadow,border-color] duration-200",
      interactive && "hover:elev-2 hover:border-primary/25",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1 p-4 md:p-5 md:pb-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("t-section text-[15px]", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("t-secondary", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0 md:p-5 md:pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2 p-4 pt-0 md:p-5 md:pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

// SectionLabel — надзаголовок секции (eyebrow) из прототипа. Новый
// компонент, существующие вызовы не затрагивает.
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}
