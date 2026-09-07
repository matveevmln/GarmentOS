import { z } from "zod";
import { materialTypeSchema, materialUnitSchema, purchaseCurrencySchema, supplierTypeSchema } from "../procurement/schemas";

// Контракты модуля Document Intelligence (P6, владелец проекта, 2026-09-06).
// Поток: вставка/загрузка текста → извлечение (AI, только предложение) →
// проверка/правка оператором → подтверждение → существующие use case'ы
// Materials & Procurement (createMaterial/createSupplier/createPurchaseOrder).
// Домен здесь не заводится отдельным пакетом — оркестрация без собственной
// бизнес-логики живёт в apps/api, как и production-order-orchestration.

export const documentIntelligenceTypeSchema = z.enum(["invoice", "packing_list"]);
export type DocumentIntelligenceTypeDto = z.infer<typeof documentIntelligenceTypeSchema>;

// Один и тот же тип строки для инвойса и пакинг-листа — оба описывают одну и
// ту же поставку разными числами (см. document-extraction-types.ts на
// бэкенде). Отсутствующее поле — null, а не 0: то, чего нет в документе, не
// подставляется молча.
export const extractedDocumentLineSchema = z.object({
  description: z.string(),
  materialCode: z.string().nullable(),
  color: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number().nullable(),
  packageCount: z.number().nullable(),
  packageUnit: z.string().nullable(),
  netWeight: z.number().nullable(),
  grossWeight: z.number().nullable(),
  cbm: z.number().nullable(),
});
export type ExtractedDocumentLineDto = z.infer<typeof extractedDocumentLineSchema>;

export const extractedDocumentFieldsSchema = z.object({
  documentType: documentIntelligenceTypeSchema,
  supplierName: z.string().nullable(),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable(),
  currency: z.string().nullable(),
  totalAmount: z.number().nullable(),
  totalPackages: z.number().nullable(),
  totalNetWeight: z.number().nullable(),
  totalGrossWeight: z.number().nullable(),
  totalCbm: z.number().nullable(),
  lines: z.array(extractedDocumentLineSchema),
});
export type ExtractedDocumentFieldsDto = z.infer<typeof extractedDocumentFieldsSchema>;

// Предложение совпадения — только предложение, не выбор: подставляется в
// готовом виде "какая карточка уже похожа на эту строку", какую из них (или
// "создать новую") выбрать — решает оператор (P6.4/P6.5).
export const entityMatchCandidateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  // "exact" — название совпало полностью (без учёта регистра/пробелов);
  // "similar" — частичное совпадение подстроки, требует явного подтверждения
  // оператора вместо автовыбора (тот же принцип, что findSimilarProductNames).
  kind: z.enum(["exact", "similar"]),
});
export type EntityMatchCandidateDto = z.infer<typeof entityMatchCandidateSchema>;

export const documentReconciliationFieldSchema = z.object({
  label: z.string(),
  sumOfLines: z.number(),
  statedTotal: z.number().nullable(),
  difference: z.number().nullable(),
  status: z.enum(["match", "discrepancy", "unknown"]),
});
export type DocumentReconciliationFieldDto = z.infer<typeof documentReconciliationFieldSchema>;

export const extractDocumentRequestSchema = z.object({
  documentType: documentIntelligenceTypeSchema,
  text: z.string().min(1, "Вставьте текст документа"),
  // Если оператор уже загрузил файл обычным способом (вкладка «Документы») и
  // просто хочет прогнать через него извлечение — передаётся id того
  // документа вместо создания нового текстового.
  documentId: z.string().uuid().optional(),
});
export type ExtractDocumentRequestDto = z.infer<typeof extractDocumentRequestSchema>;

export const extractDocumentResponseSchema = z.object({
  documentId: z.string().uuid(),
  derivativeId: z.string().uuid(),
  extracted: extractedDocumentFieldsSchema,
  supplierMatches: z.array(entityMatchCandidateSchema),
  materialMatches: z.array(z.array(entityMatchCandidateSchema)),
  reconciliation: z.array(documentReconciliationFieldSchema),
});
export type ExtractDocumentResponseDto = z.infer<typeof extractDocumentResponseSchema>;

// Подтверждение — окончательные, отредактированные оператором значения;
// именно они (а не то, что вернул AI) уходят в детерминированные use case'ы.
export const confirmDocumentSupplierSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ name: z.string().min(1), type: supplierTypeSchema.optional() }),
]);

export const confirmDocumentMaterialSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ name: z.string().min(1), type: materialTypeSchema, unit: materialUnitSchema }),
]);

export const confirmDocumentLineSchema = z.object({
  material: confirmDocumentMaterialSchema,
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  // Отличает "оператор согласился с предложением AI" от "оператор выбрал
  // другую карточку/ввёл всё сам" — используется как source в document_links
  // (P6.6), не выдумывает новую систему провенанса поверх уже существующей.
  matchSource: z.enum(["ai", "manual"]),
});
export type ConfirmDocumentLineDto = z.infer<typeof confirmDocumentLineSchema>;

export const confirmDocumentRequestSchema = z.object({
  documentId: z.string().uuid(),
  documentType: documentIntelligenceTypeSchema,
  // Обязателен для инвойса (создаёт новую закупку), необязателен для
  // пакинг-листа (см. purchaseOrder ниже).
  supplier: confirmDocumentSupplierSchema.optional(),
  supplierMatchSource: z.enum(["ai", "manual"]).optional(),
  // Если указан — строки привязываются к уже существующей закупке вместо
  // создания новой (обычный путь для пакинг-листа, который описывает уже
  // подтверждённую по инвойсу поставку).
  purchaseOrder: z.object({ id: z.string().uuid() }).optional(),
  currency: purchaseCurrencySchema.optional(),
  orderedAt: z.string().optional(),
  lines: z.array(confirmDocumentLineSchema).min(1, "Нужна хотя бы одна строка"),
});
export type ConfirmDocumentRequestDto = z.infer<typeof confirmDocumentRequestSchema>;

export const confirmDocumentResponseSchema = z.object({
  supplierId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid(),
  materialIds: z.array(z.string().uuid()),
});
export type ConfirmDocumentResponseDto = z.infer<typeof confirmDocumentResponseSchema>;
