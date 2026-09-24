import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  captureProductionOrderCostSnapshot,
  completeProductionOrder as completeProductionOrderUseCase,
  confirmProductionOrder,
  createProductionOrderDraft,
  createProductionOrderFromSpecification,
  createSewingOrderDraft as createSewingOrderDraftUseCase,
  createWorkshop,
  cancelProductionOrder as cancelProductionOrderUseCase,
  DrizzleProductionOrderRepository,
  DrizzleSewingOrderRepository,
  DrizzleWorkshopRepository,
  placeSewingOrder as placeSewingOrderUseCase,
  receiveProductionOrder as receiveProductionOrderUseCase,
  rollbackProductionOrderStatus as rollbackProductionOrderStatusUseCase,
  updateProductionOrderStatus as updateProductionOrderStatusUseCase,
  updateProductionOrderStatusFromWorkshop,
  updateSewingOrderDraft as updateSewingOrderDraftUseCase,
  updateWorkshop,
  type BomApprovalPort,
  type CancelProductionOrderResult,
  type CompanyNumberingPort,
  type CreateProductionOrderFromSpecificationInput,
  type PlaceSewingOrderModelInput,
  type ProductionOrder,
  type ProductionOrderRepository,
  type QcResultLookupPort,
  type RollbackProductionOrderStatusResult,
  type SewingOrder,
  type SewingOrderRepository,
  type Workshop,
  type WorkshopRepository,
  type WorkshopReportableStatus,
} from "@garmentos/domain-contract-manufacturing";
import {
  distributeQuantityByPercent,
  distributeQuantityByRatio,
  distributeQuantityEvenly,
  DomainError as CatalogDomainError,
} from "@garmentos/domain-catalog";
import type {
  CreateProductionOrderDto,
  CreateSewingOrderDraftDto,
  PlaceSewingOrderDto,
  PlaceSewingOrderModelDto,
  PreviewProductionOrderVariantsDto,
  PreviewProductionOrderVariantsResponseDto,
  CreateProductionOrderFromQuantityDto,
  CreateWorkshopDto,
  SizeDistributionMode,
  UpdateSewingOrderDraftDto,
  UpdateWorkshopDto,
} from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { DATABASE_CONNECTION } from "../database/database.module";
import { createBomApprovalPort } from "./bom-approval.provider";
import { WarehouseService } from "../warehouse/warehouse.service";
import {
  BOM_APPROVAL_PORT,
  COMPANY_NUMBERING_PORT,
  PRODUCTION_ORDER_REPOSITORY,
  QC_RESULT_LOOKUP_PORT,
  SEWING_ORDER_REPOSITORY,
  WORKSHOP_REPOSITORY,
} from "./contract-manufacturing.tokens";

// Срез карточки цеха для audit_log — только содержательные поля, без
// служебных дат и идентификаторов: они не несут смысла в диффе «до/после»,
// но зашумляют его.
function toWorkshopAuditJson(workshop: Workshop): Record<string, unknown> {
  return {
    name: workshop.name,
    inn: workshop.inn,
    contactInfo: workshop.contactInfo,
    specialization: workshop.specialization,
    status: workshop.status,
    contractNumber: workshop.contractNumber,
    contractDate: workshop.contractDate,
    paymentTerms: workshop.paymentTerms,
    deliveryMethod: workshop.deliveryMethod,
    signerRole: workshop.signerRole,
    signerName: workshop.signerName,
  };
}

