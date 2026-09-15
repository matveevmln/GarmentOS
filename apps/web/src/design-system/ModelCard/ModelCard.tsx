import { usePhotoUrl } from "../Blocks/BatchCard";
import { ColorDot } from "../Blocks/Breakdown";
import { StatusBadge } from "../StatusBadge/StatusBadge";

// ModelCard — карточка модели для витрины «Модели». ПРОМПТ №09.2 v2
// (владелец проекта, 2026-09-15) — полный перенос последней утверждённой
// версии PremiumModelCard из Lovable (src/components/gos/production-lab.tsx,
// проект "GarmentOS", коммит cd08246d) взамен прежних тёмных итераций.
// Разметка воспроизведена буквально (обёртка -glow и -photo вокруг
// изображения, бейдж статуса поверх фото), адаптированы только источники
// данных под реальные (ColorDot вместо фиксированного 5-цветного
// справочника, usePhotoUrl вместо статичного набора картинок).
//
// Отличается от BatchCard структурой, цветом и иерархией: у BatchCard
// тёмная ШАПКА (номер/статус) поверх светлого ТЕЛА; здесь наоборот — фото
// на светлой "плашке" со свечением, тело под ним тоже светлое (--model-
// card-*, отдельный набор токенов от --batch-*, каталожный, а не
// операционный характер карточки).
export interface ModelCardModel {
  code: string;
  name: string;
  category: string | null;
  status: string;
}

export function ModelCard({
  model,
  photoDocumentId,
  colorNames,
  sizeLabels,
  batchCount,
  inProgressCount,
  onClick,
}: {
  model: ModelCardModel;
  photoDocumentId: string | null;
  /** Цвета, реально встречающиеся в партиях этой модели (не выдуманный
   *  справочник — свободный текст product_variants.color). */
  colorNames: string[];
  /** Размеры, реально встречающиеся в партиях этой модели. */
  sizeLabels: string[];
  batchCount: number;
  inProgressCount: number;
  onClick?: () => void;
}) {
  const photoUrl = usePhotoUrl(photoDocumentId);
  const [codePrefix, codeSuffix] = model.code.split("-");

  return (
    <button type="button" onClick={onClick} className="model-card focus-ring anim-rise text-left">
      <div className="model-card-image">
        <div className="model-card-glow" aria-hidden="true" />
        {photoUrl ? (
          <div className="model-card-photo">
            <img src={photoUrl} alt={model.name} loading="lazy" />
            <div className="model-card-overlay" />
          </div>
        ) : (
          <div className="model-card-placeholder">
            <span className="model-card-placeholder-code">{codePrefix}</span>
            {codeSuffix ? <span className="model-card-placeholder-suffix">{codeSuffix}</span> : null}
          </div>
        )}
        <div className="model-card-badge">
          <StatusBadge status={model.status} className="model-card-status" />
        </div>
      </div>

      <div className="model-card-body">
        {model.category ? <span className="model-card-category">{model.category}</span> : null}
        <h3 className="model-card-name truncate">{model.name}</h3>
        <p className="model-card-article">{model.code}</p>

        {colorNames.length > 0 ? (
          <div className="model-card-colors">
            {colorNames.map((color) => (
              <ColorDot key={color} color={color} className="model-card-swatch" />
            ))}
            <span className="model-card-color-names">{colorNames.join(" · ")}</span>
          </div>
        ) : null}

        {sizeLabels.length > 0 ? (
          <div className="model-card-sizes">
            {sizeLabels.map((size) => (
              <span key={size} className="model-card-size">
                {size}
              </span>
            ))}
          </div>
        ) : null}

        <div className="model-card-metrics">
          <div>
            <span className="model-card-metric-label">Партий</span>
            <strong className="num model-card-metric-value">{batchCount}</strong>
          </div>
          <div>
            <span className="model-card-metric-label">Цветов</span>
            <strong className="num model-card-metric-value">{colorNames.length}</strong>
          </div>
          <div>
            <span className="model-card-metric-label">Размеров</span>
            <strong className="num model-card-metric-value">{sizeLabels.length}</strong>
          </div>
          <div>
            <span className="model-card-metric-label">В работе</span>
            <strong className="num model-card-metric-value">{inProgressCount}</strong>
          </div>
        </div>
      </div>
    </button>
  );
}
