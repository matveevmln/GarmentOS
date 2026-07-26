import { collections, products, productVariants, type DbOrTx } from "@garmentos/db-schema";
import { and, eq, ilike } from "drizzle-orm";
import type { Collection } from "../domain/collection";
import type { Product } from "../domain/product";
import type { ProductVariant } from "../domain/product-variant";
import type {
  CollectionRepository,
  NewCollectionInput,
  NewProductInput,
  NewProductVariantInput,
  ProductRepository,
  ProductVariantRepository,
} from "../application/ports";

type CollectionRow = typeof collections.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type ProductVariantRow = typeof productVariants.$inferSelect;

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
    status: row.status,
    techPackUrl: row.techPackUrl,
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

  async findByProductSizeColor(productId: string, size: string, color: string): Promise<ProductVariant | null> {
    const [row] = await this.db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          eq(productVariants.size, size),
          eq(productVariants.color, color),
        ),
      )
      .limit(1);
    return row ? toProductVariant(row) : null;
  }

  async findById(id: string): Promise<ProductVariant | null> {
    const [row] = await this.db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
    return row ? toProductVariant(row) : null;
  }
}
