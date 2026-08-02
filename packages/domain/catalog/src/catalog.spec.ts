import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import {
  createCompany,
  createUser,
  DrizzleCompanyRepository,
  DrizzleUserRepository,
} from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { createCollection } from "./application/create-collection";
import { createProduct } from "./application/create-product";
import { createProductVariant } from "./application/create-product-variant";
import { DomainError } from "./domain/errors";
import {
  DrizzleCollectionRepository,
  DrizzleProductRepository,
  DrizzleProductVariantRepository,
} from "./infrastructure/drizzle-catalog-repository";

// Тот же паттерн интеграционного теста на реальном Postgres, что и в
// domain/identity: своя транзакция на тест, откатывается в конце.
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

async function seedCompany(tx: DbOrTx) {
  const companies = new DrizzleCompanyRepository(tx);
  return createCompany({ companies }, { name: "ИП Основатель GarmentOS" });
}

describe("domain/catalog", () => {
  it("создаёт коллекцию, модель и SKU, соблюдая инварианты уникальности", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await seedCompany(tx);

      const collections = new DrizzleCollectionRepository(tx);
      const collection = await createCollection(
        { collections },
        { companyId: company.id, name: "Осень 2026", season: "autumn", year: 2026 },
      );
      expect(collection.status).toBe("planning");

      const products = new DrizzleProductRepository(tx);
      const product = await createProduct(
        { products },
        { companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL" },
      );
      expect(product.status).toBe("draft");

      const productVariants = new DrizzleProductVariantRepository(tx);
      const variant = await createProductVariant(
        { productVariants },
        { productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-M-PETROL" },
      );
      expect(variant.productId).toBe(product.id);

      // Дубликат кода модели в той же компании запрещён.
      await expect(
        createProduct(
          { products },
          { companyId: company.id, name: "Другое название", code: "HOODIE-PETROL" },
        ),
      ).rejects.toThrow(DomainError);

      // Дубликат (размер, цвет) для той же модели запрещён.
      await expect(
        createProductVariant(
          { productVariants },
          { productId: product.id, size: "M", color: "Петроль", skuCode: "ДРУГОЙ-КОД" },
        ),
      ).rejects.toThrow(/уже есть SKU/);

      // Дубликат кода SKU глобально запрещён, даже для другого размера/цвета.
      const otherProduct = await createProduct(
        { products },
        { companyId: company.id, name: "Куртка Норд", code: "JACKET-NORD" },
      );
      await expect(
        createProductVariant(
          { productVariants },
          { productId: otherProduct.id, size: "L", color: "Чёрный", skuCode: "HOODIE-PETROL-M-PETROL" },
        ),
      ).rejects.toThrow(/SKU с кодом/);
    });
  });

  it("отклоняет создание пользователя и коллекции с пустыми названиями", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const usersRepo = new DrizzleUserRepository(tx);
      const company = await seedCompany(tx);
      // createUser — из @garmentos/domain-identity, бросает СВОЙ класс
      // DomainError (другой модуль) — здесь проверяем только сообщение,
      // а не instanceof, чтобы не путать ошибки разных bounded context'ов.
      await expect(
        createUser({ users: usersRepo }, { companyId: company.id, email: "не-email", passwordHash: "h", fullName: "Тест" }),
      ).rejects.toThrow(/Некорректный email/);

      const collections = new DrizzleCollectionRepository(tx);
      await expect(createCollection({ collections }, { companyId: company.id, name: "   " })).rejects.toThrow(
        DomainError,
      );
    });
  });
});
