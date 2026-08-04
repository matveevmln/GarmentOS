import { documentDerivatives, documentLinks, documents, type DbOrTx } from "@garmentos/db-schema";
import { and, desc, eq } from "drizzle-orm";
import type { DocumentDerivativeType, DocumentEntity, DocumentLink } from "../domain/document";
import type {
  DocumentDerivativeEntity,
  DocumentDerivativeRepository,
  DocumentLinkRepository,
  DocumentRepository,
  NewDocumentDerivativeInput,
  NewDocumentInput,
  NewDocumentLinkInput,
} from "../application/ports";

type DocumentRow = typeof documents.$inferSelect;
type DocumentLinkRow = typeof documentLinks.$inferSelect;
type DocumentDerivativeRow = typeof documentDerivatives.$inferSelect;

function toDocument(row: DocumentRow): DocumentEntity {
  return {
    id: row.id,
    companyId: row.companyId,
    docType: row.docType,
    fileUrl: row.fileUrl,
    title: row.title,
    issuedAt: row.issuedAt,
    uploadedBy: row.uploadedBy,
    supersedesDocumentId: row.supersedesDocumentId,
    isCurrentVersion: row.isCurrentVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDocumentDerivative(row: DocumentDerivativeRow): DocumentDerivativeEntity {
  return {
    id: row.id,
    documentId: row.documentId,
    type: row.type,
    content: row.content,
    language: row.language,
    generatedBy: row.generatedBy,
    createdAt: row.createdAt,
  };
}

function toDocumentLink(row: DocumentLinkRow): DocumentLink {
  return {
    id: row.id,
    companyId: row.companyId,
    documentId: row.documentId,
    entityType: row.entityType,
    entityId: row.entityId,
    confidence: row.confidence,
    source: row.source,
    linkedBy: row.linkedBy,
    linkedAt: row.linkedAt,
  };
}

export class DrizzleDocumentRepository implements DocumentRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewDocumentInput): Promise<DocumentEntity> {
    const [row] = await this.db.insert(documents).values(input).returning();
    if (!row) throw new Error("INSERT documents не вернул строку");
    return toDocument(row);
  }

  async findById(companyId: string, id: string): Promise<DocumentEntity | null> {
    const [row] = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.id, id)))
      .limit(1);
    return row ? toDocument(row) : null;
  }

  async markSuperseded(companyId: string, id: string): Promise<void> {
    await this.db
      .update(documents)
      .set({ isCurrentVersion: false, updatedAt: new Date() })
      .where(and(eq(documents.companyId, companyId), eq(documents.id, id)));
  }
}

export class DrizzleDocumentLinkRepository implements DocumentLinkRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewDocumentLinkInput): Promise<DocumentLink> {
    const [row] = await this.db.insert(documentLinks).values(input).returning();
    if (!row) throw new Error("INSERT document_links не вернул строку");
    return toDocumentLink(row);
  }

  async listForEntity(companyId: string, entityType: string, entityId: string): Promise<DocumentLink[]> {
    const rows = await this.db
      .select()
      .from(documentLinks)
      .where(
        and(
          eq(documentLinks.companyId, companyId),
          eq(documentLinks.entityType, entityType),
          eq(documentLinks.entityId, entityId),
        ),
      );
    return rows.map(toDocumentLink);
  }
}

export class DrizzleDocumentDerivativeRepository implements DocumentDerivativeRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewDocumentDerivativeInput): Promise<DocumentDerivativeEntity> {
    const [row] = await this.db.insert(documentDerivatives).values(input).returning();
    if (!row) throw new Error("INSERT document_derivatives не вернул строку");
    return toDocumentDerivative(row);
  }

  async findLatestByDocumentId(documentId: string, type: DocumentDerivativeType): Promise<DocumentDerivativeEntity | null> {
    const [row] = await this.db
      .select()
      .from(documentDerivatives)
      .where(and(eq(documentDerivatives.documentId, documentId), eq(documentDerivatives.type, type)))
      .orderBy(desc(documentDerivatives.createdAt))
      .limit(1);
    return row ? toDocumentDerivative(row) : null;
  }
}
