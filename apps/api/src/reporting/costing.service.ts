import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { materials, purchaseOrderItems, purchaseOrders, type Database } from "@garmentos/db-schema";
import type { SpecificationPricingResponseDto } from "@garmentos/shared-types";
import { and, desc, eq } from "drizzle-orm";
import { BomService } from "../bom/bom.service";
import { CatalogService } from "../catalog/catalog.service";
import { DATABASE_CONNECTION } from "../database/database.module";

const DEFAULT_DEDUCTION = 175;

// «Расчёт стоимости спецификации» (владелец проекта, 2026-08-03): фактическая
// себестоимость (ткань/фурнитура/упаковка из утверждённого BOM × последняя
// цена закупки материала + стоимость пошива/прочие расходы из карточки
// модели, docs/PRODUCT_MODEL_ARCHITECTURE.md раздел 6) и цена для
// спецификации — обе цифры показываются всегда вместе, вторая никогда не
// подменяет первую в интерфейсе.
@Injectable()
export class CostingService {
  constructor(
    private readonly bomService: BomService,
    private readonly catalogService: CatalogService,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
  ) {}

  async computeSpecificationPricing(
    companyId: string,
    productId: string,
    deduction = DEFAULT_DEDUCTION,
  ): Promise<SpecificationPricingResponseDto> {
    const product = await this.catalogService.findProductById(companyId, productId);
    if (!product) {
      throw new NotFoundException({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
        message: `Модель ${productId} не найдена`,
      });
    }
    const bom = await this.bomService.getApproved(companyId, { productId });
    if (!bom) {
      throw new NotFoundException({
        statusCode: 404,
        code: "BOM_NOT_FOUND",
        message: `У модели "${product.name}" нет утверждённого BOM — расчёт стоимости невозможен`,
      });
    }

    let fabricCostPerUnit = 0;
    let trimCostPerUnit = 0;
    let packagingCostPerUnit = 0;
    const materialsWithoutPriceHistory: string[] = [];

    for (const item of bom.items) {
      const lastPrice = await this.findLastPurchasePrice(companyId, item.materialId);
      const consumption = Number(item.quantityPerUnit) * (1 + Number(item.wastePercent) / 100);
      if (lastPrice === null) {
        const material = await this.findMaterialName(item.materialId);
        materialsWithoutPriceHistory.push(material);
        continue;
      }
      const cost = consumption * lastPrice;
      const materialType = await this.findMaterialType(item.materialId);
      if (materialType === "fabric") fabricCostPerUnit += cost;
      else if (materialType === "packaging") packagingCostPerUnit += cost;
      else trimCostPerUnit += cost;
    }

    const sewingCostPerUnit = product.standardSewingCost !== null ? Number(product.standardSewingCost) : 0;
    const otherCostPerUnit = product.otherProductionCost !== null ? Number(product.otherProductionCost) : 0;
    const actualCostPerUnit = fabricCostPerUnit + trimCostPerUnit + packagingCostPerUnit + sewingCostPerUnit + otherCostPerUnit;
    const specificationPricePerUnit = Math.max(0, actualCostPerUnit - deduction);

    return {
      fabricCostPerUnit,
      trimCostPerUnit,
      packagingCostPerUnit,
      sewingCostPerUnit,
      otherCostPerUnit,
      actualCostPerUnit,
      deductionPerUnit: deduction,
      specificationPricePerUnit,
      materialsWithoutPriceHistory,
    };
  }

  private async findLastPurchasePrice(companyId: string, materialId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ unitPrice: purchaseOrderItems.unitPrice })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
      .where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrderItems.materialId, materialId)))
      .orderBy(desc(purchaseOrders.orderedAt))
      .limit(1);
    return row ? Number(row.unitPrice) : null;
  }

  private async findMaterialType(materialId: string): Promise<string> {
    const [row] = await this.db.select({ type: materials.type }).from(materials).where(eq(materials.id, materialId)).limit(1);
    return row?.type ?? "trim";
  }

  private async findMaterialName(materialId: string): Promise<string> {
    const [row] = await this.db.select({ name: materials.name }).from(materials).where(eq(materials.id, materialId)).limit(1);
    return row?.name ?? materialId;
  }
}
