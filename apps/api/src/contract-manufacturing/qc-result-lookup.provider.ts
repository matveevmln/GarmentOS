import type { Provider } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleQcResultRepository } from "@garmentos/domain-qc";
import type { QcResultLookupPort } from "@garmentos/domain-contract-manufacturing";
import { DATABASE_CONNECTION } from "../database/database.module";
import { QC_RESULT_LOOKUP_PORT } from "./contract-manufacturing.tokens";

// Тот же паттерн, что bom-approval.provider.ts (docs/PRINCIPLES.md, принцип
// 2) — нужен ТОЛЬКО rollbackProductionOrderStatus (ПРОМПТ №2.1/№3, раздел
// 9), чтобы запретить откат статуса, для которого уже зафиксирован
// результат ОТК. Реализован через прямой DrizzleQcResultRepository, а не
// через QcModule/QcService — QcModule уже импортирует ContractManufacturingModule
// (порт в обратную сторону, ContractManufacturingLookupAdapter), обратный
// импорт создал бы цикл модулей NestJS.
export const qcResultLookupProvider: Provider = {
  provide: QC_RESULT_LOOKUP_PORT,
  useFactory: (db: Database): QcResultLookupPort => {
    const qcResults = new DrizzleQcResultRepository(db);
    return {
      async hasResultForOrder(companyId, productionOrderId) {
        const result = await qcResults.findByProductionOrder(companyId, productionOrderId);
        return result !== null;
      },
    };
  },
  inject: [DATABASE_CONNECTION],
};
