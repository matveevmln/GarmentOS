import { forwardRef, useEffect, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../utils";

// GarmentNumberInput/MoneyInput/PercentInput — docs/DESIGN_SYSTEM_MAP.md
// §3.3/§4.6: реальный пробел в форме-эталоне — цена/количество были
// обычным <input>, без форматирования и без визуального выравнивания сумм
// (паттерн Stripe, tabular-nums). Форматирование — при blur, не на каждый
// keystroke (не мешает вводу, паттерн Origin UI/большинства финансовых форм).
interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  suffix?: string;
  min?: number;
  max?: number;
  decimals?: number;
}

function formatDisplay(value: number | undefined, decimals: number): string {
  if (value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(value);
}

function parseInput(raw: string): number | undefined {
  const normalized = raw.replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (normalized === "" || normalized === "-") return undefined;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, suffix, min, max, decimals = 0, className, disabled, ...props }, ref) => {
    const [display, setDisplay] = useState(() => formatDisplay(value, decimals));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
      if (!focused) setDisplay(formatDisplay(value, decimals));
    }, [value, decimals, focused]);

    return (
      <div className="relative">
        <input
          ref={ref}
          inputMode="decimal"
          className={cn(
            "h-11 min-h-11 w-full rounded-[11px] border border-border bg-card px-3 py-2 text-[0.95rem] tabular-nums",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            suffix && "pr-10",
            className,
          )}
          value={display}
          disabled={disabled}
          onFocus={() => {
            setFocused(true);
            setDisplay(value === undefined ? "" : String(value));
          }}
          onChange={(event) => setDisplay(event.target.value)}
          onBlur={() => {
            setFocused(false);
            let parsed = parseInput(display);
            if (parsed !== undefined) {
              if (min !== undefined) parsed = Math.max(min, parsed);
              if (max !== undefined) parsed = Math.min(max, parsed);
            }
            onChange(parsed);
            setDisplay(formatDisplay(parsed, decimals));
          }}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.85rem] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
NumberInput.displayName = "NumberInput";

export const MoneyInput = forwardRef<HTMLInputElement, Omit<NumberInputProps, "suffix" | "decimals"> & { currency?: string }>(
  ({ currency = "сом", ...props }, ref) => <NumberInput ref={ref} suffix={currency} decimals={2} min={0} {...props} />,
);
MoneyInput.displayName = "MoneyInput";

export const PercentInput = forwardRef<HTMLInputElement, Omit<NumberInputProps, "suffix" | "decimals" | "min" | "max">>(
  (props, ref) => <NumberInput ref={ref} suffix="%" decimals={1} min={0} max={100} {...props} />,
);
PercentInput.displayName = "PercentInput";
