import { z } from "zod";

// Контракты минимального Document Engine (Итерация 7,
// docs/DOCUMENT_ENGINE_ARCHITECTURE.md, разделы 1-2).

export const listDocumentsForEntityQuerySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
});
export type ListDocumentsForEntityQueryDto = z.infer<typeof listDocumentsForEntityQuerySchema>;

export const documentResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  docType: z.string(),
  fileUrl: z.string(),
  title: z.string().nullable(),
  issuedAt: z.date().nullable(),
  uploadedBy: z.string().uuid().nullable(),
  supersedesDocumentId: z.string().uuid().nullable(),
  isCurrentVersion: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DocumentResponseDto = z.infer<typeof documentResponseSchema>;

export const documentLinkResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  documentId: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  confidence: z.string().nullable(),
  source: z.enum(["manual", "ai"]),
  linkedBy: z.string().uuid().nullable(),
  linkedAt: z.date(),
});
export type DocumentLinkResponseDto = z.infer<typeof documentLinkResponseSchema>;

export const generateSpecificationSchema = z.object({
  productionOrderId: z.string().uuid(),
});
export type GenerateSpecificationDto = z.infer<typeof generateSpecificationSchema>;
