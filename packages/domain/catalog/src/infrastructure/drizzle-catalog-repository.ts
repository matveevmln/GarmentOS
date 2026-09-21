import { collections, productAttributes, productSizes, products, productVariants, type DbOrTx } from "@garmentos/db-schema";
import { and, asc, eq, ilike } from "drizzle-orm";
import type { Collection } from "../domain/collection";
import type { Product } from "../domain/product";
import type { ProductVariant } from "../domain/product-variant";
import type { ProductSize, ProductSizeDraft } from "../domain/product-size";
import type { ProductAttribute, ProductAttributeDraft } from "../domain/product-attribute";
import type {
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
} from "../application/ports";

type CollectionRow = typeof collections.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type ProductVariantRow = typeof productVariants.$inferSelect;
type ProductAttributeRow = typeof productAttributes.$inferSelect;

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    season: row.season,
    year: row.year,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    companyId: row.companyId,
    collectionId: row.collectionId,
    name: row.name,
    code: row.code,
    category: row.category,
    season: row.season,
    description: row.description,
    status: row.status,
    techPackUrl: row.techPackUrl,
    standardSewingCost: row.standardSewingCost,
    standardSewingCostCurrency: row.standardSewingCostCurrency,
    otherProductionCost: row.otherProductionCost,
    otherProductionCostCurrency: row.otherProductionCostCurrency,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toProductVariant(row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.productId,
    size: row.size,
    color: row.color,
    skuCode: row.skuCode,
    barcode: row.barcode,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toProductAttribute(row: ProductAttributeRow): ProductAttribute {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    value: row.value,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleCollectionRepository implements CollectionRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewCollectionInput): Promise<Collection> {
    const [row] = await this.db.insert(collections).values(input).returning();
    if (!row) throw new Error("INSERT collections не вернул строку");
    return toCollection(row);
  }

  async findByName(companyId: string, name: string): Promise<Collection | null> {
    const [row] = await this.db
      .select()
      .from(collections)
      .where(and(eq(collections.companyId, companyId), eq(collections.name, name)))
      .limit(1);
    return row ? toCollection(row) : null;
  }
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewProductInput): Promise<Product> {
    const [row] = await this.db.insert(products).values(input).returning();
    if (!row) throw new Error("INSERT products не вернул строку");
    return toProduct(row);
  }

  async updateCosts(companyId: string, id: string, input: ProductCostsInput): Promise<Product> {
    const [row] = await this.db
      .update(products)
      .set({
        standardSewingCost: input.standardSewingCost,
        standardSewingCostCurrency: input.standardSewingCostCurrency,
        otherProductionCost: input.otherProductionCost,
        otherProductionCostCurrency: input.otherProductionCostCurrency,
      })
      .where(and(eq(products.companyId, companyId), eq(products.id, id)))
      .returning();
    if (!row) throw new Error(`UPDATE products не вернул строку для id=${id}`);
    return toProduct(row);
  }

  // undefined — «не трогать» (PATCH одним полем не должен стирать
  // остальные), null — «явно очистить» (например, description: null).
  async updateDetails(companyId: string, id: string, input: ProductDetailsInput): Promise<Product> {
    const patch: Partial<typeof products.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.category !== undefined) patch.category = input.category;
    if (input.description !== undefined) patch.description = input.description;

    const [row] = await this.db
      .update(products)
      .set(patch)
      .where(and(eq(products.companyId, companyId), eq(products.id, id)))
      .returning();
    if (!row) throw new Error(`UPDATE products не вернул строку для id=${id}`);
    return toProduct(row);
  }

  async findByCode(companyId: string, code: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.code, code)))
      .limit(1);
    return row ? toProduct(row) : null;
  }

  async findById(companyId: string, id: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.id, id)))
      .limit(1);
    return row ? toProduct(row) : null;
  }

  async findByName(companyId: string, name: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), ilike(products.name, name)))
      .limit(1);
    return row ? toProduct(row) : null;
  }

  async findSimilarByName(companyId: string, name: string, limit: number): Promise<Product[]> {
    // Каталог бренда на этой стадии некрупный (MVP) — простое клиентское
    // сравнение подстрок в обе стороны надёжнее хрупкого SQL-трюка ради
    // редкого "не нашли точное совпадение" пути.
    const rows = await this.db.select().from(products).where(eq(products.companyId, companyId));
    const query = name.trim().toLowerCase();
    const matches = rows.filter((row) => {
      const candidate = row.name.trim().toLowerCase();
      return candidate.includes(query) || query.includes(candidate);
    });
    return matches.slice(0, limit).map(toProduct);
  }

  async listByCompany(companyId: string): Promise<Product[]> {
    const rows = await this.db.select().from(products).where(eq(products.companyId, companyId));
    return rows.map(toProduct);
  }
}

