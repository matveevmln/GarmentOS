import { IdentityService } from "./identity/identity.service";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  createDb,
  companies,
  users,
  products,
  productVariants,
  materials,
  suppliers,
  warehouses,
  workshops,
  boms,
  productionOrders,
  productionOrderVariants,
  purchaseOrders,
  purchaseOrderItems,
  stockItems,
  materialStockItems,
  productionOrderQcResults,
  cuttingOrders,
  cuttingOrderMaterials,
  cuttingOrderResults,
} from "@garmentos/db-schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "./app.module";
import type { AuthenticatedRequestUser } from "./auth/current-user.decorator";
import { ContractManufacturingService } from "./contract-manufacturing/contract-manufacturing.service";
import { ProcurementService } from "./procurement/procurement.service";
import { WarehouseService } from "./warehouse/warehouse.service";
import { QcService } from "./qc/qc.service";
import { DefectService } from "./defect/defect.service";
import { CuttingService } from "./cutting/cutting.service";
import { SpecificationService } from "./specification/specification.service";
import { ProductionOrderOrchestrationService } from "./ai-production-assistant/production-order-orchestration.service";
import { CatalogService } from "./catalog/catalog.service";
import { AuditService } from "./audit/audit.service";
import { DatabaseTransaction } from "./database/database-transaction";

const db = createDb(process.env.DATABASE_URL!);

