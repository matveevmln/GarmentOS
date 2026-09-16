import { useEffect, useState, type ReactNode } from "react";
import type { BatchCardDto } from "@garmentos/shared-types";
import { apiDownload } from "../../api/client";
import { batchCompletionState } from "../../lib/batch-completion";
import { formatBatchNumber, formatDate, formatQuantity } from "../../lib/format";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { ColorBreakdown, ColorDot } from "./Breakdown";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "../Drawer/Drawer";
import { Button } from "../Button/Button";
import { cn } from "../utils";

// BatchCard — карточка производственной партии.
//
// ПРОМПТ №08.2 (владелец проекта, 2026-09-14) — ИСПРАВЛЕНИЕ: ПРОМПТ №08
// перенёс визуальный язык светлой карточки «ТЕКУЩАЯ» из лаборатории
// Lovable. Владелец проекта явно указал, что верным эталоном была тёмная
// «АЛЬТЕРНАТИВА» (src/components/gos/production-lab.tsx,
// AlternativeBatchCard, тот же проект Lovable "GarmentOS") — тёмная шапка
// с фото модели и номером партии поверх светлого тела с метриками,
// цветами и тумблером завершения. Этот файл переписан под неё; светлая
// версия из №08 полностью заменена, не оставлена как альтернатива.
//
// Один компонент на три экрана: карточка модели → вкладка «Производство»,
// список заказов пошива, Главная. Показывает только пользовательски
// значимые поля — ни одного технического идентификатора
// (companyId/productId/bomId/workshopId/costSnapshot) на экране;
// specificationId используется только для навигации. BOM в UI не
// показывается.

// Фото — свойство МОДЕЛИ (§7 ПРОМПТ №06.1): один и тот же photoDocumentId
// повторяется у всех партий одной модели, поэтому blob кэшируется по
// documentId на уровне модуля — открыв список из 20 партий одной модели,
// браузер скачивает файл ровно один раз, а не 20. Источник фото —
// существующий Document Engine (GET /documents/:id/file), никаких
// сгенерированных или подставных изображений.
const photoUrlCache = new Map<string, string>();
const photoUrlPromises = new Map<string, Promise<string>>();

export function usePhotoUrl(photoDocumentId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(photoDocumentId ? (photoUrlCache.get(photoDocumentId) ?? null) : null);

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
        <span
          className="font-display font-semibold text-muted-foreground/70"
          style={{ fontSize: Math.round(size / 2.6) }}
        >
          {productName.charAt(0).toUpperCase()}
        </span>
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
export function HeroModelThumb({ photoDocumentId, productName }: { photoDocumentId: string | null; productName: string }) {
  const url = usePhotoUrl(photoDocumentId);
  return (
    <div className={cn("batch-hero-thumb overflow-hidden border", url ? "bg-black/20" : "flex items-center justify-center bg-white/10")}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-[19px] font-semibold text-white/75">{productName.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m5 9 7 7 7-7" />
    </svg>
  );
}

/** Просрочка считается по тому же правилу, что и на сервере
 *  (attention.service.ts): срок в прошлом и партия не в терминальном
 *  статусе. */
function overdueDays(dueDate: string | null, status: string): number | null {
  // "completed" (Global Completed Regression Audit, владелец проекта,
  // 2026-09-15) — терминальный статус наравне с "received"/"cancelled":
  // завершённая партия не подсвечивается как просроченная.
  if (!dueDate || status === "received" || status === "cancelled" || status === "completed") return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const diff = Math.floor((new Date().setHours(0, 0, 0, 0) - due.setHours(0, 0, 0, 0)) / 86_400_000);
  return diff > 0 ? diff : null;
}

/** «1 цвет» / «2 цвета» / «5 цветов» — простое русское склонение по
 *  последней цифре (11-14 — особый случай). Экспортирована (UI GAP AUDIT,
 *  владелец проекта, 2026-09-15) — используется также в паспорте партии,
 *  чтобы не заводить вторую копию той же пунктуации. */
export function colorCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "цвет" : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? "цвета" : "цветов";
  return `${count} ${word}`;
}

