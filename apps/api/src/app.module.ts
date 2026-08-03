import { Module } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { AuditModule } from "./audit/audit.module";
import { DomainExceptionFilter } from "./common/domain-exception.filter";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { ProcurementModule } from "./procurement/procurement.module";
import { BomModule } from "./bom/bom.module";
import { ContractManufacturingModule } from "./contract-manufacturing/contract-manufacturing.module";
import { WarehouseModule } from "./warehouse/warehouse.module";
import { SalesModule } from "./sales/sales.module";
import { MarketplaceIntegrationModule } from "./marketplace-integration/marketplace-integration.module";
import { HonestSignModule } from "./honest-sign/honest-sign.module";
import { FinanceModule } from "./finance/finance.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { TelegramModule } from "./telegram/telegram.module";
import { AiProductionAssistantModule } from "./ai-production-assistant/ai-production-assistant.module";
import { DocumentModule } from "./document/document.module";
import { ReportingModule } from "./reporting/reporting.module";

// Presentation-слой (docs/ARCHITECTURE.md, п.2). Доменные модули
// (packages/domain/*) подключаются сюда по мере реализации итераций
// Фазы 1 — этот файл не должен содержать бизнес-логики.
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    HealthModule,
    IdentityModule,
    AuthModule,
    CatalogModule,
    ProcurementModule,
    BomModule,
    ContractManufacturingModule,
    WarehouseModule,
    SalesModule,
    MarketplaceIntegrationModule,
    HonestSignModule,
    FinanceModule,
    NotificationsModule,
    TelegramModule,
    DocumentModule,
    AiProductionAssistantModule,
    ReportingModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
