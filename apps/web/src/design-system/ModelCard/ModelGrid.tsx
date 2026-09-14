import type { ReactNode } from "react";
import { Card } from "../Card/Card";
import { Button } from "../Button/Button";
import { EmptyState } from "../Feedback/EmptyState";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { ModelMark } from "../Blocks/ModelMark";
import { usePhotoUrl } from "../Blocks/BatchCard";
import { IconModel } from "../Icons/icons";

// Фото модели на витрине (визуальная переработка 2026-09-13): если фото
// заведено — показываем его, иначе остаётся типографический знак ModelMark
// (прежнее поведение, docs/UI_MIGRATION_PLAN.md этап 7). Высота совпадает с
// ModelMark, поэтому сетка не «прыгает» между моделями с фото и без.
function ModelPhoto({ photoDocumentId, code }: { photoDocumentId: string | null; code: string }) {
  const url = usePhotoUrl(photoDocumentId);
  if (!url) return <ModelMark code={code} />;
  return (
    <div className="h-[88px] overflow-hidden rounded-[10px] border border-border bg-secondary">
      <img src={url} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

// Витрина моделей — переоформлена по ModelsScreen GitHub-прототипа
// (docs/UI_MIGRATION_PLAN.md §0, этап 7): карточка = типографический знак
// артикула (ModelMark, этап 3) + название + артикул + статус.
//
// Прежняя версия рисовала фото-плейсхолдер пастельным градиентом
// (#E3ECF7/#F1E7EC и т.п.) — четыре цвета вне фирменной палитры и вне
// системы токенов. Прототип решает ту же задачу типографикой, а не
// выдуманной картинкой.
//
// API расширен обратно совместимо: getCode/getStatus/getMeta
// необязательны, прежний вызов с getKey/getTitle/getSubtitle продолжает
// работать.

interface ModelGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getTitle: (item: T) => ReactNode;
  getSubtitle: (item: T) => ReactNode;
  /** Артикул для знака модели. Без него знак строится из getKey. */
  getCode?: (item: T) => string;
  /** Ключ статуса из API — переводится через lib/status.ts. */
  getStatus?: (item: T) => string | null;
  /** Правая подпись в строке названия (категория, сезон). */
  getMeta?: (item: T) => ReactNode;
  /** Фото модели (Document Engine). Без него — типографический знак. */
  getPhotoDocumentId?: (item: T) => string | null;
  /** Производственная активность модели: «3 партии · 1 в работе». */
  getActivity?: (item: T) => ReactNode;
  onItemClick: (item: T) => void;
  emptyTitle?: string;
  emptyHint?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function ModelGrid<T>({
  items,
  getKey,
  getTitle,
  getSubtitle,
  getCode,
  getStatus,
  getMeta,
  getPhotoDocumentId,
  getActivity,
  onItemClick,
  emptyTitle = "Пока нет ни одной модели",
  emptyHint,
  emptyActionLabel,
  onEmptyAction,
}: ModelGridProps<T>) {
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        icon={<IconModel size={18} />}
        title={emptyTitle}
        description={emptyHint ?? ""}
        action={
          emptyActionLabel && onEmptyAction ? (
            <Button type="button" size="sm" variant="secondary" onClick={onEmptyAction}>
              {emptyActionLabel}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const key = getKey(item);
        const status = getStatus?.(item) ?? null;
        return (
          <Card
            key={key}
            interactive
            role="button"
            tabIndex={0}
            onClick={() => onItemClick(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onItemClick(item);
              }
            }}
            className="focus-ring cursor-pointer p-4 transition-colors hover:border-primary/30 md:p-5"
          >
            <ModelPhoto photoDocumentId={getPhotoDocumentId?.(item) ?? null} code={getCode?.(item) ?? key} />
            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{getTitle(item)}</div>
                <div className="num mt-0.5 truncate text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {getSubtitle(item)}
                </div>
              </div>
              {getMeta ? <span className="num shrink-0 text-[12px] text-muted-foreground">{getMeta(item)}</span> : null}
            </div>
            {status || getActivity ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                {status ? <StatusBadge status={status} /> : <span />}
                {getActivity ? <span className="t-meta truncate">{getActivity(item)}</span> : null}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
