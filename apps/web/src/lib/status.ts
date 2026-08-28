/**
 * Единая карта «статус из API → подпись и тон в интерфейсе».
 *
 * docs/UI_MIGRATION_PLAN.md, §3: в прототипе статусы хранились готовыми
 * русскими строками ("В производстве"), а API возвращает ключи enum
 * ("in_progress"). Здесь — единственное место перевода. Компоненты
 * принимают ключ API и никогда не работают с подписью напрямую: иначе
 * фильтрация, сортировка и сравнение статусов ломаются при первом же
 * изменении формулировки.
 *
 * Ключи взяты из реальных enum БД (packages/db-schema/src/schema):
 * production_order_status, purchase_order_status, invoice_status,
 * order_status, partner_status, product_status, bom_status.
 * Ничего не выдумано — если статуса нет в БД, его нет и здесь.
 */

export type StatusTone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

/** Тон отражает СОСТОЯНИЕ, а не украшает: danger — требует вмешательства,
 *  warning — ждёт действия, accent — идёт работа, success — завершено штатно. */
export const STATUS_MAP: Record<string, StatusMeta> = {
  // production_order_status — жизненный цикл партии
  draft: { label: "Черновик", tone: "neutral" },
  placed: { label: "Размещён", tone: "info" },
  in_progress: { label: "В производстве", tone: "accent" },
  ready_for_pickup: { label: "Готово к отгрузке", tone: "success" },
  received: { label: "Принято", tone: "success" },
  cancelled: { label: "Отменён", tone: "danger" },

  // purchase_order_status — закупки
  sent: { label: "Отправлена", tone: "info" },
  partially_received: { label: "Получена частично", tone: "warning" },

  // invoice_status — счета
  issued: { label: "Выставлен", tone: "warning" },
  paid: { label: "Оплачен", tone: "success" },
  overdue: { label: "Просрочен", tone: "danger" },

  // order_status — продажи
  new: { label: "Новый", tone: "info" },
  confirmed: { label: "Подтверждён", tone: "accent" },
  shipped: { label: "Отгружен", tone: "accent" },
  delivered: { label: "Доставлен", tone: "success" },
  returned: { label: "Возврат", tone: "danger" },

  // partner_status / product_status / bom_status — справочники
  active: { label: "Активен", tone: "success" },
  archived: { label: "В архиве", tone: "neutral" },
  approved: { label: "Утверждён", tone: "success" },
  discontinued: { label: "Снята с продажи", tone: "danger" },
};

/** Неизвестный статус не прячем и не подменяем: показываем ключ как есть,
 *  чтобы расхождение с API было видно сразу, а не молча превращалось в
 *  пустой бейдж. */
export function statusMeta(status: string): StatusMeta {
  return STATUS_MAP[status] ?? { label: status, tone: "neutral" };
}
