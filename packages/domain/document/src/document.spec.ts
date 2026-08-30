import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { attachDocument } from "./application/attach-document";
import { generateSpecificationDocument } from "./application/generate-specification-document";
import { listDocumentsForEntity } from "./application/list-documents-for-entity";
import { regenerateSpecificationDocument } from "./application/regenerate-specification-document";
import type { DocumentDerivativeEntity, DocumentDerivativeRepository, DocumentRenderAdapter, NewDocumentDerivativeInput, StorageAdapter } from "./application/ports";
import { DomainError } from "./domain/errors";
import { DEFAULT_SPECIFICATION_TEMPLATE, type SpecificationDocumentData, type SpecificationTemplateDefinition } from "./domain/specification-template";
import { DrizzleDocumentLinkRepository, DrizzleDocumentRepository } from "./infrastructure/drizzle-document-repository";

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

// Тестовые двойники StorageAdapter/DocumentRenderAdapter/DocumentDerivativeRepository
// — реальный S3/pdf-lib не нужны для проверки доменной логики (тот же
// паттерн, что plainTextVerifier в packages/domain/identity/src/rbac-auth.spec.ts).
class FakeStorageAdapter implements StorageAdapter {
  public readonly uploaded: Array<{ key: string; contentType: string }> = [];
  private readonly files = new Map<string, { data: Uint8Array; contentType: string }>();

  upload(key: string, data: Uint8Array, contentType: string): Promise<{ url: string }> {
    this.uploaded.push({ key, contentType });
    const url = `https://fake-storage.local/${key}`;
    this.files.set(url, { data, contentType });
    return Promise.resolve({ url });
  }

  download(fileUrl: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    return Promise.resolve(this.files.get(fileUrl) ?? null);
  }
}

class FakeRenderer implements DocumentRenderAdapter {
  public readonly calls: Array<{ template: SpecificationTemplateDefinition; data: SpecificationDocumentData }> = [];

  renderSpecification(template: SpecificationTemplateDefinition, data: SpecificationDocumentData): Promise<Uint8Array> {
    this.calls.push({ template, data });
    return Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // "%PDF" — не настоящий PDF, просто узнаваемые байты
  }
}

class FakeDocumentDerivativeRepository implements DocumentDerivativeRepository {
  private readonly rows: DocumentDerivativeEntity[] = [];

  create(input: NewDocumentDerivativeInput): Promise<DocumentDerivativeEntity> {
    const row: DocumentDerivativeEntity = {
      id: `derivative-${this.rows.length + 1}`,
      documentId: input.documentId,
      type: input.type,
      content: input.content,
      language: input.language ?? null,
      generatedBy: input.generatedBy ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findLatestByDocumentId(documentId: string, type: string): Promise<DocumentDerivativeEntity | null> {
    const match = [...this.rows].reverse().find((row) => row.documentId === documentId && row.type === type);
    return Promise.resolve(match ?? null);
  }
}

function buildSpecificationData(): SpecificationDocumentData {
  return {
    fields: {
      contractNumber: "П-22-04",
      contractDate: "22.04.2026",
      customerName: "ИП Гашов А.А.",
      contractorName: 'ОсОО "Ак-Сарай Текстиль"',
      specNumber: "1",
      paymentTerms:
        "70% стоимости товара, указанной в спецификации, оплачиваются Заказчиком в течение 3 (трёх) рабочих дней после получения счёта от Исполнителя.",
      deliveryDeadline: "30 июня 2026 г.",
      deliveryMethod: "Самовывоз.",
      contractorSignerRole: "Генеральный директор",
      contractorSignerName: "Нормуродов О.А.",
      customerSignerName: "Гашов А.А.",
    },
    items: [
      { name: "Двойка, Петроль", unit: "шт", size: "48-50", quantity: "200", unitPrice: "720,00", sum: "144 000,00" },
      { name: "Двойка, Бордо", unit: "шт", size: "48-50", quantity: "100", unitPrice: "720,00", sum: "72 000,00" },
    ],
    totals: { quantity: "300", sum: "216 000,00" },
  };
}

describe("domain/document", () => {
  it("attachDocument создаёт документ и связывает его сразу с несколькими сущностями", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд документов" });
      const documents = new DrizzleDocumentRepository(tx);
      const documentLinks = new DrizzleDocumentLinkRepository(tx);

      const materialId = "11111111-1111-1111-1111-111111111111";
      const supplierId = "22222222-2222-2222-2222-222222222222";
      const result = await attachDocument(
        { documents, documentLinks },
        {
          companyId: company.id,
          docType: "invoice",
          fileUrl: "https://fake-storage.local/invoice.pdf",
          links: [
            { entityType: "material", entityId: materialId, confidence: "0.90", source: "ai" },
            { entityType: "supplier", entityId: supplierId, confidence: "0.85", source: "ai" },
          ],
        },
      );

      expect(result.document.docType).toBe("invoice");
      expect(result.links).toHaveLength(2);

      const materialLinks = await listDocumentsForEntity({ documentLinks }, { companyId: company.id, entityType: "material", entityId: materialId });
      expect(materialLinks).toHaveLength(1);
      expect(materialLinks[0]?.documentId).toBe(result.document.id);
    });
  });

