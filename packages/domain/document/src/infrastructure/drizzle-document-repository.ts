import { documentLinks, documents, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { DocumentEntity, DocumentLink } from "../domain/document";
import type { DocumentLinkRepository, DocumentRepository, NewDocumentInput, NewDocumentLinkInput } from "../application/ports";

type DocumentRow = typeof documents.$inferSelect;
type DocumentLinkRow = typeof documentLinks.$inferSelect;

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
