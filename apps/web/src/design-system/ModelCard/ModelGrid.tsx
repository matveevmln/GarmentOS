import type { ProductResponseDto } from "@garmentos/shared-types";
import { EmptyState } from "../Feedback/EmptyState";
import { Button } from "../Button/Button";
import { IconModel } from "../Icons/icons";
import { ModelCard } from "./ModelCard";

// Витрина моделей (ПРОМПТ №09.1, владелец проекта, 2026-09-14) — визуальный
// язык перенесён из Lovable-референса PremiumModelCard, адаптирован под
// реальные данные Product + GET /products/:id/production (docs/
// UI_MIGRATION_PLAN.md, этап 7 продолжается). Раньше карточка была
// типографическим знаком (ModelMark) на плоской подложке; теперь фото
// модели — главный визуальный акцент, знак остаётся запасным состоянием
// без фото (см. ModelCard.tsx).
//
// Раньше компонент был полностью обобщённым (getKey/getTitle/getCode и
// т.д.) при единственном месте использования (ProductsPage). Новые поля
// (цвета/размеры/партии конкретной модели) делают такую обобщённость
// лишней косвенностью без выгоды — интерфейс сужен до конкретной формы
// данных, которую и так строит единственный вызывающий код.
export interface ModelGridItem {
  product: ProductResponseDto;
  photoDocumentId: string | null;
  colorNames: string[];
  sizeLabels: string[];
  batchCount: number;
  inProgressCount: number;
}

export function ModelGrid({
  items,
  onItemClick,
  emptyTitle = "Пока нет ни одной модели",
  emptyHint,
  emptyActionLabel,
  onEmptyAction,
}: {
  items: ModelGridItem[];
  onItemClick: (product: ProductResponseDto) => void;
  emptyTitle?: string;
  emptyHint?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
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
      {items.map(({ product, photoDocumentId, colorNames, sizeLabels, batchCount, inProgressCount }) => (
        <ModelCard
          key={product.id}
          model={product}
          photoDocumentId={photoDocumentId}
          colorNames={colorNames}
          sizeLabels={sizeLabels}
          batchCount={batchCount}
          inProgressCount={inProgressCount}
          onClick={() => onItemClick(product)}
        />
      ))}
    </div>
  );
}
