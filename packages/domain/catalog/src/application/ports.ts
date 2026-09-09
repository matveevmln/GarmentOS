import type { Collection, CollectionSeason } from "../domain/collection";
import type { Product, ProductStatus } from "../domain/product";
import type { ProductVariant } from "../domain/product-variant";
import type { ProductSize, ProductSizeDraft } from "../domain/product-size";

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

export interface ProductCostsInput {
  standardSewingCost: string | null;
  standardSewingCostCurrency: string | null;
  otherProductionCost: string | null;
  otherProductionCostCurrency: string | null;
}

export interface ProductRepository {
  create(input: NewProductInput): Promise<Product>;
  updateCosts(companyId: string, id: string, input: ProductCostsInput): Promise<Product>;
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

// Размерный ряд заменяется целиком: порядок и веса меняются вместе, поэтому
// частичного обновления нет — иначе ряд мог бы остаться противоречивым.
export interface ProductSizeRepository {
  listByProduct(productId: string): Promise<ProductSize[]>;
  replaceForProduct(productId: string, sizes: ProductSizeDraft[]): Promise<ProductSize[]>;
}

// У product_variants нет собственной колонки company_id — принадлежность
// компании выражена через products.company_id (docs/DATABASE_SCHEMA.md,
// раздел 5). Поэтому companyId здесь не фильтр по колонке, а обязательный
// параметр, который реализация обязана применить join'ом к products: без
// него любой SKU читался и менялся бы по одному лишь UUID, в том числе из
// чужой компании (найдено аудитом Step 4A.2).
export interface ProductVariantRepository {
  create(input: NewProductVariantInput): Promise<ProductVariant>;
  // Единственный намеренно глобальный поиск: код SKU уникален во всей
  // системе (product_variants_sku_idx — глобальный уникальный индекс), и
  // проверка занятости кода при создании обязана видеть чужие коды тоже,
  // иначе инвариант не выполняется. Наружу (в контроллеры) результат этого
  // метода не отдаётся — используется только внутри createProductVariant.
  findBySkuCode(skuCode: string): Promise<ProductVariant | null>;
  findByProductSizeColor(companyId: string, productId: string, size: string, color: string): Promise<ProductVariant | null>;
  // Заказ пошива хранит только productVariantId — нужен обратный резолв
  // size/color для заполнения строк спецификации (Итерация 7, Document
  // Template Engine).
  findById(companyId: string, id: string): Promise<ProductVariant | null>;
  listByProduct(companyId: string, productId: string): Promise<ProductVariant[]>;
}
