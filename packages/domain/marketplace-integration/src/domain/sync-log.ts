export type SyncStatus = "success" | "partial" | "failed";

// Журнал синхронизации — append-only, источник истины для "требует
// пересинхронизации" (docs/PRINCIPLES.md, принцип 14, Local-First: если
// маркетплейс недоступен, GarmentOS продолжает работать с последним
// известным состоянием и помечает его как устаревшее через эту таблицу).
export interface MarketplaceSyncLog {
  id: string;
  marketplaceAccountId: string;
  syncType: string;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorDetails: string | null;
  createdAt: Date;
  updatedAt: Date;
}
