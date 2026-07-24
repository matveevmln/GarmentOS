import type { Collection, CollectionSeason } from "../domain/collection";
import type { Product, ProductStatus } from "../domain/product";
import type { ProductVariant } from "../domain/product-variant";

export interface NewCollectionInput {
  companyId: string;
  name: string;
  season: CollectionSeason | null;
  year: number | null;
  createdBy: string | null;
}

export interface CollectionRepository {
  create(input: NewCollectionInput): Promise<Collection>;
  findByName(companyId: string, name: string): Promise<Collection | null>;
}

export interface NewProductInput {
  companyId: string;
  collectionId: string | null;
  name: string;
  code: string;
  category: string | null;
  season: string | null;
  status: ProductStatus;
  createdBy: string | null;
}

export interface ProductRepository {
  create(input: NewProductInput): Promise<Product>;
  findByCode(companyId: string, code: string): Promise<Product | null>;
  findById(companyId: string, id: string): Promise<Product | null>;
}

export interface NewProductVariantInput {
  productId: string;
  size: string;
  color: string;
  skuCode: string;
  barcode: string | null;
  createdBy: string | null;
}

export interface ProductVariantRepository {
  create(input: NewProductVariantInput): Promise<ProductVariant>;
  findBySkuCode(skuCode: string): Promise<ProductVariant | null>;
  findByProductSizeColor(productId: string, size: string, color: string): Promise<ProductVariant | null>;
}
