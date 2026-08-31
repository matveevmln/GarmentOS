import { Inject, Injectable } from "@nestjs/common";
import {
  confirmProductionOrder,
  createProductionOrderDraft,
  createWorkshop,
  receiveProductionOrder as receiveProductionOrderUseCase,
  updateProductionOrderStatusFromWorkshop,
  updateWorkshop,
  type BomApprovalPort,
  type ProductionOrder,
  type ProductionOrderRepository,
  type Workshop,
  type WorkshopRepository,
} from "@garmentos/domain-contract-manufacturing";
import {
  distributeQuantityByRatio,
  distributeQuantityEvenly,
  DomainError as CatalogDomainError,
} from "@garmentos/domain-catalog";
import type {
  CreateProductionOrderDto,
  PreviewProductionOrderVariantsDto,
  PreviewProductionOrderVariantsResponseDto,
  CreateProductionOrderFromQuantityDto,
  CreateWorkshopDto,
  UpdateWorkshopDto,
} from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { WarehouseService } from "../warehouse/warehouse.service";
import { BOM_APPROVAL_PORT, PRODUCTION_ORDER_REPOSITORY, WORKSHOP_REPOSITORY } from "./contract-manufacturing.tokens";

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
    @Inject(BOM_APPROVAL_PORT) private readonly bomApproval: BomApprovalPort,
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
    return createProductionOrderDraft(
      { productionOrders: this.productionOrders, workshops: this.workshops, bomApproval: this.bomApproval },
      { ...input, companyId },
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
    const variants = await this.catalogService.listProductVariants(input.productId);
    if (variants.length === 0) {
      throw new CatalogDomainError(`У модели ${input.productId} нет ни одного SKU`, "PRODUCT_HAS_NO_VARIANTS");
    }
    const ratios = await this.loadSizeRatios(input.productId);

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
      )
        .filter((row) => row.quantity > 0)
        .map(({ size, quantity }) => ({
          productVariantId: sizesForColor.find((variant) => variant.size === size)!.id,
          quantity,
        }));
    });

    return this.createProductionOrderDraft(companyId, {
      productId: input.productId,
      bomId: input.bomId,
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
  private async loadSizeRatios(productId: string): Promise<Map<string, number>> {
    const sizes = await this.catalogService.listProductSizes(productId);
    return new Map(sizes.map((size) => [size.size, Number(size.ratioWeight)]));
  }

  // Единая точка распределения количества по размерам (владелец проекта,
  // 2026-08-30). Веса берутся из карточки модели; размеры, которых нет в
  // ряду, получают вес 1 — иначе вариант с «забытым» размером молча выпал бы
  // из заказа. Если раскладки нет вовсе, все веса равны, то есть деление
  // становится равномерным.
  private distributeAcrossSizes(
    sizes: string[],
    ratios: Map<string, number>,
    totalQuantity: number,
  ): Array<{ size: string; quantity: number }> {
    return distributeQuantityByRatio(
      sizes.map((size) => ({ size, weight: ratios.get(size) ?? 1 })),
      totalQuantity,
    );
  }

  // Предпросмотр матрицы размер × цвет до сохранения заказа. Считается на
  // сервере, чтобы показанные числа совпадали с сохранёнными: округление по
  // методу наибольших остатков должно быть ровно одним и тем же.
  async previewProductionOrderVariants(
    input: PreviewProductionOrderVariantsDto,
  ): Promise<PreviewProductionOrderVariantsResponseDto> {
    const variants = await this.catalogService.listProductVariants(input.productId);
    if (variants.length === 0) {
      throw new CatalogDomainError(`У модели ${input.productId} нет ни одного SKU`, "PRODUCT_HAS_NO_VARIANTS");
    }
    const ratios = await this.loadSizeRatios(input.productId);

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

      for (const { size, quantity } of this.distributeAcrossSizes(sizesForColor, ratios, colorRow.quantity)) {
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
  async updateProductionOrderCostSnapshot(
    id: string,
    costSnapshot: Record<string, unknown>,
  ): Promise<ProductionOrder> {
    return this.productionOrders.updateCostSnapshot(id, costSnapshot);
  }

  async listProductionOrders(companyId: string): Promise<ProductionOrder[]> {
    return this.productionOrders.listByCompany(companyId);
  }

  async findWorkshopById(companyId: string, id: string): Promise<Workshop | null> {
    return this.workshops.findById(companyId, id);
  }

  async updateProductionOrderStatusFromWorkshop(
    companyId: string,
    workshopId: string,
    status: "in_progress" | "ready_for_pickup",
  ): Promise<ProductionOrder> {
    return updateProductionOrderStatusFromWorkshop(
      { productionOrders: this.productionOrders },
      { companyId, workshopId, status },
    );
  }

  // Приёмка партии от цеха на склад (Итерация 10) — переводит заказ в
  // received и зачисляет каждый SKU (variants) на выбранный склад через
  // WarehouseService.receiveStock, тот же принцип композиции на границе
  // модулей, что и ProcurementService.receivePurchaseOrder (материалы).
  async receiveProductionOrder(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    warehouseId: string,
  ): Promise<ProductionOrder> {
    const order = await receiveProductionOrderUseCase(
      { productionOrders: this.productionOrders },
      { companyId: currentUser.companyId, productionOrderId },
    );

    for (const variant of order.variants) {
      await this.warehouseService.receiveStock(currentUser, {
        warehouseId,
        productVariantId: variant.productVariantId,
        quantity: Number(variant.quantity),
        referenceType: "production_order",
        referenceId: order.id,
        createdBy: currentUser.id,
      });
    }

    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: order.id,
      action: "production_order.received",
      afterJson: { status: order.status, warehouseId, variants: order.variants.map((v) => ({ productVariantId: v.productVariantId, quantity: v.quantity })) },
    });

    return order;
  }

  async reserveNextSpecificationNumber(workshopId: string): Promise<number> {
    return this.workshops.reserveNextSpecificationNumber(workshopId);
  }

  async listActiveWorkshops(companyId: string): Promise<Workshop[]> {
    return this.workshops.listActiveByCompany(companyId);
  }
}
