import { describe, expect, it } from "vitest";
import { DomainError } from "./domain/errors";
import type { QcResult } from "./domain/qc-result";
import type { NewQcResultInput, ProductionOrderLookupPort, QcResultRepository } from "./application/ports";
import { recordQcResult } from "./application/record-qc-result";

const COMPANY = "company-1";
const ORDER = "order-1";

function buildResult(overrides: Partial<QcResult> = {}): QcResult {
  const now = new Date();
  return {
    id: "qc-1",
    companyId: COMPANY,
    productionOrderId: ORDER,
    receivedQuantity: "100",
    goodQuantity: "96",
    defectQuantity: "4",
    comment: null,
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeQcResults implements QcResultRepository {
  public existing: QcResult | null = null;
  public created: NewQcResultInput | null = null;

  create(input: NewQcResultInput): Promise<QcResult> {
    this.created = input;
    return Promise.resolve(
      buildResult({
        receivedQuantity: String(input.receivedQuantity),
        goodQuantity: String(input.goodQuantity),
        defectQuantity: String(input.defectQuantity),
        comment: input.comment,
        createdBy: input.createdBy,
      }),
    );
  }
  findByProductionOrder(): Promise<QcResult | null> {
    return Promise.resolve(this.existing);
  }
}

function fakeLookup(status: string | null): ProductionOrderLookupPort {
  return {
    findStatus() {
      return Promise.resolve(status === null ? null : { status });
    },
  };
}

describe("domain/qc — внесение результата ОТК", () => {
  it("фиксирует результат для принятого заказа", async () => {
    const repo = new FakeQcResults();
    const result = await recordQcResult(
      { qcResults: repo, productionOrders: fakeLookup("received") },
      { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 96, defectQuantity: 4, comment: null, createdBy: "user-1" },
    );
    expect(result.goodQuantity).toBe("96");
    expect(repo.created).toMatchObject({ receivedQuantity: 100, goodQuantity: 96, defectQuantity: 4 });
  });

  it("отклоняет ОТК для заказа, который ещё не принят", async () => {
    const repo = new FakeQcResults();
    await expect(
      recordQcResult(
        { qcResults: repo, productionOrders: fakeLookup("ready_for_pickup") },
        { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 96, defectQuantity: 4, comment: null, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "QC_PRODUCTION_ORDER_NOT_RECEIVED" });
  });

  it("отклоняет, если годных и брака в сумме больше полученного", async () => {
    const repo = new FakeQcResults();
    await expect(
      recordQcResult(
        { qcResults: repo, productionOrders: fakeLookup("received") },
        { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 96, defectQuantity: 10, comment: null, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "QC_QUANTITY_EXCEEDS_RECEIVED" });
  });

  it("отклоняет отрицательные количества", async () => {
    const repo = new FakeQcResults();
    await expect(
      recordQcResult(
        { qcResults: repo, productionOrders: fakeLookup("received") },
        { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: -1, defectQuantity: 4, comment: null, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "QC_QUANTITY_INVALID" });
  });

  it("бросает ошибку на неизвестный заказ", async () => {
    const repo = new FakeQcResults();
    await expect(
      recordQcResult(
        { qcResults: repo, productionOrders: fakeLookup(null) },
        { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 96, defectQuantity: 4, comment: null, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "QC_PRODUCTION_ORDER_NOT_FOUND" });
  });

  it("запрещает повторный финальный результат по той же партии", async () => {
    const repo = new FakeQcResults();
    repo.existing = buildResult();
    await expect(
      recordQcResult(
        { qcResults: repo, productionOrders: fakeLookup("received") },
        { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 90, defectQuantity: 10, comment: null, createdBy: null },
      ),
    ).rejects.toMatchObject({ code: "QC_RESULT_ALREADY_EXISTS" });
  });

  it("допускает равенство годных+брака и полученного (граница, не превышение)", async () => {
    const repo = new FakeQcResults();
    const result = await recordQcResult(
      { qcResults: repo, productionOrders: fakeLookup("received") },
      { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 90, defectQuantity: 10, comment: "без нареканий", createdBy: null },
    );
    expect(result).toBeDefined();
  });

  it("допускает годных+брака меньше полученного (часть ещё не рассортирована)", async () => {
    const repo = new FakeQcResults();
    await expect(
      recordQcResult(
        { qcResults: repo, productionOrders: fakeLookup("received") },
        { companyId: COMPANY, productionOrderId: ORDER, receivedQuantity: 100, goodQuantity: 50, defectQuantity: 10, comment: null, createdBy: null },
      ),
    ).resolves.toBeDefined();
  });
});

describe("DomainError", () => {
  it("несёт код ошибки", () => {
    const error = new DomainError("тест", "TEST_CODE");
    expect(error.code).toBe("TEST_CODE");
  });
});
