import type { ReactNode } from "react";
import { Icon } from "./Icon";

// Сетка карточек-моделей — дословно по классу .model-grid/.model-card из
// утверждённого прототипа (фото-плейсхолдер + название + подпись), не
// список/таблица — модели визуально листаются как витрина, не строки.
const GRADIENTS = [
  { bg: "linear-gradient(135deg,#EFE7E2,#E3D8CE)", fg: "#B8862E" },
  { bg: "linear-gradient(135deg,#E3ECF7,#D3E1F2)", fg: "#2563EB" },
  { bg: "linear-gradient(135deg,#F1E7EC,#E9D5DF)", fg: "#D7263D" },
  { bg: "linear-gradient(135deg,#E7EFE9,#D7E7DC)", fg: "#16A34A" },
];

function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

interface ModelGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getTitle: (item: T) => ReactNode;
  getSubtitle: (item: T) => ReactNode;
  onItemClick: (item: T) => void;
  emptyTitle?: string;
  emptyHint?: string;
}

export function ModelGrid<T>({
  items,
  getKey,
  getTitle,
  getSubtitle,
  onItemClick,
  emptyTitle = "Пока нет ни одной модели",
  emptyHint,
}: ModelGridProps<T>) {
  if (items.length === 0) {
    return (
      <div className="card empty">
        <Icon name="layers" />
        <div className="t">{emptyTitle}</div>
        {emptyHint && <div className="s">{emptyHint}</div>}
      </div>
    );
  }

  return (
    <div className="model-grid">
      {items.map((item) => {
        const key = getKey(item);
        const gradient = gradientFor(key);
        return (
          <button key={key} type="button" className="card model-card" onClick={() => onItemClick(item)}>
            <div className="ph" style={{ background: gradient.bg, color: gradient.fg }}>
              <Icon name="layers" />
            </div>
            <div className="mb">
              <div className="mt">{getTitle(item)}</div>
              <div className="ms">{getSubtitle(item)}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