// Тонкий presentation-адаптер поверх packages/domain/contract-manufacturing
// (docs/ARCHITECTURE.md, раздел 2) — репозитории и порт BomApprovalPort
// внедряются через DI по токенам, тот же паттерн, что и в остальных модулях.
@Injectable()
export class ContractManufacturingService {
  constructor(
    @Inject(WORKSHOP_REPOSITORY) private readonly workshops: WorkshopRepository,
    @Inject(PRODUCTION_ORDER_REPOSITORY) private readonly productionOrders: ProductionOrderRepository,
    @Inject(SEWING_ORDER_REPOSITORY) private readonly sewingOrders: SewingOrderRepository,
    @Inject(BOM_APPROVAL_PORT) private readonly bomApproval: BomApprovalPort,
    @Inject(COMPANY_NUMBERING_PORT) private readonly companyNumbering: CompanyNumberingPort,
    @Inject(QC_RESULT_LOOKUP_PORT) private readonly qcResultLookup: QcResultLookupPort,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly warehouseService: WarehouseService,
    private readonly catalogService: CatalogService,
    private readonly auditService: AuditService,
  ) {}

  async createWorkshop(companyId: string, input: CreateWorkshopDto): Promise<Workshop> {
    return createWorkshop({ workshops: this.workshops }, { ...input, companyId });
  }

  // Правка карточки цеха. Пишется в audit_log, потому что договорные
  // реквизиты цеха попадают в Snapshot партии и в подписываемую
  // спецификацию — «кто и когда сменил номер договора» должно быть видно
  // (владелец проекта, 2026-08-04: старое/новое значение по каждой правке).
  async updateWorkshop(
    currentUser: AuthenticatedRequestUser,
    workshopId: string,
    input: UpdateWorkshopDto,
  ): Promise<Workshop> {
    const before = await this.workshops.findById(currentUser.companyId, workshopId);
    const workshop = await updateWorkshop(
      { workshops: this.workshops },
      { ...input, companyId: currentUser.companyId, workshopId },
    );

    await this.auditService.recordForUser(currentUser, {
      entityType: "workshop",
      entityId: workshop.id,
      action: "workshop.updated",
      beforeJson: before ? toWorkshopAuditJson(before) : null,
      afterJson: toWorkshopAuditJson(workshop),
    });

    return workshop;
  }

  async createProductionOrderDraft(companyId: string, input: CreateProductionOrderDto): Promise<ProductionOrder> {
    // ПРОМПТ №3, раздел 8 — bomId необязателен: визард с матрицей размер×цвет
    // не заставляет выбирать BOM, backend сам находит/заводит approved BOM
    // модели прозрачно для пользователя (тот же путь, что и /from-quantity).
    const bomId = input.bomId ?? (await this.bomApproval.ensureApprovedBomForProduct(companyId, input.productId, input.createdBy ?? null));

    return createProductionOrderDraft(
      { productionOrders: this.productionOrders, workshops: this.workshops, bomApproval: this.bomApproval },
      { ...input, bomId, companyId },
    );
  }

