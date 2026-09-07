import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCollection, createProduct, DrizzleCollectionRepository, DrizzleProductRepository } from "@garmentos/domain-catalog";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { createMaterial, DrizzleMaterialRepository } from "@garmentos/domain-procurement";
import { describe, expect, it } from "vitest";
import { approveBom } from "./application/approve-bom";
import { createBomDraft } from "./application/create-bom";
import { getApprovedBom } from "./application/get-approved-bom";
import { DomainError } from "./domain/errors";
import { DrizzleBomRepository } from "./infrastructure/drizzle-bom-repository";

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

async function seedProduct(tx: DbOrTx) {
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд BOM-теста" });
  const collections = new DrizzleCollectionRepository(tx);
  const collection = await createCollection({ collections }, { companyId: company.id, name: "Осень 2026" });
  const products = new DrizzleProductRepository(tx);
  const product = await createProduct(
    { products },
    { companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL" },
  );
  const materials = new DrizzleMaterialRepository(tx);
  const material = await createMaterial(
    { materials },
    { companyId: company.id, name: "Оксфорд 280", type: "fabric", unit: "m" },
  );
  return { company, product, material };
}

describe("domain/bom", () => {
  it("создаёт черновик BOM, утверждает его и находит через getApprovedBom", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, product, material } = await seedProduct(tx);
      const boms = new DrizzleBomRepository(tx);

      const before = await getApprovedBom({ boms }, { companyId: company.id, productId: product.id });
      expect(before).toBeNull();

      const draft = await createBomDraft(
        { boms },
        { companyId: company.id, productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1.2, wastePercent: 5 }] },
      );
      expect(draft.status).toBe("draft");
      expect(draft.version).toBe(1);

      const stillNone = await getApprovedBom({ boms }, { companyId: company.id, productId: product.id });
      expect(stillNone).toBeNull();

      const approved = await approveBom({ boms }, { companyId: company.id, bomId: draft.id });
      expect(approved.status).toBe("approved");

      const found = await getApprovedBom({ boms }, { companyId: company.id, productId: product.id });
      expect(found?.id).toBe(draft.id);

      // Повторное утверждение уже утверждённого BOM запрещено.
      await expect(approveBom({ boms }, { companyId: company.id, bomId: draft.id })).rejects.toThrow(DomainError);

      // Новая версия BOM для той же модели получает следующий номер версии.
      const secondDraft = await createBomDraft(
        { boms },
        { companyId: company.id, productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1.3 }] },
      );
      expect(secondDraft.version).toBe(2);
    });
  });

  // P1-1 (владелец проекта, 2026-09-05) — не должно быть неоднозначности
  // "какая версия действует": в отличие от теста выше (approve второй раз
  // того же BOM запрещён), здесь approve НОВОЙ версии — обязан архивировать
  // старую approved, а не оставлять их обе approved одновременно.
  it("утверждение новой версии BOM архивирует прежнюю approved-версию той же модели", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, product, material } = await seedProduct(tx);
      const boms = new DrizzleBomRepository(tx);

      const v1 = await createBomDraft(
        { boms },
        { companyId: company.id, productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 2.6 }] },
      );
      const approvedV1 = await approveBom({ boms }, { companyId: company.id, bomId: v1.id });
      expect(approvedV1.status).toBe("approved");

      const v2 = await createBomDraft(
        { boms },
        { companyId: company.id, productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 2.4 }] },
      );
      const approvedV2 = await approveBom({ boms }, { companyId: company.id, bomId: v2.id });
      expect(approvedV2.status).toBe("approved");

      // v1 больше не approved — иначе findLatestApproved мог бы стать
      // неоднозначным при равенстве условий сортировки.
      const reloadedV1 = await boms.findById(company.id, v1.id);
      expect(reloadedV1?.status).toBe("archived");

      const found = await getApprovedBom({ boms }, { companyId: company.id, productId: product.id });
      expect(found?.id).toBe(v2.id);

      // Ровно одна approved-версия — не две.
      const all = await boms.listByProduct(company.id, product.id);
      expect(all.filter((bom) => bom.status === "approved")).toHaveLength(1);
    });
  });

  it("отклоняет BOM без позиций материалов", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, product } = await seedProduct(tx);
      const boms = new DrizzleBomRepository(tx);

      await expect(createBomDraft({ boms }, { companyId: company.id, productId: product.id, items: [] })).rejects.toThrow(
        DomainError,
      );
    });
  });
});
