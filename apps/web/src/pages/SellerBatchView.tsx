import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, Scissors, Check } from "lucide-react";
import type { BatchPassportResponseDto, ProductionOrderActionsDto } from "@garmentos/shared-types";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Button } from "../design-system/Button/Button";
import { MobileActionBar } from "../design-system/Blocks/MobileActionBar";
import { ModelThumb } from "../design-system/Blocks/BatchCard";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../design-system/DropdownMenu/DropdownMenu";
import { formatDate, formatMoney, formatQuantity } from "../lib/format";
import { computeProductionOrderBatchSum } from "../lib/production-order-pricing";

interface Props {
  passport: BatchPassportResponseDto;
  actions: ProductionOrderActionsDto | null;
  hasQuality: boolean;
  primary: { label: string; run: () => void; busy: boolean } | null;
  renderTab: (tab: "docs" | "history") => ReactNode;
  onDetails: () => void;
  onRework: () => void;
  onQuality: () => void;
  onCancel: () => void;
  onRollback: () => void;
  onShip: () => void;
  onComplete: () => void;
  onCreateSpecification: () => void;
  onDownload: (() => void) | null;
}

export function SellerBatchView({
  passport: p,
  actions,
  hasQuality,
  primary,
  renderTab,
  onDetails,
  onRework,
  onQuality,
  onCancel,
  onRollback,
  onShip,
  onComplete,
  onCreateSpecification,
  onDownload,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"colors" | "docs" | "history">("colors");
  const phase =
    p.status === "draft"
      ? 0
      : ["placed", "in_progress", "sewing_completed"].includes(p.status)
        ? 1
        : 2;
  const closed = p.status === "completed" || p.status === "cancelled";
  const messages: Record<string, [string, string]> = {
    draft: [
      "Проверьте условия партии",
      "Подтверждение фиксирует согласованную цену, размеры и количество.",
    ],
    placed: ["Партия размещена", "Когда цех начнёт работу, отметьте начало пошива."],
    in_progress: ["Цех шьёт партию", "Когда изделия будут готовы к передаче, отметьте готовность."],
    sewing_completed: ["Изделия сшиты", "Подтвердите, что цех подготовил их к передаче."],
    ready_for_pickup: [
      "Партия готова к приёмке",
      "Когда получите изделия, сверяйте фактические количества.",
    ],
    shipped_to_fulfillment: [
      "Изделия в пути",
      "При получении укажите фактически принятые количества.",
    ],
    received: [
      hasQuality ? "Качество проверено" : "Изделия приняты",
      hasQuality
        ? "Результат сохранён. Если работа с партией закончена, закройте её."
        : "Проверьте качество: укажите годные изделия и брак.",
    ],
    completed: [
      "Партия закрыта",
      "История и документы сохранены. Можно заказать следующую партию этой модели.",
    ],
    cancelled: ["Партия отменена", "История и документы сохранены."],
  };
  const copy = messages[p.status] ?? ["Партия", "Проверьте текущее состояние."];
  return (
    <>
      <section className="batch-hero seller-party-hero" aria-label="Карточка партии">
        <header className="flex items-center gap-3">
          <button
            aria-label="Назад к партиям"
            className="focus-ring grid h-11 w-11 shrink-0 place-items-center"
            onClick={() => void navigate("/production-orders")}
          >
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <ModelThumb
                photoDocumentId={p.product.photoDocumentId}
                productName={p.product.name}
                size={36}
                className="seller-hero-thumb"
              />
              <h1 className="!text-xl break-words">{p.product.name}</h1>
            </div>
            <p className="seller-hero-meta mt-2 text-xs">
              {p.orderNumber
                ? `Партия №${String(p.orderNumber).padStart(4, "0")}`
                : p.status === "draft"
                  ? "Черновик партии"
                  : "Партия без номера"}{" "}
              · {p.workshop.name}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Действия партии"
                className="focus-ring grid h-11 w-11 shrink-0 place-items-center"
              >
                <MoreHorizontal size={22} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={() => void navigate(`/new-batch?productId=${p.product.id}`)}
              >
                Новая партия этой модели
              </DropdownMenuItem>
              {p.specification && (
                <DropdownMenuItem
                  onSelect={() => void navigate(`/specifications/${p.specification!.id}`)}
                >
                  Открыть спецификацию
                </DropdownMenuItem>
              )}
              {onDownload && (
                <DropdownMenuItem onSelect={onDownload}>Скачать спецификацию</DropdownMenuItem>
              )}
              {actions?.documents && !p.specification && (
                <DropdownMenuItem onSelect={onCreateSpecification}>
                  Создать спецификацию
                </DropdownMenuItem>
              )}
              {actions?.ship && (
                <DropdownMenuItem onSelect={onShip}>Цех отправил изделия</DropdownMenuItem>
              )}
              {(hasQuality || actions?.quality) && (
                <DropdownMenuItem onSelect={onQuality}>Качество и брак</DropdownMenuItem>
              )}
              {actions?.complete && !hasQuality && (
                <DropdownMenuItem onSelect={onComplete}>
                  Завершить без проверки качества…
                </DropdownMenuItem>
              )}
              {actions?.documents && ["received", "completed"].includes(p.status) && (
                <DropdownMenuItem onSelect={onRework}>Переделка или допошив…</DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onDetails}>Дополнительные данные</DropdownMenuItem>
              {(actions?.rollback || actions?.cancel) && <DropdownMenuSeparator />}
              {actions?.rollback && (
                <DropdownMenuItem onSelect={onRollback}>Исправить последний этап…</DropdownMenuItem>
              )}
              {actions?.cancel && (
                <DropdownMenuItem variant="destructive" onSelect={onCancel}>
                  Отменить партию…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="mt-3 text-center">
          <StatusBadge status={p.status} className="batch-status-badge" />
        </div>
      </section>
      <dl className="seller-stats mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border">
        {[
          ["Количество", formatQuantity(Number(p.plannedQuantity), "шт.")],
          ["Срок", p.dueDate ? formatDate(p.dueDate) : "Не указан"],
          ["Цена пошива", `${formatMoney(Number(p.agreedUnitPrice), "₽")}/шт.`],
          ["Сумма", formatMoney(computeProductionOrderBatchSum(p), "₽")],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-b border-r border-border bg-card p-3 [&:nth-child(2n)]:border-r-0 [&:nth-child(n+3)]:border-b-0"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {p.daysOverdue !== null && (
        <p className="mt-2 text-sm text-danger">Срок прошёл {p.daysOverdue} дн. назад</p>
      )}
      {p.status !== "cancelled" && (
        <ol className="seller-progress" aria-label="Ход партии">
          {["Заказ", "Пошив", "Приёмка"].map((label, index) => (
            <li
              key={label}
              data-done={index < phase || p.status === "completed"}
              aria-current={!closed && index === phase ? "step" : undefined}
            >
              <span className="seller-phase-dot">
                {index < phase || p.status === "completed" ? <Check size={16} /> : null}
              </span>
              {label}
            </li>
          ))}
        </ol>
      )}
      <section
        className="seller-next-step flex gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-4"
        aria-label="Следующий шаг партии"
      >
        <Scissors className="mt-1 shrink-0 text-primary" size={22} />
        <div>
          <h2 className="font-semibold">{copy[0]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy[1]}</p>
        </div>
      </section>
      <div className="seller-tabs" role="tablist" aria-label="Данные партии">
        {(
          [
            { key: "colors", label: "Размеры" },
            { key: "docs", label: "Документы" },
            { key: "history", label: "История" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            role="tab"
            id={`party-tab-${item.key}`}
            aria-controls="party-tab-panel"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="party-tab-panel" role="tabpanel" aria-labelledby={`party-tab-${tab}`}>
        {tab === "colors" ? (
          <div className="seller-breakdown overflow-hidden rounded-xl border border-border divide-y divide-border">
            {p.variants.map((row) => (
              <div
                key={row.productVariantId}
                className="flex items-center justify-between gap-3 bg-card px-4 py-3 text-sm"
              >
                <span className="min-w-0 break-words">
                  {row.color} · {row.size}
                </span>
                <span className="shrink-0 text-right">
                  {formatQuantity(Number(row.quantity), "шт.")}
                  {row.receivedQuantity !== null && (
                    <span className="block text-xs text-muted-foreground">
                      Принято {formatQuantity(Number(row.receivedQuantity), "шт.")}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          renderTab(tab)
        )}
      </div>
      {primary && (
        <MobileActionBar>
          <Button size="lg" loading={primary.busy} onClick={primary.run}>
            {primary.label}
          </Button>
        </MobileActionBar>
      )}
      {!actions && !closed && (
        <p className="mt-4 text-sm text-muted-foreground">Проверяем доступные действия…</p>
      )}
    </>
  );
}
