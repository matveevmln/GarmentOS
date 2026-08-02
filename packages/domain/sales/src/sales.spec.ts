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
import { createOrder } from "./application/create-order";
import { createSalesChannel } from "./application/create-sales-channel";
import { cancelOrder, confirmOrder, deliverOrder, shipOrder } from "./application/transition-order-status";
import { DomainError } from "./domain/errors";
import { DrizzleOrderRepository, DrizzleSalesChannelRepository } from "./infrastructure/drizzle-sales-repository";

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
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд продаж" });
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

describe("domain/sales", () => {
  it("создаёт заказ с Wildberries, считает totalAmount и проводит по статусам new→confirmed→shipped→delivered", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);

      const salesChannels = new DrizzleSalesChannelRepository(tx);
      const channel = await createSalesChannel(
        { salesChannels },
        { companyId: company.id, type: "marketplace", name: "Wildberries" },
      );

      const orders = new DrizzleOrderRepository(tx);
      const order = await createOrder(
        { orders, salesChannels },
        {
          companyId: company.id,
          salesChannelId: channel.id,
          externalOrderId: "WB-123456",
          items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 2990 }],
        },
      );
      expect(order.status).toBe("new");
      expect(order.totalAmount).toBe("5980.00");

      const confirmed = await confirmOrder({ orders }, { companyId: company.id, orderId: order.id });
      expect(confirmed.status).toBe("confirmed");

      const shipped = await shipOrder({ orders }, { companyId: company.id, orderId: order.id });
      expect(shipped.status).toBe("shipped");

      const delivered = await deliverOrder({ orders }, { companyId: company.id, orderId: order.id });
      expect(delivered.status).toBe("delivered");

      // Из delivered нет разрешённых переходов вообще.
      await expect(confirmOrder({ orders }, { companyId: company.id, orderId: order.id })).rejects.toThrow(DomainError);
    });
  });

  it("отклоняет заказ без позиций и запрещает отменить уже отгруженный заказ", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);
      const salesChannels = new DrizzleSalesChannelRepository(tx);
      const orders = new DrizzleOrderRepository(tx);
      const channel = await createSalesChannel(
        { salesChannels },
        { companyId: company.id, type: "own_website", name: "Свой сайт" },
      );

      await expect(
        createOrder({ orders, salesChannels }, { companyId: company.id, salesChannelId: channel.id, items: [] }),
      ).rejects.toThrow(DomainError);

      const order = await createOrder(
        { orders, salesChannels },
        { companyId: company.id, salesChannelId: channel.id, items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 1000 }] },
      );
      await confirmOrder({ orders }, { companyId: company.id, orderId: order.id });
      await shipOrder({ orders }, { companyId: company.id, orderId: order.id });

      await expect(cancelOrder({ orders }, { companyId: company.id, orderId: order.id })).rejects.toThrow(
        /Недопустимый переход/,
      );
    });
  });
});
