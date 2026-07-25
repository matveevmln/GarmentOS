import { config } from "dotenv";

config({ path: "../../../.env" });

import {
  createCollection,
  createProduct,
  createProductVariant,
  DrizzleCollectionRepository,
  DrizzleProductRepository,
  DrizzleProductVariantRepository,
} from "@garmentos/domain-catalog";
import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { createInvoice } from "./application/create-invoice";
import { recordCostEntry } from "./application/record-cost-entry";
import { recordTransaction } from "./application/record-transaction";
import { cancelInvoice, issueInvoice, markInvoicePaid } from "./application/transition-invoice-status";
import { DomainError } from "./domain/errors";
import { DrizzleCostEntryRepository, DrizzleInvoiceRepository, DrizzleTransactionRepository } from "./infrastructure/drizzle-finance-repository";

class RollbackTestTransaction extends Error {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

async function runInRolledBackTransaction(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new RollbackTestTransaction();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollbackTestTransaction)) throw error;
    });
}

async function seedVariant(tx: DbOrTx) {
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд финансов" });
  const collections = new DrizzleCollectionRepository(tx);
  const collection = await createCollection({ collections }, { companyId: company.id, name: "Осень 2026" });
  const products = new DrizzleProductRepository(tx);
  const product = await createProduct(
    { products },
    { companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL" },
  );
  const productVariants = new DrizzleProductVariantRepository(tx);
  const variant = await createProductVariant(
    { productVariants },
    { productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-M" },
  );
  return { company, variant };
}

describe("domain/finance", () => {
  it("считает себестоимость SKU, проводит движение денег и счёт draft→issued→paid", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);

      const costEntries = new DrizzleCostEntryRepository(tx);
      const cost = await recordCostEntry(
        { costEntries },
        { companyId: company.id, productVariantId: variant.id, materialCost: 850, manufacturingCost: 450, logisticsCost: 60 },
      );
      expect(cost.materialCost).toBe("850.00");
      expect(cost.overheadCost).toBe("0.00");

      const transactions = new DrizzleTransactionRepository(tx);
      const transaction = await recordTransaction(
        { transactions },
        { companyId: company.id, type: "income", amount: 5980, referenceType: "order" },
      );
      expect(transaction.type).toBe("income");

      const invoices = new DrizzleInvoiceRepository(tx);
      const invoice = await createInvoice({ invoices }, { companyId: company.id, amount: 5980 });
      expect(invoice.status).toBe("draft");

      const issued = await issueInvoice({ invoices }, { companyId: company.id, invoiceId: invoice.id });
      expect(issued.status).toBe("issued");

      const paid = await markInvoicePaid({ invoices }, { companyId: company.id, invoiceId: invoice.id });
      expect(paid.status).toBe("paid");

      // Из paid нет разрешённых переходов.
      await expect(cancelInvoice({ invoices }, { companyId: company.id, invoiceId: invoice.id })).rejects.toThrow(
        DomainError,
      );
    });
  });

  it("отклоняет отрицательные компоненты себестоимости и неположительную сумму движения денег", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);
      const costEntries = new DrizzleCostEntryRepository(tx);
      const transactions = new DrizzleTransactionRepository(tx);

      await expect(
        recordCostEntry(
          { costEntries },
          { companyId: company.id, productVariantId: variant.id, materialCost: -1, manufacturingCost: 450 },
        ),
      ).rejects.toThrow(DomainError);

      await expect(
        recordTransaction({ transactions }, { companyId: company.id, type: "expense", amount: 0 }),
      ).rejects.toThrow(DomainError);
    });
  });
});
