import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  batchPayments,
  productionOrderQcResults,
  productionOrderDefects,
  productionOrders,
  productionOrderVariants,
  receiptCorrections,
  stockItems,
  stockMovements,
  transactions,
  type Database,
} from "@garmentos/db-schema";
import { validateReceiptCorrection } from "@garmentos/domain-contract-manufacturing";
import { computeBatchSettlement } from "@garmentos/domain-finance";
import type {
  BatchSettlementDto,
  CorrectReceiptDto,
  RecordBatchPaymentDto,
  ReverseBatchPaymentDto,
} from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { DATABASE_CONNECTION } from "../database/database.module";
import { DatabaseTransaction } from "../database/database-transaction";
import { IdentityService } from "../identity/identity.service";
import { ContractManufacturingService } from "./contract-manufacturing.service";

@Injectable()
export class BatchOperationsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly transaction: DatabaseTransaction,
    private readonly manufacturing: ContractManufacturingService,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  private async order(companyId: string, id: string) {
    const order = await this.manufacturing.findProductionOrderById(companyId, id);
    if (!order) throw new NotFoundException("Партия не найдена");
    return order;
  }

  async receiptAvailability(companyId: string, id: string, userId?: string) {
    const order = await this.order(companyId, id);
    if (
      userId &&
      !(await this.identity.getUserPermissions(userId)).includes("contract_manufacturing.rollback")
    )
      return {
        allowed: false,
        reason:
          "Исправление приёмки доступно владельцу или руководителю с правом исправления партий.",
      };
    if (
      !["received", "completed"].includes(order.status) ||
      order.variants.some((v) => v.receivedQuantity === null)
    )
      return { allowed: false, reason: "Приёмка ещё не записана" };
    const [qc, defects] = await Promise.all([
      this.db
        .select({ id: productionOrderQcResults.id })
        .from(productionOrderQcResults)
        .where(
          and(
            eq(productionOrderQcResults.companyId, companyId),
            eq(productionOrderQcResults.productionOrderId, id),
          ),
        )
        .limit(1),
      this.db
        .select({ id: productionOrderDefects.id })
        .from(productionOrderDefects)
        .where(
          and(
            eq(productionOrderDefects.companyId, companyId),
            eq(productionOrderDefects.productionOrderId, id),
          ),
        )
        .limit(1),
    ]);
    if (qc.length || defects.length)
      return {
        allowed: false,
        reason:
          "По партии уже записано качество или брак. Отдельное изменение приёмки нарушит эти данные; требуется согласованное исправление связанных фактов.",
      };
    const history = await this.audit.listForEntity(companyId, "production_order", id);
    const original = history.find((e) => e.action === "production_order.received")?.afterJson as {
      warehouseId?: string;
    } | null;
    if (!original?.warehouseId)
      return {
        allowed: false,
        reason:
          "У старой приёмки не сохранено место получения. Автоматическое исправление остатка недоступно.",
      };
    return { allowed: true, reason: null };
  }

  async correctReceipt(user: AuthenticatedRequestUser, id: string, input: CorrectReceiptDto) {
    return this.transaction.run(user.companyId, "production_order", id, async () => {
      const order = await this.order(user.companyId, id);
      const [previous] = await this.db
        .select()
        .from(receiptCorrections)
        .where(eq(receiptCorrections.id, input.requestId));
      const canonical = (rows: CorrectReceiptDto["variants"]) =>
        JSON.stringify(
          [...rows]
            .sort((a, b) => a.productVariantId.localeCompare(b.productVariantId))
            .map((r) => [r.productVariantId, r.quantity]),
        );
      if (previous) {
        if (
          previous.companyId !== user.companyId ||
          previous.productionOrderId !== id ||
          previous.reason !== input.reason ||
          canonical(previous.afterVariants) !== canonical(input.variants) ||
          canonical(previous.beforeVariants) !== canonical(input.expectedVariants)
        )
          throw new ConflictException("Этот запрос уже использован с другими данными");
        return order;
      }
      const availability = await this.receiptAvailability(user.companyId, id);
      if (!availability.allowed) throw new ConflictException(availability.reason);
      validateReceiptCorrection(order, input.expectedVariants, input.variants);
      const history = await this.audit.listForEntity(user.companyId, "production_order", id);
      const original = history.find((e) => e.action === "production_order.received")!.afterJson as {
        warehouseId: string;
      };
      const warehouse = await this.db.execute(
        sql`select 1 from warehouses where id=${original.warehouseId} and company_id=${user.companyId} for share`,
      );
      if (!warehouse.length)
        throw new ConflictException("Место приёмки не найдено в вашей компании");
      const beforeById = new Map(
        input.expectedVariants.map((r) => [r.productVariantId, r.quantity]),
      );
      // Stable row-lock order; reservation/dispatch SQL updates use these same
      // stock rows. The guarded update never consumes reserved stock.
      const ordered = [...input.variants].sort((a, b) =>
        a.productVariantId.localeCompare(b.productVariantId),
      );
      await this.db
        .insert(receiptCorrections)
        .values({
          id: input.requestId,
          companyId: user.companyId,
          productionOrderId: id,
          warehouseId: original.warehouseId,
          reason: input.reason,
          beforeVariants: input.expectedVariants,
          afterVariants: input.variants,
          createdBy: user.id,
        });
      for (const row of ordered) {
        const delta = row.quantity - beforeById.get(row.productVariantId)!;
        if (delta === 0) continue;
        const [item] = await this.db
          .select()
          .from(stockItems)
          .where(
            and(
              eq(stockItems.warehouseId, original.warehouseId),
              eq(stockItems.productVariantId, row.productVariantId),
            ),
          )
          .for("update");
        if (!item && delta < 0)
          throw new ConflictException(
            "Изделия уже перемещены или отгружены: недостаточно свободного остатка для исправления",
          );
        let itemId = item?.id;
        if (!item) {
          const [created] = await this.db
            .insert(stockItems)
            .values({
              warehouseId: original.warehouseId,
              productVariantId: row.productVariantId,
              quantityOnHand: String(delta),
            })
            .onConflictDoNothing()
            .returning();
          if (!created)
            throw new ConflictException("Остаток изменён другим действием. Повторите проверку");
          itemId = created.id;
        } else {
          const [updated] = await this.db
            .update(stockItems)
            .set({
              quantityOnHand: sql`${stockItems.quantityOnHand} + ${delta}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(stockItems.id, item.id),
                sql`${stockItems.quantityOnHand} + ${delta} >= ${stockItems.quantityReserved}`,
              ),
            )
            .returning();
          if (!updated)
            throw new ConflictException(
              "Недостаточно свободного остатка: часть изделий уже отгружена или зарезервирована",
            );
        }
        await this.db
          .insert(stockMovements)
          .values({
            stockItemId: itemId,
            type: "adjustment",
            quantity: String(delta),
            referenceType: "production_order_receipt_correction",
            referenceId: input.requestId,
            createdBy: user.id,
          });
        await this.db
          .update(productionOrderVariants)
          .set({ receivedQuantity: String(row.quantity) })
          .where(
            and(
              eq(productionOrderVariants.productionOrderId, id),
              eq(productionOrderVariants.productVariantId, row.productVariantId),
            ),
          );
      }
      // Reopen a previously closed party so the owner can review corrected facts.
      if (order.status === "completed")
        await this.db
          .update(productionOrders)
          .set({ status: "received", updatedAt: new Date() })
          .where(eq(productionOrders.id, id));
      await this.audit.recordForUser(user, {
        entityType: "production_order",
        entityId: id,
        action: "production_order.receipt_corrected",
        beforeJson: { status: order.status, variants: input.expectedVariants },
        afterJson: {
          status: "received",
          variants: input.variants,
          reason: input.reason,
          requestId: input.requestId,
        },
      });
      return this.order(user.companyId, id);
    });
  }

  async settlement(user: AuthenticatedRequestUser, id: string): Promise<BatchSettlementDto> {
    return this.transaction.run(user.companyId, "production_order", id, async () => {
      const order = await this.order(user.companyId, id);
      const [entries, unknown, permissions] = await Promise.all([
        this.db
          .select()
          .from(batchPayments)
          .where(
            and(
              eq(batchPayments.companyId, user.companyId),
              eq(batchPayments.productionOrderId, id),
            ),
          )
          .orderBy(asc(batchPayments.createdAt)),
        this.db.execute(
          sql`select (select count(*) from transactions t where t.company_id=${user.companyId} and t.reference_type='production_order' and t.reference_id=${id} and not exists (select 1 from batch_payments p where p.transaction_id=t.id)) + (select count(*) from invoices i where i.company_id=${user.companyId} and i.production_order_id=${id} and i.status='paid') as count`,
        ),
        this.identity.getUserPermissions(user.id),
      ]);
      const unclassifiedTransactions = Number(unknown[0]?.count ?? 0);
      const agreedAmount = order.variants.length
        ? order.variants.reduce(
            (sum, v) =>
              sum +
              Math.round(
                Number(v.quantity) *
                  (v.variantType === "rework" ? 0 : Number(v.unitPrice ?? order.agreedUnitPrice)) *
                  100,
              ),
            0,
          ) / 100
        : Math.round(Number(order.plannedQuantity) * Number(order.agreedUnitPrice) * 100) / 100;
      const reversedIds = new Set(entries.flatMap((p) => (p.reversalOfId ? [p.reversalOfId] : [])));
      return {
        currency: "RUB",
        agreedAmount,
        ...computeBatchSettlement(
          agreedAmount,
          entries,
          unclassifiedTransactions > 0 || order.status === "cancelled",
        ),
        unclassifiedTransactions,
        canWrite:
          permissions.includes("finance.write") &&
          permissions.includes("contract_manufacturing.write") &&
          order.status !== "draft",
        payments: entries.map((p) => ({
          id: p.id,
          direction: p.direction as "payment" | "refund",
          amount: Number(p.amount),
          note: p.note,
          reversalOfId: p.reversalOfId,
          reversed: reversedIds.has(p.id),
          createdAt: p.createdAt.toISOString(),
        })),
      };
    });
  }

  async recordPayment(user: AuthenticatedRequestUser, id: string, input: RecordBatchPaymentDto) {
    return this.transaction.run(user.companyId, "production_order", id, async () => {
      const order = await this.order(user.companyId, id);
      const [previous] = await this.db
        .select()
        .from(batchPayments)
        .where(eq(batchPayments.id, input.requestId));
      if (previous) {
        if (
          previous.companyId !== user.companyId ||
          previous.productionOrderId !== id ||
          previous.reversalOfId ||
          previous.direction !== input.direction ||
          Number(previous.amount) !== input.amount ||
          previous.note !== input.note ||
          previous.currency !== input.currency
        )
          throw new ConflictException("Этот запрос уже использован с другими данными");
        return this.settlement(user, id);
      }
      if (
        order.status === "draft" ||
        (order.status === "cancelled" && input.direction === "payment")
      )
        throw new BadRequestException(
          "После отмены партии можно записать возврат или исправить прежнюю запись, но не новую оплату",
        );
      const current = await this.settlement(user, id);
      if (input.direction === "refund" && input.amount > current.netPaid)
        throw new BadRequestException("Возврат не может превышать записанную оплату партии");
      await this.appendPayment(user, id, input, null);
      return this.settlement(user, id);
    });
  }

  async reversePayment(
    user: AuthenticatedRequestUser,
    id: string,
    paymentId: string,
    input: ReverseBatchPaymentDto,
  ) {
    return this.transaction.run(user.companyId, "production_order", id, async () => {
      await this.order(user.companyId, id);
      const [original] = await this.db
        .select()
        .from(batchPayments)
        .where(
          and(
            eq(batchPayments.id, paymentId),
            eq(batchPayments.companyId, user.companyId),
            eq(batchPayments.productionOrderId, id),
          ),
        );
      if (!original || original.reversalOfId)
        throw new NotFoundException("Исходный платёж не найден");
      const [previous] = await this.db
        .select()
        .from(batchPayments)
        .where(eq(batchPayments.id, input.requestId));
      if (previous) {
        if (
          previous.companyId !== user.companyId ||
          previous.productionOrderId !== id ||
          previous.reversalOfId !== paymentId ||
          previous.note !== input.reason
        )
          throw new ConflictException("Этот запрос уже использован с другими данными");
        return this.settlement(user, id);
      }
      const [reversed] = await this.db
        .select()
        .from(batchPayments)
        .where(eq(batchPayments.reversalOfId, paymentId));
      if (reversed) throw new ConflictException("Платёж уже исправлен");
      const current = await this.settlement(user, id);
      if (original.direction === "payment" && Number(original.amount) > current.netPaid)
        throw new ConflictException(
          "С этим платежом уже связан возврат. Сначала проверьте и исправьте возврат",
        );
      await this.appendPayment(
        user,
        id,
        {
          requestId: input.requestId,
          direction: original.direction === "payment" ? "refund" : "payment",
          amount: Number(original.amount),
          currency: "RUB",
          note: input.reason,
        },
        paymentId,
      );
      return this.settlement(user, id);
    });
  }

  private async appendPayment(
    user: AuthenticatedRequestUser,
    id: string,
    input: RecordBatchPaymentDto,
    reversalOfId: string | null,
  ) {
    const [money] = await this.db
      .insert(transactions)
      .values({
        companyId: user.companyId,
        type: input.direction === "payment" ? "expense" : "income",
        amount: input.amount.toFixed(2),
        referenceType: "production_order",
        referenceId: id,
      })
      .returning();
    await this.db
      .insert(batchPayments)
      .values({
        id: input.requestId,
        companyId: user.companyId,
        productionOrderId: id,
        transactionId: money.id,
        direction: input.direction,
        currency: input.currency,
        amount: input.amount.toFixed(2),
        note: input.note,
        reversalOfId,
        createdBy: user.id,
      });
    await this.audit.recordForUser(user, {
      entityType: "production_order",
      entityId: id,
      action: reversalOfId
        ? "production_order.payment_reversed"
        : "production_order.payment_recorded",
      afterJson: {
        requestId: input.requestId,
        amount: input.amount,
        currency: input.currency,
        direction: input.direction,
        note: input.note,
        reversalOfId,
      },
    });
  }
}