// Настоящие репозитории и Postgres: сбой между модулями не должен оставлять
// статус без остатка, остаток без факта или окончательный ОТК без брака.
describe("Целостность связей между бизнес-модулями (e2e)", () => {
  let app: INestApplication;
  let user: AuthenticatedRequestUser;
  let foreignCompanyId: string;
  let productId: string;
  let bomId: string;
  let workshopId: string;
  let supplierId: string;
  let variantIds: string[];
  let materialIds: string[];
  let production: ContractManufacturingService;
  let procurement: ProcurementService;
  let warehouse: WarehouseService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    production = app.get(ContractManufacturingService);
    procurement = app.get(ProcurementService);
    warehouse = app.get(WarehouseService);
    const [company, foreign] = await db
      .insert(companies)
      .values([{ name: `Integrity ${randomUUID()}` }, { name: `Foreign ${randomUUID()}` }])
      .returning();
    foreignCompanyId = foreign.id;
    const [actor] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: `${randomUUID()}@example.com`,
        passwordHash: "test-only",
        fullName: "Тест",
      })
      .returning();
    user = { id: actor.id, companyId: company.id, roles: ["owner"] };
    const [product] = await db
      .insert(products)
      .values({ companyId: user.companyId, name: "Модель", code: "INT" })
      .returning();
    productId = product.id;
    variantIds = (
      await db
        .insert(productVariants)
        .values(
          ["M", "L"].map((size) => ({
            productId,
            size,
            color: "Синий",
            skuCode: randomUUID(),
          })),
        )
        .returning()
    ).map((row) => row.id);
    materialIds = (
      await db
        .insert(materials)
        .values(
          ["Ткань", "Подклад"].map((name) => ({
            companyId: user.companyId,
            name,
            type: "fabric" as const,
            unit: "m" as const,
          })),
        )
        .returning()
    ).map((row) => row.id);
    const [supplier] = await db
      .insert(suppliers)
      .values({ companyId: user.companyId, name: "Поставщик", type: "fabric" })
      .returning();
    supplierId = supplier.id;
    const [workshop] = await db
      .insert(workshops)
      .values({ companyId: user.companyId, name: "Цех", contractNumber: "TEST-1" })
      .returning();
    workshopId = workshop.id;
    const [bom] = await db
      .insert(boms)
      .values({ companyId: user.companyId, productId, status: "approved" })
      .returning();
    bomId = bom.id;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    // Удаляем только компании этого набора; общие справочники и соседние тесты
    // не затрагиваются. Порядок соответствует внешним ключам.
    if (user) {
      const ids = [user.companyId, foreignCompanyId];
      await db.execute(
        sql`delete from stock_movements where stock_item_id in (select id from stock_items where warehouse_id in (select id from warehouses where company_id in (${ids[0]}, ${ids[1]})))`,
      );
      await db.execute(
        sql`delete from material_stock_movements where material_stock_item_id in (select id from material_stock_items where warehouse_id in (select id from warehouses where company_id in (${ids[0]}, ${ids[1]})))`,
      );
      for (const table of ["stock_items", "material_stock_items"]) {
        await db.execute(
          sql`delete from ${sql.identifier(table)} where warehouse_id in (select id from warehouses where company_id in (${ids[0]}, ${ids[1]}))`,
        );
      }
      for (const table of ["cutting_order_materials", "cutting_order_results"]) {
        await db.execute(
          sql`delete from ${sql.identifier(table)} where cutting_order_id in (select id from cutting_orders where company_id = ${user.companyId})`,
        );
      }
      for (const table of [
        "production_order_defects",
        "production_order_qc_results",
        "cutting_orders",
        "audit_log",
      ]) {
        await db.execute(
          sql`delete from ${sql.identifier(table)} where company_id = ${user.companyId}`,
        );
      }
      await db.execute(
        sql`delete from production_order_variants where production_order_id in (select id from production_orders where company_id = ${user.companyId})`,
      );
      await db.execute(
        sql`delete from purchase_order_items where purchase_order_id in (select id from purchase_orders where company_id = ${user.companyId})`,
      );
      await db.execute(
        sql`update specifications set production_order_id = null where company_id = ${user.companyId}`,
      );
      await db.execute(sql`delete from production_orders where company_id = ${user.companyId}`);
      await db.execute(
        sql`delete from specification_items where specification_id in (select id from specifications where company_id = ${user.companyId})`,
      );
      for (const table of [
        "specifications",
        "purchase_orders",
        "warehouses",
        "boms",
        "workshops",
        "suppliers",
        "materials",
      ]) {
        await db.execute(
          sql`delete from ${sql.identifier(table)} where company_id in (${ids[0]}, ${ids[1]})`,
        );
      }
      await db.execute(
        sql`delete from product_sizes where product_id in (select id from products where company_id in (${ids[0]}, ${ids[1]}))`,
      );
      await db.execute(
        sql`delete from product_variants where product_id in (select id from products where company_id in (${ids[0]}, ${ids[1]}))`,
      );
      await db.execute(sql`delete from products where company_id in (${ids[0]}, ${ids[1]})`);
      await db.delete(users).where(eq(users.id, user.id));
      for (const id of ids) await db.delete(companies).where(eq(companies.id, id));
    }
    await app?.close();
  });

  async function newWarehouse(companyId = user.companyId) {
    const [row] = await db.insert(warehouses).values({ companyId, name: randomUUID() }).returning();
    return row.id;
  }

  async function newProductionOrder() {
    const [order] = await db
      .insert(productionOrders)
      .values({
        companyId: user.companyId,
        productId,
        bomId,
        workshopId,
        plannedQuantity: "20",
        agreedUnitPrice: "100",
        status: "ready_for_pickup",
      })
      .returning();
    await db.insert(productionOrderVariants).values(
      variantIds.map((productVariantId) => ({
        productionOrderId: order.id,
        productVariantId,
        quantity: "10",
      })),
    );
    return order.id;
  }

  async function newPurchaseOrder() {
    const [order] = await db
      .insert(purchaseOrders)
      .values({
        companyId: user.companyId,
        supplierId,
        status: "sent",
        orderedAt: "2026-10-04",
      })
      .returning();
    await db.insert(purchaseOrderItems).values(
      materialIds.map((materialId) => ({
        purchaseOrderId: order.id,
        materialId,
        quantity: "30",
        unitPrice: "2",
      })),
    );
    return order.id;
  }

  async function newCuttingOrder(productionOrderId: string) {
    const [cutting] = await db
      .insert(cuttingOrders)
      .values({ companyId: user.companyId, productionOrderId, number: 1, status: "issued" })
      .returning();
    await db.insert(cuttingOrderMaterials).values(
      materialIds.map((materialId) => ({
        cuttingOrderId: cutting.id,
        materialId,
        unit: "m" as const,
        requiredQuantity: "20",
      })),
    );
    await db.insert(cuttingOrderResults).values(
      variantIds.map((productVariantId) => ({
        cuttingOrderId: cutting.id,
        productVariantId,
        plannedQuantity: "10",
      })),
    );
    return cutting.id;
  }

  function failSecondCall(method: "receiveStock" | "receiveMaterialStock") {
    const original = warehouse[method].bind(warehouse);
    let calls = 0;
    // Обе сигнатуры различны, поэтому задаём сбой отдельно для каждой.
    if (method === "receiveStock") {
      const receive = original as WarehouseService["receiveStock"];
      vi.spyOn(warehouse, method).mockImplementation(async (...args) => {
        if (++calls === 2) throw new Error("Сбой второй складской записи");
        return receive(...args);
      });
    } else {
      const receive = original as WarehouseService["receiveMaterialStock"];
      vi.spyOn(warehouse, method).mockImplementation(async (...args) => {
        if (++calls === 2) throw new Error("Сбой второй складской записи");
        return receive(...args);
      });
    }
  }

  it("ошибочный склад не оставляет партию принятой", async () => {
    const id = await newProductionOrder();
    await expect(production.receiveProductionOrder(user, id, randomUUID())).rejects.toThrow();
    expect((await production.findProductionOrderById(user.companyId, id))?.status).toBe(
      "ready_for_pickup",
    );
  });

  it("сбой второй позиции приёмки партии откатывает статус, факт и первый остаток", async () => {
    const id = await newProductionOrder();
    const warehouseId = await newWarehouse();
    failSecondCall("receiveStock");
    await expect(production.receiveProductionOrder(user, id, warehouseId)).rejects.toThrow(
      "Сбой второй",
    );
    const order = await production.findProductionOrderById(user.companyId, id);
    expect(order?.status).toBe("ready_for_pickup");
    expect(order?.variants.every((row) => row.receivedQuantity === null)).toBe(true);
    expect(
      await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseId)),
    ).toHaveLength(0);
    vi.restoreAllMocks();
    await production.receiveProductionOrder(user, id, warehouseId);
    expect(
      (await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseId))).map(
        (row) => Number(row.quantityOnHand),
      ),
    ).toEqual([10, 10]);
  });

  it("сбой второй позиции закупки откатывает статус и поступление первого материала", async () => {
    const id = await newPurchaseOrder();
    const warehouseId = await newWarehouse();
    failSecondCall("receiveMaterialStock");
    await expect(procurement.receivePurchaseOrder(user, id, warehouseId)).rejects.toThrow(
      "Сбой второй",
    );
    expect((await procurement.findPurchaseOrderById(user.companyId, id))?.status).toBe("sent");
    expect(
      await db
        .select()
        .from(materialStockItems)
        .where(eq(materialStockItems.warehouseId, warehouseId)),
    ).toHaveLength(0);
    vi.restoreAllMocks();
    await procurement.receivePurchaseOrder(user, id, warehouseId);
    expect(
      (await warehouse.listMaterialStock(user.companyId, warehouseId)).map((row) =>
        Number(row.quantityOnHand),
      ),
    ).toEqual([30, 30]);
  });

  it("приёмка партии и закупки запрещена на склад другой компании", async () => {
    const warehouseId = await newWarehouse(foreignCompanyId);
    const productionId = await newProductionOrder();
    const purchaseId = await newPurchaseOrder();
    await expect(
      production.receiveProductionOrder(user, productionId, warehouseId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      procurement.receivePurchaseOrder(user, purchaseId, warehouseId),
    ).rejects.toMatchObject({ status: 404 });
    expect((await production.findProductionOrderById(user.companyId, productionId))?.status).toBe(
      "ready_for_pickup",
    );
    expect((await procurement.findPurchaseOrderById(user.companyId, purchaseId))?.status).toBe(
      "sent",
    );
  });

  it("сбой записи брака не оставляет окончательный ОТК и позволяет повторить", async () => {
    const id = await newProductionOrder();
    await production.receiveProductionOrder(user, id, await newWarehouse());
    const qc = app.get(QcService);
    vi.spyOn(app.get(DefectService), "recordDefectsForQcResult").mockRejectedValueOnce(
      new Error("Сбой записи брака"),
    );
    const input = { receivedQuantity: 20, goodQuantity: 18, defectQuantity: 2 };
    await expect(qc.record(user, id, input)).rejects.toThrow("Сбой записи брака");
    expect(
      await db
        .select()
        .from(productionOrderQcResults)
        .where(eq(productionOrderQcResults.productionOrderId, id)),
    ).toHaveLength(0);
    await expect(qc.record(user, id, input)).resolves.toMatchObject(input);
  });

  it("сбой второго материала кроя не оставляет списание без факта", async () => {
    const productionId = await newProductionOrder();
    const warehouseId = await newWarehouse();
    for (const materialId of materialIds)
      await warehouse.receiveMaterialStock(user, warehouseId, materialId, 100);
    const cuttingId = await newCuttingOrder(productionId);
    const consume = warehouse.consumeMaterialStock.bind(warehouse);
    let calls = 0;
    vi.spyOn(warehouse, "consumeMaterialStock").mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error("Сбой второго материала");
      return consume(...args);
    });
    const input = {
      warehouseId,
      materials: materialIds.map((materialId) => ({ materialId, consumedQuantity: 20 })),
      results: variantIds.map((productVariantId) => ({ productVariantId, actualQuantity: 10 })),
    };
    await expect(app.get(CuttingService).recordFact(user, cuttingId, input)).rejects.toThrow(
      "Сбой второго",
    );
    expect(
      (await warehouse.listMaterialStock(user.companyId, warehouseId)).map((row) =>
        Number(row.quantityOnHand),
      ),
    ).toEqual([100, 100]);
    vi.restoreAllMocks();
    await app.get(CuttingService).recordFact(user, cuttingId, input);
    expect(
      (await warehouse.listMaterialStock(user.companyId, warehouseId)).map((row) =>
        Number(row.quantityOnHand),
      ),
    ).toEqual([80, 80]);
  });

  it("два одновременных клика приёмки партии зачисляют товар только один раз", async () => {
    const id = await newProductionOrder();
    const warehouseId = await newWarehouse();
    const results = await Promise.allSettled([
      production.receiveProductionOrder(user, id, warehouseId),
      production.receiveProductionOrder(user, id, warehouseId),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseId))).map(
        (row) => Number(row.quantityOnHand),
      ),
    ).toEqual([10, 10]);
  });

  it("два одновременных клика приёмки закупки не удваивают материалы", async () => {
    const id = await newPurchaseOrder();
    const warehouseId = await newWarehouse();
    const results = await Promise.allSettled([
      procurement.receivePurchaseOrder(user, id, warehouseId),
      procurement.receivePurchaseOrder(user, id, warehouseId),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (await warehouse.listMaterialStock(user.companyId, warehouseId)).map((row) =>
        Number(row.quantityOnHand),
      ),
    ).toEqual([30, 30]);
  });

  async function approvedSpecification() {
    const service = app.get(SpecificationService);
    const spec = await service.createDraft(
      user.companyId,
      {
        productId,
        workshopId,
        items: variantIds.map((productVariantId) => ({
          productVariantId,
          quantity: 10,
          unitPrice: 100,
        })),
      },
      user.id,
    );
    await service.approve(user.companyId, spec.id);
    return { service, id: spec.id };
  }

  it("две одновременные партии не превышают доступное количество спецификации", async () => {
    const { service, id } = await approvedSpecification();
    const results = await Promise.allSettled([
      service.createProductionOrder(user.companyId, id, {}, user.id),
      service.createProductionOrder(user.companyId, id, {}, user.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (await service.getAvailableQuantity(user.companyId, id)).items.reduce(
        (sum, row) => sum + row.availableQuantity,
        0,
      ),
    ).toBe(0);
  });

  it("сбой создания партии не расходует количество спецификации и допускает повтор", async () => {
    const { service, id } = await approvedSpecification();
    const { AuditService } = await import("./audit/audit.service");
    vi.spyOn(app.get(AuditService), "record").mockRejectedValueOnce(
      new Error("Сбой аудита партии"),
    );
    await expect(service.createProductionOrder(user.companyId, id, {}, user.id)).rejects.toThrow(
      "Сбой аудита партии",
    );
    expect(
      (await service.getAvailableQuantity(user.companyId, id)).items.reduce(
        (sum, row) => sum + row.availableQuantity,
        0,
      ),
    ).toBe(20);
    vi.restoreAllMocks();
    await service.createProductionOrder(user.companyId, id, {}, user.id);
    expect(
      (await service.getAvailableQuantity(user.companyId, id)).items.reduce(
        (sum, row) => sum + row.availableQuantity,
        0,
      ),
    ).toBe(0);
  });

  it("отмена партии и связанных заданий кроя сохраняется целиком", async () => {
    const id = await newProductionOrder();
    const cuttingId = await newCuttingOrder(id);
    vi.spyOn(app.get(CuttingService), "cancel").mockRejectedValueOnce(
      new Error("Сбой отмены кроя"),
    );
    const service = app.get(ProductionOrderOrchestrationService);
    await expect(service.cancelProductionOrder(user, id, "Ошибка партии")).rejects.toThrow(
      "Сбой отмены кроя",
    );
    expect((await production.findProductionOrderById(user.companyId, id))?.status).toBe(
      "ready_for_pickup",
    );
    vi.restoreAllMocks();
    await service.cancelProductionOrder(user, id, "Ошибка партии");
    expect(
      (await db.select().from(cuttingOrders).where(eq(cuttingOrders.id, cuttingId)))[0]?.status,
    ).toBe("cancelled");
  });

  it("дубли материала кроя отклоняются до списания", async () => {
    const id = await newCuttingOrder(await newProductionOrder());
    const warehouseId = await newWarehouse();
    await warehouse.receiveMaterialStock(user, warehouseId, materialIds[0], 100);
    await expect(
      app.get(CuttingService).recordFact(user, id, {
        warehouseId,
        materials: [1, 2].map(() => ({ materialId: materialIds[0], consumedQuantity: 20 })),
        results: variantIds.map((productVariantId) => ({ productVariantId, actualQuantity: 10 })),
      }),
    ).rejects.toMatchObject({ code: "CUTTING_DUPLICATE_MATERIAL" });
    expect(
      Number((await warehouse.findMaterialStockItem(warehouseId, materialIds[0]))?.quantityOnHand),
    ).toBe(100);
  });

  it("прямые складские действия не принимают склад другой компании", async () => {
    const warehouseId = await newWarehouse(foreignCompanyId);
    const input = { warehouseId, productVariantId: variantIds[0], quantity: 1 };
    for (const action of [
      () => warehouse.receiveStock(user, input),
      () => warehouse.dispatchStock(user, input),
      () => warehouse.reserveStock(user.companyId, input),
      () => warehouse.releaseReservation(user.companyId, input),
      () =>
        warehouse.transferStock(user, {
          originWarehouseId: warehouseId,
          destinationWarehouseId: warehouseId,
          productVariantId: input.productVariantId,
          quantity: 1,
        }),
    ])
      await expect(action()).rejects.toMatchObject({ status: 404 });
  });

  it("параллельные операции не смешивают транзакции и откатываются независимо", async () => {
    const transaction = app.get(DatabaseTransaction);
    const rolledBackName = randomUUID();
    const committedName = randomUUID();
    let arrived = 0;
    let ready!: () => void;
    const barrier = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const write = async (name: string, fail: boolean) =>
      transaction.run(user.companyId, "warehouse", name, async () => {
        await warehouse.createWarehouse(user.companyId, { name });
        if (++arrived === 2) ready();
        await barrier;
        if (fail) throw new Error("Тестовый откат");
      });
    const results = await Promise.allSettled([
      write(rolledBackName, true),
      write(committedName, false),
    ]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    expect(
      await db.select().from(warehouses).where(eq(warehouses.name, rolledBackName)),
    ).toHaveLength(0);
    expect(
      await db.select().from(warehouses).where(eq(warehouses.name, committedName)),
    ).toHaveLength(1);
  });

  it("закупка не может ссылаться на материал другой компании", async () => {
    const [foreign] = await db
      .insert(materials)
      .values({ companyId: foreignCompanyId, name: "Чужая ткань", type: "fabric", unit: "m" })
      .returning();
    await expect(
      procurement.createPurchaseOrderDraft(user.companyId, {
        supplierId,
        items: [{ materialId: foreign.id, quantity: 10, unitPrice: 2 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("партия не может содержать размер и цвет другой модели", async () => {
    const [other] = await db
      .insert(products)
      .values({ companyId: user.companyId, name: "Другая модель", code: randomUUID() })
      .returning();
    const [variant] = await db
      .insert(productVariants)
      .values({ productId: other.id, size: "M", color: "Синий", skuCode: randomUUID() })
      .returning();
    await expect(
      production.createProductionOrderDraft(user.companyId, {
        productId,
        bomId,
        workshopId,
        plannedQuantity: 10,
        agreedUnitPrice: 100,
        variants: [{ productVariantId: variant.id, quantity: 10 }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("подтверждение партии не сохраняет статус и снимок при ошибке аудита", async () => {
    const id = await newProductionOrder();
    await db.update(productionOrders).set({ status: "draft" }).where(eq(productionOrders.id, id));
    const { AuditService } = await import("./audit/audit.service");
    vi.spyOn(app.get(AuditService), "record").mockRejectedValueOnce(
      new Error("Сбой аудита подтверждения"),
    );
    const service = app.get(ProductionOrderOrchestrationService);
    await expect(service.confirmProductionOrder(user.companyId, id, user.id)).rejects.toThrow(
      "Сбой аудита подтверждения",
    );
    expect(await production.findProductionOrderById(user.companyId, id)).toMatchObject({
      status: "draft",
      costSnapshot: null,
    });
    vi.restoreAllMocks();
    await expect(
      service.confirmProductionOrder(user.companyId, id, user.id),
    ).resolves.toMatchObject({ status: "placed" });
  });

  it("повтор одной строки при создании партии не превышает количество спецификации", async () => {
    const { service, id } = await approvedSpecification();
    await expect(
      service.createProductionOrder(
        user.companyId,
        id,
        {
          items: [1, 2].map(() => ({ productVariantId: variantIds[0], quantity: 10 })),
        },
        user.id,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await service.getAvailableQuantity(user.companyId, id)).items.reduce(
        (sum, row) => sum + row.availableQuantity,
        0,
      ),
    ).toBe(20);
  });
  const placementInput = () => ({
    requestId: randomUUID(),
    mode: "place" as const,
    productId,
    workshopId,
    plannedQuantity: 20,
    agreedUnitPrice: 700,
    variants: variantIds.map((productVariantId) => ({ productVariantId, quantity: 10 })),
  });

  it("размещение создаёт одну связанную спецификацию и один неизменяемый снимок", async () => {
    const input = placementInput();
    const order = await app
      .get(ProductionOrderOrchestrationService)
      .placeProductionOrder(user, input);
    expect(order.status).toBe("placed");
    expect(order.orderNumber).toBeGreaterThan(0);
    expect(order.costSnapshot).toBeTruthy();
    const result = await db.execute(
      sql`select id, total_quantity, total_sum from specifications where company_id=${user.companyId} and production_order_id=${order.id}`,
    );
    expect(result).toHaveLength(1);
    expect(Number(result[0].total_quantity)).toBe(20);
    expect(Number(result[0].total_sum)).toBe(14000);
  });

  it("одновременное размещение и повтор после потерянного ответа возвращают одну партию", async () => {
    const service = app.get(ProductionOrderOrchestrationService);
    const input = placementInput();
    const orders = await Promise.all([
      service.placeProductionOrder(user, input),
      service.placeProductionOrder(user, input),
    ]);
    expect(orders[0].id).toBe(orders[1].id);
    expect((await service.placeProductionOrder(user, input)).id).toBe(orders[0].id);
    await expect(
      service.placeProductionOrder(user, { ...input, agreedUnitPrice: 800 }),
    ).rejects.toThrow("Эта попытка");
    await expect(
      service.placeProductionOrder({ ...user, id: randomUUID() }, input),
    ).rejects.toThrow("Эта попытка");
    const specs = await db.execute(
      sql`select id from specifications where production_order_id=${orders[0].id}`,
    );
    expect(specs).toHaveLength(1);
  });

  it("сбой спецификации откатывает всю партию; повтор этой попытки успешно размещает её", async () => {
    const service = app.get(ProductionOrderOrchestrationService);
    const input = placementInput();
    const before = await production.listProductionOrders(user.companyId);
    const counterBefore = await db.execute(
      sql`select next_production_order_number from companies where id=${user.companyId}`,
    );
    const spy = vi
      .spyOn(app.get(SpecificationService), "createFromProductionOrder")
      .mockRejectedValueOnce(new Error("specification-save-failed"));
    await expect(service.placeProductionOrder(user, input)).rejects.toThrow(
      "specification-save-failed",
    );
    expect(await production.listProductionOrders(user.companyId)).toHaveLength(before.length);
    expect(
      await app
        .get(AuditService)
        .listForEntity(user.companyId, "production_order_request", input.requestId),
    ).toHaveLength(0);
    expect(
      await db.execute(
        sql`select next_production_order_number from companies where id=${user.companyId}`,
      ),
    ).toEqual(counterBefore);
    spy.mockRestore();
    expect((await service.placeProductionOrder(user, input)).status).toBe("placed");
  });

  it("черновик сохраняется однократно без подтверждения и спецификации", async () => {
    const service = app.get(ProductionOrderOrchestrationService);
    const input = { ...placementInput(), mode: "draft" as const };
    const first = await service.placeProductionOrder(user, input);
    expect(first.status).toBe("draft");
    expect(first.costSnapshot).toBeNull();
    expect((await service.placeProductionOrder(user, input)).id).toBe(first.id);
    expect(
      await db.execute(sql`select id from specifications where production_order_id=${first.id}`),
    ).toHaveLength(0);
  });

  it("подготовка модели атомарна и устойчива к повтору", async () => {
    const catalog = app.get(CatalogService);
    const input = {
      requestId: randomUUID(),
      name: "Новая модель",
      sizes: [
        { size: "48-50", ratioWeight: 1 },
        { size: "52-54", ratioWeight: 1 },
      ],
      colors: ["Петроль"],
    };
    const before = await catalog.listProducts(user.companyId);
    const spy = vi
      .spyOn(catalog, "addProductColor")
      .mockRejectedValueOnce(new Error("color-save-failed"));
    await expect(catalog.quickProduct(user, input)).rejects.toThrow("color-save-failed");
    expect(await catalog.listProducts(user.companyId)).toHaveLength(before.length);
    spy.mockRestore();
    const models = await Promise.all([
      catalog.quickProduct(user, input),
      catalog.quickProduct(user, input),
    ]);
    expect(models[0].id).toBe(models[1].id);
    expect(await catalog.listProductVariants(user.companyId, models[0].id)).toHaveLength(2);
    await expect(catalog.quickProduct(user, { ...input, name: "Другая" })).rejects.toThrow(
      "Эта попытка",
    );
    await expect(
      catalog.quickProduct(
        { ...user, companyId: foreignCompanyId },
        { ...input, requestId: randomUUID(), productId: models[0].id },
      ),
    ).rejects.toThrow("вашей компании");
  });

  it("новый размер создаёт варианты существующих цветов и сохраняет старые SKU", async () => {
    const catalog = app.get(CatalogService);
    const model = await catalog.quickProduct(user, {
      requestId: randomUUID(),
      name: "Размеры",
      sizes: [{ size: "M", ratioWeight: 1 }],
      colors: ["Синий"],
    });
    const before = await catalog.listProductVariants(user.companyId, model.id);
    await catalog.replaceProductSizes(user, model.id, {
      sizes: [
        { size: "M", ratioWeight: 1 },
        { size: "L", ratioWeight: 1 },
      ],
    });
    const after = await catalog.listProductVariants(user.companyId, model.id);
    expect(after).toHaveLength(2);
    expect(after.find((row) => row.size === "M")).toEqual(before[0]);
    expect(after.find((row) => row.size === "L")?.color).toBe("Синий");
  });

  it("архив сохраняет историю и блокирует новую партию до восстановления", async () => {
    const catalog = app.get(CatalogService);
    const order = await app
      .get(ProductionOrderOrchestrationService)
      .placeProductionOrder(user, placementInput());
    try {
      await catalog.setProductStatus(user, productId, "discontinued");
      expect((await production.findProductionOrderById(user.companyId, order.id))?.id).toBe(
        order.id,
      );
      await expect(
        app.get(ProductionOrderOrchestrationService).placeProductionOrder(user, placementInput()),
      ).rejects.toThrow("Выберите доступную модель");
      await expect(
        catalog.setProductStatus({ ...user, companyId: foreignCompanyId }, productId, "active"),
      ).rejects.toThrow("Модель не найдена");
    } finally {
      await catalog.setProductStatus(user, productId, "active");
    }
  });
  it("убранный размер остаётся в истории SKU, но не попадает в новую раскладку", async () => {
    const catalog = app.get(CatalogService);
    const model = await catalog.quickProduct(user, {
      requestId: randomUUID(),
      name: "Текущий ряд",
      sizes: [
        { size: "M", ratioWeight: 1 },
        { size: "L", ratioWeight: 1 },
      ],
      colors: ["Синий"],
    });
    await catalog.replaceProductSizes(user, model.id, { sizes: [{ size: "M", ratioWeight: 1 }] });
    expect(await catalog.listProductVariants(user.companyId, model.id)).toHaveLength(2);
    const preview = await production.previewProductionOrderVariants(user.companyId, {
      productId: model.id,
      colors: [{ color: "Синий", quantity: 5 }],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]?.size).toBe("M");
    expect(preview.totalQuantity).toBe(5);
  });

  it("доступные действия учитывают реальные права, компанию и фактическую приёмку", async () => {
    const draft = await production.createProductionOrderDraft(user.companyId, {
      productId,
      workshopId,
      plannedQuantity: 2,
      agreedUnitPrice: 700,
      variants: variantIds.map((productVariantId) => ({ productVariantId, quantity: 1 })),
    });
    const permissions = vi.spyOn(app.get(IdentityService), "getUserPermissions");
    permissions.mockResolvedValue(["contract_manufacturing.read", "contract_manufacturing.write"]);
    expect((await production.getProductionOrderActions(user, draft.id)).cancel).toBe(false);
    permissions.mockResolvedValue([
      "contract_manufacturing.read",
      "contract_manufacturing.write",
      "contract_manufacturing.cancel",
      "contract_manufacturing.rollback",
    ]);
    expect((await production.getProductionOrderActions(user, draft.id)).cancel).toBe(true);
    await expect(
      production.getProductionOrderActions({ ...user, companyId: foreignCompanyId }, draft.id),
    ).rejects.toThrow("Партия не найдена");
    await db
      .update(productionOrders)
      .set({ status: "ready_for_pickup" })
      .where(eq(productionOrders.id, draft.id));
    expect((await production.getProductionOrderActions(user, draft.id)).receive).toBe(true);
    await db
      .update(productionOrders)
      .set({ status: "received" })
      .where(eq(productionOrders.id, draft.id));
    await db
      .update(productionOrderVariants)
      .set({ receivedQuantity: "1" })
      .where(eq(productionOrderVariants.productionOrderId, draft.id));
    const received = await production.getProductionOrderActions(user, draft.id);
    expect(received.cancel).toBe(false);
    expect(received.rollback).toBe(false);
    expect(received.complete).toBe(true);
    expect(received.quality).toBe(true);
    await db
      .update(productionOrders)
      .set({ status: "completed" })
      .where(eq(productionOrders.id, draft.id));
    const closed = await production.getProductionOrderActions(user, draft.id);
    expect(closed.complete).toBe(false);
    expect(closed.quality).toBe(false);
  });
});
