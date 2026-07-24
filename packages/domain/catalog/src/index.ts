// Публичный интерфейс модуля Catalog (docs/REPOSITORY_STRUCTURE.md).

export type { Collection, CollectionSeason, CollectionStatus } from "./domain/collection";
export type { Product, ProductStatus } from "./domain/product";
export type { ProductVariant } from "./domain/product-variant";
export { DomainError } from "./domain/errors";

export type {
  CollectionRepository,
  NewCollectionInput,
  NewProductInput,
  NewProductVariantInput,
  ProductRepository,
  ProductVariantRepository,
} from "./application/ports";
export { createCollection, type CreateCollectionDeps, type CreateCollectionInput } from "./application/create-collection";
export { createProduct, type CreateProductDeps, type CreateProductInput } from "./application/create-product";
export {
  createProductVariant,
  type CreateProductVariantDeps,
  type CreateProductVariantInput,
} from "./application/create-product-variant";

export {
  DrizzleCollectionRepository,
  DrizzleProductRepository,
  DrizzleProductVariantRepository,
} from "./infrastructure/drizzle-catalog-repository";
