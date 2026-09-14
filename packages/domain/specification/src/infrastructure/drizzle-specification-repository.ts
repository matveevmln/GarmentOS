import { specifications, specificationItems, type DbOrTx } from "@garmentos/db-schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { DomainError } from "../domain/errors";
import type { Specification, SpecificationItem, SpecificationSnapshot, SpecificationStatus } from "../domain/specification";
import type { NewSpecificationInput, SpecificationRepository } from "../application/ports";

type SpecificationRow = typeof specifications.$inferSelect;
type SpecificationItemRow = typeof specificationItems.$inferSelect;

function toItem(row: SpecificationItemRow): SpecificationItem {
  return {
    id: row.id,
    specificationId: row.specificationId,
    productVariantId: row.productVariantId,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    sum: row.sum,
    sortOrder: row.sortOrder,
  };
}

function toSpecification(row: SpecificationRow, itemRows: SpecificationItemRow[]): Specification {
  return {
    id: row.id,
    companyId: row.companyId,
    workshopId: row.workshopId,
    productId: row.productId,
    specNumber: row.specNumber,
    status: row.status,
    version: row.version,
    basedOnSpecificationId: row.basedOnSpecificationId,
    deliveryDeadline: row.deliveryDeadline,
    totalQuantity: row.totalQuantity,
    totalSum: row.totalSum,
    totalSumCurrency: row.totalSumCurrency,
    prepaymentAmount: row.prepaymentAmount,
    snapshotJson: row.snapshotJson as Record<string, unknown> | null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: itemRows
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toItem),
  };
}

export class DrizzleSpecificationRepository implements SpecificationRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewSpecificationInput): Promise<Specification> {
    return this.db.transaction(async (tx) => {
      const [specRow] = await tx
        .insert(specifications)
        .values({
          companyId: input.companyId,
          workshopId: input.workshopId,
          productId: input.productId,
          status: input.status,
          version: input.version,
          basedOnSpecificationId: input.basedOnSpecificationId,
          deliveryDeadline: input.deliveryDeadline,
          totalQuantity: String(input.totalQuantity),
          totalSum: String(input.totalSum),
          createdBy: input.createdBy,
        })
        .returning();
      if (!specRow) throw new Error("INSERT specifications не вернул строку");

      const itemRows = await tx
        .insert(specificationItems)
        .values(
          input.items.map((item, index) => ({
            specificationId: specRow.id,
            productVariantId: item.productVariantId,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            sum: String(item.sum),
            sortOrder: index,
          })),
        )
        .returning();

      return toSpecification(specRow, itemRows);
    });
  }

  async findById(companyId: string, id: string): Promise<Specification | null> {
    const [specRow] = await this.db
      .select()
      .from(specifications)
      .where(and(eq(specifications.companyId, companyId), eq(specifications.id, id)))
      .limit(1);
    if (!specRow) return null;

    const itemRows = await this.db
      .select()
      .from(specificationItems)
      .where(eq(specificationItems.specificationId, specRow.id))
      .orderBy(asc(specificationItems.sortOrder));
    return toSpecification(specRow, itemRows);
  }

  async listByCompany(
    companyId: string,
    filter?: { productId?: string; workshopId?: string; status?: SpecificationStatus },
  ): Promise<Specification[]> {
    const conditions = [eq(specifications.companyId, companyId)];
    if (filter?.productId) conditions.push(eq(specifications.productId, filter.productId));
    if (filter?.workshopId) conditions.push(eq(specifications.workshopId, filter.workshopId));
    if (filter?.status) conditions.push(eq(specifications.status, filter.status));

    const specRows = await this.db
      .select()
      .from(specifications)
      .where(and(...conditions))
      .orderBy(desc(specifications.createdAt));
    if (specRows.length === 0) return [];

    // N+1 по строкам сознательно: список спецификаций — не путь горячего
    // цикла (создаётся редко относительно чтения), а количество строк на
    // спецификацию небольшое — тот же компромисс, что и listByProduct у BOM.
    const results: Specification[] = [];
    for (const specRow of specRows) {
      const itemRows = await this.db
        .select()
        .from(specificationItems)
        .where(eq(specificationItems.specificationId, specRow.id))
        .orderBy(asc(specificationItems.sortOrder));
      results.push(toSpecification(specRow, itemRows));
    }
    return results;
  }

  async approve(
    companyId: string,
    id: string,
    input: { specNumber: number; prepaymentAmount: number; snapshotJson: SpecificationSnapshot },
  ): Promise<Specification> {
    // Условный UPDATE (WHERE status='draft' AND company_id=...) — закрывает
    // гонку двух параллельных approve одной и той же спецификации бесплатно,
    // без отдельной транзакции/блокировки: если строку уже кто-то утвердил
    // между findById в use case и этим вызовом, UPDATE не находит ни одной
    // строки, и мы честно сообщаем об этом, а не молча перезаписываем номер.
    // company_id в WHERE — defense-in-depth (аудит IDOR перед Этапом 2): без
    // него метод полагался бы целиком на то, что вызывающий код уже проверил
    // принадлежность id компании.
    const [specRow] = await this.db
      .update(specifications)
      .set({
        status: "approved",
        specNumber: input.specNumber,
        prepaymentAmount: String(input.prepaymentAmount),
        snapshotJson: input.snapshotJson,
        updatedAt: new Date(),
      })
      .where(and(eq(specifications.id, id), eq(specifications.companyId, companyId), eq(specifications.status, "draft")))
      .returning();

    if (!specRow) {
      throw new DomainError(
        `Спецификация ${id} уже не является черновиком — вероятно, утверждена параллельным запросом`,
        "SPECIFICATION_NOT_DRAFT",
      );
    }

    const itemRows = await this.db
      .select()
      .from(specificationItems)
      .where(eq(specificationItems.specificationId, specRow.id))
      .orderBy(asc(specificationItems.sortOrder));
    return toSpecification(specRow, itemRows);
  }
}
