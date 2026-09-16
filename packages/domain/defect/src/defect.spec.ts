import { describe, expect, it } from "vitest";
import { DomainError } from "./domain/errors";
import type { DefectCompensation, ProductionOrderDefect } from "./domain/defect";
import type {
  DefectCompensationRepository,
  NewDefectCompensationInput,
  NewProductionOrderDefectInput,
  ProductionOrderDefectRepository,
  ProductionOrderInfo,
  ProductionOrderLookupPort,
} from "./application/ports";
import { recordDefects } from "./application/record-defects";
import { createDefectCompensation } from "./application/create-defect-compensation";

const COMPANY = "company-1";
const ORDER = "order-1";
const QC_RESULT = "qc-1";
const VARIANT_A = "variant-a";
const VARIANT_B = "variant-b";

function buildDefect(overrides: Partial<ProductionOrderDefect> = {}): ProductionOrderDefect {
  const now = new Date();
  return {
    id: "defect-1",
    companyId: COMPANY,
    productionOrderId: ORDER,
    qcResultId: QC_RESULT,
    productVariantId: null,
    quantity: "100",
    reason: null,
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildCompensation(overrides: Partial<DefectCompensation> = {}): DefectCompensation {
  return {
    id: "comp-1",
    companyId: COMPANY,
    defectId: "defect-1",
    compensatingProductionOrderId: "order-2",
    compensatingVariantId: null,
    quantity: "100",
    createdBy: "user-1",
    createdAt: new Date(),
    ...overrides,
  };
}

class FakeDefects implements ProductionOrderDefectRepository {
  public rows: ProductionOrderDefect[] = [];
  public existingCountByQcResult = 0;

  create(input: NewProductionOrderDefectInput): Promise<ProductionOrderDefect> {
    const row = buildDefect({
      id: `defect-${this.rows.length + 1}`,
      productionOrderId: input.productionOrderId,
      qcResultId: input.qcResultId,
      productVariantId: input.productVariantId ?? null,
      quantity: String(input.quantity),
      reason: input.reason ?? null,
      createdBy: input.createdBy,
    });
    this.rows.push(row);
    return Promise.resolve(row);
  }

  async createMany(inputs: NewProductionOrderDefectInput[]): Promise<ProductionOrderDefect[]> {
    const created: ProductionOrderDefect[] = [];
    for (const input of inputs) created.push(await this.create(input));
    return created;
  }

  findById(companyId: string, id: string): Promise<ProductionOrderDefect | null> {
    return Promise.resolve(this.rows.find((row) => row.companyId === companyId && row.id === id) ?? null);
  }

  listByProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrderDefect[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.companyId === companyId && row.productionOrderId === productionOrderId),
    );
  }

  countByQcResult(): Promise<number> {
    return Promise.resolve(this.existingCountByQcResult);
  }
}

class FakeCompensations implements DefectCompensationRepository {
  public rows: DefectCompensation[] = [];

  create(input: NewDefectCompensationInput): Promise<DefectCompensation> {
    const row = buildCompensation({
      id: `comp-${this.rows.length + 1}`,
      defectId: input.defectId,
      compensatingProductionOrderId: input.compensatingProductionOrderId,
      compensatingVariantId: input.compensatingVariantId ?? null,
      quantity: String(input.quantity),
      createdBy: input.createdBy,
    });
    this.rows.push(row);
    return Promise.resolve(row);
  }

  listByDefect(companyId: string, defectId: string): Promise<DefectCompensation[]> {
    return Promise.resolve(this.rows.filter((row) => row.companyId === companyId && row.defectId === defectId));
  }

  listByDefectIds(companyId: string, defectIds: string[]): Promise<DefectCompensation[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.companyId === companyId && defectIds.includes(row.defectId)),
    );
  }
}

function fakeLookup(orders: Record<string, ProductionOrderInfo>): ProductionOrderLookupPort {
  return {
    findById(companyId, id) {
      return Promise.resolve(companyId === COMPANY ? (orders[id] ?? null) : null);
    },
  };
}

