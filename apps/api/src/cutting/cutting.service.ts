import { Inject, Injectable } from "@nestjs/common";
import {
  cancelCuttingOrder,
  correctCuttingFact,
  createCuttingOrder,
  issueCuttingOrder,
  recordCuttingFact,
  type CuttingOrder,
  type CuttingOrderRepository,
  type MaterialStockPort,
  type ProductionOrderSnapshotPort,
  type StockShortage,
} from "@garmentos/domain-cutting";
import type {
  CreateCuttingOrderDto,
  CuttingFactDto,
  CuttingOrderResponseDto,
  IssueCuttingOrderDto,
} from "@garmentos/shared-types";
import { AuditService } from "../audit/audit.service";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { ProcurementService } from "../procurement/procurement.service";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import {
  CUTTING_MATERIAL_STOCK_PORT,
  CUTTING_ORDER_REPOSITORY,
  CUTTING_PRODUCTION_ORDER_PORT,
} from "./cutting.tokens";

export interface CuttingFactOutcome {
  cuttingOrder: CuttingOrderResponseDto;
  shortages: Array<StockShortage & { materialName: string }>;
}

// Тонкий presentation-адаптер поверх packages/domain/cutting. Здесь же —
// обогащение ответа именами (материала, размера, цвета, цеха): доменный слой
// оперирует идентификаторами, а пользователю нужны слова.
@Injectable()
export class CuttingService {
  constructor(
    @Inject(CUTTING_ORDER_REPOSITORY) private readonly cuttingOrders: CuttingOrderRepository,
    @Inject(CUTTING_PRODUCTION_ORDER_PORT) private readonly productionOrders: ProductionOrderSnapshotPort,
    @Inject(CUTTING_MATERIAL_STOCK_PORT) private readonly materialStock: MaterialStockPort,
    private readonly catalogService: CatalogService,
    private readonly procurementService: ProcurementService,
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly auditService: AuditService,
  ) {}

  private async toResponse(companyId: string, order: CuttingOrder): Promise<CuttingOrderResponseDto> {
    const workshop = order.executorWorkshopId
      ? await this.contractManufacturingService.findWorkshopById(companyId, order.executorWorkshopId)
      : null;

    const materials = await Promise.all(
      order.materials.map(async (material) => {
        const found = await this.procurementService.findMaterialById(companyId, material.materialId);
        return {
          materialId: material.materialId,
          materialName: found?.name ?? material.materialId,
          unit: material.unit,
          requiredQuantity: Number(material.requiredQuantity),
          allocatedQuantity: material.allocatedQuantity === null ? null : Number(material.allocatedQuantity),
          consumedQuantity: material.consumedQuantity === null ? null : Number(material.consumedQuantity),
          rollNote: material.rollNote,
        };
      }),
    );

    const results = await Promise.all(
      order.results.map(async (result) => {
        const variant = await this.catalogService.findProductVariantById(result.productVariantId);
        return {
          productVariantId: result.productVariantId,
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          plannedQuantity: Number(result.plannedQuantity),
          actualQuantity: result.actualQuantity === null ? null : Number(result.actualQuantity),
        };
      }),
    );

    return {
      id: order.id,
      productionOrderId: order.productionOrderId,
      number: order.number,
      status: order.status,
      executorType: order.executorType,
      executorWorkshopId: order.executorWorkshopId,
      executorWorkshopName: workshop?.name ?? null,
      issuedAt: order.issuedAt,
      completedAt: order.completedAt,
      comment: order.comment,
      createdAt: order.createdAt,
      materials,
      results,
    };
  }

  async create(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    input: CreateCuttingOrderDto,
  ): Promise<CuttingOrderResponseDto> {
    const order = await createCuttingOrder(
      { cuttingOrders: this.cuttingOrders, productionOrders: this.productionOrders },
      {
        companyId: currentUser.companyId,
        productionOrderId,
        executorType: input.executorType,
        executorWorkshopId: input.executorWorkshopId ?? null,
        comment: input.comment ?? null,
        createdBy: currentUser.id,
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "cutting_order",
      entityId: order.id,
      action: "cutting_order.created",
      afterJson: { productionOrderId, number: order.number },
    });
    return this.toResponse(currentUser.companyId, order);
  }

