import { Inject, Injectable } from "@nestjs/common";
import {
  confirmProductionOrder,
  createProductionOrderDraft,
  createWorkshop,
  receiveProductionOrder as receiveProductionOrderUseCase,
  updateProductionOrderStatusFromWorkshop,
  type BomApprovalPort,
  type ProductionOrder,
  type ProductionOrderRepository,
  type Workshop,
  type WorkshopRepository,
} from "@garmentos/domain-contract-manufacturing";
import {
  distributeQuantityBySize,
  distributeQuantityEvenly,
  DomainError as CatalogDomainError,
} from "@garmentos/domain-catalog";
import type { CreateProductionOrderDto, CreateProductionOrderFromQuantityDto, CreateWorkshopDto } from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { CatalogService } from "../catalog/catalog.service";
import { WarehouseService } from "../warehouse/warehouse.service";
import { BOM_APPROVAL_PORT, PRODUCTION_ORDER_REPOSITORY, WORKSHOP_REPOSITORY } from "./contract-manufacturing.tokens";

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
  ) {}

  async createWorkshop(companyId: string, input: CreateWorkshopDto): Promise<Workshop> {
    return createWorkshop({ workshops: this.workshops }, { ...input, companyId });
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

    // Цвета делятся поровну (не по правилу размерных тиров — оно осмысленно
    // только для размеров, не для цветов), внутри каждого цвета — по
    // размерам через distributeQuantityBySize.
    const colors = [...new Set(variants.map((variant) => variant.color))];
    const colorQuantities = distributeQuantityEvenly(colors.length, input.totalQuantity);

    const variantDrafts = colors.flatMap((color, colorIndex) => {
      const sizesForColor = variants.filter((variant) => variant.color === color);
      const colorQuantity = colorQuantities[colorIndex] ?? 0;
      if (colorQuantity === 0) return [];
      return distributeQuantityBySize(
        sizesForColor.map((variant) => variant.size),
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

  async confirmProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrder> {
    return confirmProductionOrder({ productionOrders: this.productionOrders }, { companyId, productionOrderId });
  }

  async findProductionOrderById(companyId: string, id: string): Promise<ProductionOrder | null> {
    return this.productionOrders.findById(companyId, id);
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

    return order;
  }

  async reserveNextSpecificationNumber(workshopId: string): Promise<number> {
    return this.workshops.reserveNextSpecificationNumber(workshopId);
  }

  async listActiveWorkshops(companyId: string): Promise<Workshop[]> {
    return this.workshops.listActiveByCompany(companyId);
  }
}
