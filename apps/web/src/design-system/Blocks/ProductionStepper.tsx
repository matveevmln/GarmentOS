import { cn } from "../utils";
import { statusMeta } from "../../lib/status";

// ProductionStepper — производственная шкала партии. Оформление перенесено
// из утверждённого прототипа дословно (docs/UI_MIGRATION_PLAN.md, этап 3):
// вертикальная ось на мобильном, горизонтальная на десктопе; пройденные
// этапы — кольцо, текущий — квадрат с ореолом, следующие — пустой круг.
//
// Отличие от прототипа — источник этапов. Там был массив русских строк из
// mock-файла (`PRODUCTION_STAGES` в data/garmentos.ts), который переносить
// нельзя. Здесь — ключи реального enum `production_order_status`
// (packages/db-schema/src/schema/contract-manufacturing.ts) в порядке
// объявления, подписи берутся из lib/status.ts. Значения совпадают
// один-в-один, ничего не выдумано.
//
// `cancelled` в шкалу не входит: отмена — не этап производства, а выход
// из него. Партия в этом статусе показывается через StatusBadge.
export const PRODUCTION_STAGES = [
  "draft",
  "placed",
  "in_progress",
  "ready_for_pickup",
  "received",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

/** Отменённая партия не имеет позиции на шкале — вызывающий код должен
 *  показать её отдельно, а не подсвечивать произвольный этап. */
export function isProductionStage(status: string): status is ProductionStage {
  return (PRODUCTION_STAGES as readonly string[]).includes(status);
}

export function ProductionStepper({ current }: { current: ProductionStage }) {
  const idx = PRODUCTION_STAGES.indexOf(current);
  return (
    <ol className="flex flex-col md:flex-row md:items-stretch">
      {PRODUCTION_STAGES.map((stage, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "next";
        return (
          <li
            key={stage}
            className="relative flex flex-1 items-start gap-3 py-2.5 md:flex-col md:gap-0 md:py-0 md:pr-4"
          >
            {/* ось: вертикальная на мобильном, горизонтальная на десктопе */}
            <span
              className={cn(
                "absolute left-[5px] top-6 h-[calc(100%-12px)] w-px md:left-0 md:top-[5px] md:h-px md:w-full",
                i === PRODUCTION_STAGES.length - 1 && "hidden",
                i < idx ? "bg-primary/45" : "bg-border",
              )}
            />
            <span
              className={cn(
                "relative z-10 mt-[3px] h-[11px] w-[11px] shrink-0 md:mt-0",
                state === "current" && "-translate-x-px bg-primary md:-translate-x-0 md:-translate-y-[3px]",
              )}
            >
              {state === "done" ? (
                <span className="block h-full w-full rounded-full border border-primary/50 bg-primary/[0.18]" />
              ) : state === "current" ? (
                <span className="block h-full w-full rounded-[2px] bg-primary ring-4 ring-primary/[0.14]" />
              ) : (
                <span className="block h-full w-full rounded-full border border-border bg-card" />
              )}
            </span>

            <div className="min-w-0 md:mt-3">
              <div className="num text-[10px] tracking-[0.14em] text-muted-foreground/70">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                className={cn(
                  "mt-1 text-[13px] leading-tight",
                  state === "current"
                    ? "font-semibold tracking-[-0.01em] text-primary"
                    : state === "done"
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {statusMeta(stage).label}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground/80">
                {state === "done" ? "пройден" : state === "current" ? "текущий" : "следующий"}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
