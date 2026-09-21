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
  materials,
  materialStockItems,
  materialStockMovements,
  productionOrders,
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
  BatchPassportResponseDto,
  BomResponseDto,
  CuttingOrderResponseDto,
  MaterialResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  PurchaseOrderResponseDto,
  SpecificationAvailableQuantityResponseDto,
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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

interface ErrorResponseBody {
  statusCode: number;
  code?: string;
  message: string;
}

// Этап 3 «Production Master» (владелец проекта, 2026-09-12) — «Утверждённая
// спецификация → производственная партия». Отдельный файл (не
// specification.e2e.spec.ts) — свой счётчик rate-limit /auth/login и чтобы
// не раздувать уже большой существующий файл; токены выпускаются напрямую
// через TokenService, тот же приём, что и в specification.e2e.spec.ts.
describe("Specification → Production Order (Этап 3, e2e)", () => {
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
        const stockItems = await db.select().from(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
        for (const item of stockItems) {
          await db.delete(materialStockMovements).where(eq(materialStockMovements.materialStockItemId, item.id));
        }
        await db.delete(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
      }
      await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
      await db.delete(materials).where(eq(materials.companyId, company.id));

      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
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
        email: `spec-po-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

  // Модель + вариант + цех + утверждённые нормы расхода (0.5 м/шт, без
  // отходов) + склад — минимум, нужный для создания партии из спецификации.
  // onHandFabric управляет остатком (для проверки дефицита), null — приход
  // не оформляется вовсе.
  async function setupApprovedProduct(
    accessToken: string,
    label: string,
    onHandFabric: number | null = 100,
  ): Promise<{
    product: ProductResponseDto;
    workshop: WorkshopResponseDto;
    variant: ProductVariantResponseDto;
    material: MaterialResponseDto;
    warehouse: WarehouseResponseDto;
    bom: BomResponseDto;
  }> {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка ПМ ${suffix}`, code: `PM-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .put(`/v1/products/${product.id}/sizes`)
      .set(...authHeader(accessToken))
      .send({ sizes: [{ size: "48-50", ratioWeight: 1 }] })
      .expect(200);
    await request(httpServer)
      .post(`/v1/products/${product.id}/colors`)
      .set(...authHeader(accessToken))
      .send({ color: "Графит", colorCode: "GRAFIT" })
      .expect(201);
    const variantsResponse = await request(httpServer)
      .get(`/v1/product-variants`)
      .set(...authHeader(accessToken))
      .query({ productId: product.id })
      .expect(200);
    const variant = (variantsResponse.body as ProductVariantResponseDto[])[0];
    if (!variant) throw new Error("Вариант модели не создался");

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех ПМ ${suffix}`, contractNumber: `Д-ПМ-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Двухнитка ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад ПМ ${suffix}` })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    if (onHandFabric !== null) {
      const supplierResponse = await request(httpServer)
        .post("/v1/suppliers")
        .set(...authHeader(accessToken))
        .send({ name: `Поставщик ПМ ${suffix}`, type: "fabric" })
        .expect(201);
      const supplier = supplierResponse.body as SupplierResponseDto;
      const purchaseOrderResponse = await request(httpServer)
        .post("/v1/purchase-orders")
        .set(...authHeader(accessToken))
        .send({ supplierId: supplier.id, currency: "RUB", items: [{ materialId: material.id, quantity: onHandFabric, unitPrice: 300 }] })
        .expect(201);
      const purchaseOrder = purchaseOrderResponse.body as PurchaseOrderResponseDto;
      await request(httpServer).post(`/v1/purchase-orders/${purchaseOrder.id}/confirm`).set(...authHeader(accessToken)).expect(201);
      await request(httpServer)
        .post(`/v1/purchase-orders/${purchaseOrder.id}/receive`)
        .set(...authHeader(accessToken))
        .send({ warehouseId: warehouse.id })
        .expect(201);
    }

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

    return { product, workshop, variant, material, warehouse, bom };
  }

  async function createApprovedSpecification(
    accessToken: string,
    workshopId: string,
    productId: string,
    variantId: string,
    quantity: number,
    unitPrice: number,
  ): Promise<SpecificationResponseDto> {
    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId, productId, items: [{ productVariantId: variantId, quantity, unitPrice }] })
      .expect(201);
    const draft = draftResponse.body as SpecificationResponseDto;
    const approvedResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    return approvedResponse.body as SpecificationResponseDto;
  }

  it("создаёт партию из утверждённой спецификации: auto-confirm placed, независимый номер, variants 1:1 с ценой из спецификации, cost_snapshot по Варианту B", async () => {
    const companyName = `E2E SpecPO Main ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variant, material, bom } = await setupApprovedProduct(accessToken, "A", 100);

    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 20, 900);

    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    expect(order.status).toBe("placed");
    expect(order.specificationId).toBe(spec.id);
    expect(order.orderNumber).toBe(1);
    // Номер партии независим от specNumber спецификации (оба могут быть 1
    // случайно совпадать, но это не гарантируется никаким общим счётчиком) —
    // здесь важно, что оба значения существуют раздельно.
    expect(spec.specNumber).toBe(1);
    expect(order.productId).toBe(product.id);
    expect(order.workshopId).toBe(workshop.id);
    expect(order.bomId).toBe(bom.id);
    expect(order.plannedQuantity).toBe("20.000");
    expect(order.variants).toHaveLength(1);
    expect(order.variants[0]).toMatchObject({ productVariantId: variant.id, quantity: "20.000", variantType: "new", unitPrice: "900.00" });

    // cost_snapshot: коммерческие поля — из snapshot спецификации (Вариант B).
    expect(order.costSnapshot).toMatchObject({
      contractNumber: workshop.contractNumber,
      contractorName: workshop.name,
      materialNormsVersion: 1,
    });
    expect(order.costSnapshot?.materialNorms?.[0]).toMatchObject({ materialId: material.id, quantityPerUnit: 0.5 });

    // Паспорт партии отдаёт orderNumber и специю.
    const passportResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}/passport`)
      .set(...authHeader(accessToken))
      .expect(200);
    const passport = passportResponse.body as BatchPassportResponseDto;
    expect(passport.orderNumber).toBe(1);
    expect(passport.specification).toMatchObject({ id: spec.id, specNumber: spec.specNumber });

    // Материал: требуется 0.5×20=10, на складе 100 → доступно, дефицита нет.
    const materialRow = passport.materialRequirement.find((row) => row.materialId === material.id);
    expect(materialRow).toMatchObject({ totalRequired: 10, onHand: 100, isAvailable: true, deficit: 0 });
  });

  it("draft спецификация — 400; отсутствие утверждённых норм расхода МОДЕЛИ — не блокирует создание партии (ПРОМПТ №3, раздел 8: нет обязательного BOM-гейта)", async () => {
    const companyName = `E2E SpecPO NotApproved ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant } = await setupApprovedProduct(accessToken, "B", 100);

    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 5, unitPrice: 100 }] })
      .expect(201);
    const draft = draftResponse.body as SpecificationResponseDto;

    const notApprovedResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(400);
    expect((notApprovedResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_NOT_APPROVED");

    // Отдельная модель без утверждённых норм расхода вовсе.
    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Без норм ${Date.now()}`, code: `NONORM-${Date.now()}` })
      .expect(201);
    const productNoBom = productResponse.body as ProductResponseDto;
    await request(httpServer)
      .put(`/v1/products/${productNoBom.id}/sizes`)
      .set(...authHeader(accessToken))
      .send({ sizes: [{ size: "S", ratioWeight: 1 }] })
      .expect(200);
    await request(httpServer)
      .post(`/v1/products/${productNoBom.id}/colors`)
      .set(...authHeader(accessToken))
      .send({ color: "Синий", colorCode: "BLUE" })
      .expect(201);
    const variantsNoBomResponse = await request(httpServer)
      .get(`/v1/product-variants`)
      .set(...authHeader(accessToken))
      .query({ productId: productNoBom.id })
      .expect(200);
    const variantNoBom = (variantsNoBomResponse.body as ProductVariantResponseDto[])[0];
    if (!variantNoBom) throw new Error("Вариант модели не создался");

    const specNoBom = await createApprovedSpecification(accessToken, workshop.id, productNoBom.id, variantNoBom.id, 5, 100);
    // Аудит пользовательского пути (owner, 2026-09-21, живой прогон «QA
    // Стеганка»): раньше это было 400 SPECIFICATION_PRODUCT_NORMS_NOT_APPROVED
    // — единственный путь создания партии, требовавший заранее заведённого
    // BOM, хотя прямой POST /production-orders уже давно (fe043dd,
    // create-empty-bom.ts) сам заводит пустой approved BOM без участия
    // пользователя. Два входа в создание партии обязаны вести себя одинаково —
    // модель без единого BOM больше не блокирует утверждённую спецификацию.
    const noBomResponse = await request(httpServer)
      .post(`/v1/specifications/${specNoBom.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const orderNoBom = noBomResponse.body as ProductionOrderResponseDto;
    expect(orderNoBom.bomId).toBeTruthy();
    const [autoBom] = await db.select().from(boms).where(eq(boms.id, orderNoBom.bomId));
    expect(autoBom?.status).toBe("approved");
    const autoBomItemRows = await db.select().from(bomItems).where(eq(bomItems.bomId, orderNoBom.bomId));
    expect(autoBomItemRows).toHaveLength(0);
  });

  it("чужая компания получает 404 при попытке создать партию из чужой спецификации", async () => {
    const { accessToken: tokenA } = await createCompanyWithRoleToken(`E2E SpecPO Tenant A ${Date.now()}`, "owner");
    const { accessToken: tokenB } = await createCompanyWithRoleToken(`E2E SpecPO Tenant B ${Date.now()}`, "owner");
    const { workshop, product, variant } = await setupApprovedProduct(tokenA, "C", 100);
    const spec = await createApprovedSpecification(tokenA, workshop.id, product.id, variant.id, 5, 100);

    await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(tokenB))
      .send({})
      .expect(404);

    await request(httpServer)
      .get(`/v1/specifications/${spec.id}/available-quantity`)
      .set(...authHeader(tokenB))
      .expect(404);
  });

  it("изменение реквизитов цеха ПОСЛЕ approve спецификации не влияет на cost_snapshot новой партии (Вариант B — frozen)", async () => {
    const companyName = `E2E SpecPO Frozen ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant } = await setupApprovedProduct(accessToken, "D", 100);
    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 5, 100);

    await request(httpServer)
      .patch(`/v1/workshops/${workshop.id}`)
      .set(...authHeader(accessToken))
      .send({ contractNumber: "ДРУГОЙ-НОМЕР-ПОСЛЕ", paymentTerms: "100% предоплата" })
      .expect(200);

    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    expect(order.costSnapshot?.contractNumber).toBe(workshop.contractNumber);
    expect(order.costSnapshot?.contractNumber).not.toBe("ДРУГОЙ-НОМЕР-ПОСЛЕ");
  });

  it("номер партии независим и атомарен — последовательные партии из разных спецификаций получают возрастающие номера", async () => {
    const companyName = `E2E SpecPO Numbering ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant } = await setupApprovedProduct(accessToken, "E", 100);

    const specX = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 2, 100);
    const specY = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 2, 100);

    const orderXResponse = await request(httpServer)
      .post(`/v1/specifications/${specX.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const orderYResponse = await request(httpServer)
      .post(`/v1/specifications/${specY.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);

    const orderX = orderXResponse.body as ProductionOrderResponseDto;
    const orderY = orderYResponse.body as ProductionOrderResponseDto;
    expect(orderY.orderNumber).toBe((orderX.orderNumber ?? 0) + 1);
  });

  it("1 спецификация → несколько частичных партий; нельзя превысить остаток; полностью размещённая спецификация — 400", async () => {
    const companyName = `E2E SpecPO Partial ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant } = await setupApprovedProduct(accessToken, "F", 1000);
    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 100, 500);

    // Остаток до всех партий — 100 доступно.
    const availableBefore = (
      await request(httpServer).get(`/v1/specifications/${spec.id}/available-quantity`).set(...authHeader(accessToken)).expect(200)
    ).body as SpecificationAvailableQuantityResponseDto;
    expect(availableBefore.items[0]).toMatchObject({ productVariantId: variant.id, specifiedQuantity: 100, allocatedQuantity: 0, availableQuantity: 100 });

    // Партия №1 — частично, 30 из 100.
    const order1Response = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({ items: [{ productVariantId: variant.id, quantity: 30 }] })
      .expect(201);
    const order1 = order1Response.body as ProductionOrderResponseDto;
    expect(order1.plannedQuantity).toBe("30.000");

    // Спецификация сама не изменилась (status/snapshotJson/items).
    const specAfterOrder1 = (
      await request(httpServer).get(`/v1/specifications/${spec.id}`).set(...authHeader(accessToken)).expect(200)
    ).body as SpecificationResponseDto;
    expect(specAfterOrder1.status).toBe("approved");
    expect(specAfterOrder1.items[0]?.quantity).toBe("100.000");

    // Остаток теперь 70.
    const availableAfterOrder1 = (
      await request(httpServer).get(`/v1/specifications/${spec.id}/available-quantity`).set(...authHeader(accessToken)).expect(200)
    ).body as SpecificationAvailableQuantityResponseDto;
    expect(availableAfterOrder1.items[0]).toMatchObject({ allocatedQuantity: 30, availableQuantity: 70 });

    // Нельзя запросить больше остатка (70).
    const exceedResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({ items: [{ productVariantId: variant.id, quantity: 71 }] })
      .expect(400);
    expect((exceedResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_QUANTITY_EXCEEDS_AVAILABLE");

    // Партия №2 без явных items — берёт ВСЁ доступное (70), минимум кликов.
    const order2Response = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order2 = order2Response.body as ProductionOrderResponseDto;
    expect(order2.plannedQuantity).toBe("70.000");
    expect(order2.orderNumber).toBe((order1.orderNumber ?? 0) + 1);

    // Спецификация полностью размещена — новая попытка отклоняется.
    const fullyAllocatedResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(400);
    expect((fullyAllocatedResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_FULLY_ALLOCATED");
  });

  it("остаток материала считается по всем складам компании; дефицит информационный и не блокирует создание партии", async () => {
    const companyName = `E2E SpecPO Deficit ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    // На складе всего 3 м, а на партию (0.5×20=10) нужно 10 — дефицит 7.
    const { workshop, product, variant, material } = await setupApprovedProduct(accessToken, "G", 3);

    // Второй склад той же компании — тоже с остатком; агрегат должен
    // сложить оба склада, не только первый.
    const secondWarehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Второй склад ${Date.now()}` })
      .expect(201);
    const secondWarehouse = secondWarehouseResponse.body as WarehouseResponseDto;
    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик 2 ${Date.now()}`, type: "fabric" })
      .expect(201);
    const supplier2 = supplierResponse.body as SupplierResponseDto;
    const po2Response = await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier2.id, currency: "RUB", items: [{ materialId: material.id, quantity: 2, unitPrice: 300 }] })
      .expect(201);
    const po2 = po2Response.body as PurchaseOrderResponseDto;
    await request(httpServer).post(`/v1/purchase-orders/${po2.id}/confirm`).set(...authHeader(accessToken)).expect(201);
    await request(httpServer)
      .post(`/v1/purchase-orders/${po2.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: secondWarehouse.id })
      .expect(201);
    // Итого по компании: 3 + 2 = 5 м, требуется 10 → дефицит 5.

    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 20, 500);
    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201); // Дефицит НЕ блокирует создание партии.
    const order = orderResponse.body as ProductionOrderResponseDto;

    const passportResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}/passport`)
      .set(...authHeader(accessToken))
      .expect(200);
    const passport = passportResponse.body as BatchPassportResponseDto;
    const materialRow = passport.materialRequirement.find((row) => row.materialId === material.id);
    expect(materialRow).toMatchObject({ totalRequired: 10, onHand: 5, isAvailable: false, deficit: 5 });
  });

  it("tenant isolation: остаток материала другой компании не попадает в расчёт onHand", async () => {
    const { accessToken: tokenA } = await createCompanyWithRoleToken(`E2E SpecPO Stock A ${Date.now()}`, "owner");
    const { accessToken: tokenB } = await createCompanyWithRoleToken(`E2E SpecPO Stock B ${Date.now()}`, "owner");

    // Компания B копит большой остаток такого же по названию материала —
    // не должен примешаться к расчёту компании A.
    await setupApprovedProduct(tokenB, "H-other", 999);

    const { workshop, product, variant, material } = await setupApprovedProduct(tokenA, "H", 4);
    const spec = await createApprovedSpecification(tokenA, workshop.id, product.id, variant.id, 20, 500);
    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(tokenA))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    const passport = (
      await request(httpServer).get(`/v1/production-orders/${order.id}/passport`).set(...authHeader(tokenA)).expect(200)
    ).body as BatchPassportResponseDto;
    const materialRow = passport.materialRequirement.find((row) => row.materialId === material.id);
    // onHand — ровно 4 (склад компании A), а не 999+4.
    expect(materialRow?.onHand).toBe(4);
  });

  it("старая партия без specification_id продолжает работать в паспорте (обратная совместимость)", async () => {
    const companyName = `E2E SpecPO Legacy ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant, bom } = await setupApprovedProduct(accessToken, "I", 100);

    // Ручной путь создания партии (draft → confirm), без спецификации.
    const manualOrderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: bom.id,
        workshopId: workshop.id,
        plannedQuantity: 5,
        agreedUnitPrice: 500,
        variants: [{ productVariantId: variant.id, quantity: 5 }],
      })
      .expect(201);
    const manualOrder = manualOrderResponse.body as ProductionOrderResponseDto;
    expect(manualOrder.specificationId).toBeNull();
    expect(manualOrder.orderNumber).toBeNull();
    await request(httpServer).post(`/v1/production-orders/${manualOrder.id}/confirm`).set(...authHeader(accessToken)).expect(201);

    const passportResponse = await request(httpServer)
      .get(`/v1/production-orders/${manualOrder.id}/passport`)
      .set(...authHeader(accessToken))
      .expect(200);
    const passport = passportResponse.body as BatchPassportResponseDto;
    expect(passport.orderNumber).toBeNull();
    expect(passport.specification).toBeNull();
  });

  it("раскрой партии, созданной из спецификации, читает нормы из cost_snapshot, а не из живой модели/BOM", async () => {
    const companyName = `E2E SpecPO Cutting ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant, material } = await setupApprovedProduct(accessToken, "J", 100);
    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 10, 500);

    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    // Норма меняется в новой версии BOM ПОСЛЕ создания партии.
    const newBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 5, wastePercent: 0 }] })
      .expect(201);
    await request(httpServer).post(`/v1/boms/${(newBomResponse.body as BomResponseDto).id}/approve`).set(...authHeader(accessToken)).expect(201);

    const cuttingResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cutting-orders`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const cutting = cuttingResponse.body as CuttingOrderResponseDto;
    // Партия создана из спецификации на норме 0.5 → требуется 0.5×10=5, а не
    // 5×10=50 (новая живая норма).
    expect(cutting.materials.find((row) => row.materialId === material.id)?.requiredQuantity).toBe(5);
  });

  it("возврат материала после кроя учитывается отдельно от расхода и корректно списывается/зачисляется на склад", async () => {
    const companyName = `E2E SpecPO Return ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { workshop, product, variant, material, warehouse } = await setupApprovedProduct(accessToken, "K", 100);
    const spec = await createApprovedSpecification(accessToken, workshop.id, product.id, variant.id, 10, 500);

    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    const cuttingResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cutting-orders`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const cutting = cuttingResponse.body as CuttingOrderResponseDto;
    await request(httpServer).post(`/v1/cutting-orders/${cutting.id}/issue`).set(...authHeader(accessToken)).send({}).expect(201);

    // Требуется 5 м (0.5×10). На складе было 100. Фактически израсходовано 4,
    // возвращено 0.5 (лишний обрезок вернули на склад отдельно от расхода).
    const factResponse = await request(httpServer)
      .post(`/v1/cutting-orders/${cutting.id}/result`)
      .set(...authHeader(accessToken))
      .send({
        warehouseId: warehouse.id,
        materials: [{ materialId: material.id, consumedQuantity: 4, returnedQuantity: 0.5 }],
        results: [{ productVariantId: variant.id, actualQuantity: 10 }],
      })
      .expect(201);
    const fact = factResponse.body as { cuttingOrder: CuttingOrderResponseDto };
    expect(fact.cuttingOrder.materials.find((row) => row.materialId === material.id)).toMatchObject({
      consumedQuantity: 4,
      returnedQuantity: 0.5,
    });

    // 100 - 4 (расход) + 0.5 (возврат) = 96.5.
    const [stockItem] = await db
      .select()
      .from(materialStockItems)
      .where(and(eq(materialStockItems.warehouseId, warehouse.id), eq(materialStockItems.materialId, material.id)));
    expect(Number(stockItem?.quantityOnHand)).toBe(96.5);
  });
});
