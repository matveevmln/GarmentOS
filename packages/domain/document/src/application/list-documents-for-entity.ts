import type { DocumentLink } from "../domain/document";
import type { DocumentLinkRepository } from "./ports";

export interface ListDocumentsForEntityInput {
  companyId: string;
  entityType: string;
  entityId: string;
}

export interface ListDocumentsForEntityDeps {
  documentLinks: DocumentLinkRepository;
}

// Entity Timeline (docs/INBOX_ARCHITECTURE.md, раздел 7.3) — все документы,
// когда-либо привязанные к сущности, независимо от канала/источника.
export async function listDocumentsForEntity(
  deps: ListDocumentsForEntityDeps,
  input: ListDocumentsForEntityInput,
): Promise<DocumentLink[]> {
  return deps.documentLinks.listForEntity(input.companyId, input.entityType, input.entityId);
}
