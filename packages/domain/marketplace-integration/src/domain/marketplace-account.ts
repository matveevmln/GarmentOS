import { DomainError } from "./errors";

// Личный кабинет продавца на конкретном маркетплейсе (CLAUDE.md, глоссарий
// «marketplaceAccount»). docs/ARCHITECTURE.md, раздел 5.1 — домен работает
// только с интерфейсом MarketplaceConnector, эта таблица хранит состояние.
export interface MarketplaceAccount {
  id: string;
  companyId: string;
  marketplaceId: string;
  apiCredentialsEncrypted: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidCredentials(apiCredentialsEncrypted: string): void {
  if (apiCredentialsEncrypted.trim().length === 0) {
    throw new DomainError("Учётные данные API не могут быть пустыми", "MARKETPLACE_ACCOUNT_CREDENTIALS_REQUIRED");
  }
}
