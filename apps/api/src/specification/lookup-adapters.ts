import { Injectable } from "@nestjs/common";
import type { ProductLookupPort, ProductVariantLookupPort, WorkshopLookupPort } from "@garmentos/domain-specification";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { CatalogService } from "../catalog/catalog.service";

// Адаптеры портов Specification в чужие доменные модули (docs/PRINCIPLES.md,
// принцип 2) — @garmentos/domain-specification не зависит рантаймом ни от
// @garmentos/domain-contract-manufacturing, ни от @garmentos/domain-catalog;
// эти классы — единственное место, где такая зависимость появляется, и
// только на уровне apps/api (тот же паттерн, что QcProductionOrderLookupAdapter
// и BomApprovalPort в contract-manufacturing.module.ts).
@Injectable()
export class SpecificationWorkshopLookupAdapter implements WorkshopLookupPort {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  async findById(companyId: string, workshopId: string): Promise<{ id: string } | null> {
    const workshop = await this.contractManufacturingService.findWorkshopById(companyId, workshopId);
    return workshop ? { id: workshop.id } : null;
  }

  reserveNextSpecificationNumber(workshopId: string): Promise<number> {
    return this.contractManufacturingService.reserveNextSpecificationNumber(workshopId);
  }
}

@Injectable()
export class SpecificationProductLookupAdapter implements ProductLookupPort {
  constructor(private readonly catalogService: CatalogService) {}

  async findById(companyId: string, productId: string): Promise<{ id: string } | null> {
    const product = await this.catalogService.findProductById(companyId, productId);
    return product ? { id: product.id } : null;
  }
}

@Injectable()
export class SpecificationProductVariantLookupAdapter implements ProductVariantLookupPort {
  constructor(private readonly catalogService: CatalogService) {}

  async findById(companyId: string, productVariantId: string): Promise<{ id: string; productId: string } | null> {
    const variant = await this.catalogService.findProductVariantById(companyId, productVariantId);
    return variant ? { id: variant.id, productId: variant.productId } : null;
  }
}
