import type { ReactNode } from "react";
import { cn } from "../utils";

// DataTable — табличное представление для широких экранов. Оформление
// перенесено из утверждённого прототипа дословно (docs/UI_MIGRATION_PLAN.md,
// этап 3): заголовки капителью, строки высотой 52px, вся строка кликабельна.
//
// Это НЕ тот же файл, что components/DataTable.tsx: тот — мёртвый код и
// удаляется на этапе 9 (docs/UI_MIGRATION_PLAN.md §6). Пока сосуществуют,
// поэтому лежат в разных папках и импортируются по разным путям.
//
// Таблица предназначена для десктопа; на мобильном тот же список
// показывается через MobileListItem — так же, как в прототипе.

export interface DataTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
}

export function DataTable({
  columns,
  children,
  className,
}: {
  columns: DataTableColumn[];
  children: ReactNode;
  className?: string;
}) {
  return (
    // min-w-0 обязателен: у flex-элемента min-width по умолчанию auto, и
    // без него контейнер растягивается под ширину таблицы вместо того
    // чтобы её прокручивать — страница уезжает вбок (поймано проверкой
    // на 390px, +4px горизонтального скролла).
    <div className={cn("surface-card surface-grad min-w-0 overflow-hidden rounded-[10px]", className)}>
      {/* Узкие экраны: таблица шире вьюпорта прокручивается внутри себя,
          страница целиком горизонтально не едет. */}
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "h-11 px-4 text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border [&>tr]:row-interactive [&>tr]:cursor-pointer">
            {children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({
  children,
  align,
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={cn("h-[52px] px-4 align-middle", align === "right" && "text-right", className)}>
      {children}
    </td>
  );
}

// MobileListItem — та же сущность на узком экране: карточка-кнопка вместо
// строки таблицы. Перенесён из прототипа дословно.
export function MobileListItem({
  onClick,
  children,
  className,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-unset interactive focus-ring elev-1 min-h-[56px] w-full rounded-[10px] border border-border bg-card p-3.5 text-left hover:border-primary/30 hover:elev-2 active:bg-muted/50",
        className,
      )}
    >
      {children}
    </button>
  );
}