  // «Указываю только общее количество, размерный ряд распределяется
  // автоматически» (владелец проекта, 2026-08-03) — если у модели один
  // цвет, всё количество идёт на его размеры; при нескольких цветах общее
  // количество сначала делится поровну между цветами, затем внутри каждого
  // цвета — по размерам (см. distributeQuantityBySize, @garmentos/domain-catalog).
  // Порядок размеров — порядок создания SKU модели (от меньшего к большему);
  // явного поля порядка размеров в схеме пока нет — известное упрощение,
  // не для показа как "готово навсегда".
  async createProductionOrderDraftFromTotalQuantity(
    companyId: string,
    input: CreateProductionOrderFromQuantityDto,
  ): Promise<ProductionOrder> {
    const variants = await this.catalogService.listProductVariants(companyId, input.productId);
    if (variants.length === 0) {
      throw new CatalogDomainError(`У модели ${input.productId} нет ни одного SKU`, "PRODUCT_HAS_NO_VARIANTS");
    }
    const ratios = await this.loadSizeRatios(companyId, input.productId);

    // Цвета делятся поровну (не по правилу размерных тиров — оно осмысленно
    // только для размеров, не для цветов), внутри каждого цвета — по
    // размерам через distributeQuantityBySize.
    const colors = [...new Set(variants.map((variant) => variant.color))];
    const colorQuantities = distributeQuantityEvenly(colors.length, input.totalQuantity);

    const variantDrafts = colors.flatMap((color, colorIndex) => {
      const sizesForColor = variants.filter((variant) => variant.color === color);
      const colorQuantity = colorQuantities[colorIndex] ?? 0;
      if (colorQuantity === 0) return [];
      return this.distributeAcrossSizes(
        sizesForColor.map((variant) => variant.size),
        ratios,
        colorQuantity,
        input.distributionMode,
      )
        .filter((row) => row.quantity > 0)
        .map(({ size, quantity }) => ({
          productVariantId: sizesForColor.find((variant) => variant.size === size)!.id,
          quantity,
        }));
    });

    // ПРОМПТ №3, раздел 8 — bomId необязателен в этом эндпоинте: если не
    // передан явно, находим/заводим approved BOM модели прозрачно для
    // пользователя (пустой BOM = материалы для модели пока не описаны, не
    // блокирует создание заказа).
    const bomId = input.bomId ?? (await this.bomApproval.ensureApprovedBomForProduct(companyId, input.productId, input.createdBy ?? null));

    return this.createProductionOrderDraft(companyId, {
      productId: input.productId,
      bomId,
      workshopId: input.workshopId,
      plannedQuantity: input.totalQuantity,
      agreedUnitPrice: input.agreedUnitPrice,
      materialsProvidedByUs: input.materialsProvidedByUs,
      dueDate: input.dueDate,
      createdBy: input.createdBy,
      variants: variantDrafts,
    });
  }

  // Раскладка модели: порядок размеров и веса из карточки (product_sizes).
  // Пустой результат означает «ряд не задан» — тогда применяется запасное
  // равномерное деление, а вызывающий явно об этом сообщает пользователю
  // (числа финансово значимые, молча угадывать пропорцию нельзя).
  private async loadSizeRatios(companyId: string, productId: string): Promise<Map<string, number>> {
    const sizes = await this.catalogService.listProductSizes(companyId, productId);
    return new Map(sizes.map((size) => [size.size, Number(size.ratioWeight)]));
  }

  // Единая точка распределения количества по размерам (владелец проекта,
  // 2026-08-30; распределение по режиму — ПРОМПТ №3, раздел 2, шаг 5).
  // "ratio" (по умолчанию) — веса берутся из карточки модели; размеры,
  // которых нет в ряду, получают вес 1 — иначе вариант с «забытым» размером
  // молча выпал бы из заказа. Если раскладки нет вовсе, все веса равны, то
  // есть деление становится равномерным само по себе. "even" — явный выбор
  // пользователя игнорировать веса модели и распределить поровну между
  // размерами именно для этого заказа, не трогая саму карточку модели.
  private distributeAcrossSizes(
    sizes: string[],
    ratios: Map<string, number>,
    totalQuantity: number,
    mode?: SizeDistributionMode,
  ): Array<{ size: string; quantity: number }> {
    if (mode === "even") {
      const quantities = distributeQuantityEvenly(sizes.length, totalQuantity);
      return sizes.map((size, index) => ({ size, quantity: quantities[index] ?? 0 }));
    }
    return distributeQuantityByRatio(
      sizes.map((size) => ({ size, weight: ratios.get(size) ?? 1 })),
      totalQuantity,
    );
  }

