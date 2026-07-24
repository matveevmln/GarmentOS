// Публичный интерфейс модуля BOM (docs/REPOSITORY_STRUCTURE.md).

export type { Bom, BomItem, BomItemDraft, BomStatus } from "./domain/bom";
export { DomainError } from "./domain/errors";

export type { BomRepository, NewBomInput } from "./application/ports";
export { createBomDraft, type CreateBomDraftDeps, type CreateBomDraftInput } from "./application/create-bom";
export { approveBom, type ApproveBomDeps, type ApproveBomInput } from "./application/approve-bom";
export {
  getApprovedBom,
  type GetApprovedBomDeps,
  type GetApprovedBomInput,
} from "./application/get-approved-bom";

export { DrizzleBomRepository } from "./infrastructure/drizzle-bom-repository";
