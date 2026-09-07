import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { materials, purchaseOrderItems, purchaseOrders, type Database } from "@garmentos/db-schema";
import type { ProductionOrderMaterialNorm, SpecificationPricingResponseDto } from "@garmentos/shared-types";
import { and, desc, eq } from "drizzle-orm";
import { BomService } from "../bom/bom.service";
import { CatalogService } from "../catalog/catalog.service";
import { DATABASE_CONNECTION } from "../database/database.module";

const DEFAULT_DEDUCTION = 175;
// Запасное значение валюты пошива/прочих расходов ТОЛЬКО для карточек модели,
// заведённых до появления собственных полей валюты (P1, hardening перед
// «Стеганкой», владелец проекта, 2026-09-07) — миграция 0024 проставляет то
// же самое значение существующим строкам явно, здесь оно нужно только как
// дополнительная подстраховка на случай null. Новые значения ВСЕГДА несут
// свою явную валюту (product.standardSewingCostCurrency/otherProductionCostCurrency).
const LEGACY_SEWING_AND_OTHER_CURRENCY = "RUB";

type MaterialCategory = "fabric" | "trim" | "packaging";

// Результат сведения одной категории материалов (ткань/фурнитура/упаковка) к
// одному числу (P1, hardening перед «Стеганкой», владелец проекта,
// 2026-09-07): раньше материалы одной категории суммировались в одно число
// независимо от валюты закупки каждого — если в BOM окажется, например, два
// разных материала-"ткани", один в USD и один в RUB, получившееся число не
// имеет экономического смысла ("150 USD/RUB"). total/currency — null, если
// внутри категории встретилось больше одной ИЗВЕСТНОЙ валюты закупки;
// позиции без указанной валюты (закупки, заведённые до появления этого поля)
// не считаются конфликтом и по-прежнему складываются в сумму как раньше.
interface CategoryCostResult {
  total: number | null;
  currency: string | null;
  mixedCurrencies: string[];
}

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

    const materialsWithoutPriceHistory: string[] = [];
    // По категории — своя карта currency→сумма (P1, hardening перед
    // «Стеганкой»): позиции без указанной валюты закупки складываются в
    // отдельный "неизвестный" накопитель категории — они не создают
    // конфликта (как и раньше), но и не помогают определить валюту категории.
    const categoryCostsByCurrency: Record<MaterialCategory, Map<string, number>> = {
      fabric: new Map(),
      trim: new Map(),
      packaging: new Map(),
    };
    const categoryCostsUnknownCurrency: Record<MaterialCategory, number> = { fabric: 0, trim: 0, packaging: 0 };
    // Материалы по валюте закупки (P0-2, владелец проекта, 2026-09-07) —
    // тот же принцип, что уже применялся к потребности материалов на партию
    // (BatchPassportPage.tsx, requirementTotals): суммы в разных валютах
    // никогда не складываются в одно число, только отдельно по каждой
    // валюте (docs/PRINCIPLES.md, принцип 21). Эта карта — по ВСЕМ материалам
    // сразу (не по категориям), используется только для показа разбивки
    // "Материалы, X за ед." в UI — независимо от того, посчиталась ли
    // отдельная категория одним числом.
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
      const category: MaterialCategory =
        materialType === "fabric" ? "fabric" : materialType === "packaging" ? "packaging" : "trim";

      if (lastPurchase.currency !== null) {
        const byCurrency = categoryCostsByCurrency[category];
        byCurrency.set(lastPurchase.currency, (byCurrency.get(lastPurchase.currency) ?? 0) + cost);
        materialCostsByCurrency.set(lastPurchase.currency, (materialCostsByCurrency.get(lastPurchase.currency) ?? 0) + cost);
      } else {
        // Валюта закупки материала — nullable у закупок, заведённых до
        // появления этого поля (см. purchase_orders.currency); такую сумму
        // нельзя честно отнести ни к одной валюте, но и запрещать расчёт
        // категории из-за одной старой закупки без валюты избыточно — сумма
        // просто прибавляется к категории отдельно от валютного учёта, тот
        // же принцип терпимости, что уже был здесь раньше.
        categoryCostsUnknownCurrency[category] += cost;
      }
    }

    // Категория "чиста" (может быть выражена одним числом), если среди её
    // материалов не больше одной ИЗВЕСТНОЙ валюты закупки. Две и более
    // известных валюты внутри одной категории — total/currency становятся
    // null (P1: "150 USD/RUB" не имеет смысла), это отдельно от общего
    // мультивалютного предупреждения ниже.
    const resolveCategory = (category: MaterialCategory): CategoryCostResult => {
      const byCurrency = categoryCostsByCurrency[category];
      const distinctCurrencies = [...byCurrency.keys()];
      if (distinctCurrencies.length > 1) {
        return { total: null, currency: null, mixedCurrencies: distinctCurrencies };
      }
      const currency = distinctCurrencies[0] ?? null;
      const knownTotal = currency !== null ? (byCurrency.get(currency) ?? 0) : 0;
      return { total: knownTotal + categoryCostsUnknownCurrency[category], currency, mixedCurrencies: [] };
    };

    const fabric = resolveCategory("fabric");
    const trim = resolveCategory("trim");
    const packaging = resolveCategory("packaging");

    const sewingCostPerUnit = product.standardSewingCost !== null ? Number(product.standardSewingCost) : 0;
    const otherCostPerUnit = product.otherProductionCost !== null ? Number(product.otherProductionCost) : 0;
    // Валюта каждой суммы — своя (P1, hardening перед «Стеганкой», владелец
    // проекта, 2026-09-07): раньше обе жёстко считались в RUB, из-за чего
    // услугу вроде стёжки (реально в KGS) нельзя было завести, не смешав
    // валюты молча. LEGACY_SEWING_AND_OTHER_CURRENCY — подстраховка только
    // для карточек, заведённых до появления этого поля (миграция 0024 уже
    // проставляет им явное значение).
    const sewingCostCurrency = product.standardSewingCostCurrency ?? LEGACY_SEWING_AND_OTHER_CURRENCY;
    const otherCostCurrency = product.otherProductionCostCurrency ?? LEGACY_SEWING_AND_OTHER_CURRENCY;

    let actualCostPerUnit: number | null = null;
    let actualCostCurrency: string | null = null;
    let currencyWarning: string | null = null;

    const mixedCategoryLabels: string[] = [];
    if (fabric.mixedCurrencies.length > 0) mixedCategoryLabels.push(`ткань — ${fabric.mixedCurrencies.join(", ")}`);
    if (trim.mixedCurrencies.length > 0) mixedCategoryLabels.push(`фурнитура — ${trim.mixedCurrencies.join(", ")}`);
    if (packaging.mixedCurrencies.length > 0) mixedCategoryLabels.push(`упаковка — ${packaging.mixedCurrencies.join(", ")}`);

    if (mixedCategoryLabels.length > 0) {
      // Внутри одной категории материалов больше одной известной валюты —
      // сама категория (не только итог) не может быть выражена одним числом,
      // поэтому дальше даже не сравниваем валюты между категориями.
      currencyWarning = `Итоговая себестоимость не рассчитана: внутри одной категории материалов несколько валют закупки (${mixedCategoryLabels.join("; ")}).`;
    } else {
      // Итог считается ОДНИМ числом только тогда, когда это арифметически
      // честно: у всех ненулевых компонентов (категории материалов, пошив,
      // прочие расходы) — ровно одна и та же валюта. Иначе единого числа не
      // существует, показывать его нельзя (принцип 21: "число, которое
      // выглядит как единая себестоимость, если компоненты в разных
      // валютах" — запрещено).
      const componentCurrencies = new Set<string>();
      for (const category of [fabric, trim, packaging]) {
        if (category.total !== null && category.total !== 0 && category.currency !== null) {
          componentCurrencies.add(category.currency);
        }
      }
      if (sewingCostPerUnit > 0) componentCurrencies.add(sewingCostCurrency);
      if (otherCostPerUnit > 0) componentCurrencies.add(otherCostCurrency);

      if (componentCurrencies.size > 1) {
        currencyWarning = `Итоговая себестоимость не рассчитана: компоненты в разных валютах (${[...componentCurrencies].join(", ")}).`;
      } else {
        actualCostPerUnit = (fabric.total ?? 0) + (trim.total ?? 0) + (packaging.total ?? 0) + sewingCostPerUnit + otherCostPerUnit;
        const [onlyCurrency] = componentCurrencies;
        actualCostCurrency = onlyCurrency ?? LEGACY_SEWING_AND_OTHER_CURRENCY;
      }
    }
    const specificationPricePerUnit = actualCostPerUnit !== null ? Math.max(0, actualCostPerUnit - deduction) : null;

    return {
      fabricCostPerUnit: fabric.total,
      trimCostPerUnit: trim.total,
      packagingCostPerUnit: packaging.total,
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
