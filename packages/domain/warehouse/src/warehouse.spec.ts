import { config } from "dotenv";

config({ path: "../../../.env" });

import {
  createCollection,
  createProduct,
  createProductVariant,
  DrizzleCollectionRepository,
  DrizzleProductRepository,
  DrizzleProductVariantRepository,
  type ProductVariantRepository,
} from "@garmentos/domain-catalog";
import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createWorkshop, DrizzleWorkshopRepository } from "@garmentos/domain-contract-manufacturing";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { completeInventoryCount } from "./application/complete-inventory-count";
import { createInventoryCount } from "./application/create-inventory-count";
import { createShipment } from "./application/create-shipment";
import { createWarehouse } from "./application/create-warehouse";
import { dispatchShipment } from "./application/dispatch-shipment";
import { dispatchStock } from "./application/dispatch-stock";
import { markShipmentDelivered } from "./application/mark-shipment-delivered";
import { receiveStock } from "./application/receive-stock";
import { recordInventoryCountItem } from "./application/record-inventory-count-item";
import { releaseReservation, reserveStock } from "./application/reservation";
import { transferStock } from "./application/transfer-stock";
import { DomainError } from "./domain/errors";
import type { ProductVariantOwnershipPort } from "./application/ports";
import { DrizzleInventoryCountRepository } from "./infrastructure/drizzle-inventory-count-repository";
import { DrizzleShipmentRepository } from "./infrastructure/drizzle-shipment-repository";
import { DrizzleStockRepository, DrizzleWarehouseRepository } from "./infrastructure/drizzle-warehouse-repository";

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

// Реализация ACL-порта для тестов — то же самое, что apps/api делает через
// CatalogService (SEC-P1, владелец проекта, 2026-09-24): domain-warehouse не
// зависит от domain-catalog в рантайме, только в devDependency для тестов.
function ownershipPort(productVariants: ProductVariantRepository): ProductVariantOwnershipPort {
  return {
    belongsToCompany: async (companyId, productVariantId) =>
      (await productVariants.findById(companyId, productVariantId)) !== null,
  };
}

