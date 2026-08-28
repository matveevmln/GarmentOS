import { formatMoney, formatPercent } from "../../lib/format";

// CostBreakdown — раскладка себестоимости: строка затрат, доля-полоса,
// цена за единицу и сумма. Оформление и сетка перенесены из утверждённого
// прототипа дословно (docs/UI_MIGRATION_PLAN.md, этап 3): на узких экранах
// полоса переносится под название, на широких — пять колонок в ряд.
//
// Отличие от прототипа: `unit`/`total` были готовыми строками, здесь —
// числа (docs/UI_MIGRATION_PLAN.md §3). Доля тоже число, а не текст.

export interface CostRow {
  label: string;
  /** Цена за единицу изделия. */
  unitCost: number;
  /** Сумма по строке на весь объём. */
  total: number;
  /** Доля в себестоимости, 0-100. */
  share: number;
}

export function CostBreakdown({
  rows,
  total,
  currency,
}: {
  rows: CostRow[];
  total: { label: string; unitCost: number; total: number };
  currency?: string;
}) {
  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.label}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-2.5 lg:grid-cols-[minmax(0,150px)_minmax(0,1fr)_100px_110px_44px]"
          >
            <span className="text-[13px] font-medium">{r.label}</span>
            <span className="order-3 col-span-2 h-1.5 overflow-hidden rounded-full bg-muted lg:order-none lg:col-span-1">
              <span
                className="block h-full rounded-full bg-primary/60"
                style={{ width: `${Math.max(0, Math.min(100, r.share))}%` }}
              />
            </span>
            <span className="num text-right text-[12px] text-muted-foreground lg:text-left">
              {formatMoney(r.unitCost, currency, 2)}
            </span>
            <span className="num order-4 text-right text-[13px] lg:order-none">
              {formatMoney(r.total, currency, 2)}
            </span>
            <span className="num order-5 hidden text-right text-[12px] text-muted-foreground lg:order-none lg:block">
              {formatPercent(r.share)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-4 border-t border-border pt-3 lg:grid-cols-[minmax(0,150px)_minmax(0,1fr)_100px_110px_44px]">
        <span className="text-[13px] font-semibold">{total.label}</span>
        <span className="hidden lg:block" />
        <span className="num hidden text-[12px] text-muted-foreground lg:block">
          {formatMoney(total.unitCost, currency, 2)}
        </span>
        <span className="num text-right text-[14px] font-semibold">
          {formatMoney(total.total, currency, 2)}
        </span>
        <span className="hidden lg:block" />
      </div>
    </div>
  );
}
