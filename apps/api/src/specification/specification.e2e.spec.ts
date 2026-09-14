import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  companies,
  createDb,
  documentDerivatives,
  documentLinks,
  documents,
  products,
  productSizes,
  productVariants,
  refreshTokens,
  roles,
  specificationItems,
  specifications,
  userRoles,
  users,
  workshops,
} from "@garmentos/db-schema";
import type { ProductResponseDto, ProductVariantResponseDto, SpecificationResponseDto, WorkshopResponseDto } from "@garmentos/shared-types";
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

describe("Specification API (e2e)", () => {
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

      const companySpecs = await db.select().from(specifications).where(eq(specifications.companyId, company.id));
      for (const spec of companySpecs) {
        await db.delete(specificationItems).where(eq(specificationItems.specificationId, spec.id));
      }
      await db.delete(specifications).where(eq(specifications.companyId, company.id));

      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
      for (const product of companyProducts) {
        await db.delete(productSizes).where(eq(productSizes.productId, product.id));
        await db.delete(productVariants).where(eq(productVariants.productId, product.id));
      }
      await db.delete(products).where(eq(products.companyId, company.id));
      await db.delete(workshops).where(eq(workshops.companyId, company.id));

      // PDF-тест (Этап 2) генерирует документы, привязанные к
      // entityType="specification" — тот же порядок очистки, что и в
      // production-order-orchestration.e2e.spec.ts.
      const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
      for (const doc of companyDocuments) {
        await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, doc.id));
      }
      await db.delete(documentLinks).where(eq(documentLinks.companyId, company.id));
      await db.delete(documents).where(eq(documents.companyId, company.id));

      // Этап 2 («Паспорт модели») подключил audit_log к CatalogService —
      // строки ссылаются на users.id, чистятся до удаления пользователей.
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

  // Компания + пользователь с заданной ролью + настоящий подписанный
  // access-токен, но БЕЗ вызова /v1/auth/login: тот ограничен ThrottlerGuard
  // (5 запросов/60 сек), а этому файлу нужно больше токенов подряд. Тот же
  // приём, что и в tenant-isolation.e2e.spec.ts — токен выпускается тем же
  // TokenService, что и при обычном логине, проверяется поведение guard'ов
  // и доменного слоя, а не сама выдача токена (она покрыта auth.e2e.spec.ts).
  async function createCompanyWithRoleToken(companyName: string, roleCode: string): Promise<{ companyId: string; accessToken: string }> {
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const [user] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: `spec-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: hashPassword("test-password-123"),
        fullName: "Test User",
      })
      .returning();
    if (!user) throw new Error("Не удалось создать тестового пользователя");

    const [role] = await db
      .select()
      .from(roles)
      .where(and(isNull(roles.companyId), eq(roles.code, roleCode)))
      .limit(1);
    if (!role) throw new Error(`Предустановленная роль "${roleCode}" не найдена — проверьте миграцию 0007`);
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

    const accessToken = tokenService.signAccessToken({ sub: user.id, companyId: company.id, roles: [roleCode] });
    return { companyId: company.id, accessToken };
  }

  // Готовит модель с одним вариантом (размер+цвет) и активный цех — минимум,
  // нужный для создания спецификации. Код модели включает Date.now(), чтобы
  // сгенерированный sku_code (глобально уникальный на всю таблицу
  // product_variants) не совпал между независимыми прогонами теста.
  async function setupModelAndWorkshop(
    accessToken: string,
    label: string,
  ): Promise<{ product: ProductResponseDto; workshop: WorkshopResponseDto; variant: ProductVariantResponseDto }> {
    const uniqueCode = `HUD-SPEC-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Худи Пилот ${label}`, code: uniqueCode })
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
    if (!variant) throw new Error("Вариант модели не создался — проверьте /products/:id/colors");

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех Спец ${label}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    return { product, workshop, variant };
  }

  it("создаёт черновик → утверждает → номер/предоплата/snapshot корректны; повторное утверждение — 409", async () => {
    const companyName = `E2E Spec ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variant } = await setupModelAndWorkshop(accessToken, "A");

    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 4000, unitPrice: 700 }] })
      .expect(201);
    const draft = draftResponse.body as SpecificationResponseDto;
    expect(draft.status).toBe("draft");
    expect(draft.specNumber).toBeNull();
    expect(draft.version).toBe(1);
    expect(draft.totalQuantity).toBe("4000.000");
    expect(draft.totalSum).toBe("2800000.00");
    expect(draft.totalSumCurrency).toBe("RUB");
    expect(draft.prepaymentAmount).toBeNull();
    expect(draft.snapshotJson).toBeNull();

    const approvedResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approved = approvedResponse.body as SpecificationResponseDto;
    expect(approved.status).toBe("approved");
    expect(approved.specNumber).toBe(1);
    // Эталонный пример: 2 800 000 × 70% = 1 960 000.
    expect(approved.prepaymentAmount).toBe("1960000.00");
    expect(approved.snapshotJson).toMatchObject({
      product: { name: product.name, code: product.code },
      prepaymentPercent: 70,
      prepaymentAmount: "1960000",
    });

    // Повторное утверждение того же черновика — конфликт, не тихая перезапись.
    const conflictResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(409);
    expect((conflictResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_NOT_DRAFT");

    // Второй, независимый черновик того же цеха получает следующий номер (2).
    const secondDraftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 10, unitPrice: 700 }] })
      .expect(201);
    const secondApproved = await request(httpServer)
      .post(`/v1/specifications/${(secondDraftResponse.body as SpecificationResponseDto).id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((secondApproved.body as SpecificationResponseDto).specNumber).toBe(2);

    // Список и получение по id.
    const listResponse = await request(httpServer)
      .get("/v1/specifications")
      .set(...authHeader(accessToken))
      .expect(200);
    expect((listResponse.body as SpecificationResponseDto[]).map((s) => s.id)).toEqual(
      expect.arrayContaining([draft.id, (secondDraftResponse.body as SpecificationResponseDto).id]),
    );

    const foundResponse = await request(httpServer)
      .get(`/v1/specifications/${draft.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((foundResponse.body as SpecificationResponseDto).id).toBe(draft.id);
  });

  it("POST /v1/specifications без строк — 400; неизвестный вариант — 404", async () => {
    const companyName = `E2E Spec Invalid ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop } = await setupModelAndWorkshop(accessToken, "B");

    await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [] })
      .expect(400);

    const notFoundResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({
        workshopId: workshop.id,
        productId: product.id,
        items: [{ productVariantId: "00000000-0000-0000-0000-000000000000", quantity: 1, unitPrice: 1 }],
      })
      .expect(404);
    expect((notFoundResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_VARIANT_NOT_FOUND");
  });

  it("«Создать на основе существующей» — источник не меняется, копия независима, номер не присваивается до approve", async () => {
    const companyName = `E2E Spec Based On ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variant } = await setupModelAndWorkshop(accessToken, "C");

    const sourceDraftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 4000, unitPrice: 700 }] })
      .expect(201);
    const source = sourceDraftResponse.body as SpecificationResponseDto;
    const approvedSourceResponse = await request(httpServer)
      .post(`/v1/specifications/${source.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approvedSource = approvedSourceResponse.body as SpecificationResponseDto;

    const copyResponse = await request(httpServer)
      .post("/v1/specifications/from-existing")
      .set(...authHeader(accessToken))
      .send({ sourceSpecificationId: source.id, overrideItems: [{ productVariantId: variant.id, quantity: 2000, unitPrice: 700 }] })
      .expect(201);
    const copy = copyResponse.body as SpecificationResponseDto;

    expect(copy.id).not.toBe(source.id);
    expect(copy.status).toBe("draft");
    expect(copy.specNumber).toBeNull();
    expect(copy.basedOnSpecificationId).toBe(source.id);
    expect(copy.totalQuantity).toBe("2000.000");
    expect(copy.totalSum).toBe("1400000.00");

    // Источник — approved, номер и статус не изменились после копирования.
    const refetchedSourceResponse = await request(httpServer)
      .get(`/v1/specifications/${source.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const refetchedSource = refetchedSourceResponse.body as SpecificationResponseDto;
    expect(refetchedSource.status).toBe("approved");
    expect(refetchedSource.specNumber).toBe(approvedSource.specNumber);
    expect(refetchedSource.totalSum).toBe(source.totalSum);
  });

  it("viewer не может создать спецификацию (403), но может её прочитать", async () => {
    const companyName = `E2E Spec Permissions ${Date.now()}`;
    const { accessToken: ownerToken, companyId } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variant } = await setupModelAndWorkshop(ownerToken, "D");

    const [viewerUser] = await db
      .insert(users)
      .values({
        companyId,
        email: `spec-e2e-viewer-${Date.now()}@example.com`,
        passwordHash: hashPassword("test-password-123"),
        fullName: "Viewer",
      })
      .returning();
    if (!viewerUser) throw new Error("Не удалось создать пользователя-viewer");
    const [viewerRole] = await db.select().from(roles).where(and(isNull(roles.companyId), eq(roles.code, "viewer"))).limit(1);
    if (!viewerRole) throw new Error('Роль "viewer" не найдена');
    await db.insert(userRoles).values({ userId: viewerUser.id, roleId: viewerRole.id });
    const viewerToken = tokenService.signAccessToken({ sub: viewerUser.id, companyId, roles: ["viewer"] });

    await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(viewerToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 1 }] })
      .expect(403);

    const ownerDraftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(ownerToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 1 }] })
      .expect(201);

    await request(httpServer)
      .get(`/v1/specifications/${(ownerDraftResponse.body as SpecificationResponseDto).id}`)
      .set(...authHeader(viewerToken))
      .expect(200);
  });

  it("procurement_manager не может утвердить спецификацию (нет specification.approve), хотя может создать черновик", async () => {
    const companyName = `E2E Spec Approve Permission ${Date.now()}`;
    const { accessToken: ownerToken, companyId } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variant } = await setupModelAndWorkshop(ownerToken, "E");

    const { accessToken: procurementToken } = await createCompanyWithRoleToken(`${companyName} unused`, "procurement_manager");
    // Второй вызов createCompanyWithRoleToken создал СВОЮ отдельную компанию —
    // нужен пользователь procurement_manager именно в компании owner'а выше,
    // поэтому создаём его напрямую, как и viewer в предыдущем тесте.
    void procurementToken;

    const [pmUser] = await db
      .insert(users)
      .values({
        companyId,
        email: `spec-e2e-pm-${Date.now()}@example.com`,
        passwordHash: hashPassword("test-password-123"),
        fullName: "Procurement Manager",
      })
      .returning();
    if (!pmUser) throw new Error("Не удалось создать пользователя procurement_manager");
    const [pmRole] = await db.select().from(roles).where(and(isNull(roles.companyId), eq(roles.code, "procurement_manager"))).limit(1);
    if (!pmRole) throw new Error('Роль "procurement_manager" не найдена');
    await db.insert(userRoles).values({ userId: pmUser.id, roleId: pmRole.id });
    const pmToken = tokenService.signAccessToken({ sub: pmUser.id, companyId, roles: ["procurement_manager"] });

    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(pmToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 1 }] })
      .expect(201);

    await request(httpServer)
      .post(`/v1/specifications/${(draftResponse.body as SpecificationResponseDto).id}/approve`)
      .set(...authHeader(pmToken))
      .expect(403);
  });

  it("tenant isolation: чужая компания не видит и не может утвердить спецификацию другой компании", async () => {
    const { accessToken: tokenA } = await createCompanyWithRoleToken(`E2E Spec Tenant A ${Date.now()}`, "owner");
    const { accessToken: tokenB } = await createCompanyWithRoleToken(`E2E Spec Tenant B ${Date.now()}`, "owner");
    const { product, workshop, variant } = await setupModelAndWorkshop(tokenA, "F");

    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(tokenA))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 1 }] })
      .expect(201);
    const spec = draftResponse.body as SpecificationResponseDto;

    // Компания B не видит спецификацию компании A по прямому id.
    await request(httpServer)
      .get(`/v1/specifications/${spec.id}`)
      .set(...authHeader(tokenB))
      .expect(404);

    // Компания B не может утвердить чужую спецификацию.
    await request(httpServer)
      .post(`/v1/specifications/${spec.id}/approve`)
      .set(...authHeader(tokenB))
      .expect(404);

    // Список компании B не содержит спецификацию компании A.
    const listResponseB = await request(httpServer)
      .get("/v1/specifications")
      .set(...authHeader(tokenB))
      .expect(200);
    expect((listResponseB.body as SpecificationResponseDto[]).map((s) => s.id)).not.toContain(spec.id);

    // Компания B не может создать спецификацию, ссылаясь на цех/модель компании A.
    const crossTenantResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(tokenB))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 1 }] })
      .expect(404);
    expect((crossTenantResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_WORKSHOP_NOT_FOUND");
  });

  // Требование №16/№17: PDF генерируется ИЗ SNAPSHOT, не из живых данных.
  // Черновик не может получить PDF (нет snapshotJson); после approve —
  // документ появляется, привязан к entityType="specification"; повторная
  // генерация после изменения живых реквизитов цеха не меняет уже
  // зафиксированный номер/реквизиты в снимке (проверяется явно, т.к.
  // generateDocument собирает данные PDF только из snapshotJson).
  it("PDF формируется только из snapshot утверждённой спецификации; смена реквизитов цеха задним числом снимок не трогает", async () => {
    const companyName = `E2E Spec PDF ${Date.now()}`;
    const { accessToken } = await createCompanyWithRoleToken(companyName, "owner");
    const { product, workshop, variant } = await setupModelAndWorkshop(accessToken, "F");

    await request(httpServer)
      .patch(`/v1/workshops/${workshop.id}`)
      .set(...authHeader(accessToken))
      .send({ contractNumber: "П-22-04", contractDate: "2026-04-22" })
      .expect(200);

    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({ workshopId: workshop.id, productId: product.id, items: [{ productVariantId: variant.id, quantity: 100, unitPrice: 500 }] })
      .expect(201);
    const draft = draftResponse.body as SpecificationResponseDto;

    // Черновик без snapshot — PDF не формируется.
    const draftDocResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/document`)
      .set(...authHeader(accessToken))
      .expect(400);
    expect((draftDocResponse.body as ErrorResponseBody).code).toBe("SPECIFICATION_NOT_APPROVED");

    await request(httpServer)
      .post(`/v1/specifications/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    const firstDocResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/document`)
      .set(...authHeader(accessToken))
      .expect(201);
    const firstDoc = firstDocResponse.body as { id: string; docType: string; isCurrentVersion: boolean };
    expect(firstDoc.docType).toBe("specification");
    expect(firstDoc.isCurrentVersion).toBe(true);

    // Документ действительно скачивается и является PDF.
    const fileResponse = await request(httpServer)
      .get(`/v1/documents/${firstDoc.id}/file`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect(fileResponse.headers["content-type"]).toBe("application/pdf");

    // Документ находится через generic Document Engine по entityType=specification.
    const listResponse = await request(httpServer)
      .get("/v1/documents")
      .set(...authHeader(accessToken))
      .query({ entityType: "specification", entityId: draft.id })
      .expect(200);
    expect((listResponse.body as Array<{ id: string }>).map((d) => d.id)).toContain(firstDoc.id);

    // Меняем реквизиты цеха ПОСЛЕ утверждения — снимок спецификации не должен
    // измениться (требование №9/№10 — Snapshot неизменяем после approve).
    await request(httpServer)
      .patch(`/v1/workshops/${workshop.id}`)
      .set(...authHeader(accessToken))
      .send({ contractNumber: "ДРУГОЙ-НОМЕР", contractDate: "2027-01-01" })
      .expect(200);

    const refetchedSpec = (
      await request(httpServer).get(`/v1/specifications/${draft.id}`).set(...authHeader(accessToken)).expect(200)
    ).body as SpecificationResponseDto;
    expect((refetchedSpec.snapshotJson as { workshop: { contractNumber: string } }).workshop.contractNumber).toBe("П-22-04");

    // Повторная генерация — новый документ, старый перестаёт быть текущим
    // (Immutable Original), но данные всё ещё из ТОГО ЖЕ (неизменного) снимка.
    const secondDocResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/document`)
      .set(...authHeader(accessToken))
      .expect(201);
    const secondDoc = secondDocResponse.body as { id: string; isCurrentVersion: boolean; supersedesDocumentId: string | null };
    expect(secondDoc.id).not.toBe(firstDoc.id);
    expect(secondDoc.isCurrentVersion).toBe(true);
    expect(secondDoc.supersedesDocumentId).toBe(firstDoc.id);

    const firstDocReloaded = (
      await request(httpServer).get("/v1/documents").set(...authHeader(accessToken)).query({ entityType: "specification", entityId: draft.id }).expect(200)
    ).body as Array<{ id: string; isCurrentVersion: boolean }>;
    expect(firstDocReloaded.find((d) => d.id === firstDoc.id)?.isCurrentVersion).toBe(false);
  });
});
