import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  bomItems,
  boms,
  companies,
  createDb,
  cuttingOrderMaterials,
  cuttingOrderResults,
  cuttingOrders,
  documentLinks,
  documents,
  materials,
  materialStockItems,
  materialStockMovements,
  productionOrders,
  stockItems,
  stockMovements,
  productionOrderVariants,
  productSizes,
  productVariants,
  products,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  roles,
  specificationItems,
  specifications,
  suppliers,
  userRoles,
  users,
  warehouses,
  workshops,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  DocumentResponseDto,
  MaterialResponseDto,
  ProductProductionResponseDto,
  ProductResponseDto,
  ProductionOrderResponseDto,
  ProductVariantResponseDto,
  PurchaseOrderResponseDto,
  SpecificationResponseDto,
  SupplierResponseDto,
  WarehouseResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { TokenService } from "../auth/token.service";
import { hashPassword } from "../identity/password-hasher";
import { authHeader } from "../test-support/auth-test-helper";

interface ErrorResponseBody {
  code?: string;
  message?: string;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

// «История производства модели» (GET /products/:id/production, Model-first
// Minimal Core, ПРОМПТ №06.1) — Модель → Спецификации → Партии → История,
// tenant isolation, агрегаты, обратная совместимость с партиями без
// specification_id.
describe("GET /products/:id/production (Model-first, e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  let tokenService: TokenService;
  const createdCompanyNames: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;
    tokenService = app.get(TokenService);
  });

  afterAll(async () => {
    for (const name of createdCompanyNames) {
      const [company] = await db.select().from(companies).where(eq(companies.name, name));
      if (!company) continue;

      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
      for (const product of companyProducts) {
        const links = await db.select().from(documentLinks).where(and(eq(documentLinks.entityType, "product"), eq(documentLinks.entityId, product.id)));
        await db.delete(documentLinks).where(and(eq(documentLinks.entityType, "product"), eq(documentLinks.entityId, product.id)));
        for (const link of links) {
          await db.delete(documents).where(eq(documents.id, link.documentId));
        }
      }

      const companyOrders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company.id));
      for (const order of companyOrders) {
        const orderCuttingOrders = await db.select().from(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
        for (const cuttingOrder of orderCuttingOrders) {
          await db.delete(cuttingOrderMaterials).where(eq(cuttingOrderMaterials.cuttingOrderId, cuttingOrder.id));
          await db.delete(cuttingOrderResults).where(eq(cuttingOrderResults.cuttingOrderId, cuttingOrder.id));
        }
        await db.delete(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
        await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
      }
      await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));

      const companySpecs = await db.select().from(specifications).where(eq(specifications.companyId, company.id));
      for (const spec of companySpecs) {
        await db.delete(specificationItems).where(eq(specificationItems.specificationId, spec.id));
      }
      await db.delete(specifications).where(eq(specifications.companyId, company.id));

      await db.delete(workshops).where(eq(workshops.companyId, company.id));

      const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
      for (const bom of companyBoms) {
        await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
      }
      await db.delete(boms).where(eq(boms.companyId, company.id));

      const companyPurchaseOrders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
      for (const po of companyPurchaseOrders) {
        await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
      }
      await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
      await db.delete(suppliers).where(eq(suppliers.companyId, company.id));

      const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
      for (const warehouse of companyWarehouses) {
        const materialStock = await db.select().from(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
        for (const item of materialStock) {
          await db.delete(materialStockMovements).where(eq(materialStockMovements.materialStockItemId, item.id));
        }
        await db.delete(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));

        // Готовые SKU, зачисленные при приёмке партии (receiveProductionOrder) —
        // отдельно от materialStockItems выше (тот про сырьё, этот про готовое
        // изделие), см. CLAUDE.md глоссарий stock/stockItem.
        const finishedStock = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        for (const item of finishedStock) {
          await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
        }
        await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
      }
      await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
      await db.delete(materials).where(eq(materials.companyId, company.id));

      for (const product of companyProducts) {
        await db.delete(productSizes).where(eq(productSizes.productId, product.id));
        await db.delete(productVariants).where(eq(productVariants.productId, product.id));
      }
      await db.delete(products).where(eq(products.companyId, company.id));

      await db.delete(auditLog).where(eq(auditLog.companyId, company.id));
      const companyUsers = await db.select().from(users).where(eq(users.companyId, company.id));
      for (const user of companyUsers) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
        await db.delete(userRoles).where(eq(userRoles.userId, user.id));
      }
      await db.delete(users).where(eq(users.companyId, company.id));
      await db.delete(companies).where(eq(companies.id, company.id));
    }
    await app.close();
  });

  async function createCompanyWithRoleToken(companyName: string, roleCode: string): Promise<{ companyId: string; accessToken: string }> {
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const [user] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: `product-prod-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: hashPassword("test-password-123"),
        fullName: "Test User",
      })
      .returning();
    if (!user) throw new Error("Не удалось создать тестового пользователя");

    const [role] = await db.select().from(roles).where(and(isNull(roles.companyId), eq(roles.code, roleCode))).limit(1);
    if (!role) throw new Error(`Предустановленная роль "${roleCode}" не найдена — проверьте миграцию 0007`);
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

    const accessToken = tokenService.signAccessToken({ sub: user.id, companyId: company.id, roles: [roleCode] });
    return { companyId: company.id, accessToken };
  }

  // Модель с двумя цветами × двумя размерами + утверждённые нормы расхода +
  // склад — минимум, нужный для полного цикла партии до "received".
  async function setupApprovedProduct(
    accessToken: string,
    label: string,
  ): Promise<{
    product: ProductResponseDto;
    workshop: WorkshopResponseDto;
    variants: ProductVariantResponseDto[];
    material: MaterialResponseDto;
    warehouse: WarehouseResponseDto;
    bom: BomResponseDto;
  }> {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка МодельФёрст ${suffix}`, code: `MF-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .put(`/v1/products/${product.id}/sizes`)
      .set(...authHeader(accessToken))
      .send({
        sizes: [
          { size: "48-50", ratioWeight: 1 },
          { size: "52-54", ratioWeight: 1 },
        ],
      })
      .expect(200);
    await request(httpServer)
      .post(`/v1/products/${product.id}/colors`)
      .set(...authHeader(accessToken))
      .send({ color: "Петроль", colorCode: "PETROL" })
      .expect(201);
    await request(httpServer)
      .post(`/v1/products/${product.id}/colors`)
      .set(...authHeader(accessToken))
      .send({ color: "Чёрный", colorCode: "BLACK" })
      .expect(201);
    const variantsResponse = await request(httpServer)
      .get(`/v1/product-variants`)
      .set(...authHeader(accessToken))
      .query({ productId: product.id })
      .expect(200);
    const variants = variantsResponse.body as ProductVariantResponseDto[];
    if (variants.length !== 4) throw new Error("Варианты модели не создались");

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех МФ ${suffix}`, contractNumber: `Д-МФ-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Двухнитка МФ ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад МФ ${suffix}` })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик МФ ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;
    const purchaseOrderResponse = await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "RUB", items: [{ materialId: material.id, quantity: 500, unitPrice: 300 }] })
      .expect(201);
    const purchaseOrder = purchaseOrderResponse.body as PurchaseOrderResponseDto;
    await request(httpServer).post(`/v1/purchase-orders/${purchaseOrder.id}/confirm`).set(...authHeader(accessToken)).expect(201);
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);

    const bomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 0.5, wastePercent: 0 }] })
      .expect(201);
    const bomApprovedResponse = await request(httpServer)
      .post(`/v1/boms/${(bomResponse.body as BomResponseDto).id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const bom = bomApprovedResponse.body as BomResponseDto;

    return { product, workshop, variants, material, warehouse, bom };
  }

  async function createApprovedSpecification(
    accessToken: string,
    workshopId: string,
    productId: string,
    items: Array<{ productVariantId: string; quantity: number; unitPrice: number }>,
  ): Promise<SpecificationResponseDto> {
    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId, productId, items })
      .expect(201);
    const draft = draftResponse.body as SpecificationResponseDto;
    const approvedResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    return approvedResponse.body as SpecificationResponseDto;
  }

  it("история пуста для модели без единой партии (aggregates нулевые, batches — пустой массив)", async () => {
    const companyName = `E2E ProdHistory Empty ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product } = await setupApprovedProduct(accessToken, "Empty");

    const response = await request(httpServer)
      .get(`/v1/products/${product.id}/production`)
      .set(...authHeader(accessToken))
      .expect(200);
    const body = response.body as ProductProductionResponseDto;
    expect(body).toEqual({
      aggregates: { totalProduced: 0, batchCount: 0, completed: 0, inProgress: 0, other: 0 },
      batches: [],
    });
  });

  it("повторные партии одной модели: две партии из двух разных спецификаций попадают в общую историю, отсортированы от новых к старым", async () => {
    const companyName = `E2E ProdHistory Repeat ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variants } = await setupApprovedProduct(accessToken, "Repeat");
    const petrol48 = variants.find((v) => v.color === "Петроль" && v.size === "48-50")!;
    const black52 = variants.find((v) => v.color === "Чёрный" && v.size === "52-54")!;

    const spec1 = await createApprovedSpecification(accessToken, workshop.id, product.id, [
      { productVariantId: petrol48.id, quantity: 10, unitPrice: 900 },
    ]);
    const order1Response = await request(httpServer)
      .post(`/v1/specifications/${spec1.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order1 = order1Response.body as ProductionOrderResponseDto;

    const spec2 = await createApprovedSpecification(accessToken, workshop.id, product.id, [
      { productVariantId: black52.id, quantity: 15, unitPrice: 950 },
    ]);
    const order2Response = await request(httpServer)
      .post(`/v1/specifications/${spec2.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order2 = order2Response.body as ProductionOrderResponseDto;

    const response = await request(httpServer)
      .get(`/v1/products/${product.id}/production`)
      .set(...authHeader(accessToken))
      .expect(200);
    const body = response.body as ProductProductionResponseDto;

    expect(body.aggregates).toEqual({ totalProduced: 0, batchCount: 2, completed: 0, inProgress: 2, other: 0 });
    expect(body.batches).toHaveLength(2);
    // Новая партия (order2) — первая в списке.
    expect(body.batches[0]).toMatchObject({
      id: order2.id,
      orderNumber: order2.orderNumber,
      productId: product.id,
      productName: product.name,
      workshopName: workshop.name,
      specificationId: spec2.id,
      specNumber: spec2.specNumber,
    });
    expect(body.batches[0].breakdown).toEqual([{ color: "Чёрный", quantity: 15, sizes: [{ size: "52-54", quantity: 15 }] }]);
    expect(body.batches[1]).toMatchObject({ id: order1.id, specificationId: spec1.id, specNumber: spec1.specNumber });
    expect(body.batches[1].breakdown).toEqual([{ color: "Петроль", quantity: 10, sizes: [{ size: "48-50", quantity: 10 }] }]);
  });

  it("раскладка группирует несколько размеров одного цвета в одной партии, сортировка размеров — по раскладке модели", async () => {
    const companyName = `E2E ProdHistory Breakdown ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variants } = await setupApprovedProduct(accessToken, "Breakdown");
    const petrol48 = variants.find((v) => v.color === "Петроль" && v.size === "48-50")!;
    const petrol52 = variants.find((v) => v.color === "Петроль" && v.size === "52-54")!;
    const black48 = variants.find((v) => v.color === "Чёрный" && v.size === "48-50")!;

    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, [
      { productVariantId: petrol48.id, quantity: 12, unitPrice: 900 },
      { productVariantId: petrol52.id, quantity: 8, unitPrice: 900 },
      { productVariantId: black48.id, quantity: 5, unitPrice: 900 },
    ]);
    await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);

    const response = await request(httpServer)
      .get(`/v1/products/${product.id}/production`)
      .set(...authHeader(accessToken))
      .expect(200);
    const body = response.body as ProductProductionResponseDto;
    expect(body.batches).toHaveLength(1);
    const breakdown = body.batches[0].breakdown;
    const petrolRow = breakdown.find((row) => row.color === "Петроль");
    expect(petrolRow).toEqual({
      color: "Петроль",
      quantity: 20,
      sizes: [
        { size: "48-50", quantity: 12 },
        { size: "52-54", quantity: 8 },
      ],
    });
    const blackRow = breakdown.find((row) => row.color === "Чёрный");
    expect(blackRow).toEqual({ color: "Чёрный", quantity: 5, sizes: [{ size: "48-50", quantity: 5 }] });
  });

  it("партия старого формата (без specification_id, созданная вручную) попадает в историю модели", async () => {
    const companyName = `E2E ProdHistory Legacy ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variants, bom } = await setupApprovedProduct(accessToken, "Legacy");
    const petrol48 = variants.find((v) => v.color === "Петроль" && v.size === "48-50")!;

    // Ручное создание — тот же путь, что существовал до Этапа 3
    // (createProductionOrderDraft), без обращения к спецификациям вовсе.
    const manualOrderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: bom.id,
        workshopId: workshop.id,
        plannedQuantity: 7,
        agreedUnitPrice: 800,
        variants: [{ productVariantId: petrol48.id, quantity: 7 }],
      })
      .expect(201);
    const manualOrder = manualOrderResponse.body as ProductionOrderResponseDto;
    expect(manualOrder.specificationId).toBeNull();
    expect(manualOrder.status).toBe("draft");

    const response = await request(httpServer)
      .get(`/v1/products/${product.id}/production`)
      .set(...authHeader(accessToken))
      .expect(200);
    const body = response.body as ProductProductionResponseDto;
    expect(body.aggregates).toEqual({ totalProduced: 0, batchCount: 1, completed: 0, inProgress: 0, other: 1 });
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0]).toMatchObject({ id: manualOrder.id, specificationId: null, specNumber: null, status: "draft" });
  });

  it("totalProduced считается по фактически принятому количеству (receivedQuantity), а не по заказанному", async () => {
    const companyName = `E2E ProdHistory Received ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variants, warehouse } = await setupApprovedProduct(accessToken, "Received");
    const petrol48 = variants.find((v) => v.color === "Петроль" && v.size === "48-50")!;

    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, [
      { productVariantId: petrol48.id, quantity: 20, unitPrice: 900 },
    ]);
    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "in_progress" })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "ready_for_pickup" })
      .expect(201);
    // Фактически принято 18 из 20 заказанных — "ordered ≠ received".
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id, receivedVariants: [{ productVariantId: petrol48.id, quantity: 18 }] })
      .expect(201);

    const response = await request(httpServer)
      .get(`/v1/products/${product.id}/production`)
      .set(...authHeader(accessToken))
      .expect(200);
    const body = response.body as ProductProductionResponseDto;
    expect(body.aggregates).toEqual({ totalProduced: 18, batchCount: 1, completed: 1, inProgress: 0, other: 0 });
    expect(body.batches[0].status).toBe("received");
  });

  it("фото модели попадает в photoDocumentId каждой партии, но НЕ дублируется — общий id для всех партий модели", async () => {
    const companyName = `E2E ProdHistory Photo ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variants } = await setupApprovedProduct(accessToken, "Photo");
    const petrol48 = variants.find((v) => v.color === "Петроль" && v.size === "48-50")!;
    const black48 = variants.find((v) => v.color === "Чёрный" && v.size === "48-50")!;

    const uploadResponse = await request(httpServer)
      .post("/v1/documents")
      .set(...authHeader(accessToken))
      .field("docType", "photo_product")
      .field("entityType", "product")
      .field("entityId", product.id)
      .attach("file", Buffer.from("fake-jpeg-bytes"), { filename: "model.jpg", contentType: "image/jpeg" })
      .expect(201);
    const photoDoc = uploadResponse.body as DocumentResponseDto;

    const spec1 = await createApprovedSpecification(accessToken, workshop.id, product.id, [
      { productVariantId: petrol48.id, quantity: 5, unitPrice: 900 },
    ]);
    await request(httpServer).post(`/v1/specifications/${spec1.id}/production-order`).set(...authHeader(accessToken)).send({}).expect(201);
    const spec2 = await createApprovedSpecification(accessToken, workshop.id, product.id, [
      { productVariantId: black48.id, quantity: 6, unitPrice: 900 },
    ]);
    await request(httpServer).post(`/v1/specifications/${spec2.id}/production-order`).set(...authHeader(accessToken)).send({}).expect(201);

    const response = await request(httpServer)
      .get(`/v1/products/${product.id}/production`)
      .set(...authHeader(accessToken))
      .expect(200);
    const body = response.body as ProductProductionResponseDto;
    expect(body.batches).toHaveLength(2);
    expect(body.batches[0].photoDocumentId).toBe(photoDoc.id);
    expect(body.batches[1].photoDocumentId).toBe(photoDoc.id);
  });

  it("tenant isolation: чужой productId — 404 (не раскрывает существование чужой модели), чужие партии и чужое фото не попадают в ответ", async () => {
    const companyAName = `E2E ProdHistory TenantA ${Date.now()}`;
    const companyBName = `E2E ProdHistory TenantB ${Date.now()}`;
    const companyA = await createCompanyWithRoleToken(companyAName, "owner");
    const companyB = await createCompanyWithRoleToken(companyBName, "owner");

    const productA = await setupApprovedProduct(companyA.accessToken, "TenantA");
    const productB = await setupApprovedProduct(companyB.accessToken, "TenantB");

    const variantA = productA.variants.find((v) => v.color === "Петроль" && v.size === "48-50")!;
    const specA = await createApprovedSpecification(companyA.accessToken, productA.workshop.id, productA.product.id, [
      { productVariantId: variantA.id, quantity: 9, unitPrice: 900 },
    ]);
    await request(httpServer)
      .post(`/v1/specifications/${specA.id}/production-order`)
      .set(...authHeader(companyA.accessToken))
      .send({})
      .expect(201);

    // Компания B не видит чужую модель вовсе — 404, не пустая история.
    const crossTenantResponse = await request(httpServer)
      .get(`/v1/products/${productA.product.id}/production`)
      .set(...authHeader(companyB.accessToken))
      .expect(404);
    expect((crossTenantResponse.body as ErrorResponseBody).code).toBe("PRODUCT_NOT_FOUND");

    // История модели B пуста и не содержит партий/агрегатов компании A —
    // даже если бы обе модели случайно совпали по productId (невозможно по
    // UUID, но проверяем изоляцию агрегатов явно) партии другой компании не
    // должны попасть в подсчёт.
    const ownHistoryResponse = await request(httpServer)
      .get(`/v1/products/${productB.product.id}/production`)
      .set(...authHeader(companyB.accessToken))
      .expect(200);
    const ownHistory = ownHistoryResponse.body as ProductProductionResponseDto;
    expect(ownHistory.batches).toHaveLength(0);
    expect(ownHistory.aggregates).toEqual({ totalProduced: 0, batchCount: 0, completed: 0, inProgress: 0, other: 0 });
  });
});
