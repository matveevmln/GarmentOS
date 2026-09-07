import type { ReactNode } from "react";
import { IconInbox } from "../Icons/icons";
import { cn } from "../utils";

// GarmentEmptyState — перенесён из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2). Новый компонент: раньше в apps/web
// была только картинка-иллюстрация (EmptyIllustration) без заголовка,
// пояснения и действия, из-за чего пустой экран не объяснял пользователю,
// что произошло и что делать дальше.
//
// Принцип честности (docs/UI_UX_REDESIGN_PLAN.md §11): если данных нет —
// показываем это состояние с объяснением, а не выдуманные нули.
export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border bg-card/60 text-center",
        compact ? "px-5 py-10" : "px-6 py-16",
      )}
    >
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-border bg-muted/50 text-muted-foreground">
        {icon ?? <IconInbox size={18} />}
      </span>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-[380px] text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
