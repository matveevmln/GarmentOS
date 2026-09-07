import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { materials, purchaseOrderItems, purchaseOrders, type Database } from "@garmentos/db-schema";
import type { ProductionOrderMaterialNorm, SpecificationPricingResponseDto } from "@garmentos/shared-types";
import { and, desc, eq } from "drizzle-orm";
import { BomService } from "../bom/bom.service";
import { CatalogService } from "../catalog/catalog.service";
import { DATABASE_CONNECTION } from "../database/database.module";

const DEFAULT_DEDUCTION = 175;
// Пошив и «прочие расходы» договорно всегда в рублях (docs/PRINCIPLES.md,
// принцип 21) — у product.standardSewingCost/otherProductionCost нет
// собственного поля валюты, потому что оно не требуется бизнес-правилом.
const SEWING_AND_OTHER_CURRENCY = "RUB";

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
    // Материалы по валюте закупки (P0-2, владелец проекта, 2026-09-07) —
    // тот же принцип, что уже применялся к потребности материалов на партию
    // (BatchPassportPage.tsx, requirementTotals): суммы в разных валютах
    // никогда не складываются в одно число, только отдельно по каждой
    // валюте (docs/PRINCIPLES.md, принцип 21).
    const materialCostsByCurrency = new Map<string, number>();

    for (const item of bom.items) {
      const lastPurchase = await this.findLastPurchase(companyId, item.materialId);
      const consumption = Number(item.quantityPerUnit) * (1 + Number(item.wastePercent) / 100);
      if (lastPurchase === null) {
        const material = await this.findMaterialName(item.materialId);
        materialsWithoutPriceHistory.push(material);
        continue;
      }
      const cost = consumption * lastPurchase.unitPrice;
      const materialType = await this.findMaterialType(item.materialId);
      if (materialType === "fabric") fabricCostPerUnit += cost;
      else if (materialType === "packaging") packagingCostPerUnit += cost;
      else trimCostPerUnit += cost;

      // Валюта закупки материала — nullable у закупок, заведённых до
      // появления этого поля (см. purchase_orders.currency); такую сумму
      // нельзя честно отнести ни к одной валюте, поэтому не участвует ни в
      // одном ведре — тот же принцип, что materialsWithoutPriceHistory.
      if (lastPurchase.currency !== null) {
        materialCostsByCurrency.set(lastPurchase.currency, (materialCostsByCurrency.get(lastPurchase.currency) ?? 0) + cost);
      }
    }

    const sewingCostPerUnit = product.standardSewingCost !== null ? Number(product.standardSewingCost) : 0;
    const otherCostPerUnit = product.otherProductionCost !== null ? Number(product.otherProductionCost) : 0;

    // Итог считается ОДНИМ числом только тогда, когда это арифметически
    // честно: материалы куплены ровно в одной валюте, и она совпадает с
    // валютой пошива/прочих расходов (RUB). Во всех остальных случаях —
    // материалы в другой валюте, материалы в нескольких валютах сразу —
    // единого числа не существует, показывать его нельзя (задание P0-2
    // прямо запрещает "число, которое выглядит как единая себестоимость,
    // если компоненты в разных валютах").
    const distinctMaterialCurrencies = [...materialCostsByCurrency.keys()];
    const hasSewingOrOtherCost = sewingCostPerUnit > 0 || otherCostPerUnit > 0;
    let actualCostPerUnit: number | null = null;
    let actualCostCurrency: string | null = null;
    let currencyWarning: string | null = null;

    if (distinctMaterialCurrencies.length > 1) {
      currencyWarning = `Итоговая себестоимость не рассчитана: материалы куплены в разных валютах (${distinctMaterialCurrencies.join(", ")}).`;
    } else if (distinctMaterialCurrencies.length === 1 && distinctMaterialCurrencies[0] !== SEWING_AND_OTHER_CURRENCY && hasSewingOrOtherCost) {
      currencyWarning = `Итоговая себестоимость не рассчитана: материалы — ${distinctMaterialCurrencies[0]}, пошив и прочие расходы — ${SEWING_AND_OTHER_CURRENCY}.`;
    } else {
      actualCostPerUnit = fabricCostPerUnit + trimCostPerUnit + packagingCostPerUnit + sewingCostPerUnit + otherCostPerUnit;
      actualCostCurrency = SEWING_AND_OTHER_CURRENCY;
    }
    const specificationPricePerUnit = actualCostPerUnit !== null ? Math.max(0, actualCostPerUnit - deduction) : null;

    return {
      fabricCostPerUnit,
      trimCostPerUnit,
      packagingCostPerUnit,
      sewingCostPerUnit,
      otherCostPerUnit,
      materialCostsByCurrency: [...materialCostsByCurrency.entries()].map(([currency, amountPerUnit]) => ({
        currency,
        amountPerUnit,
      })),
      actualCostPerUnit,
      actualCostCurrency,
      currencyWarning,
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
