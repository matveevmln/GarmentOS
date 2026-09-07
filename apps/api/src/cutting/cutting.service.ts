import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
import type { CuttingOrderDocumentData } from "@garmentos/domain-document";
import { formatRuDate, formatRuQuantity } from "../ai-production-assistant/ru-number-format";
import type {
  CreateCuttingOrderDto,
  CuttingFactDto,
  CuttingOrderResponseDto,
  IssueCuttingOrderDto,
} from "@garmentos/shared-types";
import { AuditService } from "../audit/audit.service";
import { DocumentService } from "../document/document.service";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { ProcurementService } from "../procurement/procurement.service";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import {
  CUTTING_MATERIAL_STOCK_PORT,
  CUTTING_ORDER_REPOSITORY,
  CUTTING_PRODUCTION_ORDER_PORT,
} from "./cutting.tokens";

// Единица измерения хранится кодом (m/kg/pcs), а документ читает человек —
// в PDF уходит русская подпись, а не код из справочника.
const UNIT_LABELS: Record<string, string> = { m: "м", kg: "кг", pcs: "шт" };
const unitLabel = (unit: string): string => UNIT_LABELS[unit] ?? unit;

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
    private readonly documentService: DocumentService,
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

  // Раскройное задание в PDF: матрица размер × цвет, как в рабочем документе
  // владельца («КРОЙ СТЕГАНКА · 4542 ед · 3 ЦВЕТА»). Генератор общий со
  // спецификацией — те же шрифты, хранилище и версионность.
  async generateDocument(
    currentUser: AuthenticatedRequestUser,
    cuttingOrderId: string,
  ): Promise<{ documentId: string; title: string | null }> {
    const order = await this.cuttingOrders.findById(currentUser.companyId, cuttingOrderId);
    if (!order) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "CUTTING_ORDER_NOT_FOUND",
        message: `Раскройное задание ${cuttingOrderId} не найдено`,
      });
    }
    const response = await this.toResponse(currentUser.companyId, order);
    const production = await this.contractManufacturingService.findProductionOrderById(
      currentUser.companyId,
      order.productionOrderId,
    );
    const product = production
      ? await this.catalogService.findProductById(currentUser.companyId, production.productId)
      : null;
    const workshop = production
      ? await this.contractManufacturingService.findWorkshopById(currentUser.companyId, production.workshopId)
      : null;

    // Порядок цветов и размеров — порядок появления в матрице задания, то
    // есть тот же, что был зафиксирован в заказе.
    const colors: string[] = [];
    const sizes: string[] = [];
    for (const row of response.results) {
      if (!colors.includes(row.color)) colors.push(row.color);
      if (!sizes.includes(row.size)) sizes.push(row.size);
    }
    const quantityAt = (size: string, color: string): number => {
      const row = response.results.find((item) => item.size === size && item.color === color);
      return row ? row.plannedQuantity : 0;
    };
    const total = response.results.reduce((sum, row) => sum + row.plannedQuantity, 0);

    const data: CuttingOrderDocumentData = {
      title: `КРОЙ ${(product?.name ?? "").toUpperCase()} · ${formatRuQuantity(total)} ед · ${colors.length} ЦВЕТ${colors.length === 1 ? "" : "А"}`.trim(),
      subtitleLines: [
        `Раскройное задание №${response.number} к заказу от ${formatRuDate(production?.createdAt?.toISOString() ?? "")}`,
        `Цех «${workshop?.name ?? "—"}»${production?.dueDate ? ` · срок ${formatRuDate(production.dueDate)}` : ""}`,
        response.executorType === "workshop"
          ? `Раскрой выполняет: ${response.executorWorkshopName ?? "подрядчик"}`
          : "Раскрой выполняем сами",
      ],
      colors,
      rows: sizes.map((size) => ({
        size,
        quantities: colors.map((color) => formatRuQuantity(quantityAt(size, color))),
      })),
      totals: colors.map((color) =>
        formatRuQuantity(sizes.reduce((sum, size) => sum + quantityAt(size, color), 0)),
      ),
      footerLines: [
        `Материалы: ${response.materials
          .map((material) => `${material.materialName} ${formatRuQuantity(material.requiredQuantity)} ${unitLabel(material.unit)}`)
          .join(" · ")}`,
        ...(response.comment ? [`Примечание: ${response.comment}`] : []),
      ],
    };

    const result = await this.documentService.generateCuttingOrderDocument(
      currentUser.companyId,
      order.id,
      order.productionOrderId,
      order.number,
      currentUser.id,
      data,
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "cutting_order",
      entityId: order.id,
      action: "cutting_order.document_generated",
      afterJson: { documentId: result.document.id },
    });
    return { documentId: result.document.id, title: result.document.title };
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