describe("domain/defect — запись брака", () => {
  it("создаёт одну агрегатную строку без деталировки по SKU", async () => {
    const repo = new FakeDefects();
    const result = await recordDefects(
      { defects: repo, productionOrders: fakeLookup({}) },
      {
        companyId: COMPANY,
        productionOrderId: ORDER,
        qcResultId: QC_RESULT,
        totalDefectQuantity: 100,
        drafts: [{ quantity: 100, reason: null }],
        createdBy: "user-1",
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.productVariantId).toBeNull();
    expect(result[0]?.quantity).toBe("100");
  });

  it("создаёт разбивку по вариантам, когда сумма совпадает с итогом ОТК", async () => {
    const repo = new FakeDefects();
    const order: ProductionOrderInfo = {
      id: ORDER,
      sourceProductionOrderId: null,
      variants: [
        { id: "line-a", productVariantId: VARIANT_A, variantType: "new" },
        { id: "line-b", productVariantId: VARIANT_B, variantType: "new" },
      ],
    };
    const result = await recordDefects(
      { defects: repo, productionOrders: fakeLookup({ [ORDER]: order }) },
      {
        companyId: COMPANY,
        productionOrderId: ORDER,
        qcResultId: QC_RESULT,
        totalDefectQuantity: 100,
        drafts: [
          { productVariantId: VARIANT_A, quantity: 60, reason: "строчка" },
          { productVariantId: VARIANT_B, quantity: 40, reason: "пятно" },
        ],
        createdBy: "user-1",
      },
    );
    expect(result).toHaveLength(2);
  });

  it("отклоняет разбивку, если сумма строк не совпадает с итогом ОТК", async () => {
    const repo = new FakeDefects();
    await expect(
      recordDefects(
        { defects: repo, productionOrders: fakeLookup({}) },
        {
          companyId: COMPANY,
          productionOrderId: ORDER,
          qcResultId: QC_RESULT,
          totalDefectQuantity: 100,
          drafts: [{ quantity: 90, reason: null }],
          createdBy: null,
        },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_DRAFTS_SUM_MISMATCH" });
  });

  it("отклоняет вариант, не принадлежащий этому заказу", async () => {
    const repo = new FakeDefects();
    const order: ProductionOrderInfo = {
      id: ORDER,
      sourceProductionOrderId: null,
      variants: [{ id: "line-a", productVariantId: VARIANT_A, variantType: "new" }],
    };
    await expect(
      recordDefects(
        { defects: repo, productionOrders: fakeLookup({ [ORDER]: order }) },
        {
          companyId: COMPANY,
          productionOrderId: ORDER,
          qcResultId: QC_RESULT,
          totalDefectQuantity: 100,
          drafts: [{ productVariantId: "unknown-variant", quantity: 100, reason: null }],
          createdBy: null,
        },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_VARIANT_NOT_FOUND" });
  });

  it("запрещает повторную запись брака для того же результата ОТК", async () => {
    const repo = new FakeDefects();
    repo.existingCountByQcResult = 1;
    await expect(
      recordDefects(
        { defects: repo, productionOrders: fakeLookup({}) },
        {
          companyId: COMPANY,
          productionOrderId: ORDER,
          qcResultId: QC_RESULT,
          totalDefectQuantity: 100,
          drafts: [{ quantity: 100, reason: null }],
          createdBy: null,
        },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_ALREADY_RECORDED_FOR_QC_RESULT" });
  });

  it("отклоняет пустой список строк брака", async () => {
    const repo = new FakeDefects();
    await expect(
      recordDefects(
        { defects: repo, productionOrders: fakeLookup({}) },
        { companyId: COMPANY, productionOrderId: ORDER, qcResultId: QC_RESULT, totalDefectQuantity: 0, drafts: [], createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_DRAFTS_EMPTY" });
  });
});

describe("domain/defect — компенсация", () => {
  function sourceOrder(): ProductionOrderInfo {
    return { id: ORDER, sourceProductionOrderId: null, variants: [] };
  }

  function reworkOrder(overrides: Partial<ProductionOrderInfo> = {}): ProductionOrderInfo {
    return {
      id: "order-2",
      sourceProductionOrderId: ORDER,
      variants: [{ id: "rework-line", productVariantId: VARIANT_A, variantType: "rework" }],
      ...overrides,
    };
  }

  it("создаёт компенсацию только по явному вызову use case, при корректной ссылке на партию-источник", async () => {
    const defects = new FakeDefects();
    defects.rows.push(buildDefect({ id: "defect-1", quantity: "100" }));
    const compensations = new FakeCompensations();
    const result = await createDefectCompensation(
      {
        defects,
        compensations,
        productionOrders: fakeLookup({ [ORDER]: sourceOrder(), "order-2": reworkOrder() }),
      },
      {
        companyId: COMPANY,
        defectId: "defect-1",
        compensatingProductionOrderId: "order-2",
        compensatingVariantId: "rework-line",
        quantity: 100,
        createdBy: "user-1",
      },
    );
    expect(result.quantity).toBe("100");
  });

  it("отклоняет компенсацию, если компенсирующий заказ не ссылается на партию-источник дефекта", async () => {
    const defects = new FakeDefects();
    defects.rows.push(buildDefect({ id: "defect-1", quantity: "100" }));
    const compensations = new FakeCompensations();
    const unrelatedOrder: ProductionOrderInfo = { id: "order-3", sourceProductionOrderId: null, variants: [] };
    await expect(
      createDefectCompensation(
        { defects, compensations, productionOrders: fakeLookup({ [ORDER]: sourceOrder(), "order-3": unrelatedOrder }) },
        { companyId: COMPANY, defectId: "defect-1", compensatingProductionOrderId: "order-3", quantity: 50, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_COMPENSATION_SOURCE_MISMATCH" });
  });

  it("отклоняет компенсацию, привязанную к строке типа 'new' вместо 'rework'", async () => {
    const defects = new FakeDefects();
    defects.rows.push(buildDefect({ id: "defect-1", quantity: "100" }));
    const compensations = new FakeCompensations();
    const orderWithNewLine = reworkOrder({
      variants: [{ id: "new-line", productVariantId: VARIANT_A, variantType: "new" }],
    });
    await expect(
      createDefectCompensation(
        { defects, compensations, productionOrders: fakeLookup({ [ORDER]: sourceOrder(), "order-2": orderWithNewLine }) },
        {
          companyId: COMPANY,
          defectId: "defect-1",
          compensatingProductionOrderId: "order-2",
          compensatingVariantId: "new-line",
          quantity: 50,
          createdBy: null,
        },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_COMPENSATION_VARIANT_NOT_REWORK" });
  });

  it("запрещает перекомпенсацию сверх количества самого дефекта", async () => {
    const defects = new FakeDefects();
    defects.rows.push(buildDefect({ id: "defect-1", quantity: "100" }));
    const compensations = new FakeCompensations();
    compensations.rows.push(buildCompensation({ defectId: "defect-1", quantity: "60" }));
    await expect(
      createDefectCompensation(
        { defects, compensations, productionOrders: fakeLookup({ [ORDER]: sourceOrder(), "order-2": reworkOrder() }) },
        {
          companyId: COMPANY,
          defectId: "defect-1",
          compensatingProductionOrderId: "order-2",
          compensatingVariantId: "rework-line",
          quantity: 50,
          createdBy: null,
        },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_OVERCOMPENSATION" });
  });

  it("допускает частичную компенсацию несколькими заказами в сумме равную дефекту", async () => {
    const defects = new FakeDefects();
    defects.rows.push(buildDefect({ id: "defect-1", quantity: "100" }));
    const compensations = new FakeCompensations();
    compensations.rows.push(buildCompensation({ defectId: "defect-1", quantity: "60" }));
    await expect(
      createDefectCompensation(
        { defects, compensations, productionOrders: fakeLookup({ [ORDER]: sourceOrder(), "order-2": reworkOrder() }) },
        {
          companyId: COMPANY,
          defectId: "defect-1",
          compensatingProductionOrderId: "order-2",
          compensatingVariantId: "rework-line",
          quantity: 40,
          createdBy: null,
        },
      ),
    ).resolves.toBeDefined();
  });

  it("бросает ошибку, если дефект не найден в этой компании", async () => {
    const defects = new FakeDefects();
    const compensations = new FakeCompensations();
    await expect(
      createDefectCompensation(
        { defects, compensations, productionOrders: fakeLookup({}) },
        { companyId: COMPANY, defectId: "missing", compensatingProductionOrderId: "order-2", quantity: 10, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "DEFECT_NOT_FOUND" });
  });
});

describe("DomainError", () => {
  it("несёт код ошибки", () => {
    const error = new DomainError("тест", "TEST_CODE");
    expect(error.code).toBe("TEST_CODE");
  });
});
