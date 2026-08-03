import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "../utils";

// GarmentProgress — docs/DESIGN_SYSTEM_MAP.md §3.10: процент выполнения
// заказа пошива (сколько SKU из заказанного уже принято). Radix Progress
// даёт доступность (role=progressbar, aria-valuenow) бесплатно.
export function Progress({ value, className, ...props }: { value: number; className?: string }) {
  return (
    <ProgressPrimitive.Root
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 rounded-full bg-primary transition-transform duration-[var(--animate-duration-slow)] ease-[var(--ease-standard)]"
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
