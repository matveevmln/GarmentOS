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
  // Регистронезависимый поиск по названию модели — нужен для разбора
  // текстового производственного запроса (Итерация 7): AI не имеет права
  // придумать модель, только найти уже существующую по имени
  // (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md, раздел 2, пункт 4).
  findByName(companyId: string, name: string): Promise<Product | null>;
  // "Возможно, вы имели в виду..." — нужен, когда точное совпадение не
  // найдено (Итерация 7: предпросмотр текстового запроса перед созданием
  // заказа, не гадаем — предлагаем варианты человеку на подтверждение).
  findSimilarByName(companyId: string, name: string, limit: number): Promise<Product[]>;
  listByCompany(companyId: string): Promise<Product[]>;
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
  // Заказ пошива хранит только productVariantId — нужен обратный резолв
  // size/color для заполнения строк спецификации (Итерация 7, Document
  // Template Engine).
  findById(id: string): Promise<ProductVariant | null>;
  listByProduct(productId: string): Promise<ProductVariant[]>;
}