export class DrizzleProductVariantRepository implements ProductVariantRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewProductVariantInput): Promise<ProductVariant> {
    const [row] = await this.db.insert(productVariants).values(input).returning();
    if (!row) throw new Error("INSERT product_variants не вернул строку");
    return toProductVariant(row);
  }

  async findBySkuCode(skuCode: string): Promise<ProductVariant | null> {
    const [row] = await this.db.select().from(productVariants).where(eq(productVariants.skuCode, skuCode)).limit(1);
    return row ? toProductVariant(row) : null;
  }

  // join к products во всех трёх методах ниже — единственный способ
  // ограничить выборку компанией: собственной колонки company_id у
  // product_variants нет (см. комментарий у порта).
  async findByProductSizeColor(
    companyId: string,
    productId: string,
    size: string,
    color: string,
  ): Promise<ProductVariant | null> {
    const [row] = await this.db
      .select({ variant: productVariants })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.companyId, companyId),
          eq(productVariants.productId, productId),
          eq(productVariants.size, size),
          eq(productVariants.color, color),
        ),
      )
      .limit(1);
    return row ? toProductVariant(row.variant) : null;
  }

  async findById(companyId: string, id: string): Promise<ProductVariant | null> {
    const [row] = await this.db
      .select({ variant: productVariants })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.companyId, companyId), eq(productVariants.id, id)))
      .limit(1);
    return row ? toProductVariant(row.variant) : null;
  }

  async listByProduct(companyId: string, productId: string): Promise<ProductVariant[]> {
    const rows = await this.db
      .select({ variant: productVariants })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.companyId, companyId), eq(productVariants.productId, productId)));
    return rows.map((row) => toProductVariant(row.variant));
  }

  async listDistinctColorsByCompany(companyId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ color: productVariants.color })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(products.companyId, companyId))
      .orderBy(asc(productVariants.color));
    return rows.map((row) => row.color);
  }
}

function toProductSize(row: typeof productSizes.$inferSelect): ProductSize {
  return {
    id: row.id,
    productId: row.productId,
    size: row.size,
    sortOrder: row.sortOrder,
    ratioWeight: row.ratioWeight,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleProductSizeRepository implements ProductSizeRepository {
  constructor(private readonly db: DbOrTx) {}

  async listByProduct(companyId: string, productId: string): Promise<ProductSize[]> {
    const rows = await this.db
      .select({ size: productSizes })
      .from(productSizes)
      .innerJoin(products, eq(products.id, productSizes.productId))
      .where(and(eq(products.companyId, companyId), eq(productSizes.productId, productId)))
      .orderBy(asc(productSizes.sortOrder));
    return rows.map((row) => toProductSize(row.size));
  }

  // Ряд заменяется целиком в одной транзакции: порядок и веса меняются
  // вместе, и промежуточное состояние (часть старых размеров, часть новых)
  // не должно быть видно ни одному читателю.
  async replaceForProduct(productId: string, sizes: ProductSizeDraft[]): Promise<ProductSize[]> {
    return this.db.transaction(async (tx) => {
      await tx.delete(productSizes).where(eq(productSizes.productId, productId));
      const rows = await tx
        .insert(productSizes)
        .values(
          sizes.map((row, index) => ({
            productId,
            size: row.size,
            sortOrder: index,
            ratioWeight: String(row.ratioWeight),
          })),
        )
        .returning();
      return rows.map(toProductSize);
    });
  }
}

export class DrizzleProductAttributeRepository implements ProductAttributeRepository {
  constructor(private readonly db: DbOrTx) {}

  async listByProduct(companyId: string, productId: string): Promise<ProductAttribute[]> {
    const rows = await this.db
      .select({ attribute: productAttributes })
      .from(productAttributes)
      .innerJoin(products, eq(products.id, productAttributes.productId))
      .where(and(eq(products.companyId, companyId), eq(productAttributes.productId, productId)))
      .orderBy(asc(productAttributes.sortOrder));
    return rows.map((row) => toProductAttribute(row.attribute));
  }

  // Без companyId — вызывающий use case уже проверил владение продуктом
  // через products.findById(companyId, productId) (тот же паттерн, что
  // replaceForProduct у ProductSizeRepository).
  async findById(productId: string, attributeId: string): Promise<ProductAttribute | null> {
    const [row] = await this.db
      .select()
      .from(productAttributes)
      .where(and(eq(productAttributes.productId, productId), eq(productAttributes.id, attributeId)))
      .limit(1);
    return row ? toProductAttribute(row) : null;
  }

  async create(productId: string, draft: ProductAttributeDraft): Promise<ProductAttribute> {
    // Список характеристик у одной модели короткий (единицы-десятки строк) —
    // выборка всех id ради next sortOrder не требует агрегатных функций и не
    // рискует разойтись с диалектом count(), который здесь больше нигде не
    // использовался.
    const existing = await this.db
      .select({ id: productAttributes.id })
      .from(productAttributes)
      .where(eq(productAttributes.productId, productId));
    const [row] = await this.db
      .insert(productAttributes)
      .values({ productId, name: draft.name, value: draft.value, sortOrder: existing.length })
      .returning();
    if (!row) throw new Error("INSERT product_attributes не вернул строку");
    return toProductAttribute(row);
  }

  async update(attributeId: string, draft: ProductAttributeDraft): Promise<ProductAttribute> {
    const [row] = await this.db
      .update(productAttributes)
      .set({ name: draft.name, value: draft.value })
      .where(eq(productAttributes.id, attributeId))
      .returning();
    if (!row) throw new Error(`UPDATE product_attributes не вернул строку для id=${attributeId}`);
    return toProductAttribute(row);
  }

  async remove(attributeId: string): Promise<void> {
    await this.db.delete(productAttributes).where(eq(productAttributes.id, attributeId));
  }

  async listDistinctByCompany(companyId: string): Promise<Array<{ name: string; value: string }>> {
    const rows = await this.db
      .selectDistinct({ name: productAttributes.name, value: productAttributes.value })
      .from(productAttributes)
      .innerJoin(products, eq(products.id, productAttributes.productId))
      .where(eq(products.companyId, companyId))
      .orderBy(asc(productAttributes.name));
    return rows;
  }
}
