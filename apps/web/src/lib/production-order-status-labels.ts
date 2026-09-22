// Статусы заказа пошива, которыми управляет владелец вручную через
// интерфейс (P0-1, владелец проекта, 2026-09-05) — переходы, которые
// сегодня приходят только через Telegram-ответ цеха, единственный способ
// провести партию дальше без настроенного Telegram-чата у цеха.
//
// Вынесено в общее место (владелец проекта, 2026-09-22, рефакторинг без
// изменения поведения) — раньше ORDER_STATUS_LABELS и NEXT_STATUS были
// продублированы дословно в ProductionOrdersPage.tsx и BatchPassportPage.tsx;
// расхождение между копиями при правке одной из них было бы молчаливым.
export type ManualOrderStatus = "in_progress" | "sewing_completed" | "ready_for_pickup" | "shipped_to_fulfillment";

export const ORDER_STATUS_LABELS: Record<ManualOrderStatus, string> = {
  in_progress: "Начали шить",
  sewing_completed: "Пошив завершён",
  ready_for_pickup: "Готово к отгрузке",
  shipped_to_fulfillment: "Отправлено на фулфилмент",
};

export const NEXT_STATUS: Record<string, ManualOrderStatus> = {
  placed: "in_progress",
  in_progress: "sewing_completed",
  sewing_completed: "ready_for_pickup",
  ready_for_pickup: "shipped_to_fulfillment",
};
