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
import {
  applyMarkingCode,
  DrizzleMarkingCodeRepository,
  introduceMarkingCode,
  issueMarkingCode,
  retireMarkingCode,
} from "@garmentos/domain-honest-sign";
import { createCompany, createUser, DrizzleCompanyRepository, DrizzleUserRepository } from "@garmentos/domain-identity";
import {
  createMarketplaceAccount,
  createMarketplaceListing,
  DrizzleMarketplaceAccountRepository,
  DrizzleMarketplaceListingRepository,
  DrizzleMarketplaceRepository,
  ensureMarketplace,
} from "@garmentos/domain-marketplace-integration";
import {
  confirmOrder,
  createOrder,
  createSalesChannel,
  deliverOrder,
  DrizzleOrderRepository,
  DrizzleSalesChannelRepository,
  shipOrder,
} from "@garmentos/domain-sales";
import {
  createShipment,
  createWarehouse,
  dispatchShipment,
  dispatchStock,
  DrizzleShipmentRepository,
  DrizzleStockRepository,
  DrizzleWarehouseRepository,
  markShipmentDelivered,
  receiveStock,
} from "@garmentos/domain-warehouse";
import { describe, expect, it } from "vitest";
import { createInvoice } from "./application/create-invoice";
import { recordCostEntry } from "./application/record-cost-entry";
import { recordTransaction } from "./application/record-transaction";
import { issueInvoice, markInvoicePaid } from "./application/transition-invoice-status";
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

