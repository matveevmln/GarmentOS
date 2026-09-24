import { DomainError } from "../domain/errors";
import {
  assertBomIsApproved,
  assertHasVariants,
  assertValidPlannedQuantity,
  assertValidUnitPrice,
  assertValidVariant,
  assertVariantsMatchPlannedQuantity,
  type ProductionOrder,
} from "../domain/production-order";
import {
  assertCanPlace,
  assertHasModels,
  assertNoDuplicateModels,
  type PlaceSewingOrderModelInput,
  type SewingOrder,
} from "../domain/sewing-order";
import type {
  BomApprovalPort,
  CompanyNumberingPort,
  ProductionOrderRepository,
  SewingOrderRepository,
  WorkshopRepository,
} from "./ports";

export interface PlaceSewingOrderInput {
  companyId: string;
  sewingOrderId: string;
  workshopId: string;
  models: PlaceSewingOrderModelInput[];
  // Обязателен — идемпотентность размещения (ADR 0002); генерируется один
  // раз на клиенте на попытку размещения и переиспользуется при повторе
  // (двойной клик, потерянный ответ сети).
  clientRequestId: string;
  createdBy: string | null;
}

export interface PlaceSewingOrderResult {
  sewingOrder: SewingOrder;
  productionOrders: ProductionOrder[];
  // true — это повтор уже выполненного размещения с тем же client_request_id
  // (ничего не записано повторно), false — размещение произошло сейчас.
  reused: boolean;
}

export interface PlaceSewingOrderDeps {
  sewingOrders: SewingOrderRepository;
  productionOrders: ProductionOrderRepository;
  workshops: WorkshopRepository;
  bomApproval: BomApprovalPort;
  companyNumbering: CompanyNumberingPort;
}

// Атомарное размещение заказа на пошив (ADR 0002, раздел «Атомарное
// размещение»): одно пользовательское действие «Создать заказ» создаёт
// шапку в статусе placed и одну партию (production_order) на каждую модель,
// СРАЗУ в статусе placed — без отдельного пользовательского подтверждения
// каждой партии (TRANSITION-REVIEW, пункт 1). Вызывающий (apps/api) обязан
// выполнить этот use case внутри db.transaction с репозиториями,
// созданными на tx, и предварительно заблокировать строку шапки через
// sewingOrders.findByIdForUpdate — сам use case транзакцию не открывает
// (тот же принцип, что и остальные composite-операции в этом монолите,
// ADR 0001).
export async function placeSewingOrder(
  deps: PlaceSewingOrderDeps,
  input: PlaceSewingOrderInput,
): Promise<PlaceSewingOrderResult> {
  assertHasModels(input.models);
  assertNoDuplicateModels(input.models);
  for (const model of input.models) {
    assertHasVariants(model.variants);
    for (const variant of model.variants) assertValidVariant(variant);
    const plannedQuantity = model.variants.reduce((sum, variant) => sum + variant.quantity, 0);
    assertValidPlannedQuantity(plannedQuantity);
    assertVariantsMatchPlannedQuantity(model.variants, plannedQuantity);
    assertValidUnitPrice(model.agreedUnitPrice);
  }

  // Вызывающий обязан передать репозиторий, уже выполнивший
  // SELECT ... FOR UPDATE по этому id (findByIdForUpdate) — здесь findById
  // достаточно, повторное чтение той же заблокированной строки в одной tx.
  const header = await deps.sewingOrders.findById(input.companyId, input.sewingOrderId);
  if (!header) {
    throw new DomainError(`Заказ на пошив ${input.sewingOrderId} не найден в этой компании`, "SEWING_ORDER_NOT_FOUND");
  }

  if (header.status === "placed") {
    if (header.clientRequestId !== null && header.clientRequestId === input.clientRequestId) {
      // Идемпотентный повтор — тот же результат, ничего не пишем повторно
      // (ADR 0002: «иной ключ у уже размещённой шапки не создаёт вторую
      // группу партий», а тот же ключ — не создаёт вообще ничего нового).
      const existing = await deps.productionOrders.listBySewingOrder(input.companyId, header.id);
      return { sewingOrder: header, productionOrders: existing, reused: true };
    }
    throw new DomainError(
      "Заказ на пошив уже размещён по другому запросу — повторное размещение с иным идентификатором отклонено",
      "SEWING_ORDER_ALREADY_PLACED",
    );
  }
  assertCanPlace(header.status);

  const workshop = await deps.workshops.findById(input.companyId, input.workshopId);
  if (!workshop) {
    throw new DomainError(`Цех ${input.workshopId} не найден в этой компании`, "WORKSHOP_NOT_FOUND");
  }

  const createdOrders: ProductionOrder[] = [];
  for (const model of input.models) {
    const plannedQuantity = model.variants.reduce((sum, variant) => sum + variant.quantity, 0);
    const bomId = await deps.bomApproval.ensureApprovedBomForProduct(input.companyId, model.productId, input.createdBy);
    const bomApproved = await deps.bomApproval.isBomApproved(input.companyId, bomId, model.productId);
    assertBomIsApproved(bomApproved, bomId);

    // Партия создаётся СРАЗУ в статусе "placed" (не "draft" с последующим
    // отдельным подтверждением) — тот же приём, что уже применён в
    // createProductionOrderFromSpecification для другого композитного
    // сценария: вызывающая операция сама гарантирует согласованность, и
    // «Создать заказ» — одно действие пользователя, не серия.
    const created = await deps.productionOrders.create({
      companyId: input.companyId,
      productId: model.productId,
      bomId,
      workshopId: input.workshopId,
      plannedQuantity,
      agreedUnitPrice: model.agreedUnitPrice,
      materialsProvidedByUs: model.materialsProvidedByUs ?? true,
      status: "placed",
      dueDate: model.dueDate ?? null,
      createdBy: input.createdBy,
      variants: model.variants,
      sourceProductionOrderId: null,
      sewingOrderId: header.id,
    });
    createdOrders.push(created);
  }

  const number = await deps.companyNumbering.reserveNextSewingOrderNumber(input.companyId);
  const placedHeader = await deps.sewingOrders.place(header.id, {
    workshopId: input.workshopId,
    number,
    clientRequestId: input.clientRequestId,
  });

  return { sewingOrder: placedHeader, productionOrders: createdOrders, reused: false };
}
