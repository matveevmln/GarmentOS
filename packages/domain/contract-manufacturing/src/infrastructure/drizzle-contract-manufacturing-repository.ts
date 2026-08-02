import {
  productionOrders,
  productionOrderVariants,
  workshops,
  type DbOrTx,
} from "@garmentos/db-schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Workshop } from "../domain/workshop";
import type { ProductionOrder, ProductionOrderStatus, ProductionOrderVariant } from "../domain/production-order";
import type {
  NewProductionOrderInput,
  NewWorkshopInput,
  ProductionOrderRepository,
  WorkshopRepository,
} from "../application/ports";

type WorkshopRow = typeof workshops.$inferSelect;
type ProductionOrderRow = typeof productionOrders.$inferSelect;
type ProductionOrderVariantRow = typeof productionOrderVariants.$inferSelect;

function toWorkshop(row: WorkshopRow): Workshop {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    inn: row.inn,
    contactInfo: row.contactInfo,
    specialization: row.specialization,
    status: row.status,
    telegramChatId: row.telegramChatId,
    contractNumber: row.contractNumber,
    contractDate: row.contractDate,
    nextSpecificationNumber: row.nextSpecificationNumber,
    paymentTerms: row.paymentTerms,
    deliveryMethod: row.deliveryMethod,
    signerRole: row.signerRole,
    signerName: row.signerName,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toProductionOrderVariant(row: ProductionOrderVariantRow): ProductionOrderVariant {
  return {
    id: row.id,
    productionOrderId: row.productionOrderId,
    productVariantId: row.productVariantId,
    quantity: row.quantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProductionOrder(row: ProductionOrderRow, variants: ProductionOrderVariantRow[]): ProductionOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    productId: row.productId,
    bomId: row.bomId,
    workshopId: row.workshopId,
    plannedQuantity: row.plannedQuantity,
    agreedUnitPrice: row.agreedUnitPrice,
    materialsProvidedByUs: row.materialsProvidedByUs,
    status: row.status,
    dueDate: row.dueDate,
    receivedAt: row.receivedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variants: variants.map(toProductionOrderVariant),
  };
}

export class DrizzleWorkshopRepository implements WorkshopRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewWorkshopInput): Promise<Workshop> {
    const [row] = await this.db.insert(workshops).values(input).returning();
    if (!row) throw new Error("INSERT workshops не вернул строку");
    return toWorkshop(row);
  }

  async findById(companyId: string, id: string): Promise<Workshop | null> {
    const [row] = await this.db
      .select()
      .from(workshops)
      .where(and(eq(workshops.companyId, companyId), eq(workshops.id, id)))
      .limit(1);
    return row ? toWorkshop(row) : null;
  }

  async findByTelegramChatId(chatId: string): Promise<Workshop | null> {
    const [row] = await this.db.select().from(workshops).where(eq(workshops.telegramChatId, chatId)).limit(1);
    return row ? toWorkshop(row) : null;
  }

  async listActiveByCompany(companyId: string): Promise<Workshop[]> {
    const rows = await this.db
      .select()
      .from(workshops)
      .where(and(eq(workshops.companyId, companyId), eq(workshops.status, "active")));
    return rows.map(toWorkshop);
  }

  async setTelegramChatId(id: string, chatId: string): Promise<Workshop> {
    const [row] = await this.db
      .update(workshops)
      .set({ telegramChatId: chatId, updatedAt: new Date() })
      .where(eq(workshops.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE workshops не нашёл строку id=${id}`);
    return toWorkshop(row);
  }

  async reserveNextSpecificationNumber(id: string): Promise<number> {
    // Атомарный UPDATE...RETURNING — исключает гонку при параллельной
    // генерации двух спецификаций для одного цеха (обычный UPDATE с
    // прочитанным заранее значением был бы уязвим к read-then-write race).
    const [row] = await this.db
      .update(workshops)
      .set({ nextSpecificationNumber: sql`${workshops.nextSpecificationNumber} + 1`, updatedAt: new Date() })
      .where(eq(workshops.id, id))
      .returning({ nextSpecificationNumber: workshops.nextSpecificationNumber });
    if (!row) throw new Error(`UPDATE workshops не нашёл строку id=${id}`);
    return row.nextSpecificationNumber - 1;
  }
}

export class DrizzleProductionOrderRepository implements ProductionOrderRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewProductionOrderInput): Promise<ProductionOrder> {
    return this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(productionOrders)
        .values({
          companyId: input.companyId,
          productId: input.productId,
          bomId: input.bomId,
          workshopId: input.workshopId,
          plannedQuantity: String(input.plannedQuantity),
          agreedUnitPrice: String(input.agreedUnitPrice),
          materialsProvidedByUs: input.materialsProvidedByUs,
          status: input.status,
          dueDate: input.dueDate,
          createdBy: input.createdBy,
        })
        .returning();
      if (!orderRow) throw new Error("INSERT production_orders не вернул строку");

      const variantRows = await tx
        .insert(productionOrderVariants)
        .values(
          input.variants.map((variant) => ({
            productionOrderId: orderRow.id,
            productVariantId: variant.productVariantId,
            quantity: String(variant.quantity),
          })),
        )
        .returning();

      return toProductionOrder(orderRow, variantRows);
    });
  }

  async findById(companyId: string, id: string): Promise<ProductionOrder | null> {
    const [orderRow] = await this.db
      .select()
      .from(productionOrders)
      .where(and(eq(productionOrders.companyId, companyId), eq(productionOrders.id, id)))
      .limit(1);
    if (!orderRow) return null;

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(eq(productionOrderVariants.productionOrderId, orderRow.id));

    return toProductionOrder(orderRow, variantRows);
  }

  async updateStatus(id: string, status: ProductionOrderStatus): Promise<ProductionOrder> {
    const [orderRow] = await this.db
      .update(productionOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(productionOrders.id, id))
      .returning();
    if (!orderRow) throw new Error(`UPDATE production_orders не нашёл строку id=${id}`);

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(eq(productionOrderVariants.productionOrderId, orderRow.id));

    return toProductionOrder(orderRow, variantRows);
  }

  async findLatestActiveByWorkshop(companyId: string, workshopId: string): Promise<ProductionOrder | null> {
    const [orderRow] = await this.db
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.companyId, companyId),
          eq(productionOrders.workshopId, workshopId),
          inArray(productionOrders.status, ["placed", "in_progress", "ready_for_pickup"]),
        ),
      )
      .orderBy(desc(productionOrders.createdAt))
      .limit(1);
    if (!orderRow) return null;

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(eq(productionOrderVariants.productionOrderId, orderRow.id));

    return toProductionOrder(orderRow, variantRows);
  }
}