  // Предпросмотр матрицы размер × цвет до сохранения заказа. Считается на
  // сервере, чтобы показанные числа совпадали с сохранёнными: округление по
  // методу наибольших остатков должно быть ровно одним и тем же.
  async previewProductionOrderVariants(
    companyId: string,
    input: PreviewProductionOrderVariantsDto,
  ): Promise<PreviewProductionOrderVariantsResponseDto> {
    const variants = await this.catalogService.listProductVariants(companyId, input.productId);
    if (variants.length === 0) {
      throw new CatalogDomainError(`У модели ${input.productId} нет ни одного SKU`, "PRODUCT_HAS_NO_VARIANTS");
    }
    const ratios = await this.loadSizeRatios(companyId, input.productId);

    // Порядок размеров — из раскладки модели; размеры без раскладки идут
    // следом в порядке появления среди вариантов.
    const orderedSizes = [...ratios.keys()];
    for (const variant of variants) {
      if (!orderedSizes.includes(variant.size)) orderedSizes.push(variant.size);
    }

    const rows: PreviewProductionOrderVariantsResponseDto["rows"] = [];
    const missingVariants: PreviewProductionOrderVariantsResponseDto["missingVariants"] = [];

    for (const colorRow of input.colors) {
      const sizesForColor = orderedSizes.filter((size) =>
        variants.some((variant) => variant.size === size && variant.color === colorRow.color),
      );
      for (const size of orderedSizes) {
        if (!sizesForColor.includes(size)) missingVariants.push({ size, color: colorRow.color });
      }
      if (sizesForColor.length === 0) continue;

      for (const { size, quantity } of this.distributeAcrossSizes(
        sizesForColor,
        ratios,
        colorRow.quantity,
        input.distributionMode,
      )) {
        const variant = variants.find((row) => row.size === size && row.color === colorRow.color);
        if (!variant) continue;
        rows.push({ productVariantId: variant.id, size, color: colorRow.color, quantity });
      }
    }

    return {
      rows,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      missingVariants,
      usedFallbackRatio: ratios.size === 0,
    };
  }

  async confirmProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrder> {
    return confirmProductionOrder({ productionOrders: this.productionOrders }, { companyId, productionOrderId });
  }

  async findProductionOrderById(companyId: string, id: string): Promise<ProductionOrder | null> {
    return this.productionOrders.findById(companyId, id);
  }

  // Фиксирует Snapshot партии (см. миграцию cost_snapshot) — вызывается
  // ровно один раз оркестрацией сразу после подтверждения заказа
  // (production-order-orchestration.service.ts, ProductionOrderOrchestrationService.confirmProductionOrder).
  // P1-1: домен сам проверяет, что снимка ещё не было — второй вызов на тот
  // же заказ бросит PRODUCTION_ORDER_COST_SNAPSHOT_ALREADY_SET, а не тихо
  // перезапишет историю.
  async updateProductionOrderCostSnapshot(
    companyId: string,
    id: string,
    costSnapshot: Record<string, unknown>,
  ): Promise<ProductionOrder> {
    return captureProductionOrderCostSnapshot(
      { productionOrders: this.productionOrders },
      { companyId, productionOrderId: id, costSnapshot },
    );
  }

  async listProductionOrders(companyId: string): Promise<ProductionOrder[]> {
    return this.productionOrders.listByCompany(companyId);
  }

  // Партии, уже созданные из этой утверждённой спецификации (Этап 3) — нужно
  // SpecificationService, чтобы посчитать доступный остаток по строкам
  // (1 спецификация → N партий, в т.ч. частичных по количеству).
  async listProductionOrdersBySpecification(companyId: string, specificationId: string): Promise<ProductionOrder[]> {
    return this.productionOrders.listBySpecification(companyId, specificationId);
  }

  // Все партии одной модели (Model-first Minimal Core, ПРОМПТ №06.1) —
  // история производства модели включает партии, созданные и через
  // спецификацию, и вручную/до Этапа 3 (у обоих productId заполнен всегда).
  async listProductionOrdersByProduct(companyId: string, productId: string): Promise<ProductionOrder[]> {
    return this.productionOrders.listByProduct(companyId, productId);
  }

