import { shipments, shipmentItems, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { Shipment, ShipmentItem, ShipmentStatus } from "../domain/shipment";
import type { NewShipmentInput, ShipmentRepository } from "../application/ports";

type ShipmentRow = typeof shipments.$inferSelect;
type ShipmentItemRow = typeof shipmentItems.$inferSelect;

function toShipmentItem(row: ShipmentItemRow): ShipmentItem {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    productVariantId: row.productVariantId,
    quantity: row.quantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toShipment(row: ShipmentRow, items: ShipmentItemRow[]): Shipment {
  return {
    id: row.id,
    companyId: row.companyId,
    originWarehouseId: row.originWarehouseId,
    destinationWarehouseId: row.destinationWarehouseId,
    carrierId: row.carrierId,
    status: row.status,
    trackingNumber: row.trackingNumber,
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map(toShipmentItem),
  };
}

export class DrizzleShipmentRepository implements ShipmentRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewShipmentInput): Promise<Shipment> {
    return this.db.transaction(async (tx) => {
      const [shipmentRow] = await tx
        .insert(shipments)
        .values({
          companyId: input.companyId,
          originWarehouseId: input.originWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          carrierId: input.carrierId,
          trackingNumber: input.trackingNumber,
          createdBy: input.createdBy,
        })
        .returning();
      if (!shipmentRow) throw new Error("INSERT shipments не вернул строку");

      const itemRows = await tx
        .insert(shipmentItems)
        .values(input.items.map((item) => ({ shipmentId: shipmentRow.id, productVariantId: item.productVariantId, quantity: String(item.quantity) })))
        .returning();

      return toShipment(shipmentRow, itemRows);
    });
  }

  async findById(companyId: string, id: string): Promise<Shipment | null> {
    const [shipmentRow] = await this.db
      .select()
      .from(shipments)
      .where(and(eq(shipments.companyId, companyId), eq(shipments.id, id)))
      .limit(1);
    if (!shipmentRow) return null;

    const itemRows = await this.db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentRow.id));
    return toShipment(shipmentRow, itemRows);
  }

  async updateStatus(id: string, status: ShipmentStatus, deliveredAt: Date | null): Promise<Shipment> {
    const [shipmentRow] = await this.db
      .update(shipments)
      .set({
        status,
        updatedAt: new Date(),
        ...(status === "in_transit" ? { shippedAt: new Date() } : {}),
        ...(deliveredAt !== null ? { deliveredAt } : {}),
      })
      .where(eq(shipments.id, id))
      .returning();
    if (!shipmentRow) throw new Error(`UPDATE shipments не нашёл строку id=${id}`);

    const itemRows = await this.db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentRow.id));
    return toShipment(shipmentRow, itemRows);
  }
}
