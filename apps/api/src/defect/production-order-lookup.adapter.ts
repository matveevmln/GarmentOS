import { Injectable } from "@nestjs/common";
import type { ProductionOrderInfo, ProductionOrderLookupPort } from "@garmentos/domain-defect";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";

// Адаптер порта: брак/компенсация не читают таблицу заказов напрямую
// (docs/PRINCIPLES.md, принцип 2) — узнают только id/sourceProductionOrderId/
// variants(id, productVariantId, variantType), ничего больше.
@Injectable()
export class DefectProductionOrderLookupAdapter implements ProductionOrderLookupPort {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  async findById(companyId: string, id: string): Promise<ProductionOrderInfo | null> {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, id);
    if (!order) return null;
    return {
      id: order.id,
      sourceProductionOrderId: order.sourceProductionOrderId,
      variants: order.variants.map((variant) => ({
        id: variant.id,
        productVariantId: variant.productVariantId,
        variantType: variant.variantType,
      })),
    };
  }
}
