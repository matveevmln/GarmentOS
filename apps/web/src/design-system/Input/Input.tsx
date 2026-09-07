import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // Геометрия поля — из прототипа (SearchField): 10px радиус,
        // 40px высота на мобильном / 36px на десктопе, 13px текст.
        // Фокус даёт утилита `field` (ореол), а не собственный ring.
        "field h-10 min-h-10 rounded-[10px] border border-border bg-card px-3 text-[13px] md:h-9 md:min-h-9 flex w-full text-foreground placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
