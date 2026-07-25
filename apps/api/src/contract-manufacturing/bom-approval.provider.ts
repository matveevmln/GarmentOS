import type { Provider } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleBomRepository, getApprovedBom } from "@garmentos/domain-bom";
import type { BomApprovalPort } from "@garmentos/domain-contract-manufacturing";
import { DATABASE_CONNECTION } from "../database/database.module";
import { BOM_APPROVAL_PORT } from "./contract-manufacturing.tokens";

// Единственный явный синхронный межмодульный порт Итерации 3
// (docs/ARCHITECTURE_SELF_REVIEW.md, раздел 11) — Contract Manufacturing
// проверяет через него инвариант "нельзя разместить заказ пошива без
// утверждённого BOM", не читая таблицу boms напрямую. Реализация здесь
// использует настоящий getApprovedBom из @garmentos/domain-bom — тот же
// адаптер, что и в scenario.spec.ts на уровне доменных пакетов, теперь
// подключённый через DI apps/api вместо ручной сборки в тесте.
export const bomApprovalProvider: Provider = {
  provide: BOM_APPROVAL_PORT,
  useFactory: (db: Database): BomApprovalPort => {
    const boms = new DrizzleBomRepository(db);
    return {
      async isBomApproved(companyId, bomId, productId) {
        const approved = await getApprovedBom({ boms }, { companyId, productId });
        return approved?.id === bomId;
      },
    };
  },
  inject: [DATABASE_CONNECTION],
};