  // Создание партии из утверждённой спецификации (Этап 3 «Production
  // Master», владелец проекта, 2026-09-12) — auto-confirm: партия сразу
  // получает status="placed" и готовый cost_snapshot (Вариант B), без
  // отдельного шага "Подтвердить". Вызывающий код (SpecificationService)
  // уже проверил статус спецификации, посчитал остаток по строкам,
  // подобрал approved BOM и собрал cost_snapshot/номер партии — этот метод
  // только проводит доменные инварианты (сумма по размерам, approved BOM) и
  // атомарно создаёт запись.
  async createProductionOrderFromSpecification(
    companyId: string,
    input: Omit<CreateProductionOrderFromSpecificationInput, "companyId">,
  ): Promise<ProductionOrder> {
    return createProductionOrderFromSpecification(
      { productionOrders: this.productionOrders, workshops: this.workshops, bomApproval: this.bomApproval },
      { ...input, companyId },
    );
  }

  async findWorkshopById(companyId: string, id: string): Promise<Workshop | null> {
    return this.workshops.findById(companyId, id);
  }

  async updateProductionOrderStatusFromWorkshop(
    companyId: string,
    workshopId: string,
    status: WorkshopReportableStatus,
  ): Promise<ProductionOrder> {
    return updateProductionOrderStatusFromWorkshop(
      { productionOrders: this.productionOrders },
      { companyId, workshopId, status },
    );
  }

  // REST-путь смены статуса (P0-1, владелец проекта, 2026-09-05; расширен
  // ПРОМПТ №3 разделом 8 до sewing_completed/shipped_to_fulfillment) — тот
  // же инвариант, что у Telegram-пути выше, но по конкретному id заказа, не
  // по цеху. Единственная точка входа в Web UI, пока Telegram-канал с цехом
  // не настроен.
  async updateProductionOrderStatus(
    companyId: string,
    productionOrderId: string,
    status: WorkshopReportableStatus,
  ): Promise<ProductionOrder> {
    return updateProductionOrderStatusUseCase(
      { productionOrders: this.productionOrders },
      { companyId, productionOrderId, status },
    );
  }

