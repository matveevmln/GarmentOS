import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleCostEntryRepository, DrizzleInvoiceRepository, DrizzleTransactionRepository } from "@garmentos/domain-finance";
import { DATABASE_CONNECTION } from "../database/database.module";
import { CostEntriesController } from "./cost-entries.controller";
import { TransactionsController } from "./transactions.controller";
import { InvoicesController } from "./invoices.controller";
import { COST_ENTRY_REPOSITORY, INVOICE_REPOSITORY, TRANSACTION_REPOSITORY } from "./finance.tokens";
import { FinanceService } from "./finance.service";

@Module({
  controllers: [CostEntriesController, TransactionsController, InvoicesController],
  providers: [
    FinanceService,
    {
      provide: COST_ENTRY_REPOSITORY,
      useFactory: (db: Database) => new DrizzleCostEntryRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: TRANSACTION_REPOSITORY,
      useFactory: (db: Database) => new DrizzleTransactionRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: INVOICE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleInvoiceRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class FinanceModule {}
