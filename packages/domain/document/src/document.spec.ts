import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { attachDocument } from "./application/attach-document";
import { generateSpecificationDocument } from "./application/generate-specification-document";
import { listDocumentsForEntity } from "./application/list-documents-for-entity";
import type { DocumentRenderAdapter, SpecificationPdfData, StorageAdapter } from "./application/ports";
import { DomainError } from "./domain/errors";
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

// Тестовые двойники StorageAdapter/DocumentRenderAdapter — реальный S3/pdf-lib
// не нужны для проверки доменной логики (тот же паттерн, что
// plainTextVerifier в packages/domain/identity/src/rbac-auth.spec.ts).
class FakeStorageAdapter implements StorageAdapter {
  public readonly uploaded: Array<{ key: string; contentType: string }> = [];

  upload(key: string, _data: Uint8Array, contentType: string): Promise<{ url: string }> {
    this.uploaded.push({ key, contentType });
    return Promise.resolve({ url: `https://fake-storage.local/${key}` });
  }
}

class FakeRenderer implements DocumentRenderAdapter {
  renderSpecification(_data: SpecificationPdfData): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // "%PDF" — не настоящий PDF, просто узнаваемые байты
  }
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

  it("generateSpecificationDocument рендерит PDF, загружает в хранилище и привязывает к production_order", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд документов 3" });
      const documents = new DrizzleDocumentRepository(tx);
      const documentLinks = new DrizzleDocumentLinkRepository(tx);
      const storage = new FakeStorageAdapter();
      const renderer = new FakeRenderer();

      const productionOrderId = "33333333-3333-3333-3333-333333333333";
      const data: SpecificationPdfData = {
        productName: "Двойка",
        workshopName: "Цех №1",
        variants: [
          { size: "M", color: "Петроль", quantity: "1000" },
          { size: "M", color: "Бордо", quantity: "500" },
        ],
        materials: [{ materialName: "Двухнитка", unit: "m", totalQuantity: "1725.00" }],
        dueDate: null,
      };

      const result = await generateSpecificationDocument(
        { documents, documentLinks, storage, renderer },
        { companyId: company.id, productionOrderId, uploadedBy: null, data },
      );

      expect(result.document.docType).toBe("specification");
      expect(result.document.fileUrl).toContain("specifications/");
      expect(storage.uploaded).toHaveLength(1);
      expect(storage.uploaded[0]?.contentType).toBe("application/pdf");

      const links = await listDocumentsForEntity(
        { documentLinks },
        { companyId: company.id, entityType: "production_order", entityId: productionOrderId },
      );
      expect(links).toHaveLength(1);
      expect(links[0]?.source).toBe("ai");
    });
  });
});
