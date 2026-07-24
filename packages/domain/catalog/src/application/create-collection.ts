import { assertValidCollectionName, type Collection, type CollectionSeason } from "../domain/collection";
import { DomainError } from "../domain/errors";
import type { CollectionRepository } from "./ports";

export interface CreateCollectionInput {
  companyId: string;
  name: string;
  season?: CollectionSeason;
  year?: number;
  createdBy?: string;
}

export interface CreateCollectionDeps {
  collections: CollectionRepository;
}

export async function createCollection(deps: CreateCollectionDeps, input: CreateCollectionInput): Promise<Collection> {
  const name = input.name.trim();
  assertValidCollectionName(name);

  const existing = await deps.collections.findByName(input.companyId, name);
  if (existing) {
    throw new DomainError(`Коллекция с названием "${name}" уже существует`, "COLLECTION_NAME_TAKEN");
  }

  return deps.collections.create({
    companyId: input.companyId,
    name,
    season: input.season ?? null,
    year: input.year ?? null,
    createdBy: input.createdBy ?? null,
  });
}
