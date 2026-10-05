import { Shirt } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { BatchCardDto } from "@garmentos/shared-types";
import { apiDownload } from "../../api/client";
import { formatDate, formatQuantity } from "../../lib/format";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { cn } from "../utils";

// Компактная карточка из утверждённого макета (2026-10-05). Приёмка и закрытие — явные действия в паспорте.

// Фото — свойство МОДЕЛИ (§7 ПРОМПТ №06.1): один и тот же photoDocumentId
// повторяется у всех партий одной модели, поэтому blob кэшируется по
// documentId на уровне модуля — открыв список из 20 партий одной модели,
// браузер скачивает файл ровно один раз, а не 20. Источник фото —
// существующий Document Engine (GET /documents/:id/file), никаких
// сгенерированных или подставных изображений.
const photoUrlCache = new Map<string, string>();
const photoUrlPromises = new Map<string, Promise<string>>();

export function usePhotoUrl(photoDocumentId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(
    photoDocumentId ? (photoUrlCache.get(photoDocumentId) ?? null) : null,
  );

  useEffect(() => {
    if (!photoDocumentId) {
      setUrl(null);
      return;
    }
    const cached = photoUrlCache.get(photoDocumentId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    let promise = photoUrlPromises.get(photoDocumentId);
    if (!promise) {
      promise = apiDownload(`/documents/${photoDocumentId}/file`).then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        photoUrlCache.set(photoDocumentId, objectUrl);
        return objectUrl;
      });
      photoUrlPromises.set(photoDocumentId, promise);
    }
    promise
      .then((objectUrl) => {
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photoDocumentId]);

  return url;
}

// Квадратная миниатюра — оставлена экспортируемой для обратной
// совместимости (используется отдельно в ModelGrid.tsx через usePhotoUrl,
// а сам ModelThumb — на случай переиспользования вне тёмной шапки).
// Фото у модели может ещё не быть заведено (§10 ПРОМПТ №06.1 — фото
// рекомендуемое, не обязательное) — тогда вместо него монограмма на
// нейтральной подложке.
export function ModelThumb({
  photoDocumentId,
  productName,
  size = 52,
  className,
}: {
  photoDocumentId: string | null;
  productName: string;
  size?: number;
  className?: string;
}) {
  const url = usePhotoUrl(photoDocumentId);
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-[10px] border border-border",
        url ? "bg-secondary" : "flex items-center justify-center bg-muted/40",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Shirt
          aria-label={productName}
          size={Math.round(size * 0.5)}
          className="text-muted-foreground/70"
        />
      )}
    </div>
  );
}

/** Миниатюра модели в тёмной шапке (68×78, не квадрат — размер и радиус
 *  заданы классом `.batch-hero-thumb`, см. Tokens/tokens.css). Фон и цвет
 *  монограммы — отдельный, светлый-на-тёмном вариант: обычный ModelThumb
 *  здесь нечитаем (тёмный текст на тёмной подложке).
 *
 *  Экспортирована (UI GAP AUDIT, владелец проекта, 2026-09-15) — используется
 *  ещё и в тёмном hero паспорта партии (BatchPassportPage), тот же визуальный
 *  язык, не второй компонент. */
export function HeroModelThumb({
  photoDocumentId,
  productName,
}: {
  photoDocumentId: string | null;
  productName: string;
}) {
  const url = usePhotoUrl(photoDocumentId);
  return (
    <div
      className={cn(
        "batch-hero-thumb overflow-hidden border",
        url ? "bg-black/20" : "flex items-center justify-center bg-white/10",
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-[19px] font-semibold text-white/75">
          {productName.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/** Просрочка считается по тому же правилу, что и на сервере
 *  (attention.service.ts): срок в прошлом и партия не в терминальном
 *  статусе. */
function overdueDays(dueDate: string | null, status: string): number | null {
  // "completed" (Global Completed Regression Audit, владелец проекта,
  // 2026-09-15) — терминальный статус наравне с "received"/"cancelled":
  // завершённая партия не подсвечивается как просроченная.
  if (!dueDate || status === "received" || status === "cancelled" || status === "completed")
    return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const diff = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - due.setHours(0, 0, 0, 0)) / 86_400_000,
  );
  return diff > 0 ? diff : null;
}

/** «1 цвет» / «2 цвета» / «5 цветов» — простое русское склонение по
 *  последней цифре (11-14 — особый случай). Экспортирована (UI GAP AUDIT,
 *  владелец проекта, 2026-09-15) — используется также в паспорте партии,
 *  чтобы не заводить вторую копию той же пунктуации. */
export function colorCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "цвет"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
        ? "цвета"
        : "цветов";
  return `${count} ${word}`;
}

export interface BatchCardProps {
  data: BatchCardDto;
  /** Клик по карточке — обычно переход на паспорт партии. */
  onClick?: () => void;
  /** Клик по подписи спецификации — обычно переход на её страницу. */
  onSpecificationClick?: () => void;
  /**
   * Запрос на завершение партии. Вызывается ТОЛЬКО когда домен это
   * разрешает (статус "ready_for_pickup"), и обязан выполнить существующую
   * операцию приёмки — приёмка требует выбора склада и фактических
   * количеств, поэтому обработчик открывает диалог, а не шлёт запрос молча.
   * Не передан — переключатель показывает состояние, но не притворяется
   * кнопкой (Главная, карточка модели: операции приёмки там нет).
   */
  onRequestComplete?: () => void;
  /** Идёт запрос по этой партии — переключатель и действия блокируются. */
  completionPending?: boolean;
  /** Слот действий (Подтвердить/Начали шить/Готово к отгрузке). Видимые
   *  кнопки, а не пункты скрытого меню — один клик на основное действие
   *  партии (Zero Input, docs/PRINCIPLES.md принцип 17). В самом референсе
   *  таких действий нет вовсе (демо не показывает жизненный цикл), поэтому
   *  футер с ними — необходимое дополнение поверх визуального языка, а не
   *  часть самого языка: без него часть реальных партий (draft/placed/
   *  in_progress) была бы без единого способа продвинуться дальше. */
  actions?: ReactNode;
  className?: string;
}

export function BatchCard({ data, onClick, actions, className }: BatchCardProps) {
  const colorNames = data.breakdown.map((row) => row.color).join(" · ");
  const late = overdueDays(data.dueDate, data.status);
  return (
    <article className={cn("seller-card", className)}>
      <div className="flex items-start gap-3">
        <ModelThumb
          photoDocumentId={data.photoDocumentId}
          productName={data.productName}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 break-words text-base font-semibold">{data.productName}</h3>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {data.orderNumber !== null ? `№${String(data.orderNumber).padStart(4, "0")} · ` : ""}
            {colorNames || data.workshopName}
          </p>
          <p className={cn("mt-2 text-sm", late ? "text-danger" : "text-muted-foreground")}>
            {formatQuantity(Number(data.plannedQuantity), "изделий")}
            {data.dueDate ? ` · до ${formatDate(data.dueDate)}` : " · срок не указан"}
          </p>
          {onClick && (
            <button
              type="button"
              className="focus-ring mt-1 min-h-11 text-sm font-semibold text-primary"
              onClick={onClick}
            >
              {data.status === "draft" ? "Продолжить →" : "Открыть →"}
            </button>
          )}
        </div>
      </div>
      {actions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>
      )}
    </article>
  );
}
