import { AlertTriangle } from "lucide-react";
import { Button } from "../Button/Button";

// GarmentErrorState — docs/DESIGN_SYSTEM_MAP.md §4.5: реальный пробел —
// если API недоступен при первой загрузке списка (не при отправке формы),
// экран показывал пустой список, неотличимый от «нет данных»
// (UX_PRINCIPLES.md §5 — ошибка обязана называть, что произошло и что делать).
interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Не удалось загрузить данные",
  description = "Проверьте подключение к интернету и попробуйте ещё раз.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[22px] border border-border bg-card p-8 text-center shadow-card">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[0.95rem] font-bold text-foreground">{title}</p>
        <p className="text-[0.85rem] text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
