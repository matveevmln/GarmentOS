import {
  productionOrders,
  productionOrderVariants,
  sewingOrders,
  workshops,
  type DbOrTx,
} from "@garmentos/db-schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Workshop } from "../domain/workshop";
import type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderVariant,
  ReceivedVariantInput,
} from "../domain/production-order";
import type { SewingOrder, SewingOrderDraftPayload } from "../domain/sewing-order";
import type {
  NewProductionOrderInput,
  NewSewingOrderInput,
  NewWorkshopInput,
  PlaceSewingOrderRepoInput,
  ProductionOrderRepository,
  SewingOrderDraftPatch,
  SewingOrderRepository,
  WorkshopPatch,
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
    legalAddress: row.legalAddress,
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
    variantType: row.variantType,
    unitPrice: row.unitPrice,
    receivedQuantity: row.receivedQuantity,
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
    sourceProductionOrderId: row.sourceProductionOrderId,
    receivedAt: row.receivedAt,
    specificationId: row.specificationId,
    orderNumber: row.orderNumber,
    costSnapshot: row.costSnapshot as Record<string, unknown> | null,
    sewingOrderId: row.sewingOrderId,
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

  async update(id: string, patch: WorkshopPatch): Promise<Workshop> {
    // Ключи со значением undefined отбрасываются явно, а не полагаясь на
    // поведение драйвера: undefined означает «поле не передано» и не должно
    // попасть в SET, тогда как null означает «очистить» и попасть обязан.
    const values = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;

    const [row] = await this.db
      .update(workshops)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workshops.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE workshops не нашёл строку id=${id}`);
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
          sourceProductionOrderId: input.sourceProductionOrderId,
          specificationId: input.specificationId ?? null,
          orderNumber: input.orderNumber ?? null,
          costSnapshot: input.costSnapshot ?? null,
          sewingOrderId: input.sewingOrderId ?? null,
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
            variantType: variant.variantType ?? "new",
            unitPrice: variant.unitPrice !== undefined ? String(variant.unitPrice) : null,
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

  async updateCostSnapshot(id: string, costSnapshot: Record<string, unknown>): Promise<ProductionOrder | null> {
    // Compare-and-swap (idempotency-аудит 2026-09-22) — WHERE cost_snapshot
    // IS NULL делает "снимок ещё не зафиксирован" частью самого UPDATE, а не
    // отдельной проверкой до него. Раньше запись была безусловной: два
    // одновременных confirm на один черновик оба проходили application-level
    // проверку (оба читали costSnapshot=null до того, как любой успевал
    // записать), и оба писали — последний коммит молча побеждал. Теперь
    // такой второй запрос находит 0 строк и возвращает null.
    const [orderRow] = await this.db
      .update(productionOrders)
      .set({ costSnapshot, updatedAt: new Date() })
      .where(and(eq(productionOrders.id, id), isNull(productionOrders.costSnapshot)))
      .returning();
    if (!orderRow) return null;

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(eq(productionOrderVariants.productionOrderId, orderRow.id));

    return toProductionOrder(orderRow, variantRows);
  }

  // Факт по варианту (P0-1) пишется в той же транзакции, что и перевод
  // статуса в "received" — атомарно, чтобы не оказалось заказа, уже
  // принятого по статусу, но ещё без зафиксированного факта по строкам.
  async markReceived(id: string, received: ReceivedVariantInput[]): Promise<ProductionOrder> {
    return this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .update(productionOrders)
        .set({ status: "received", receivedAt: new Date(), updatedAt: new Date() })
        .where(eq(productionOrders.id, id))
        .returning();
      if (!orderRow) throw new Error(`UPDATE production_orders не нашёл строку id=${id}`);

      await Promise.all(
        received.map((line) =>
          tx
            .update(productionOrderVariants)
            .set({ receivedQuantity: String(line.quantity), updatedAt: new Date() })
            .where(
              and(
                eq(productionOrderVariants.productionOrderId, orderRow.id),
                eq(productionOrderVariants.productVariantId, line.productVariantId),
              ),
            ),
        ),
      );

      const variantRows = await tx
        .select()
        .from(productionOrderVariants)
        .where(eq(productionOrderVariants.productionOrderId, orderRow.id));

      return toProductionOrder(orderRow, variantRows);
    });
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

  async listByCompany(companyId: string): Promise<ProductionOrder[]> {
    const orderRows = await this.db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.companyId, companyId))
      .orderBy(desc(productionOrders.createdAt));
    if (orderRows.length === 0) return [];

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(
        inArray(
          productionOrderVariants.productionOrderId,
          orderRows.map((row) => row.id),
        ),
      );

    return orderRows.map((orderRow) =>
      toProductionOrder(
        orderRow,
        variantRows.filter((variant) => variant.productionOrderId === orderRow.id),
      ),
    );
  }

  async listBySpecification(companyId: string, specificationId: string): Promise<ProductionOrder[]> {
    const orderRows = await this.db
      .select()
      .from(productionOrders)
      .where(and(eq(productionOrders.companyId, companyId), eq(productionOrders.specificationId, specificationId)))
      .orderBy(desc(productionOrders.createdAt));
    if (orderRows.length === 0) return [];

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(
        inArray(
          productionOrderVariants.productionOrderId,
          orderRows.map((row) => row.id),
        ),
      );

    return orderRows.map((orderRow) =>
      toProductionOrder(
        orderRow,
        variantRows.filter((variant) => variant.productionOrderId === orderRow.id),
      ),
    );
  }

  async listByProduct(companyId: string, productId: string): Promise<ProductionOrder[]> {
    const orderRows = await this.db
      .select()
      .from(productionOrders)
      .where(and(eq(productionOrders.companyId, companyId), eq(productionOrders.productId, productId)))
      .orderBy(desc(productionOrders.createdAt));
    if (orderRows.length === 0) return [];

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(
        inArray(
          productionOrderVariants.productionOrderId,
          orderRows.map((row) => row.id),
        ),
      );

    return orderRows.map((orderRow) =>
      toProductionOrder(
        orderRow,
        variantRows.filter((variant) => variant.productionOrderId === orderRow.id),
      ),
    );
  }

  async listBySewingOrder(companyId: string, sewingOrderId: string): Promise<ProductionOrder[]> {
    const orderRows = await this.db
      .select()
      .from(productionOrders)
      .where(and(eq(productionOrders.companyId, companyId), eq(productionOrders.sewingOrderId, sewingOrderId)))
      .orderBy(desc(productionOrders.createdAt));
    if (orderRows.length === 0) return [];

    const variantRows = await this.db
      .select()
      .from(productionOrderVariants)
      .where(
        inArray(
          productionOrderVariants.productionOrderId,
          orderRows.map((row) => row.id),
        ),
      );

    return orderRows.map((orderRow) =>
      toProductionOrder(
        orderRow,
        variantRows.filter((variant) => variant.productionOrderId === orderRow.id),
      ),
    );
  }
}

function toSewingOrder(row: typeof sewingOrders.$inferSelect): SewingOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    workshopId: row.workshopId,
    number: row.number,
    status: row.status,
    draftPayload: row.draftPayload as SewingOrderDraftPayload | null,
    version: row.version,
    clientRequestId: row.clientRequestId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleSewingOrderRepository implements SewingOrderRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewSewingOrderInput): Promise<SewingOrder> {
    const [row] = await this.db
      .insert(sewingOrders)
      .values({
        companyId: input.companyId,
        workshopId: input.workshopId,
        draftPayload: input.draftPayload,
        createdBy: input.createdBy,
      })
      .returning();
    if (!row) throw new Error("INSERT sewing_orders не вернул строку");
    return toSewingOrder(row);
  }

  async findById(companyId: string, id: string): Promise<SewingOrder | null> {
    const [row] = await this.db
      .select()
      .from(sewingOrders)
      .where(and(eq(sewingOrders.companyId, companyId), eq(sewingOrders.id, id)))
      .limit(1);
    return row ? toSewingOrder(row) : null;
  }

  async findByIdForUpdate(companyId: string, id: string): Promise<SewingOrder | null> {
    const [row] = await this.db
      .select()
      .from(sewingOrders)
      .where(and(eq(sewingOrders.companyId, companyId), eq(sewingOrders.id, id)))
      .for("update")
      .limit(1);
    return row ? toSewingOrder(row) : null;
  }

  async updateDraft(id: string, expectedVersion: number, patch: SewingOrderDraftPatch): Promise<SewingOrder | null> {
    const values = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;

    // Compare-and-swap по version в самом WHERE — тот же принцип, что
    // updateCostSnapshot: конфликт двух вкладок не читается заранее и потом
    // проверяется в application-слое (гонка была бы возможна между чтением и
    // записью), а делает саму запись условной.
    const [row] = await this.db
      .update(sewingOrders)
      .set({ ...values, version: sql`${sewingOrders.version} + 1`, updatedAt: new Date() })
      .where(and(eq(sewingOrders.id, id), eq(sewingOrders.version, expectedVersion)))
      .returning();
    return row ? toSewingOrder(row) : null;
  }

  async place(id: string, input: PlaceSewingOrderRepoInput): Promise<SewingOrder> {
    const [row] = await this.db
      .update(sewingOrders)
      .set({
        status: "placed",
        workshopId: input.workshopId,
        number: input.number,
        clientRequestId: input.clientRequestId,
        updatedAt: new Date(),
      })
      .where(eq(sewingOrders.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE sewing_orders не нашёл строку id=${id}`);
    return toSewingOrder(row);
  }

  async listByCompany(companyId: string): Promise<SewingOrder[]> {
    const rows = await this.db
      .select()
      .from(sewingOrders)
      .where(eq(sewingOrders.companyId, companyId))
      .orderBy(desc(sewingOrders.createdAt));
    return rows.map(toSewingOrder);
  }
}
