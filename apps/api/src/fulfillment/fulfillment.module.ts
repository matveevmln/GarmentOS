import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DocumentModule } from "../document/document.module";
import { QcModule } from "../qc/qc.module";
import { SpecificationModule } from "../specification/specification.module";
import { FulfillmentController } from "./fulfillment.controller";
import { FulfillmentService } from "./fulfillment.service";

// Read-model поверх ContractManufacturing/Catalog/Qc/Document/Specification —
// не заводит собственных таблиц (ПРОМПТ №3, раздел 10).
@Module({
  imports: [ContractManufacturingModule, CatalogModule, QcModule, DocumentModule, SpecificationModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService],
})
export class FulfillmentModule {}
