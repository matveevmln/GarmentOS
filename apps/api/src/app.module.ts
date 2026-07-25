import { Module } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { DomainExceptionFilter } from "./common/domain-exception.filter";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { CatalogModule } from "./catalog/catalog.module";
import { ProcurementModule } from "./procurement/procurement.module";
import { BomModule } from "./bom/bom.module";

// Presentation-слой (docs/ARCHITECTURE.md, п.2). Доменные модули
// (packages/domain/*) подключаются сюда по мере реализации итераций
// Фазы 1 — этот файл не должен содержать бизнес-логики.
@Module({
  imports: [DatabaseModule, HealthModule, IdentityModule, CatalogModule, ProcurementModule, BomModule],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
