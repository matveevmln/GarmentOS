import { cn } from "../utils";
import { formatMoney } from "../../lib/format";

// MoneyBlock — денежный показатель: надзаголовок, крупная цифра, подпись.
// Перенесён из утверждённого прототипа (docs/UI_MIGRATION_PLAN.md, этап 3),
// оформление сохранено дословно.
//
// Отличие от прототипа — только тип: там `value: string` уже с готовой
// строкой «124 500 ₽», здесь `value: number` и форматирование внутри
// (docs/UI_MIGRATION_PLAN.md §3). Со строкой невозможно ни сравнить, ни
// просуммировать значение, а API отдаёт числа.
export function MoneyBlock({
  label,
  value,
  currency,
  sub,
  tone,
  decimals,
  className,
}: {
  label: string;
  value: number;
  currency?: string;
  sub?: string;
  tone?: "default" | "warning" | "muted";
  decimals?: number;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3.5", className)}>
      <div className="eyebrow text-[10px]">{label}</div>
      <div
        className={cn(
          "num mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em]",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {formatMoney(value, currency, decimals)}
      </div>
      {sub ? <div className="num mt-1.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
