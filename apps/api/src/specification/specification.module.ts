import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleSpecificationRepository } from "@garmentos/domain-specification";
import { BomModule } from "../bom/bom.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DocumentModule } from "../document/document.module";
import { IdentityModule } from "../identity/identity.module";
import { ReportingModule } from "../reporting/reporting.module";
import { DATABASE_CONNECTION } from "../database/database.module";
import {
  SpecificationProductLookupAdapter,
  SpecificationProductVariantLookupAdapter,
  SpecificationWorkshopLookupAdapter,
} from "./lookup-adapters";
import { SpecificationsController } from "./specifications.controller";
import {
  SPECIFICATION_PRODUCT_PORT,
  SPECIFICATION_PRODUCT_VARIANT_PORT,
  SPECIFICATION_REPOSITORY,
  SPECIFICATION_WORKSHOP_PORT,
} from "./specification.tokens";
import { SpecificationService } from "./specification.service";

// Спецификация — самостоятельная бизнес-сущность (владелец проекта,
// 2026-09-11 — «Production Master»), первый шаг производства. Читает
// Workshop/Product/ProductVariant только через узкие порты
// (docs/PRINCIPLES.md, принцип 2) — адаптеры оборачивают уже существующие
// сервисы, не заводят параллельный доступ к чужим таблицам.
@Module({
  imports: [ContractManufacturingModule, CatalogModule, IdentityModule, DocumentModule, ReportingModule, BomModule],
  controllers: [SpecificationsController],
  providers: [
    SpecificationService,
    SpecificationWorkshopLookupAdapter,
    SpecificationProductLookupAdapter,
    SpecificationProductVariantLookupAdapter,
    {
      provide: SPECIFICATION_REPOSITORY,
      useFactory: (db: Database) => new DrizzleSpecificationRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    { provide: SPECIFICATION_WORKSHOP_PORT, useExisting: SpecificationWorkshopLookupAdapter },
    { provide: SPECIFICATION_PRODUCT_PORT, useExisting: SpecificationProductLookupAdapter },
    { provide: SPECIFICATION_PRODUCT_VARIANT_PORT, useExisting: SpecificationProductVariantLookupAdapter },
  ],
  exports: [SpecificationService],
})
export class SpecificationModule {}
