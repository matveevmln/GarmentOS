import type { MarketplaceSyncLog, SyncStatus } from "../domain/sync-log";
import type { SyncLogRepository } from "./ports";

export interface RecordSyncLogInput {
  marketplaceAccountId: string;
  syncType: string;
  status: SyncStatus;
  startedAt: Date;
  finishedAt?: Date;
  errorDetails?: string;
}

export interface RecordSyncLogDeps {
  syncLogs: SyncLogRepository;
}

// Запись результата синхронизации — append-only (docs/DATABASE_SCHEMA.md,
// раздел 12). Источник истины для Local-First "требует пересинхронизации"
// (PRINCIPLES.md, принцип 14) — если синхронизация провалилась, локальное
// состояние остаётся действующим, а не блокирует работу пользователя.
export async function recordSyncLog(deps: RecordSyncLogDeps, input: RecordSyncLogInput): Promise<MarketplaceSyncLog> {
  return deps.syncLogs.create({
    marketplaceAccountId: input.marketplaceAccountId,
    syncType: input.syncType,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? null,
    errorDetails: input.errorDetails ?? null,
  });
}