/**
 * Переключатель «Завершён».
 *
 * Разметка — дословно из референса (.batch-toggle/.batch-toggle-track,
 * бывшие .alt-completion/.alt-toggle). Поведение реальное: положение
 * читается из статуса заказа с сервера (`status === "received"`),
 * включение выполняет существующую операцию приёмки партии
 * (POST /production-orders/:id/receive через диалог выбора склада и
 * фактических количеств — обработчик открывает этот диалог, а не шлёт
 * запрос молча). Это НЕ useState(true/false): после перезагрузки страницы
 * положение то же, потому что источник один — сервер.
 *
 * В backend нет операции, отменяющей приёмку («ordered ≠ received» —
 * `receiveProductionOrder` зачисляет остаток на склад и не имеет обратного
 * действия), поэтому включённый переключатель для принятой партии
 * заблокирован, а не имитирует выключение локальным состоянием — причина
 * блокировки (lib/batch-completion.ts) остаётся доступной через `title`,
 * не выводится отдельным текстовым блоком — в референсе у тумблера нет
 * текстового пояснения, только двухпозиционная подпись.
 */
function CompletionToggle({
  completed,
  interactive,
  blockedReason,
  pending,
  onRequest,
}: {
  completed: boolean;
  interactive: boolean;
  blockedReason: string | null;
  pending: boolean;
  onRequest?: () => void;
}) {
  const disabled = !interactive || pending;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={completed}
      aria-label="Завершён"
      title={blockedReason ?? "Принять партию на склад"}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onRequest?.();
      }}
      className="batch-toggle focus-ring flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5"
    >
      <span className={cn("batch-toggle-track relative h-[28px] w-[50px] rounded-full", completed && "is-on")}>
        <span className="absolute left-[4px] top-[4px] h-5 w-5 rounded-full" />
      </span>
      <span className={cn("text-[10px] font-bold uppercase", completed ? "text-success" : "text-muted-foreground")}>Завершён</span>
    </button>
  );
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