  // Контролируемый rollback (ПРОМПТ №2.1, раздел C / ПРОМПТ №3, раздел 9) —
  // право contract_manufacturing.rollback проверяется на уровне контроллера
  // (RequirePermissions), не здесь; сервис отвечает только за вызов домена и
  // журналирование. Целевой статус вычисляется доменом — контроллер и
  // клиент его не выбирают.
  async rollbackProductionOrderStatus(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    reason: string,
  ): Promise<RollbackProductionOrderStatusResult> {
    const result = await rollbackProductionOrderStatusUseCase(
      { productionOrders: this.productionOrders, qcResults: this.qcResultLookup },
      { companyId: currentUser.companyId, productionOrderId, reason },
    );

    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: result.order.id,
      action: "production_order.status_rolled_back",
      beforeJson: { status: result.fromStatus },
      afterJson: { status: result.toStatus, reason },
    });

    return result;
  }

  // Отмена заказа пошива (владелец проекта, 2026-09-22) — та же дисциплина,
  // что и у rollback: право contract_manufacturing.cancel проверяется на
  // уровне контроллера, сервис отвечает только за вызов домена (guard —
  // assertCanCancel) и журналирование. Каскадная отмена связанных сущностей
  // (спецификация/раскройные задания) НЕ здесь — это забота вызывающей
  // оркестрации (ProductionOrderOrchestrationService.cancelProductionOrder в
  // ai-production-assistant), потому что доступ к SpecificationService и
  // CuttingService отсюда создал бы цикл модулей (тот же принцип, что уже
  // объясняет, почему ":id/confirm" не в этом контроллере — см. комментарий
  // в production-orders.controller.ts).
  async cancelProductionOrder(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    reason: string,
  ): Promise<CancelProductionOrderResult> {
    const result = await cancelProductionOrderUseCase(
      { productionOrders: this.productionOrders, qcResults: this.qcResultLookup },
      { companyId: currentUser.companyId, productionOrderId, reason },
    );

    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: result.order.id,
      action: "production_order.cancelled",
      beforeJson: { status: result.fromStatus },
      afterJson: { status: "cancelled", reason },
    });

    return result;
  }

  // Приёмка партии от цеха на склад (Итерация 10, факт — P0-1, владелец
  // проекта, 2026-09-07) — переводит заказ в received и зачисляет каждый SKU
  // на выбранный склад через WarehouseService.receiveStock, тот же принцип
  // композиции на границе модулей, что и ProcurementService.receivePurchaseOrder
  // (материалы). КРИТИЧНО: на склад зачисляется ФАКТИЧЕСКИ принятое
  // количество (order.variants[].receivedQuantity после markReceived), а не
  // плановое (quantity) — "ordered ≠ received", подмена плана фактом
  // запрещена ("ordered ≠ received ≠ good ≠ defect", там же).
  async receiveProductionOrder(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    warehouseId: string,
    receivedVariants?: Array<{ productVariantId: string; quantity: number }>,
  ): Promise<ProductionOrder> {
    const draftForAudit = await this.productionOrders.findById(currentUser.companyId, productionOrderId);
    const order = await receiveProductionOrderUseCase(
      { productionOrders: this.productionOrders },
      { companyId: currentUser.companyId, productionOrderId, receivedVariants },
    );

    for (const variant of order.variants) {
      const quantity = variant.receivedQuantity !== null ? Number(variant.receivedQuantity) : Number(variant.quantity);
      // Нечего зачислять на склад, если фактически ничего не пришло по этой
      // строке (0 — легитимный факт, не ошибка, ReceiveStockDto не принимает
      // ноль/отрицательное количество отдельным use case, поэтому строки без
      // факта просто пропускаются, а не падают).
      if (quantity <= 0) continue;
      await this.warehouseService.receiveStock(currentUser, {
        warehouseId,
        productVariantId: variant.productVariantId,
        quantity,
        referenceType: "production_order",
        referenceId: order.id,
        createdBy: currentUser.id,
      });
    }

    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: order.id,
      action: "production_order.received",
      beforeJson: {
        variants: draftForAudit?.variants.map((v) => ({ productVariantId: v.productVariantId, plannedQuantity: v.quantity })),
      },
      afterJson: {
        status: order.status,
        warehouseId,
        variants: order.variants.map((v) => ({
          productVariantId: v.productVariantId,
          plannedQuantity: v.quantity,
          receivedQuantity: v.receivedQuantity,
        })),
      },
    });

    return order;
  }

  // Завершение партии (ПРОМПТ №10.1/10.2, владелец проекта, 2026-09-15) —
  // отдельное явное действие пользователя после приёмки, независимое от ОТК
  // (production_order_qc_results никогда сама не меняет статус партии — см.
  // packages/domain/qc). "received" сам по себе больше не считается концом
  // жизни партии.
  async completeProductionOrder(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
  ): Promise<ProductionOrder> {
    const order = await completeProductionOrderUseCase(
      { productionOrders: this.productionOrders },
      { companyId: currentUser.companyId, productionOrderId },
    );

    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: order.id,
      action: "production_order.completed",
      beforeJson: { status: "received" },
      afterJson: { status: order.status },
    });

    return order;
  }

  async reserveNextSpecificationNumber(workshopId: string): Promise<number> {
    return this.workshops.reserveNextSpecificationNumber(workshopId);
  }

  async listActiveWorkshops(companyId: string): Promise<Workshop[]> {
    return this.workshops.listActiveByCompany(companyId);
  }

  // ---- Заказ на пошив (ADR 0002, «Штаб партии v1») ----

  async createSewingOrderDraft(currentUser: AuthenticatedRequestUser, input: CreateSewingOrderDraftDto): Promise<SewingOrder> {
    return createSewingOrderDraftUseCase(
      { sewingOrders: this.sewingOrders },
      {
        companyId: currentUser.companyId,
        workshopId: input.workshopId,
        draftPayload: input.draftPayload,
        createdBy: currentUser.id,
      },
    );
  }

  async updateSewingOrderDraft(
    currentUser: AuthenticatedRequestUser,
    sewingOrderId: string,
    input: UpdateSewingOrderDraftDto,
  ): Promise<SewingOrder> {
    return updateSewingOrderDraftUseCase(
      { sewingOrders: this.sewingOrders },
      {
        companyId: currentUser.companyId,
        sewingOrderId,
        expectedVersion: input.version,
        workshopId: input.workshopId,
        draftPayload: input.draftPayload,
      },
    );
  }

  async findSewingOrderById(companyId: string, id: string): Promise<SewingOrder | null> {
    return this.sewingOrders.findById(companyId, id);
  }

  async deleteSewingOrderDraft(companyId: string, id: string): Promise<boolean> {
    return this.sewingOrders.deleteDraft(companyId, id);
  }

  // Штаб заказа (B01 basic) — шапка вместе с уже размещёнными партиями.
  // null, если заказ не найден в этой компании — контроллер сам решает,
  // как ответить (404), домен здесь не участвует.
  async getSewingOrderWithProductionOrders(
    companyId: string,
    id: string,
  ): Promise<{ sewingOrder: SewingOrder; productionOrders: ProductionOrder[] } | null> {
    const sewingOrder = await this.sewingOrders.findById(companyId, id);
    if (!sewingOrder) return null;
    const productionOrders = await this.productionOrders.listBySewingOrder(companyId, id);
    return { sewingOrder, productionOrders };
  }

  async listSewingOrders(companyId: string): Promise<SewingOrder[]> {
    return this.sewingOrders.listByCompany(companyId);
  }

  // Резолвит одну модель заказа (цвета + проценты/ручные ячейки) в готовую
  // разбивку по SKU — та же логика, что previewProductionOrderVariants/
  // createProductionOrderDraftFromTotalQuantity выше, обобщённая на
  // произвольный шаблон долей (не только раскладку из карточки модели) и на
  // ручной режим. companyId уже ограничивает listProductVariants — чужой
  // productId просто не даст вариантов (тот же принцип изоляции, что и в
  // остальном API, SEC-P1).
  private async resolveSewingOrderModelVariants(
    companyId: string,
    model: PlaceSewingOrderModelDto,
  ): Promise<PlaceSewingOrderModelInput> {
    const product = await this.catalogService.findProductById(companyId, model.productId);
    if (!product) {
      throw new CatalogDomainError(`Модель ${model.productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
    }
    const allVariants = await this.catalogService.listProductVariants(companyId, model.productId);
    if (allVariants.length === 0) {
      throw new CatalogDomainError(`У модели ${model.productId} нет ни одного SKU`, "PRODUCT_HAS_NO_VARIANTS");
    }

    const variants: Array<{ productVariantId: string; quantity: number }> = [];
    for (const colorRow of model.colors) {
      const sizesForColor = allVariants.filter((variant) => variant.color === colorRow.color);
      if (sizesForColor.length === 0) {
        throw new CatalogDomainError(
          `У модели ${model.productId} нет варианта цвета "${colorRow.color}"`,
          "SEWING_ORDER_COLOR_NOT_FOUND",
        );
      }

      let sizeQuantities: Array<{ size: string; quantity: number }>;
      if (model.distributionMode === "manual") {
        if (!colorRow.cells || colorRow.cells.length === 0) {
          throw new CatalogDomainError(
            `Цвет "${colorRow.color}" в ручном режиме должен содержать хотя бы одну заполненную ячейку`,
            "SEWING_ORDER_CELLS_REQUIRED",
          );
        }
        sizeQuantities = colorRow.cells;
      } else {
        if (colorRow.quantity === undefined) {
          throw new CatalogDomainError(
            `Цвет "${colorRow.color}" должен содержать общее количество в режиме "по шаблону"`,
            "SEWING_ORDER_COLOR_QUANTITY_REQUIRED",
          );
        }
        if (colorRow.percentages && colorRow.percentages.length > 0) {
          // Проценты должны покрывать РОВНО набор размеров этого цвета —
          // иначе сумма 100% относилась бы к другому набору строк, чем
          // тот, что реально будет создан (R02: один источник числа).
          const colorSizes = new Set(sizesForColor.map((variant) => variant.size));
          const percentSizes = new Set(colorRow.percentages.map((row) => row.size));
          const sameSizes = colorSizes.size === percentSizes.size && [...colorSizes].every((size) => percentSizes.has(size));
          if (!sameSizes) {
            throw new CatalogDomainError(
              `Проценты цвета "${colorRow.color}" должны быть заданы ровно для его размеров (${[...colorSizes].join(", ")})`,
              "SEWING_ORDER_PERCENT_SIZES_MISMATCH",
            );
          }
          sizeQuantities = distributeQuantityByPercent(colorRow.percentages, colorRow.quantity);
        } else {
          const ratios = await this.loadSizeRatios(companyId, model.productId);
          sizeQuantities = this.distributeAcrossSizes(
            sizesForColor.map((variant) => variant.size),
            ratios,
            colorRow.quantity,
            undefined,
          );
        }
      }

      for (const { size, quantity } of sizeQuantities) {
        if (quantity <= 0) continue;
        const variant = sizesForColor.find((row) => row.size === size);
        if (!variant) {
          throw new CatalogDomainError(
            `У модели ${model.productId} нет варианта ${colorRow.color}/${size}`,
            "SEWING_ORDER_VARIANT_NOT_FOUND",
          );
        }
        variants.push({ productVariantId: variant.id, quantity });
      }
    }

    return {
      productId: model.productId,
      agreedUnitPrice: model.agreedUnitPrice,
      materialsProvidedByUs: model.materialsProvidedByUs,
      dueDate: model.dueDate,
      variants,
    };
  }

  // Атомарное размещение заказа на пошив (ADR 0002) — единственное
  // пользовательское «Создать заказ» создаёт шапку в статусе placed и одну
  // партию на каждую модель, сразу в placed, одной транзакцией. Матрица
  // размер×цвет каждой модели пересчитывается здесь же на сервере — тело
  // запроса содержит намерение пользователя (цвета/проценты/ручные ячейки),
  // не готовые итоги (T01: «итоги вычисляются и валидируются на сервере»).
  async placeSewingOrder(
    currentUser: AuthenticatedRequestUser,
    sewingOrderId: string,
    input: PlaceSewingOrderDto,
  ): Promise<{ sewingOrder: SewingOrder; productionOrders: ProductionOrder[]; reused: boolean }> {
    const models = await Promise.all(
      input.models.map((model) => this.resolveSewingOrderModelVariants(currentUser.companyId, model)),
    );

    return this.db.transaction(async (tx) => {
      const sewingOrders = new DrizzleSewingOrderRepository(tx);
      const productionOrders = new DrizzleProductionOrderRepository(tx);
      const workshops = new DrizzleWorkshopRepository(tx);

      // Блокировка строки шапки ДО проверки идемпотентности/статуса и
      // записи партий (ADR 0002) — исключает две параллельные попытки
      // размещения одного и того же черновика.
      await sewingOrders.findByIdForUpdate(currentUser.companyId, sewingOrderId);

      return placeSewingOrderUseCase(
        {
          sewingOrders,
          productionOrders,
          workshops,
          bomApproval: createBomApprovalPort(tx),
          companyNumbering: this.companyNumbering,
        },
        {
          companyId: currentUser.companyId,
          sewingOrderId,
          workshopId: input.workshopId,
          models,
          clientRequestId: input.clientRequestId,
          createdBy: currentUser.id,
        },
      );
    });
  }
}
