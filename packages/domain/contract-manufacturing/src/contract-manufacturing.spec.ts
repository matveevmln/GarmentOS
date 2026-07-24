import { config } from "dotenv";

config({ path: "../../../.env" });

import { approveBom, createBomDraft, DrizzleBomRepository, getApprovedBom, type BomRepository } from "@garmentos/domain-bom";
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
import { createMaterial, DrizzleMaterialRepository } from "@garmentos/domain-procurement";
import { describe, expect, it } from "vitest";
import { confirmProductionOrder } from "./application/confirm-production-order";
import { createProductionOrderDraft } from "./application/create-production-order";
import { createWorkshop } from "./application/create-workshop";
import type { BomApprovalPort } from "./application/ports";
import { DomainError } from "./domain/errors";
import {
  DrizzleProductionOrderRepository,
  DrizzleWorkshopRepository,
} from "./infrastructure/drizzle-contract-manufacturing-repository";

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

// Адаптер BomApprovalPort поверх настоящего getApprovedBom из @garmentos/domain-bom
// — именно так composition root (здесь: тест) связывает Contract Manufacturing
// с модулем BOM через application service, а не через таблицу boms напрямую
// (docs/PRINCIPLES.md, принцип 2; ARCHITECTURE.md, «Правило межмодульного
// взаимодействия»).
function makeBomApprovalPort(boms: BomRepository): BomApprovalPort {
  return {
    async isBomApproved(companyId, bomId, productId) {
      const approved = await getApprovedBom({ boms }, { companyId, productId });
      return approved?.id === bomId;
    },
  };
}

async function seedApprovedBomAndVariant(tx: DbOrTx) {
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд заказа в цех" });

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
    { productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-M-PETROL" },
  );

  const materials = new DrizzleMaterialRepository(tx);
  const material = await createMaterial(
    { materials },
    { companyId: company.id, name: "Оксфорд 280", type: "fabric", unit: "m" },
  );

  const boms = new DrizzleBomRepository(tx);
  const draftBom = await createBomDraft(
    { boms },
    { companyId: company.id, productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1.2 }] },
  );
  const approvedBom = await approveBom({ boms }, { companyId: company.id, bomId: draftBom.id });

  const workshops = new DrizzleWorkshopRepository(tx);
  const workshop = await createWorkshop({ workshops }, { companyId: company.id, name: "Цех №1" });

  return { company, product, variant, boms, approvedBom, workshops, workshop };
}

describe("domain/contract-manufacturing", () => {
  it("проходит полный сценарий: модель -> approved BOM -> черновик заказа в цех -> подтверждение", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, product, variant, boms, approvedBom, workshops, workshop } = await seedApprovedBomAndVariant(tx);

      const productionOrders = new DrizzleProductionOrderRepository(tx);
      const bomApproval = makeBomApprovalPort(boms);

      const draft = await createProductionOrderDraft(
        { productionOrders, workshops, bomApproval },
        {
          companyId: company.id,
          productId: product.id,
          bomId: approvedBom.id,
          workshopId: workshop.id,
          plannedQuantity: 100,
          agreedUnitPrice: 450,
          dueDate: "2026-09-01",
          variants: [{ productVariantId: variant.id, quantity: 100 }],
        },
      );
      expect(draft.status).toBe("draft");
      expect(draft.variants).toHaveLength(1);

      const confirmed = await confirmProductionOrder(
        { productionOrders },
        { companyId: company.id, productionOrderId: draft.id },
      );
      expect(confirmed.status).toBe("placed");

      // Повторное подтверждение уже размещённого заказа запрещено.
      await expect(
        confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id }),
      ).rejects.toThrow(DomainError);
    });
  });

  it("отклоняет заказ пошива, если BOM ещё не утверждён (draft)", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд без approved BOM" });
      const collections = new DrizzleCollectionRepository(tx);
      const collection = await createCollection({ collections }, { companyId: company.id, name: "Весна 2027" });
      const products = new DrizzleProductRepository(tx);
      const product = await createProduct(
        { products },
        { companyId: company.id, collectionId: collection.id, name: "Куртка Норд", code: "JACKET-NORD" },
      );
      const productVariants = new DrizzleProductVariantRepository(tx);
      const variant = await createProductVariant(
        { productVariants },
        { productId: product.id, size: "L", color: "Чёрный", skuCode: "JACKET-NORD-L-BLACK" },
      );
      const materials = new DrizzleMaterialRepository(tx);
      const material = await createMaterial(
        { materials },
        { companyId: company.id, name: "Мембрана 3L", type: "fabric", unit: "m" },
      );
      const boms = new DrizzleBomRepository(tx);
      const draftBom = await createBomDraft(
        { boms },
        { companyId: company.id, productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 2 }] },
      );
      const workshops = new DrizzleWorkshopRepository(tx);
      const workshop = await createWorkshop({ workshops }, { companyId: company.id, name: "Цех №2" });
      const productionOrders = new DrizzleProductionOrderRepository(tx);
      const bomApproval = makeBomApprovalPort(boms);

      await expect(
        createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: draftBom.id,
            workshopId: workshop.id,
            plannedQuantity: 50,
            agreedUnitPrice: 600,
            variants: [{ productVariantId: variant.id, quantity: 50 }],
          },
        ),
      ).rejects.toThrow(/не утверждён/);
    });
  });
});
