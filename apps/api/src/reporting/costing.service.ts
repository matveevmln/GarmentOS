import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { materials, purchaseOrderItems, purchaseOrders, type Database } from "@garmentos/db-schema";
import type { ProductionOrderMaterialNorm, SpecificationPricingResponseDto } from "@garmentos/shared-types";
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

  // Снимает нормы расхода модели вместе с ценой и валютой каждого материала
  // на текущий момент (Pilot v1, этап 4). Вызывается один раз — при
  // подтверждении заказа, результат замораживается в снимке партии и больше
  // не пересчитывается: изменение карточки модели не должно менять уже
  // созданную партию.
  //
  // Отдельный метод, а не расширение computeSpecificationPricing: тот считает
  // деньги и суммирует статьи, здесь же нужны сами нормы построчно, включая
  // материалы без истории закупок — их нельзя пропустить, потребность в
  // ткани по ним всё равно считается.
  async captureMaterialNorms(companyId: string, productId: string): Promise<ProductionOrderMaterialNorm[]> {
    const bom = await this.bomService.getApproved(companyId, { productId });
    if (!bom) return [];

    const norms: ProductionOrderMaterialNorm[] = [];
    for (const item of bom.items) {
      const material = await this.findMaterial(item.materialId);
      const price = await this.findLastPurchase(companyId, item.materialId);
      norms.push({
        materialId: item.materialId,
        materialName: material?.name ?? item.materialId,
        materialType: material?.type ?? "trim",
        unit: material?.unit ?? "",
        quantityPerUnit: Number(item.quantityPerUnit),
        wastePercent: Number(item.wastePercent),
        lastPurchasePrice: price?.unitPrice ?? null,
        priceCurrency: price?.currency ?? null,
      });
    }
    return norms;
  }

  async findApprovedBomVersion(companyId: string, productId: string): Promise<number | null> {
    const bom = await this.bomService.getApproved(companyId, { productId });
    return bom ? bom.version : null;
  }

  private async findLastPurchasePrice(companyId: string, materialId: string): Promise<number | null> {
    const row = await this.findLastPurchase(companyId, materialId);
    return row ? row.unitPrice : null;
  }

  // Последняя закупочная цена вместе с валютой закупки. Валюта берётся из
  // самой закупки, а не выводится из типа материала: вывод был бы скрытым
  // правилом, которое молча сломается на первой упаковке за доллары.
  private async findLastPurchase(
    companyId: string,
    materialId: string,
  ): Promise<{ unitPrice: number; currency: string | null } | null> {
    const [row] = await this.db
      .select({ unitPrice: purchaseOrderItems.unitPrice, currency: purchaseOrders.currency })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
      .where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrderItems.materialId, materialId)))
      .orderBy(desc(purchaseOrders.orderedAt))
      .limit(1);
    return row ? { unitPrice: Number(row.unitPrice), currency: row.currency } : null;
  }

  private async findMaterial(materialId: string): Promise<{ name: string; type: string; unit: string } | null> {
    const [row] = await this.db
      .select({ name: materials.name, type: materials.type, unit: materials.unit })
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1);
    return row ?? null;
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
