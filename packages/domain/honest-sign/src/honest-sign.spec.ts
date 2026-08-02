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
import { issueMarkingCode } from "./application/issue-marking-code";
import { applyMarkingCode, introduceMarkingCode, retireMarkingCode } from "./application/transition-marking-code";
import { DomainError } from "./domain/errors";
import { DrizzleMarkingCodeRepository } from "./infrastructure/drizzle-honest-sign-repository";

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
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд Честного Знака" });
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

describe("domain/honest-sign", () => {
  it("проводит код маркировки по легальному циклу issued→applied→introduced→sold", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);
      const markingCodes = new DrizzleMarkingCodeRepository(tx);

      const code = await issueMarkingCode(
        { markingCodes },
        { companyId: company.id, productVariantId: variant.id, codeValue: "010460...21ABCD" },
      );
      expect(code.status).toBe("issued");

      const applied = await applyMarkingCode({ markingCodes }, { companyId: company.id, markingCodeId: code.id });
      expect(applied.status).toBe("applied");

      const introduced = await introduceMarkingCode({ markingCodes }, { companyId: company.id, markingCodeId: code.id });
      expect(introduced.status).toBe("introduced");

      const sold = await retireMarkingCode(
        { markingCodes },
        { companyId: company.id, markingCodeId: code.id, reason: "sold", referenceType: "order" },
      );
      expect(sold.status).toBe("sold");

      // Терминальный статус — дальнейшие переходы запрещены.
      await expect(
        applyMarkingCode({ markingCodes }, { companyId: company.id, markingCodeId: code.id }),
      ).rejects.toThrow(DomainError);
    });
  });

  it("запрещает пропуск шагов (issued сразу в introduced) и повторную выдачу того же кода", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);
      const markingCodes = new DrizzleMarkingCodeRepository(tx);

      const code = await issueMarkingCode(
        { markingCodes },
        { companyId: company.id, productVariantId: variant.id, codeValue: "010460...21EFGH" },
      );

      await expect(
        introduceMarkingCode({ markingCodes }, { companyId: company.id, markingCodeId: code.id }),
      ).rejects.toThrow(/Недопустимый переход/);

      await expect(
        issueMarkingCode({ markingCodes }, { companyId: company.id, productVariantId: variant.id, codeValue: "010460...21EFGH" }),
      ).rejects.toThrow(/уже выпущен/);
    });
  });
});
