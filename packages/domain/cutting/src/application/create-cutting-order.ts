import { DomainError } from "../domain/errors";
import {
  assertExecutorConsistency,
  assertProductionOrderCanBeCut,
  type CuttingExecutorType,
  type CuttingOrder,
} from "../domain/cutting-order";
import type { CuttingOrderRepository, ProductionOrderSnapshotPort } from "./ports";

export interface CreateCuttingOrderInput {
  companyId: string;
  productionOrderId: string;
  executorType?: CuttingExecutorType;
  executorWorkshopId?: string | null;
  comment?: string | null;
  createdBy?: string | null;
}

export interface CreateCuttingOrderDeps {
  cuttingOrders: CuttingOrderRepository;
  productionOrders: ProductionOrderSnapshotPort;
}

// Раскройное задание строится автоматически из данных заказа (владелец
// проекта, 2026-08-30): матрица размер×цвет берётся из строк заказа, нормы —
// из зафиксированных данных партии. Руками не вводится ничего, кроме
// исполнителя и комментария.
//
// Ничего не копируется «про запас»: план по размерам и требуемый метраж
// сохраняются в задании потому, что при докрое они отличаются от плана всей
// партии, а план не должен переписываться фактом.
export async function createCuttingOrder(
  deps: CreateCuttingOrderDeps,
  input: CreateCuttingOrderInput,
): Promise<CuttingOrder> {
  const executorType = input.executorType ?? "in_house";
  const executorWorkshopId = input.executorWorkshopId ?? null;
  assertExecutorConsistency(executorType, executorWorkshopId);

  const order = await deps.productionOrders.findForCutting(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(
      `Заказ пошива ${input.productionOrderId} не найден`,
      "CUTTING_PRODUCTION_ORDER_NOT_FOUND",
    );
  }
  assertProductionOrderCanBeCut(order.status);

  if (order.variants.length === 0) {
    throw new DomainError(
      "У заказа нет разбивки по размерам и цветам — кроить нечего",
      "CUTTING_ORDER_VARIANTS_EMPTY",
    );
  }
  // Раньше (до ПРОМПТ №3, раздел 8) отсутствие норм расхода в снимке партии
  // жёстко блокировало создание раскройного задания целиком — рассчитано на
  // партии, подтверждённые до появления заморозки норм. Но с момента, когда
  // модель без единого BOM стала обычным путём (createEmptyBom/ensureApproved
  // — 0 позиций материалов, «Zero Input», не гейт), materialNorms.length === 0
  // стало и штатным случаем для совершенно новых партий — снимок структурно
  // неотличим от старого «до заморозки» случая (см. комментарий в
  // production-order-snapshot.adapter.ts). Задание при этом всё равно нужно:
  // «Результаты» (сколько реально выкроено по размеру/цвету) не зависят от
  // норм расхода материала вовсе, а расход материала (issueCuttingOrder/
  // recordCuttingFact) уже полностью терпим к пустому materials[] (аудит
  // пользовательского пути, owner, 2026-09-21, живой прогон «QA Стеганка»:
  // утверждённая спецификация → партия → раскрой оказался тупиком на ровном
  // месте для любой модели без вручную заведённого BOM).

  const previousCount = await deps.cuttingOrders.countByProductionOrder(
    input.companyId,
    input.productionOrderId,
  );

  const quantity = order.variants.reduce((sum, variant) => sum + variant.quantity, 0);

  return deps.cuttingOrders.create({
    companyId: input.companyId,
    productionOrderId: input.productionOrderId,
    number: previousCount + 1,
    executorType,
    executorWorkshopId,
    comment: input.comment ?? null,
    createdBy: input.createdBy ?? null,
    materials: order.materialNorms.map((norm) => ({
      materialId: norm.materialId,
      unit: norm.unit,
      // Та же формула, что и в паспорте партии: расход на изделие с учётом
      // отходов, умноженный на количество.
      requiredQuantity: norm.quantityPerUnit * (1 + norm.wastePercent / 100) * quantity,
      allocatedQuantity: null,
      rollNote: null,
    })),
    results: order.variants.map((variant) => ({
      productVariantId: variant.productVariantId,
      plannedQuantity: variant.quantity,
    })),
  });
}