  it("отклоняет документ без ни одной связи", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд документов 2" });
      const documents = new DrizzleDocumentRepository(tx);
      const documentLinks = new DrizzleDocumentLinkRepository(tx);

      await expect(
        attachDocument({ documents, documentLinks }, { companyId: company.id, docType: "invoice", fileUrl: "x", links: [] }),
      ).rejects.toThrow(DomainError);
    });
  });

  it("generateSpecificationDocument рендерит по шаблону, сохраняет исходные данные и привязывает к production_order", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд документов 3" });
      const documents = new DrizzleDocumentRepository(tx);
      const documentLinks = new DrizzleDocumentLinkRepository(tx);
      const documentDerivatives = new FakeDocumentDerivativeRepository();
      const storage = new FakeStorageAdapter();
      const renderer = new FakeRenderer();

      const productionOrderId = "33333333-3333-3333-3333-333333333333";
      const data = buildSpecificationData();

      const result = await generateSpecificationDocument(
        { documents, documentLinks, documentDerivatives, storage, renderer },
        { companyId: company.id, productionOrderId, uploadedBy: null, data },
      );

      expect(result.document.docType).toBe("specification");
      expect(result.document.fileUrl).toContain("specifications/");
      expect(storage.uploaded).toHaveLength(1);
      expect(storage.uploaded[0]?.contentType).toBe("application/pdf");
      expect(renderer.calls[0]?.template.id).toBe(DEFAULT_SPECIFICATION_TEMPLATE.id);

      const links = await listDocumentsForEntity(
        { documentLinks },
        { companyId: company.id, entityType: "production_order", entityId: productionOrderId },
      );
      expect(links).toHaveLength(1);
      expect(links[0]?.source).toBe("ai");

      const derivative = await documentDerivatives.findLatestByDocumentId(result.document.id, "structured_data");
      expect(derivative).not.toBeNull();
      expect((derivative?.content as { templateId: string }).templateId).toBe(DEFAULT_SPECIFICATION_TEMPLATE.id);

      // "открыть старую спецификацию и пересоздать её в один клик" —
      // требование владельца проекта 2026-07-26.
      const regenerated = await regenerateSpecificationDocument(
        { documents, documentLinks, documentDerivatives, storage, renderer },
        { companyId: company.id, productionOrderId, uploadedBy: null, sourceDocumentId: result.document.id },
      );
      expect(regenerated.document.id).not.toBe(result.document.id);
      expect(renderer.calls).toHaveLength(2);
      expect(renderer.calls[1]?.data.items).toEqual(data.items);
    });
  });

  // Владелец проекта, требование до пилота 2026-08-04: "в системе
  // одновременно не может существовать несколько актуальных версий одной
  // спецификации".
  it("generateSpecificationDocument с supersedesDocumentIds снимает isCurrentVersion со старой версии", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд документов 4" });
      const documents = new DrizzleDocumentRepository(tx);
      const documentLinks = new DrizzleDocumentLinkRepository(tx);
      const documentDerivatives = new FakeDocumentDerivativeRepository();
      const storage = new FakeStorageAdapter();
      const renderer = new FakeRenderer();
      const deps = { documents, documentLinks, documentDerivatives, storage, renderer };

      const productionOrderId = "44444444-4444-4444-4444-444444444444";
      const data = buildSpecificationData();

      const v1 = await generateSpecificationDocument(deps, { companyId: company.id, productionOrderId, uploadedBy: null, data });
      expect(v1.document.isCurrentVersion).toBe(true);
      expect(v1.document.supersedesDocumentId).toBeNull();

      const v2 = await generateSpecificationDocument(deps, {
        companyId: company.id,
        productionOrderId,
        uploadedBy: null,
        data,
        supersedesDocumentIds: [v1.document.id],
      });
      expect(v2.document.isCurrentVersion).toBe(true);
      expect(v2.document.supersedesDocumentId).toBe(v1.document.id);

      const v1Reloaded = await documents.findById(company.id, v1.document.id);
      expect(v1Reloaded?.isCurrentVersion).toBe(false);

      // Ровно один документ этого заказа считается текущей версией.
      const linked = await listDocumentsForEntity(
        { documentLinks },
        { companyId: company.id, entityType: "production_order", entityId: productionOrderId },
      );
      const current = await Promise.all(linked.map((link) => documents.findById(company.id, link.documentId)));
      expect(current.filter((doc) => doc?.isCurrentVersion).map((doc) => doc?.id)).toEqual([v2.document.id]);
    });
  });
});
