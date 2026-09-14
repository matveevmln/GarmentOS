// Публичный интерфейс модуля Catalog (docs/REPOSITORY_STRUCTURE.md).

export type { Collection, CollectionSeason, CollectionStatus } from "./domain/collection";
export type { Product, ProductStatus } from "./domain/product";
export type { ProductVariant } from "./domain/product-variant";
export type { ProductSize, ProductSizeDraft } from "./domain/product-size";
export type { ProductAttribute, ProductAttributeDraft } from "./domain/product-attribute";
export { DomainError } from "./domain/errors";

export type {
  CollectionRepository,
  NewCollectionInput,
  NewProductInput,
  NewProductVariantInput,
  ProductAttributeRepository,
  ProductCostsInput,
  ProductDetailsInput,
  ProductRepository,
  ProductSizeRepository,
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
  updateProductCosts,
  type UpdateProductCostsDeps,
  type UpdateProductCostsInput,
} from "./application/update-product-costs";
export {
  updateProductDetails,
  type UpdateProductDetailsDeps,
  type UpdateProductDetailsInput,
} from "./application/update-product-details";
export {
  addProductColor,
  replaceProductSizes,
  type AddProductColorDeps,
  type AddProductColorInput,
  type ManageProductSizesDeps,
  type ReplaceProductSizesInput,
} from "./application/manage-product-sizes";
export {
  addProductAttribute,
  removeProductAttribute,
  updateProductAttribute,
  type AddProductAttributeInput,
  type ManageProductAttributesDeps,
  type RemoveProductAttributeInput,
  type UpdateProductAttributeInput,
} from "./application/manage-product-attributes";
export {
  distributeQuantityByRatio,
  distributeQuantityBySize,
  distributeQuantityEvenly,
  type SizeQuantity,
  type SizeRatio,
} from "./application/distribute-size-quantities";

export {
  DrizzleCollectionRepository,
  DrizzleProductAttributeRepository,
  DrizzleProductRepository,
  DrizzleProductSizeRepository,
  DrizzleProductVariantRepository,
} from "./infrastructure/drizzle-catalog-repository";
