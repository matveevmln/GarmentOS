import type { ReactNode } from "react";
import { Icon } from "../Icons/Icon";
import { EmptyIllustration } from "../Feedback/EmptyIllustration";
import { Button } from "../Button/Button";

export interface ListCardTone {
  icon: string;
  tint: "accent" | "success" | "warning" | "danger" | "info" | "neutral";
}

interface ListCardItemProps {
  icon?: string;
  tone?: ListCardTone["tint"];
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}

const TINT_VARS: Record<ListCardTone["tint"], { bg: string; fg: string }> = {
  accent: { bg: "var(--accent-tint)", fg: "var(--accent)" },
  success: { bg: "var(--success-tint)", fg: "var(--success)" },
  warning: { bg: "var(--warning-tint)", fg: "var(--warning)" },
  danger: { bg: "var(--danger-tint)", fg: "var(--danger)" },
  info: { bg: "var(--info-tint)", fg: "var(--info)" },
  neutral: { bg: "var(--surface-2)", fg: "var(--muted)" },
};

// Список-карточка — основной способ показать сущность в GarmentOS (иконка +
// заголовок/подпись + статус), дословно по классам утверждённого прототипа
// (apps/prototype/index.html, .list-card/.thumb/.body). Заменяет DataTable
// на всех основных экранах (docs/WEB_DESIGN_SYSTEM.md, шаг 1).
export function ListCardItem({ icon, tone = "neutral", title, meta, trailing, onClick }: ListCardItemProps) {
  const tint = TINT_VARS[tone];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag className="card list-card" onClick={onClick} type={onClick ? "button" : undefined}>
      <span className="thumb" style={{ background: tint.bg, color: tint.fg }}>
        {icon ? <Icon name={icon} style={{ width: 18, height: 18 }} /> : null}
      </span>
      <span className="body">
        <span className="title">{title}</span>
        {meta && <span className="meta">{meta}</span>}
      </span>
      {trailing && <span className="actions">{trailing}</span>}
    </Tag>
  );
}

interface ListCardProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getIcon?: (item: T) => string;
  getTone?: (item: T) => ListCardTone["tint"];
  getTitle: (item: T) => ReactNode;
  getMeta?: (item: T) => ReactNode;
  getTrailing?: (item: T) => ReactNode;
  onItemClick?: (item: T) => void;
  emptyTitle?: string;
  emptyHint?: string;
  // docs/UX_PRINCIPLES.md §4 — пустое состояние обязано вести прямо к
  // действию, которое его заполнит, не только объяснять, что здесь будет.
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function ListCard<T>({
  items,
  getKey,
  getIcon,
  getTone,
  getTitle,
  getMeta,
  getTrailing,
  onItemClick,
  emptyTitle = "Пока пусто",
  emptyHint,
  emptyActionLabel,
  onEmptyAction,
}: ListCardProps<T>) {
  if (items.length === 0) {
    return (
      <div className="card empty flex flex-col items-center gap-1">
        <EmptyIllustration className="mb-1 h-16 w-auto" />
        <div className="t">{emptyTitle}</div>
        {emptyHint && <div className="s">{emptyHint}</div>}
        {emptyActionLabel && onEmptyAction && (
          <Button type="button" size="sm" variant="secondary" className="mt-2 w-auto" onClick={onEmptyAction}>
            {emptyActionLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <ListCardItem
          key={getKey(item)}
          icon={getIcon?.(item)}
          tone={getTone?.(item)}
          title={getTitle(item)}
          meta={getMeta?.(item)}
          trailing={getTrailing?.(item)}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        />
      ))}
    </div>
  );
}
