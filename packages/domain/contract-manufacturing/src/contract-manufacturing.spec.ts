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
import { createDb, productionOrders as productionOrdersTable, type DbOrTx } from "@garmentos/db-schema";
import { sql } from "drizzle-orm";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { createMaterial, DrizzleMaterialRepository } from "@garmentos/domain-procurement";
import { describe, expect, it } from "vitest";
import { confirmProductionOrder } from "./application/confirm-production-order";
import { createProductionOrderDraft } from "./application/create-production-order";
import { createWorkshop } from "./application/create-workshop";
import type { BomApprovalPort } from "./application/ports";
import { captureProductionOrderCostSnapshot } from "./application/capture-production-order-cost-snapshot";
import { receiveProductionOrder } from "./application/receive-production-order";
import { updateProductionOrderStatus } from "./application/update-production-order-status";
import { updateProductionOrderStatusFromWorkshop } from "./application/update-production-order-status-from-workshop";
import { DomainError } from "./domain/errors";
import { assertSourceOrderIsNotSelf } from "./domain/production-order";
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

  it("обновляет статус самого свежего активного заказа цеха по простому текстовому ответу (Telegram, Итерация 7)", async () => {
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
          variants: [{ productVariantId: variant.id, quantity: 100 }],
        },
      );
      await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id });

      const inProgress = await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "in_progress" },
      );
      expect(inProgress.id).toBe(draft.id);
      expect(inProgress.status).toBe("in_progress");

      const readyForPickup = await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "ready_for_pickup" },
      );
      expect(readyForPickup.status).toBe("ready_for_pickup");

      // "в работе" после "готово к отгрузке" — недопустимый откат назад.
      await expect(
        updateProductionOrderStatusFromWorkshop(
          { productionOrders },
          { companyId: company.id, workshopId: workshop.id, status: "in_progress" },
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  it("принимает партию (received) только из статуса 'готово к отгрузке', устанавливая receivedAt", async () => {
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
          variants: [{ productVariantId: variant.id, quantity: 100 }],
        },
      );

      // Нельзя принять черновик.
      await expect(
        receiveProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id }),
      ).rejects.toThrow(/готово к отгрузке/);

      await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id });
      await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "in_progress" },
      );

      // Нельзя принять заказ "в работе" — только "готово к отгрузке".
      await expect(
        receiveProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id }),
      ).rejects.toThrow(DomainError);

      await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "ready_for_pickup" },
      );

      const received = await receiveProductionOrder(
        { productionOrders },
        { companyId: company.id, productionOrderId: draft.id },
      );
      expect(received.status).toBe("received");
      expect(received.receivedAt).not.toBeNull();

      // Повторная приёмка уже принятой партии запрещена.
      await expect(
        receiveProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id }),
      ).rejects.toThrow(DomainError);
    });
  });

  // P0-1 (владелец проекта, 2026-09-07): "ordered ≠ received" — фактическое
  // количество может отличаться от планового в любую сторону, план при этом
  // остаётся неизменным.
  it("принимает партию по фактическому количеству, отличному от планового, не изменяя план", async () => {
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
          plannedQuantity: 4000,
          agreedUnitPrice: 450,
          variants: [{ productVariantId: variant.id, quantity: 4000 }],
        },
      );
      await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id });
      await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "in_progress" },
      );
      await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "ready_for_pickup" },
      );

      const received = await receiveProductionOrder(
        { productionOrders },
        {
          companyId: company.id,
          productionOrderId: draft.id,
          receivedVariants: [{ productVariantId: variant.id, quantity: 3993 }],
        },
      );

      const receivedVariant = received.variants.find((v) => v.productVariantId === variant.id);
      expect(receivedVariant?.quantity).toBe("4000.000"); // план не изменился
      expect(Number(receivedVariant?.receivedQuantity)).toBe(3993); // факт хранится отдельно
    });
  });

  it("отклоняет отрицательное фактическое количество и variantId не из этого заказа", async () => {
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
          variants: [{ productVariantId: variant.id, quantity: 100 }],
        },
      );
      await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id });
      await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "in_progress" },
      );
      await updateProductionOrderStatusFromWorkshop(
        { productionOrders },
        { companyId: company.id, workshopId: workshop.id, status: "ready_for_pickup" },
      );

      await expect(
        receiveProductionOrder(
          { productionOrders },
          {
            companyId: company.id,
            productionOrderId: draft.id,
            receivedVariants: [{ productVariantId: variant.id, quantity: -1 }],
          },
        ),
      ).rejects.toThrow(/отрицательным/);

      await expect(
        receiveProductionOrder(
          { productionOrders },
          {
            companyId: company.id,
            productionOrderId: draft.id,
            receivedVariants: [{ productVariantId: "00000000-0000-4000-8000-000000000000", quantity: 10 }],
          },
        ),
      ).rejects.toThrow(/не относится к этому заказу/);
    });
  });

  it("бросает ошибку, если у цеха нет ни одного активного заказа", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд без заказов" });
      const workshops = new DrizzleWorkshopRepository(tx);
      const workshop = await createWorkshop({ workshops }, { companyId: company.id, name: "Цех без заказов" });
      const productionOrders = new DrizzleProductionOrderRepository(tx);

      await expect(
        updateProductionOrderStatusFromWorkshop(
          { productionOrders },
          { companyId: company.id, workshopId: workshop.id, status: "in_progress" },
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // REST-путь смены статуса (P0-1) — по конкретному id заказа, не по "самому
  // свежему заказу цеха". Переиспользует тот же инвариант перехода, что и
  // Telegram-путь выше (assertCanUpdateStatusFromWorkshop), поэтому здесь
  // проверяется только адресация по id и обёртка ошибок, не сами правила
  // переходов — они уже покрыты тестом выше.
  describe("updateProductionOrderStatus (REST, по id заказа)", () => {
    it("разрешает placed → in_progress → ready_for_pickup по конкретному заказу", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } =
          await seedApprovedBomAndVariant(tx);
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
            variants: [{ productVariantId: variant.id, quantity: 100 }],
          },
        );
        await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id });

        const inProgress = await updateProductionOrderStatus(
          { productionOrders },
          { companyId: company.id, productionOrderId: draft.id, status: "in_progress" },
        );
        expect(inProgress.id).toBe(draft.id);
        expect(inProgress.status).toBe("in_progress");

        const readyForPickup = await updateProductionOrderStatus(
          { productionOrders },
          { companyId: company.id, productionOrderId: draft.id, status: "ready_for_pickup" },
        );
        expect(readyForPickup.status).toBe("ready_for_pickup");
      });
    });

    it("бросает ошибку на недопустимый переход (черновик не подтверждён)", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } =
          await seedApprovedBomAndVariant(tx);
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
            variants: [{ productVariantId: variant.id, quantity: 100 }],
          },
        );

        // Заказ ещё "draft" (не подтверждён) — переход в "в работе" запрещён.
        await expect(
          updateProductionOrderStatus(
            { productionOrders },
            { companyId: company.id, productionOrderId: draft.id, status: "in_progress" },
          ),
        ).rejects.toThrow(DomainError);
      });
    });

    it("бросает PRODUCTION_ORDER_NOT_FOUND на неизвестный id заказа", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const company = await createCompany(
          { companies: new DrizzleCompanyRepository(tx) },
          { name: "Бренд без заказа" },
        );
        const productionOrders = new DrizzleProductionOrderRepository(tx);

        await expect(
          updateProductionOrderStatus(
            { productionOrders },
            {
              companyId: company.id,
              productionOrderId: "00000000-0000-0000-0000-000000000000",
              status: "in_progress",
            },
          ),
        ).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
      });
    });

    it("не трогает другой, более свежий заказ того же цеха", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } =
          await seedApprovedBomAndVariant(tx);
        const productionOrders = new DrizzleProductionOrderRepository(tx);
        const bomApproval = makeBomApprovalPort(boms);

        const first = await createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: approvedBom.id,
            workshopId: workshop.id,
            plannedQuantity: 100,
            agreedUnitPrice: 450,
            variants: [{ productVariantId: variant.id, quantity: 100 }],
          },
        );
        const second = await createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: approvedBom.id,
            workshopId: workshop.id,
            plannedQuantity: 50,
            agreedUnitPrice: 450,
            variants: [{ productVariantId: variant.id, quantity: 50 }],
          },
        );
        await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: first.id });
        await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: second.id });

        // Меняем статус именно первого (более старого) заказа — второй,
        // более свежий заказ того же цеха, не должен пострадать. Это ровно
        // то отличие от updateProductionOrderStatusFromWorkshop (которая
        // всегда берёт "последний активный заказ цеха"), ради которого этот
        // use case адресуется по id, а не по цеху.
        const updated = await updateProductionOrderStatus(
          { productionOrders },
          { companyId: company.id, productionOrderId: first.id, status: "in_progress" },
        );
        expect(updated.id).toBe(first.id);
        expect(updated.status).toBe("in_progress");

        const untouched = await productionOrders.findById(company.id, second.id);
        expect(untouched?.status).toBe("placed");
      });
    });
  });

  // P1-1 (владелец проекта, 2026-09-05) — снимок партии неизменяем не только
  // по конвенции: повторная запись через доменный use case теперь запрещена
  // явно, а не только "предполагается, что не будет".
  describe("captureProductionOrderCostSnapshot (P1-1, неизменяемость снимка)", () => {
    it("фиксирует снимок один раз и бросает ошибку на повторную попытку", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } =
          await seedApprovedBomAndVariant(tx);
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
            variants: [{ productVariantId: variant.id, quantity: 100 }],
          },
        );
        await confirmProductionOrder({ productionOrders }, { companyId: company.id, productionOrderId: draft.id });

        const withSnapshot = await captureProductionOrderCostSnapshot(
          { productionOrders },
          { companyId: company.id, productionOrderId: draft.id, costSnapshot: { materialNorms: [{ quantityPerUnit: 2.6 }] } },
        );
        expect(withSnapshot.costSnapshot).toEqual({ materialNorms: [{ quantityPerUnit: 2.6 }] });

        // Повторная попытка — даже с другими данными — запрещена: снимок
        // уже есть, перезаписывать его нельзя.
        await expect(
          captureProductionOrderCostSnapshot(
            { productionOrders },
            { companyId: company.id, productionOrderId: draft.id, costSnapshot: { materialNorms: [{ quantityPerUnit: 2.4 }] } },
          ),
        ).rejects.toMatchObject({ code: "PRODUCTION_ORDER_COST_SNAPSHOT_ALREADY_SET" });

        // Снимок остался прежним — попытка его не тронула.
        const reloaded = await productionOrders.findById(company.id, draft.id);
        expect(reloaded?.costSnapshot).toEqual({ materialNorms: [{ quantityPerUnit: 2.6 }] });
      });
    });

    it("бросает PRODUCTION_ORDER_NOT_FOUND на неизвестный заказ", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const company = await createCompany(
          { companies: new DrizzleCompanyRepository(tx) },
          { name: "Бренд без заказа (снимок)" },
        );
        const productionOrders = new DrizzleProductionOrderRepository(tx);

        await expect(
          captureProductionOrderCostSnapshot(
            { productionOrders },
            {
              companyId: company.id,
              productionOrderId: "00000000-0000-0000-0000-000000000000",
              costSnapshot: {},
            },
          ),
        ).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
      });
    });
  });

  // P5-1 (владелец проекта, 2026-09-06): rework строками существующей модели
  // production_orders/production_order_variants, без production_batches и
  // без нового статуса. Здесь проверяется только доменная основа — не
  // рабочий процесс "создать следующий заказ" целиком (P5-2).
  describe("REWORK (P5-1)", () => {
    // Чистая функция, не задействованная в обычном пути createProductionOrderDraft
    // (id нового заказа не существует до INSERT, поэтому self-reference там
    // структурно недостижим) — но инвариант явно требуется заданием и должен
    // остаться проверяемым напрямую, а не полагаться только на DB CHECK.
    it("assertSourceOrderIsNotSelf: заказ не может быть источником переделки для самого себя", () => {
      expect(() => assertSourceOrderIsNotSelf("order-1", "order-1")).toThrow(DomainError);
      expect(() => assertSourceOrderIsNotSelf("order-1", "order-2")).not.toThrow();
      expect(() => assertSourceOrderIsNotSelf("order-1", null)).not.toThrow();
    });

    it("создаёт заказ, где часть строк — rework (цена 0) со ссылкой на заказ-источник, а часть — обычные новые строки", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } = await seedApprovedBomAndVariant(tx);
        const productionOrders = new DrizzleProductionOrderRepository(tx);
        const bomApproval = makeBomApprovalPort(boms);

        const sourceOrder = await createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: approvedBom.id,
            workshopId: workshop.id,
            plannedQuantity: 100,
            agreedUnitPrice: 450,
            variants: [{ productVariantId: variant.id, quantity: 100 }],
          },
        );

        // Смешанный заказ: 4 шт. rework (бесплатно, брак из sourceOrder) + 20
        // шт. нового оплачиваемого объёма — ровно пример из задания владельца.
        const mixedOrder = await createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: approvedBom.id,
            workshopId: workshop.id,
            plannedQuantity: 24,
            agreedUnitPrice: 450,
            sourceProductionOrderId: sourceOrder.id,
            variants: [
              { productVariantId: variant.id, quantity: 4, variantType: "rework", unitPrice: 0 },
              { productVariantId: variant.id, quantity: 20, variantType: "new" },
            ],
          },
        );

        expect(mixedOrder.sourceProductionOrderId).toBe(sourceOrder.id);
        const rework = mixedOrder.variants.find((v) => v.variantType === "rework");
        const fresh = mixedOrder.variants.find((v) => v.variantType === "new");
        expect(rework?.unitPrice).toBe("0.00");
        expect(fresh?.unitPrice).toBeNull();

        // Заказ-источник не затронут: его снимок/статус/варианты не менялись.
        const reloadedSource = await productionOrders.findById(company.id, sourceOrder.id);
        expect(reloadedSource?.status).toBe("draft");
        expect(reloadedSource?.variants).toHaveLength(1);
      });
    });

    it("отклоняет rework-строку с ненулевой ценой", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } = await seedApprovedBomAndVariant(tx);
        const productionOrders = new DrizzleProductionOrderRepository(tx);
        const bomApproval = makeBomApprovalPort(boms);

        const sourceOrder = await createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: approvedBom.id,
            workshopId: workshop.id,
            plannedQuantity: 100,
            agreedUnitPrice: 450,
            variants: [{ productVariantId: variant.id, quantity: 100 }],
          },
        );

        await expect(
          createProductionOrderDraft(
            { productionOrders, workshops, bomApproval },
            {
              companyId: company.id,
              productId: product.id,
              bomId: approvedBom.id,
              workshopId: workshop.id,
              plannedQuantity: 4,
              agreedUnitPrice: 450,
              sourceProductionOrderId: sourceOrder.id,
              variants: [{ productVariantId: variant.id, quantity: 4, variantType: "rework", unitPrice: 300 }],
            },
          ),
        ).rejects.toMatchObject({ code: "PRODUCTION_ORDER_REWORK_PRICE_NOT_ZERO" });
      });
    });

    it("отклоняет rework-строку без указания заказа-источника", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } = await seedApprovedBomAndVariant(tx);
        const productionOrders = new DrizzleProductionOrderRepository(tx);
        const bomApproval = makeBomApprovalPort(boms);

        await expect(
          createProductionOrderDraft(
            { productionOrders, workshops, bomApproval },
            {
              companyId: company.id,
              productId: product.id,
              bomId: approvedBom.id,
              workshopId: workshop.id,
              plannedQuantity: 4,
              agreedUnitPrice: 450,
              variants: [{ productVariantId: variant.id, quantity: 4, variantType: "rework", unitPrice: 0 }],
            },
          ),
        ).rejects.toMatchObject({ code: "PRODUCTION_ORDER_REWORK_REQUIRES_SOURCE" });
      });
    });

    it("отклоняет заказ, ссылающийся на несуществующий заказ-источник", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, workshops, workshop } = await seedApprovedBomAndVariant(tx);
        const approvedBom = boms;
        const productionOrders = new DrizzleProductionOrderRepository(tx);
        const bomApproval = makeBomApprovalPort(approvedBom);

        const approved = await getApprovedBom({ boms: approvedBom }, { companyId: company.id, productId: product.id });

        await expect(
          createProductionOrderDraft(
            { productionOrders, workshops, bomApproval },
            {
              companyId: company.id,
              productId: product.id,
              bomId: approved!.id,
              workshopId: workshop.id,
              plannedQuantity: 4,
              agreedUnitPrice: 450,
              sourceProductionOrderId: "00000000-0000-0000-0000-000000000000",
              variants: [{ productVariantId: variant.id, quantity: 4, variantType: "rework", unitPrice: 0 }],
            },
          ),
        ).rejects.toMatchObject({ code: "PRODUCTION_ORDER_SOURCE_NOT_FOUND" });
      });
    });

    // Проверка реального DB CHECK (миграция 0022) — обходит domain-слой
    // намеренно: self-reference структурно недостижим через обычный путь
    // создания (id ещё не существует на момент валидации черновика), поэтому
    // единственный способ убедиться, что constraint в БД реально работает —
    // прямой SQL UPDATE поверх уже вставленной строки.
    it("DB CHECK production_orders_source_not_self_check отклоняет self-reference на уровне БД", async () => {
      await runInRolledBackTransaction(async (tx) => {
        const { company, product, variant, boms, approvedBom, workshops, workshop } = await seedApprovedBomAndVariant(tx);
        const productionOrders = new DrizzleProductionOrderRepository(tx);
        const bomApproval = makeBomApprovalPort(boms);

        const order = await createProductionOrderDraft(
          { productionOrders, workshops, bomApproval },
          {
            companyId: company.id,
            productId: product.id,
            bomId: approvedBom.id,
            workshopId: workshop.id,
            plannedQuantity: 10,
            agreedUnitPrice: 450,
            variants: [{ productVariantId: variant.id, quantity: 10 }],
          },
        );

        let caught: unknown;
        try {
          await tx.execute(
            sql`update ${productionOrdersTable} set source_production_order_id = ${order.id} where id = ${order.id}`,
          );
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeDefined();
        const cause = caught instanceof Error && caught.cause instanceof Error ? caught.cause : caught;
        expect(String(cause)).toMatch(/production_orders_source_not_self_check/);
      });
    });
  });
});