  async listByProductionOrder(companyId: string, productionOrderId: string): Promise<CuttingOrderResponseDto[]> {
    const orders = await this.cuttingOrders.listByProductionOrder(companyId, productionOrderId);
    return Promise.all(orders.map((order) => this.toResponse(companyId, order)));
  }

  async findById(companyId: string, id: string): Promise<CuttingOrderResponseDto | null> {
    const order = await this.cuttingOrders.findById(companyId, id);
    return order ? this.toResponse(companyId, order) : null;
  }

  async issue(
    currentUser: AuthenticatedRequestUser,
    cuttingOrderId: string,
    input: IssueCuttingOrderDto,
  ): Promise<CuttingOrderResponseDto> {
    const order = await issueCuttingOrder(
      { cuttingOrders: this.cuttingOrders },
      { companyId: currentUser.companyId, cuttingOrderId, allocations: input.allocations },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "cutting_order",
      entityId: order.id,
      action: "cutting_order.issued",
      afterJson: { allocations: input.allocations ?? [] },
    });
    return this.toResponse(currentUser.companyId, order);
  }

  async cancel(currentUser: AuthenticatedRequestUser, cuttingOrderId: string): Promise<CuttingOrderResponseDto> {
    const order = await cancelCuttingOrder(
      { cuttingOrders: this.cuttingOrders },
      { companyId: currentUser.companyId, cuttingOrderId },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "cutting_order",
      entityId: order.id,
      action: "cutting_order.cancelled",
    });
    return this.toResponse(currentUser.companyId, order);
  }

  private async namedShortages(
    companyId: string,
    shortages: StockShortage[],
  ): Promise<CuttingFactOutcome["shortages"]> {
    return Promise.all(
      shortages.map(async (shortage) => {
        const material = await this.procurementService.findMaterialById(companyId, shortage.materialId);
        return { ...shortage, materialName: material?.name ?? shortage.materialId };
      }),
    );
  }

  async recordFact(
    currentUser: AuthenticatedRequestUser,
    cuttingOrderId: string,
    input: CuttingFactDto,
  ): Promise<CuttingFactOutcome> {
    const outcome = await recordCuttingFact(
      { cuttingOrders: this.cuttingOrders, materialStock: this.materialStock },
      {
        companyId: currentUser.companyId,
        cuttingOrderId,
        warehouseId: input.warehouseId,
        materials: input.materials,
        results: input.results,
        recordedBy: currentUser.id,
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "cutting_order",
      entityId: outcome.cuttingOrder.id,
      action: "cutting_order.fact_recorded",
      afterJson: { materials: input.materials, results: input.results, warehouseId: input.warehouseId },
    });
    return {
      cuttingOrder: await this.toResponse(currentUser.companyId, outcome.cuttingOrder),
      shortages: await this.namedShortages(currentUser.companyId, outcome.shortages),
    };
  }

  // Исправление факта: журнал изменений пишется всегда — «было → стало, кто,
  // когда» (владелец проекта, 2026-08-30). Прежнее движение по складу не
  // переписывается, проводится корректировка на разницу.
  async correctFact(
    currentUser: AuthenticatedRequestUser,
    cuttingOrderId: string,
    input: CuttingFactDto,
  ): Promise<CuttingFactOutcome> {
    const before = await this.cuttingOrders.findById(currentUser.companyId, cuttingOrderId);
    const outcome = await correctCuttingFact(
      { cuttingOrders: this.cuttingOrders, materialStock: this.materialStock },
      {
        companyId: currentUser.companyId,
        cuttingOrderId,
        warehouseId: input.warehouseId,
        materials: input.materials,
        results: input.results,
        recordedBy: currentUser.id,
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "cutting_order",
      entityId: outcome.cuttingOrder.id,
      action: "cutting_order.fact_corrected",
      beforeJson: {
        materials: before?.materials.map((row) => ({
          materialId: row.materialId,
          consumedQuantity: row.consumedQuantity,
        })),
        results: before?.results.map((row) => ({
          productVariantId: row.productVariantId,
          actualQuantity: row.actualQuantity,
        })),
      },
      afterJson: { corrections: outcome.corrections, materials: input.materials, results: input.results },
    });
    return {
      cuttingOrder: await this.toResponse(currentUser.companyId, outcome.cuttingOrder),
      shortages: await this.namedShortages(currentUser.companyId, outcome.shortages),
    };
  }
}
