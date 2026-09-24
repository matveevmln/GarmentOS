import type { Provider } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleCompanyRepository } from "@garmentos/domain-identity";
import type { CompanyNumberingPort } from "@garmentos/domain-contract-manufacturing";
import { DATABASE_CONNECTION } from "../database/database.module";
import { COMPANY_NUMBERING_PORT } from "./contract-manufacturing.tokens";

// ACL-порт в Identity (ADR 0002, «Штаб партии v1») — тот же принцип, что
// bomApprovalProvider рядом: Contract Manufacturing не зависит от
// domain-identity в рантайме (только devDependency для тестов).
// companies.next_sewing_order_number резервируется атомарным
// UPDATE...RETURNING на уровне одной строки — как и reserveNextProductionOrderNumber/
// reserveNextSpecificationNumber, этот вызов не участвует в общей
// db.transaction размещения заказа: пропуск номера при откате остальной
// операции — обычный и допустимый пробел счётчика (гарантируется только
// уникальность фактически размещённых номеров, не их непрерывность).
export const companyNumberingProvider: Provider = {
  provide: COMPANY_NUMBERING_PORT,
  useFactory: (db: Database): CompanyNumberingPort => {
    const companies = new DrizzleCompanyRepository(db);
    return {
      reserveNextSewingOrderNumber: (companyId) => companies.reserveNextSewingOrderNumber(companyId),
    };
  },
  inject: [DATABASE_CONNECTION],
};
