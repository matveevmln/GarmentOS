import { z } from "zod";

// Контракты модуля Honest Sign / Честный Знак (docs/ARCHITECTURE.md,
// раздел 3 — отдельный bounded context, не размазан по другим модулям).

export const markingCodeStatusSchema = z.enum(["issued", "applied", "introduced", "sold", "retired", "damaged"]);

export const issueMarkingCodeSchema = z.object({
  productVariantId: z.string().uuid(),
  codeValue: z.string().min(1, "Код маркировки не может быть пустым"),
  productionOrderId: z.string().uuid().optional(),
});
export type IssueMarkingCodeDto = z.infer<typeof issueMarkingCodeSchema>;

export const markingCodeResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  codeValue: z.string(),
  status: markingCodeStatusSchema,
  productionOrderId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MarkingCodeResponseDto = z.infer<typeof markingCodeResponseSchema>;

export const transitionMarkingCodeSchema = z.object({
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});
export type TransitionMarkingCodeDto = z.infer<typeof transitionMarkingCodeSchema>;

export const retireMarkingCodeSchema = transitionMarkingCodeSchema.extend({
  reason: z.enum(["sold", "retired", "damaged"]),
});
export type RetireMarkingCodeDto = z.infer<typeof retireMarkingCodeSchema>;
