import type { ReactNode } from "react";
import { cn } from "../utils";
import { IconAlert } from "../Icons/icons";

// AttentionList — список того, что требует вмешательства сегодня
// (просроченные заказы пошива, закупки, счета). Оформление перенесено из
// утверждённого прототипа дословно (docs/UI_MIGRATION_PLAN.md, этап 3).
//
// Отличие от прототипа: `meta` принимает ReactNode, а не строку — на
// дашборде справа стоит то срок в днях, то сумма, и форматирование этих
// значений остаётся за вызывающим экраном (этап 6).
export interface AttentionItem {
  id: string;
  tone: "danger" | "warning";
  title: string;
  /** Подпись под заголовком: цех, поставщик, срок. */
  sub: string;
  /** Правая колонка: просрочка в днях или сумма. */
  meta: ReactNode;
}

export function AttentionList({
  items,
  onSelect,
}: {
  items: AttentionItem[];
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => onSelect?.(it.id)}
            className="btn-unset interactive focus-ring -mx-2 flex w-full items-start gap-3 rounded-[8px] px-2 py-3 text-left hover:bg-muted/50 active:bg-muted"
          >
            <span
              className={cn(
                "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]",
                it.tone === "danger"
                  ? "bg-danger/[0.08] text-danger"
                  : "bg-warning/[0.08] text-warning",
              )}
            >
              <IconAlert size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-object block">{it.title}</span>
              <span className="t-meta mt-1 block">{it.sub}</span>
            </span>
            <span
              className={cn(
                "t-value shrink-0 text-[13.5px] font-semibold",
                it.tone === "danger" ? "text-danger" : "text-warning",
              )}
            >
              {it.meta}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