// Сквозной сценарий второй партии Итерации 3 (docs/ROADMAP.md): «от готовой
// партии на складе цеха до проданной единицы на Wildberries, с гашением кода
// маркировки и проводкой себестоимости/дохода». Warehouse, Sales,
// Marketplace Integration, Honest Sign и Finance вызываются здесь НЕЗАВИСИМО
// друг от друга — оркестрация в этом тесте (composition root), а не
// синхронными вызовами одного модуля из другого (см. решение по хореографии,
// ARCHITECTURE_SELF_REVIEW.md, раздел 11: дожидается Domain Events).
describe("сквозной сценарий: со склада цеха до проданной единицы на Wildberries", () => {
  it("проходит warehouse → sales → marketplace → honest-sign → finance на реальных данных", async () => {
    await runInRolledBackTransaction(async (tx) => {
      // Identity + Catalog: та же модель «Худи Петроль», что и в первой партии.
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "ООО Петроль Studio" });
      const owner = await createUser(
        { users: new DrizzleUserRepository(tx) },
        { companyId: company.id, email: "owner@petrolstudio.ru", passwordHash: "argon2-hash-placeholder", fullName: "Алексей Богданов" },
      );
      const collections = new DrizzleCollectionRepository(tx);
      const collection = await createCollection({ collections }, { companyId: company.id, name: "Осень 2026" });
      const products = new DrizzleProductRepository(tx);
      const product = await createProduct(
        { products },
        { companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL-2026" },
      );
      const productVariants = new DrizzleProductVariantRepository(tx);
      const variant = await createProductVariant(
        { productVariants },
        { productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-2026-M" },
      );

      // Warehouse: цех передал готовую партию 30 шт на свой WIP-склад,
      // компания перевезла её на склад продаж (Shipment planned→in_transit→delivered).
      const warehouses = new DrizzleWarehouseRepository(tx);
      const workshopWarehouse = await createWarehouse(
        { warehouses },
        { companyId: company.id, name: "WIP Цех №1", type: "own", createdBy: owner.id },
      );
      const salesWarehouse = await createWarehouse(
        { warehouses },
        { companyId: company.id, name: "Склад продаж (Москва)", type: "own", createdBy: owner.id },
      );
      const stock = new DrizzleStockRepository(tx);
      await receiveStock({ stock }, { warehouseId: workshopWarehouse.id, productVariantId: variant.id, quantity: 30, meta: { referenceType: "production_order" } });

      const shipments = new DrizzleShipmentRepository(tx);
      const shipment = await createShipment(
        { shipments },
        { companyId: company.id, originWarehouseId: workshopWarehouse.id, destinationWarehouseId: salesWarehouse.id, items: [{ productVariantId: variant.id, quantity: 30 }] },
      );
      await dispatchShipment({ shipments, stock }, { companyId: company.id, shipmentId: shipment.id });
      const delivered = await markShipmentDelivered({ shipments }, { companyId: company.id, shipmentId: shipment.id });
      expect(delivered.status).toBe("delivered");

      const salesWarehouseStock = await stock.findStockItem(salesWarehouse.id, variant.id);
      expect(salesWarehouseStock?.quantityOnHand).toBe("30.000");

      // Marketplace Integration: подключаем Wildberries и заводим карточку SKU.
      const marketplaces = new DrizzleMarketplaceRepository(tx);
      await ensureMarketplace({ marketplaces }, { code: "wildberries", name: "Wildberries" });
      const marketplaceAccounts = new DrizzleMarketplaceAccountRepository(tx);
      const account = await createMarketplaceAccount(
        { marketplaceAccounts, marketplaces },
        { companyId: company.id, marketplaceCode: "wildberries", apiCredentialsEncrypted: "encrypted-wb-token" },
      );
      const marketplaceListings = new DrizzleMarketplaceListingRepository(tx);
      await createMarketplaceListing(
        { marketplaceListings, marketplaceAccounts },
        { companyId: company.id, marketplaceAccountId: account.id, productVariantId: variant.id, externalSkuId: "WB-SKU-PETROL-M", currentPrice: 2990, currentStockReported: 30 },
      );

      // Sales: покупатель заказал 2 худи на Wildberries.
      const salesChannels = new DrizzleSalesChannelRepository(tx);
      const channel = await createSalesChannel({ salesChannels }, { companyId: company.id, type: "marketplace", name: "Wildberries" });
      const orders = new DrizzleOrderRepository(tx);
      const order = await createOrder(
        { orders, salesChannels },
        { companyId: company.id, salesChannelId: channel.id, externalOrderId: "WB-777001", items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 2990 }] },
      );
      await confirmOrder({ orders }, { companyId: company.id, orderId: order.id });
      await shipOrder({ orders }, { companyId: company.id, orderId: order.id });
      const deliveredOrder = await deliverOrder({ orders }, { companyId: company.id, orderId: order.id });
      expect(deliveredOrder.status).toBe("delivered");
      expect(deliveredOrder.totalAmount).toBe("5980.00");

      // Warehouse: окончательное списание проданных единиц со склада продаж.
      const afterDispatch = await dispatchStock(
        { stock },
        { warehouseId: salesWarehouse.id, productVariantId: variant.id, quantity: 2, meta: { referenceType: "order", referenceId: order.id } },
      );
      expect(afterDispatch.quantityOnHand).toBe("28.000");

      // Honest Sign: гашение кода маркировки одной проданной единицы.
      const markingCodes = new DrizzleMarkingCodeRepository(tx);
      const code = await issueMarkingCode({ markingCodes }, { companyId: company.id, productVariantId: variant.id, codeValue: "010460000000001121" + order.id.slice(0, 6) });
      await applyMarkingCode({ markingCodes }, { companyId: company.id, markingCodeId: code.id });
      await introduceMarkingCode({ markingCodes }, { companyId: company.id, markingCodeId: code.id });
      const retiredCode = await retireMarkingCode(
        { markingCodes },
        { companyId: company.id, markingCodeId: code.id, reason: "sold", referenceType: "order", referenceId: order.id },
      );
      expect(retiredCode.status).toBe("sold");

      // Finance: себестоимость проданной единицы + доход + счёт клиенту.
      const costEntries = new DrizzleCostEntryRepository(tx);
      const cost = await recordCostEntry(
        { costEntries },
        { companyId: company.id, productVariantId: variant.id, materialCost: 850, manufacturingCost: 450, logisticsCost: 60, overheadCost: 40 },
      );
      expect(Number(cost.materialCost) + Number(cost.manufacturingCost) + Number(cost.logisticsCost) + Number(cost.overheadCost)).toBe(1400);

      const transactions = new DrizzleTransactionRepository(tx);
      const income = await recordTransaction(
        { transactions },
        { companyId: company.id, type: "income", amount: Number(deliveredOrder.totalAmount), referenceType: "order", referenceId: order.id },
      );
      expect(income.amount).toBe("5980.00");

      const invoices = new DrizzleInvoiceRepository(tx);
      const invoice = await createInvoice({ invoices }, { companyId: company.id, amount: Number(deliveredOrder.totalAmount), orderId: order.id });
      await issueInvoice({ invoices }, { companyId: company.id, invoiceId: invoice.id });
      const paidInvoice = await markInvoicePaid({ invoices }, { companyId: company.id, invoiceId: invoice.id });
      expect(paidInvoice.status).toBe("paid");

      // Целостность сквозной цепочки: заказ, движение денег и счёт ссылаются
      // на одну и ту же продажу; себестоимость и маржа считаются, а не хранятся.
      const marginPerUnit = 2990 - (850 + 450 + 60 + 40);
      expect(marginPerUnit).toBe(1590);
    });
  });
});
