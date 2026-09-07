import { IconAlert, IconRefresh } from "../Icons/icons";
import { Button } from "../Button/Button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

// GarmentErrorState — визуальный слой из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2): рамка и подложка в тоне danger,
// чтобы состояние ошибки читалось как ошибка, а не как обычная карточка.
// API сохранён ({title, description, onRetry}) — 12 вызовов на страницах
// продолжают работать.
export function ErrorState({
  title = "Не удалось загрузить данные",
  description = "Проверьте подключение к интернету и попробуйте ещё раз.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-danger/20 bg-danger/[0.03] px-6 py-12 text-center">
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-danger/20 bg-danger/[0.08] text-danger">
        <IconAlert size={18} />
      </span>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-[360px] text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <IconRefresh size={14} />
            Повторить
          </Button>
        </div>
      )}
    </div>
  );
}

// AccessDeniedState — новый компонент из прототипа. Отдельное состояние
// «нет прав» вместо пустого экрана: RBAC уже работает на бэкенде, но UI
// раньше не отличал «данных нет» от «доступ закрыт».
export function AccessDeniedState({
  description = "У вашей роли нет доступа к этому разделу. Запросите расширение прав у владельца компании.",
}: {
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-border bg-card px-6 py-12 text-center">
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-border bg-muted/60 text-muted-foreground">
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <h3 className="text-[14px] font-semibold">Нет прав доступа</h3>
      <p className="mt-1.5 max-w-[360px] text-[12px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
