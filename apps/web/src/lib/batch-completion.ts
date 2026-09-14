/**
 * Правила переключателя «Завершена» на карточке партии.
 *
 * Единственное место, где интерфейс рассуждает о том, можно ли завершить
 * партию. Зеркалит доменный инвариант `assertCanReceive`
 * (packages/domain/contract-manufacturing/src/domain/production-order.ts):
 * принять партию можно ТОЛЬКО из статуса "ready_for_pickup". Здесь нет ни
 * одного собственного бизнес-правила — если домен изменит инвариант,
 * меняется и этот файл, а не наоборот.
 *
 * Почему вообще отдельный файл, а не условие внутри BatchCard: карточка одна
 * на три экрана, и правило «когда партия считается завершённой» обязано быть
 * одним и тем же на всех трёх. Плюс чистая функция проверяется тестом без
 * рендера.
 *
 * ВАЖНО про обратный переход (снятие галочки). В backend нет операции,
 * отменяющей приёмку: `receiveProductionOrder` переводит заказ в "received",
 * проставляет `receivedAt`, записывает фактические количества в
 * `production_order_variants.received_quantity` и зачисляет остатки на склад
 * через WarehouseService. Обратной операции («un-receive») не существует ни
 * в контроллере, ни в use case, ни в домене. Поэтому переключатель в
 * положении «включено» блокируется с объяснением, а НЕ имитирует выключение
 * локальным состоянием: тумблер, который визуально выключается, а на сервере
 * ничего не меняет, — это ложь интерфейса, худшая, чем отсутствие контрола.
 */

export interface BatchCompletionState {
  /** Реальное состояние с сервера: партия принята на склад. */
  completed: boolean;
  /** Можно ли нажать переключатель прямо сейчас. */
  interactive: boolean;
  /** Почему нажать нельзя — показывается пользователю, а не проглатывается. */
  blockedReason: string | null;
}

/**
 * @param status  Реальный статус заказа из API (production_order_status).
 * @param hasAction Передан ли обработчик завершения. На экранах, где операции
 *   приёмки нет (Главная, карточка модели), переключатель показывает
 *   состояние, но не притворяется кнопкой.
 */
export function batchCompletionState(status: string, hasAction: boolean): BatchCompletionState {
  const completed = status === "received";

  if (completed) {
    return {
      completed: true,
      interactive: false,
      blockedReason: "Партия принята на склад — отменить приёмку нельзя: остатки уже зачислены",
    };
  }

  if (status === "cancelled") {
    return { completed: false, interactive: false, blockedReason: "Партия отменена" };
  }

  if (status === "draft") {
    return {
      completed: false,
      interactive: false,
      blockedReason: "Сначала подтвердите партию — черновик ещё не размещён у цеха",
    };
  }

  if (status !== "ready_for_pickup") {
    return {
      completed: false,
      interactive: false,
      blockedReason: 'Цех ещё не сообщил «готово к отгрузке» — завершить можно только после этого',
    };
  }

  if (!hasAction) {
    return {
      completed: false,
      interactive: false,
      blockedReason: "Приёмка партии выполняется на экране «Заказы пошива»",
    };
  }

  return { completed: false, interactive: true, blockedReason: null };
}
