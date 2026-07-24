import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { confirmPurchaseOrder } from "./application/confirm-purchase-order";
import { createMaterial } from "./application/create-material";
import { createPurchaseOrderDraft } from "./application/create-purchase-order";
import { createSupplier } from "./application/create-supplier";
import { DomainError } from "./domain/errors";
import {
  DrizzleMaterialRepository,
  DrizzlePurchaseOrderRepository,
  DrizzleSupplierRepository,
} from "./infrastructure/drizzle-procurement-repository";

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

describe("domain/procurement", () => {
  it("создаёт поставщика, материал и черновик закупки, затем подтверждает его", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд Тест" });

      const suppliersRepo = new DrizzleSupplierRepository(tx);
      const supplier = await createSupplier(
        { suppliers: suppliersRepo },
        { companyId: company.id, name: "Оксфорд Текстиль", type: "fabric" },
      );
      expect(supplier.status).toBe("active");

      const materialsRepo = new DrizzleMaterialRepository(tx);
      const material = await createMaterial(
        { materials: materialsRepo },
        { companyId: company.id, name: "Оксфорд 280", type: "fabric", unit: "m" },
      );

      const purchaseOrdersRepo = new DrizzlePurchaseOrderRepository(tx);
      const order = await createPurchaseOrderDraft(
        { purchaseOrders: purchaseOrdersRepo, suppliers: suppliersRepo },
        {
          companyId: company.id,
          supplierId: supplier.id,
          items: [{ materialId: material.id, quantity: 500, unitPrice: 350 }],
        },
      );
      expect(order.status).toBe("draft");
      expect(order.items).toHaveLength(1);
      expect(order.items[0]?.quantity).toBe("500.000");

      const confirmed = await confirmPurchaseOrder(
        { purchaseOrders: purchaseOrdersRepo },
        { companyId: company.id, purchaseOrderId: order.id },
      );
      expect(confirmed.status).toBe("sent");

      // Повторное подтверждение уже отправленного заказа запрещено.
      await expect(
        confirmPurchaseOrder({ purchaseOrders: purchaseOrdersRepo }, { companyId: company.id, purchaseOrderId: order.id }),
      ).rejects.toThrow(DomainError);
    });
  });

  it("отклоняет закупку без позиций и с несуществующим поставщиком", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд Тест 2" });
      const suppliersRepo = new DrizzleSupplierRepository(tx);
      const purchaseOrdersRepo = new DrizzlePurchaseOrderRepository(tx);

      const supplier = await createSupplier(
        { suppliers: suppliersRepo },
        { companyId: company.id, name: "Фурнитура Плюс", type: "trim" },
      );

      await expect(
        createPurchaseOrderDraft(
          { purchaseOrders: purchaseOrdersRepo, suppliers: suppliersRepo },
          { companyId: company.id, supplierId: supplier.id, items: [] },
        ),
      ).rejects.toThrow(DomainError);

      await expect(
        createPurchaseOrderDraft(
          { purchaseOrders: purchaseOrdersRepo, suppliers: suppliersRepo },
          {
            companyId: company.id,
            supplierId: "00000000-0000-0000-0000-000000000000",
            items: [{ materialId: "00000000-0000-0000-0000-000000000000", quantity: 1, unitPrice: 1 }],
          },
        ),
      ).rejects.toThrow(/не найден/);
    });
  });
});
