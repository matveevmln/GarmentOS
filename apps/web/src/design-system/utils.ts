import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Стандартный shadcn-хелпер: clsx собирает условные классы, tailwind-merge
// разрешает конфликты (например, если базовый вариант компонента и переданный
// извне className оба задают padding — побеждает последний, не оба разом).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
