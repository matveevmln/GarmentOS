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

// Раскрой — наша собственная операция, а не состояние заказа у цеха, поэтому
// он не значение production_order_status (владелец проекта, 2026-08-30: «не
// превращать каждый производственный шаг в статус заказа»). На шкале он
// показывается отдельным шагом между «Размещён» и «В производстве», а его
// состояние приходит вторым входом — из раскройного задания.
export type CuttingStageState = "none" | "in_progress" | "done";

const CUTTING_LABEL: Record<CuttingStageState, string> = {
  none: "не начат",
  in_progress: "в работе",
  done: "выполнен",
};

export function ProductionStepper({
  current,
  cutting = "none",
}: {
  current: ProductionStage;
  cutting?: CuttingStageState;
}) {
  const baseIdx = PRODUCTION_STAGES.indexOf(current);
  // Раскрой вставляется после «Размещён» (индекс 1) — визуально, не в enum.
  const stages: Array<{ key: string; label: string; sub?: string }> = [];
  PRODUCTION_STAGES.forEach((stage, i) => {
    stages.push({ key: stage, label: statusMeta(stage).label });
    if (i === 1) stages.push({ key: "cutting", label: "Раскрой", sub: CUTTING_LABEL[cutting] });
  });
  // Позиция на шкале: до раскроя — как раньше; сам раскрой считается текущим,
  // пока заказ ещё «Размещён», а задание не завершено.
  const cuttingIndex = 2;
  const idx =
    baseIdx <= 1
      ? baseIdx === 1 && cutting !== "none" && cutting !== "done"
        ? cuttingIndex
        : baseIdx
      : baseIdx + 1;

  return (
    <ol className="flex flex-col md:flex-row md:items-stretch">
      {stages.map((stage, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "next";
        return (
          <li
            key={stage.key}
            className={cn(
              // min-w-0 обязателен: без него flex-элемент не сжимается уже своего
              // содержимого, и шести шагам не хватало ширины на 768px —
              // подписи вроде «Готов к отгрузке» выталкивали шкалу за экран.
              "relative flex min-w-0 flex-1 items-start gap-3 py-2.5 md:flex-col md:gap-0 md:py-0 md:pr-4",
              // У последнего шага правого отступа быть не должно: с шестью
              // шагами он выталкивал шкалу за край экрана на 768px.
              i === stages.length - 1 && "md:pr-0",
            )}
          >
            {/* ось: вертикальная на мобильном, горизонтальная на десктопе */}
            <span
              className={cn(
                "absolute left-[5px] top-6 h-[calc(100%-12px)] w-px md:left-0 md:top-[5px] md:h-px md:w-full",
                i === stages.length - 1 && "hidden",
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
                {stage.label}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground/80">
                {stage.sub ?? (state === "done" ? "пройден" : state === "current" ? "текущий" : "следующий")}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
