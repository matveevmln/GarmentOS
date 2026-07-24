import { DomainError } from "./errors";

export type CollectionSeason = "spring" | "summer" | "autumn" | "winter";
export type CollectionStatus = "planning" | "active" | "archived";

// Коллекция — сезонная группа моделей, например «Осень 2026»
// (docs/DATABASE_SCHEMA.md, раздел 5; CLAUDE.md, глоссарий).
export interface Collection {
  id: string;
  companyId: string;
  name: string;
  season: CollectionSeason | null;
  year: number | null;
  status: CollectionStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidCollectionName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название коллекции не может быть пустым", "COLLECTION_NAME_REQUIRED");
  }
}