export function BatchCard({
  data,
  onClick,
  onSpecificationClick,
  onRequestComplete,
  completionPending = false,
  actions,
  className,
}: BatchCardProps) {
  const totalColors = data.breakdown.length;
  // 1-2 цвета — раскрытие прямо в карточке, 3+ — bottom sheet (правило не
  // изменилось со времён ПРОМПТ №06.1 — сам референс AlternativeBatchCard
  // такой сценарий не показывает вовсе, доработано по аналогии со
  // светлой карточкой, чтобы не потерять уже работающий сценарий).
  const inSheet = totalColors >= 3;
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleBreakdown = () => (inSheet ? setSheetOpen(true) : setExpanded((value) => !value));

  const title = data.orderNumber !== null ? formatBatchNumber(data.orderNumber, data.createdAt) : "Партия без номера";
  const late = overdueDays(data.dueDate, data.status);
  const completion = batchCompletionState(data.status, onRequestComplete !== undefined);
  const colorNames = data.breakdown.map((row) => row.color).join(" · ");
  const totalSizePositions = data.breakdown.reduce((sum, row) => sum + row.sizes.length, 0);

  return (
    <article className={cn("batch-card overflow-hidden rounded-[16px]", className)}>
      {/* ── Тёмная шапка: номер партии, статус, фото + модель ──────── */}
      <div className="batch-hero relative overflow-hidden p-4 pb-5">
        <div className="relative z-[1] flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className="focus-ring min-w-0 rounded-[6px] text-left disabled:cursor-default"
          >
            <span className="batch-kicker">Производственная партия</span>
            <strong className="num mt-1.5 block truncate text-[18px] font-semibold text-sidebar-foreground">{title}</strong>
          </button>
          <StatusBadge status={data.status} className="batch-status-badge shrink-0" />
        </div>

        <div className="relative z-[1] mt-5 grid grid-cols-[68px_minmax(0,1fr)] items-end gap-3">
          <HeroModelThumb photoDocumentId={data.photoDocumentId} productName={data.productName} />
          <div className="min-w-0">
            <h3 className="truncate text-[19px] font-semibold leading-tight text-sidebar-foreground">{data.productName}</h3>
            <p className="mt-1.5 truncate text-[11px] text-sidebar-foreground/55">
              {data.specNumber !== null ? (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSpecificationClick?.();
                    }}
                    disabled={!onSpecificationClick}
                    className="interactive focus-ring rounded-[3px] underline-offset-2 hover:underline disabled:pointer-events-none"
                  >
                    Спецификация №{data.specNumber}
                  </button>
                  {" · "}
                </>
              ) : null}
              {data.workshopName}
            </p>
          </div>
        </div>
      </div>

      {/* ── Светлое тело: объём, срок, цвета, контроль партии ──────── */}
      <div className="batch-body p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div>
            <span className="batch-label">Объём партии</span>
            <div className="mt-1 flex items-end gap-2">
              <strong className="num batch-quantity">{formatQuantity(Number(data.plannedQuantity))}</strong>
              <span className="pb-1.5 text-[11px] font-medium text-muted-foreground">изделий</span>
            </div>
          </div>
          <div className="pb-1 text-right">
            <span className="batch-label">Срок</span>
            <strong className={cn("num mt-1.5 block text-[13px]", late && "text-danger")}>
              {data.dueDate ? formatDate(data.dueDate) : "не назначен"}
            </strong>
          </div>
        </div>

        {totalColors > 0 ? (
          <div className="mt-4 flex items-center justify-between border-y border-border py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex -space-x-1.5">
                {data.breakdown.map((row) => (
                  <ColorDot key={row.color} color={row.color} className="batch-swatch h-[18px] w-[18px] border-2 border-card" />
                ))}
              </div>
              <span className="truncate text-[11px] text-muted-foreground">{colorNames}</span>
            </div>
            <span className="num ml-3 shrink-0 text-[11px] font-semibold">{colorCountLabel(totalColors)}</span>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <span className="batch-label">Контроль партии</span>
            <strong className={cn("mt-1 block text-[12px] font-semibold", completion.completed ? "text-success" : "text-foreground")}>
              {completion.completed ? "Партия завершена" : "Ожидает завершения"}
            </strong>
          </div>
          <CompletionToggle
            completed={completion.completed}
            interactive={completion.interactive}
            blockedReason={completion.blockedReason}
            pending={completionPending}
            onRequest={onRequestComplete}
          />
        </div>
      </div>

      {/* ── Раскрытие раскладки ──────────────────────────────────── */}
      {totalColors > 0 ? (
        <>
          <button
            type="button"
            onClick={toggleBreakdown}
            aria-expanded={inSheet ? sheetOpen : expanded}
            className="batch-expand focus-ring flex min-h-[54px] w-full items-center justify-between border-t border-border px-4 text-[12px] font-semibold"
          >
            <span>{expanded && !inSheet ? "Скрыть размерную сетку" : "Цвета и размеры"}</span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="num text-[10px]">{formatQuantity(totalSizePositions, "поз.")}</span>
              <ChevronDown className={cn("transition-transform duration-200", expanded && !inSheet && "rotate-180")} />
            </span>
          </button>

          {!inSheet ? (
            <div className={cn("collapsible", expanded && "collapsible-open")}>
              <div>
                <ColorBreakdown breakdown={data.breakdown} />
              </div>
            </div>
          ) : null}

          <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
                <div className="batch-sheet-summary flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] text-muted-foreground">{data.productName}</span>
                  <span className="t-value">{formatQuantity(Number(data.plannedQuantity), "шт")}</span>
                </div>
              </DrawerHeader>
              <DrawerBody>
                <ColorBreakdown breakdown={data.breakdown} />
              </DrawerBody>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="secondary">Закрыть</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </>
      ) : null}

      {actions ? (
        <div
          className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-4 py-3"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </article>
  );
}