async function seedVariant(tx: DbOrTx) {
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд склада" });
  const collections = new DrizzleCollectionRepository(tx);
  const collection = await createCollection({ collections }, { companyId: company.id, name: "Осень 2026" });
  const products = new DrizzleProductRepository(tx);
  const product = await createProduct(
    { products },
    { companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL" },
  );
  const productVariants = new DrizzleProductVariantRepository(tx);
  const variant = await createProductVariant(
    { productVariants, products },
    { companyId: company.id, productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-M" },
  );
  return { company, variant };
}

describe("domain/warehouse", () => {
  it("проходит полный цикл: приёмка на WIP-складе цеха → резерв → отгрузка на склад продаж → инвентаризация", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);

      const workshops = new DrizzleWorkshopRepository(tx);
      const workshop = await createWorkshop({ workshops }, { companyId: company.id, name: "Цех №1" });

      const warehouses = new DrizzleWarehouseRepository(tx);
      const workshopWarehouse = await createWarehouse(
        { warehouses },
        { companyId: company.id, name: "WIP Цех №1", type: "workshop", workshopId: workshop.id },
      );
      const salesWarehouse = await createWarehouse(
        { warehouses },
        { companyId: company.id, name: "Склад продаж (Москва)", type: "own" },
      );

      const stock = new DrizzleStockRepository(tx);
      const productVariantRepo = new DrizzleProductVariantRepository(tx);
      const productVariants = ownershipPort(productVariantRepo);

      // Цех передал 100 готовых худи на WIP-склад.
      const afterReceive = await receiveStock(
        { stock, warehouses, productVariants },
        { companyId: company.id, warehouseId: workshopWarehouse.id, productVariantId: variant.id, quantity: 100 },
      );
      expect(afterReceive.quantityOnHand).toBe("100.000");

      // Зарезервировали 20 под уже согласованную оптовую заявку.
      const afterReserve = await reserveStock(
        { stock, warehouses, productVariants },
        { companyId: company.id, warehouseId: workshopWarehouse.id, productVariantId: variant.id, quantity: 20 },
      );
      expect(afterReserve.quantityReserved).toBe("20.000");

      // Нельзя списать больше, чем доступно (100 - 20 = 80).
      await expect(
        dispatchStock(
          { stock, warehouses, productVariants },
          { companyId: company.id, warehouseId: workshopWarehouse.id, productVariantId: variant.id, quantity: 81 },
        ),
      ).rejects.toThrow(/Недостаточно остатка/);

      // Списываем ровно доступное (продали часть напрямую с WIP-склада).
      const afterDispatch = await dispatchStock(
        { stock, warehouses, productVariants },
        { companyId: company.id, warehouseId: workshopWarehouse.id, productVariantId: variant.id, quantity: 80 },
      );
      expect(afterDispatch.quantityOnHand).toBe("20.000");

      // Сняли резерв — оптовая заявка отменилась.
      const afterRelease = await releaseReservation(
        { stock, warehouses, productVariants },
        { companyId: company.id, warehouseId: workshopWarehouse.id, productVariantId: variant.id, quantity: 20 },
      );
      expect(afterRelease.quantityReserved).toBe("0.000");

      // Прямой transferStock (например, ручное перемещение) — доступно 20.
      const direct = await transferStock(
        { stock, warehouses, productVariants },
        {
          companyId: company.id,
          originWarehouseId: workshopWarehouse.id,
          destinationWarehouseId: salesWarehouse.id,
          productVariantId: variant.id,
          quantity: 5,
        },
      );
      expect(direct.origin.quantityOnHand).toBe("15.000");
      expect(direct.destination.quantityOnHand).toBe("5.000");

      // Отгрузка (Shipment) оставшихся 15 единиц: planned → in_transit → delivered.
      const shipments = new DrizzleShipmentRepository(tx);
      const shipment = await createShipment(
        { shipments, warehouses, productVariants },
        {
          companyId: company.id,
          originWarehouseId: workshopWarehouse.id,
          destinationWarehouseId: salesWarehouse.id,
          items: [{ productVariantId: variant.id, quantity: 15 }],
        },
      );
      expect(shipment.status).toBe("planned");

      const dispatched = await dispatchShipment(
        { shipments, stock, warehouses, productVariants },
        { companyId: company.id, shipmentId: shipment.id },
      );
      expect(dispatched.status).toBe("in_transit");

      const delivered = await markShipmentDelivered(
        { shipments, warehouses },
        { companyId: company.id, shipmentId: shipment.id },
      );
      expect(delivered.status).toBe("delivered");
      expect(delivered.deliveredAt).not.toBeNull();

      // После отгрузки: WIP-склад пуст (15-15=0), склад продаж = 5+15 = 20.
      const wipStock = await stock.findStockItem(workshopWarehouse.id, variant.id);
      const salesStock = await stock.findStockItem(salesWarehouse.id, variant.id);
      expect(wipStock?.quantityOnHand).toBe("0.000");
      expect(salesStock?.quantityOnHand).toBe("20.000");

      // Инвентаризация склада продаж находит расхождение (кто-то унёс 1 штуку без документа).
      const inventoryCounts = new DrizzleInventoryCountRepository(tx);
      const count = await createInventoryCount(
        { inventoryCounts, warehouses },
        { companyId: company.id, warehouseId: salesWarehouse.id },
      );
      const afterCount = await recordInventoryCountItem(
        { inventoryCounts, stock, productVariants },
        {
          companyId: company.id,
          inventoryCountId: count.id,
          productVariantId: variant.id,
          actualQuantity: 19,
        },
      );
      expect(afterCount.items[0]?.expectedQuantity).toBe("20.000");
      expect(afterCount.items[0]?.actualQuantity).toBe("19.000");
      expect(afterCount.items[0]?.discrepancy).toBe("-1.000");

      const completed = await completeInventoryCount(
        { inventoryCounts },
        { companyId: company.id, inventoryCountId: count.id },
      );
      expect(completed.status).toBe("completed");

      const stockAfterCount = await stock.findStockItem(salesWarehouse.id, variant.id);
      expect(stockAfterCount?.quantityOnHand).toBe("19.000");
    });
  });

  it("отклоняет несогласованность типа склада и workshopId", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company } = await seedVariant(tx);
      const warehouses = new DrizzleWarehouseRepository(tx);

      await expect(
        createWarehouse({ warehouses }, { companyId: company.id, name: "Склад без workshopId", type: "workshop" }),
      ).rejects.toThrow(DomainError);

      const workshops = new DrizzleWorkshopRepository(tx);
      const workshop = await createWorkshop({ workshops }, { companyId: company.id, name: "Цех №2" });
      await expect(
        createWarehouse(
          { warehouses },
          { companyId: company.id, name: "Обычный склад с workshopId", type: "own", workshopId: workshop.id },
        ),
      ).rejects.toThrow(DomainError);
    });
  });
});
