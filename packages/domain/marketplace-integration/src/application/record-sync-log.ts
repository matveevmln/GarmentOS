import { DomainError } from "../domain/errors";
import type { MarketplaceSyncLog, SyncStatus } from "../domain/sync-log";
import type { MarketplaceAccountRepository, SyncLogRepository } from "./ports";

export interface RecordSyncLogInput {
  companyId: string;
  marketplaceAccountId: string;
  syncType: string;
  status: SyncStatus;
  startedAt: Date;
  finishedAt?: Date;
  errorDetails?: string;
}

export interface RecordSyncLogDeps {
  syncLogs: SyncLogRepository;
  marketplaceAccounts: MarketplaceAccountRepository;
}

// Запись результата синхронизации — append-only (docs/DATABASE_SCHEMA.md,
// раздел 12). Источник истины для Local-First "требует пересинхронизации"
// (PRINCIPLES.md, принцип 14) — если синхронизация провалилась, локальное
// состояние остаётся действующим, а не блокирует работу пользователя.
//
// marketplaceAccountId приходит из тела запроса, поэтому принадлежность
// кабинета компании проверяется здесь — тем же способом, что и в
// createMarketplaceListing: иначе можно было бы писать журнал синхронизации
// в чужой кабинет, зная его UUID (Step 4A.2).
export async function recordSyncLog(deps: RecordSyncLogDeps, input: RecordSyncLogInput): Promise<MarketplaceSyncLog> {
  const account = await deps.marketplaceAccounts.findById(input.companyId, input.marketplaceAccountId);
  if (!account) {
    throw new DomainError(
      `Личный кабинет ${input.marketplaceAccountId} не найден в этой компании`,
      "MARKETPLACE_ACCOUNT_NOT_FOUND",
    );
  }

  return deps.syncLogs.create({
    marketplaceAccountId: input.marketplaceAccountId,
    syncType: input.syncType,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? null,
    errorDetails: input.errorDetails ?? null,
  });
}
