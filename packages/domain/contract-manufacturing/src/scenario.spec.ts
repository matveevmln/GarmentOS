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
import { createCompany, createUser, DrizzleCompanyRepository, DrizzleUserRepository } from "@garmentos/domain-identity";
import {
  confirmPurchaseOrder,
  createMaterial,
  createPurchaseOrderDraft,
  createSupplier,
  DrizzleMaterialRepository,
  DrizzlePurchaseOrderRepository,
  DrizzleSupplierRepository,
} from "@garmentos/domain-procurement";
import { describe, expect, it } from "vitest";
import { confirmProductionOrder } from "./application/confirm-production-order";
import { createProductionOrderDraft } from "./application/create-production-order";
import { createWorkshop } from "./application/create-workshop";
import type { BomApprovalPort } from "./application/ports";
import { DrizzleProductionOrderRepository, DrizzleWorkshopRepository } from "./infrastructure/drizzle-contract-manufacturing-repository";

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

function makeBomApprovalPort(boms: BomRepository): BomApprovalPort {
  return {
    async isBomApproved(companyId, bomId, productId) {
      const approved = await getApprovedBom({ boms }, { companyId, productId });
      return approved?.id === bomId;
    },
  };
}

// Сквозной сценарий Итерации 3 (docs/ROADMAP.md): «от модели до заказа в цех
// через Universal Inbox», реальный бизнес-сценарий владельца GarmentOS —
// бренд одежды, размещающий пошив в независимых подрядных цехах и продающий
// через Wildberries. Каждый шаг explicit помечен, кто его вызывает — человек
// через будущий apps/api (Итерация 4) или AI-классификатор Inbox (Итерация 9)
// — и в обоих случаях это ОДИН И ТОТ ЖЕ use case (docs/PRINCIPLES.md,
// принцип 15, AI-First: «AI работает через те же интерфейсы, что и человек»).
// Реального Telegram-бота/LLM-классификатора здесь нет (это Итерация 9) —
// сценарий доказывает, что домен уже поддерживает draft-first цепочку,
// которую Inbox будет вызывать без каких-либо изменений в этом коде.
describe("сквозной сценарий: от модели до заказа в цех", () => {
  it("создаёт компанию, коллекцию, модель, SKU, закупку ткани, BOM и заказ пошива через draft→confirm", async () => {
    await runInRolledBackTransaction(async (tx) => {
      // Шаг 0 — Identity: компания и её первый пользователь (владелец бизнеса).
      // Выполняется один раз при онбординге, человеком через apps/api.
      const company = await createCompany(
        { companies: new DrizzleCompanyRepository(tx) },
        { name: "ООО Петроль Studio", defaultCurrency: "RUB" },
      );
      const owner = await createUser(
        { users: new DrizzleUserRepository(tx) },
        {
          companyId: company.id,
          email: "owner@petrolstudio.ru",
          passwordHash: "argon2-hash-placeholder",
          fullName: "Алексей Богданов",
        },
      );

      // Шаг 1 — Catalog: коллекция «Осень 2026» и модель «Худи Петроль» с
      // двумя SKU (M/Петроль, L/Петроль). Человек создаёт модель заранее —
      // до того, как появятся закупки и заказы в цех.
      const collections = new DrizzleCollectionRepository(tx);
      const collection = await createCollection(
        { collections },
        { companyId: company.id, name: "Осень 2026", season: "autumn", year: 2026, createdBy: owner.id },
      );

      const products = new DrizzleProductRepository(tx);
      const product = await createProduct(
        { products },
        {
          companyId: company.id,
          collectionId: collection.id,
          name: "Худи Петроль",
          code: "HOODIE-PETROL-2026",
          category: "hoodie",
          createdBy: owner.id,
        },
      );

      const productVariants = new DrizzleProductVariantRepository(tx);
      const variantM = await createProductVariant(
        { productVariants },
        { productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-2026-M", createdBy: owner.id },
      );
      const variantL = await createProductVariant(
        { productVariants },
        { productId: product.id, size: "L", color: "Петроль", skuCode: "HOODIE-PETROL-2026-L", createdBy: owner.id },
      );

      // Шаг 2 — Materials & Procurement: поставщик ткани прислал в Telegram
      // счёт на оксфорд 280 — ИМИТАЦИЯ INBOX: AI распознаёт инвойс и создаёт
      // ЧЕРНОВИК закупки (createPurchaseOrderDraft — тот же use case, что
      // вызвал бы человек вручную, см. docs/INBOX_ARCHITECTURE.md, раздел 3).
      const suppliers = new DrizzleSupplierRepository(tx);
      const fabricSupplier = await createSupplier(
        { suppliers },
        { companyId: company.id, name: "Оксфорд Текстиль", type: "fabric", createdBy: owner.id },
      );

      const materials = new DrizzleMaterialRepository(tx);
      const fabric = await createMaterial(
        { materials },
        { companyId: company.id, name: "Оксфорд 280", type: "fabric", unit: "m", createdBy: owner.id },
      );

      const purchaseOrders = new DrizzlePurchaseOrderRepository(tx);
      // ← AI (Inbox): создаёт черновик из распознанного инвойса, ничего не подтверждая сам.
      const purchaseOrderDraft = await createPurchaseOrderDraft(
        { purchaseOrders, suppliers },
        {
          companyId: company.id,
          supplierId: fabricSupplier.id,
          items: [{ materialId: fabric.id, quantity: 250, unitPrice: 340 }],
          expectedDate: "2026-08-15",
          createdBy: owner.id,
        },
      );
      expect(purchaseOrderDraft.status).toBe("draft");

      // ← Человек: одним нажатием в Telegram-боте подтверждает черновик закупки.
      const purchaseOrderConfirmed = await confirmPurchaseOrder(
        { purchaseOrders },
        { companyId: company.id, purchaseOrderId: purchaseOrderDraft.id },
      );
      expect(purchaseOrderConfirmed.status).toBe("sent");

      // Шаг 3 — BOM: технолог указывает норму расхода ткани на единицу модели
      // и утверждает спецификацию. Без этого шага заказ в цех невозможен
      // (следующий шаг это проверит).
      const boms = new DrizzleBomRepository(tx);
      const bomDraft = await createBomDraft(
        { boms },
        {
          companyId: company.id,
          productId: product.id,
          items: [{ materialId: fabric.id, quantityPerUnit: 1.15, wastePercent: 4 }],
          createdBy: owner.id,
        },
      );
      const approvedBom = await approveBom({ boms }, { companyId: company.id, bomId: bomDraft.id });
      expect(approvedBom.status).toBe("approved");

      // Шаг 4 — Contract Manufacturing: цех прислал в Telegram голосовое
      // «готовы взять 150 худи Петроль по 450 рублей за штуку, 100 M и 50 L» —
      // ИМИТАЦИЯ INBOX: распознавание речи → классификатор → черновик заказа
      // пошива (createProductionOrderDraft). Тот же use case проверяет
      // ключевой инвариант Итерации 3: approved BOM обязателен.
      const workshops = new DrizzleWorkshopRepository(tx);
      const workshop = await createWorkshop(
        { workshops },
        { companyId: company.id, name: "Цех №1 (Иваново)", specialization: "трикотаж", createdBy: owner.id },
      );

      const productionOrders = new DrizzleProductionOrderRepository(tx);
      const bomApproval = makeBomApprovalPort(boms);

      // ← AI (Inbox): голосовое цеха → черновик заказа пошива.
      const productionOrderDraft = await createProductionOrderDraft(
        { productionOrders, workshops, bomApproval },
        {
          companyId: company.id,
          productId: product.id,
          bomId: approvedBom.id,
          workshopId: workshop.id,
          plannedQuantity: 150,
          agreedUnitPrice: 450,
          dueDate: "2026-09-10",
          createdBy: owner.id,
          variants: [
            { productVariantId: variantM.id, quantity: 100 },
            { productVariantId: variantL.id, quantity: 50 },
          ],
        },
      );
      expect(productionOrderDraft.status).toBe("draft");
      expect(productionOrderDraft.variants).toHaveLength(2);

      // ← Человек: подтверждает предложение Inbox одним нажатием — заказ
      // становится реально размещённым у цеха.
      const productionOrderConfirmed = await confirmProductionOrder(
        { productionOrders },
        { companyId: company.id, productionOrderId: productionOrderDraft.id },
      );
      expect(productionOrderConfirmed.status).toBe("placed");
      expect(productionOrderConfirmed.bomId).toBe(approvedBom.id);
      expect(productionOrderConfirmed.workshopId).toBe(workshop.id);

      // Финальная проверка сквозного сценария: заказ пошива ссылается ровно
      // на ту модель, тот approved BOM и те SKU, что были созданы в начале —
      // цепочка «модель → закупка ткани → BOM → заказ в цех» целостна.
      const finalOrder = await productionOrders.findById(company.id, productionOrderConfirmed.id);
      expect(finalOrder?.productId).toBe(product.id);
      expect(finalOrder?.variants.map((v) => v.productVariantId).sort()).toEqual(
        [variantM.id, variantL.id].sort(),
      );
    });
  });
});
