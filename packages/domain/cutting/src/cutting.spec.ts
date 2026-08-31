import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "./domain/errors";
import type { CuttingOrder, CuttingOrderStatus } from "./domain/cutting-order";
import type {
  CuttingOrderMaterialFactInput,
  CuttingOrderRepository,
  CuttingOrderResultFactInput,
  MaterialStockPort,
  NewCuttingOrderInput,
  ProductionOrderSnapshotPort,
} from "./application/ports";
import { createCuttingOrder } from "./application/create-cutting-order";
import { issueCuttingOrder } from "./application/issue-cutting-order";
import { correctCuttingFact, recordCuttingFact } from "./application/record-cutting-fact";
import { cancelCuttingOrder } from "./application/cancel-cutting-order";

const FABRIC = "11111111-1111-1111-1111-111111111111";
const VARIANT_S = "22222222-2222-2222-2222-222222222222";
const VARIANT_M = "33333333-3333-3333-3333-333333333333";
const WAREHOUSE = "44444444-4444-4444-4444-444444444444";

function buildOrder(overrides: Partial<CuttingOrder> = {}): CuttingOrder {
  const now = new Date();
  return {
    id: "order-1",
    companyId: "company-1",
    productionOrderId: "production-1",
    number: 1,
    status: "draft",
    executorType: "in_house",
    executorWorkshopId: null,
    issuedAt: null,
    completedAt: null,
    comment: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    materials: [
      {
        id: "m-1",
        cuttingOrderId: "order-1",
        materialId: FABRIC,
        unit: "m",
        requiredQuantity: "1300",
        allocatedQuantity: null,
        consumedQuantity: null,
        rollNote: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    results: [
      {
        id: "r-1",
        cuttingOrderId: "order-1",
        productVariantId: VARIANT_S,
        plannedQuantity: "200",
        actualQuantity: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "r-2",
        cuttingOrderId: "order-1",
        productVariantId: VARIANT_M,
        plannedQuantity: "300",
        actualQuantity: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  };
}

class FakeCuttingOrders implements CuttingOrderRepository {
  public order: CuttingOrder = buildOrder();
  public created: NewCuttingOrderInput | null = null;
  public count = 0;

  async create(input: NewCuttingOrderInput): Promise<CuttingOrder> {
    this.created = input;
    return buildOrder({ number: input.number });
  }
  async findById(): Promise<CuttingOrder | null> {
    return this.order;
  }
  async listByProductionOrder(): Promise<CuttingOrder[]> {
    return [this.order];
  }
  async countByProductionOrder(): Promise<number> {
    return this.count;
  }
  async updateStatus(_id: string, status: CuttingOrderStatus): Promise<CuttingOrder> {
    this.order = { ...this.order, status };
    return this.order;
  }
  async updateAllocations(): Promise<CuttingOrder> {
    return this.order;
  }
  async recordFact(
    _id: string,
    materials: CuttingOrderMaterialFactInput[],
    results: CuttingOrderResultFactInput[],
  ): Promise<CuttingOrder> {
    this.order = {
      ...this.order,
      materials: this.order.materials.map((row) => {
        const fact = materials.find((item) => item.materialId === row.materialId);
        return fact ? { ...row, consumedQuantity: String(fact.consumedQuantity) } : row;
      }),
      results: this.order.results.map((row) => {
        const fact = results.find((item) => item.productVariantId === row.productVariantId);
        return fact ? { ...row, actualQuantity: String(fact.actualQuantity) } : row;
      }),
    };
    return this.order;
  }
}

class FakeStock implements MaterialStockPort {
  public onHand = 1300;
  public consumed: number[] = [];
  public adjusted: number[] = [];

  async quantityOnHand(): Promise<number> {
    return this.onHand;
  }
  async consume(_w: string, _m: string, quantity: number): Promise<void> {
    this.consumed.push(quantity);
    this.onHand -= quantity;
  }
  async adjust(_w: string, _m: string, delta: number): Promise<void> {
    this.adjusted.push(delta);
    this.onHand += delta;
  }
}

const snapshotPort: ProductionOrderSnapshotPort = {
  async findForCutting() {
    return {
      status: "placed",
      plannedQuantity: 500,
      variants: [
        { productVariantId: VARIANT_S, quantity: 200 },
        { productVariantId: VARIANT_M, quantity: 300 },
      ],
      materialNorms: [{ materialId: FABRIC, unit: "m", quantityPerUnit: 2.6, wastePercent: 0 }],
    };
  },
};

describe("domain/cutting — создание задания", () => {
  let repo: FakeCuttingOrders;
  beforeEach(() => {
    repo = new FakeCuttingOrders();
  });

  it("строит задание из данных заказа: потребность = норма × количество", async () => {
    await createCuttingOrder(
      { cuttingOrders: repo, productionOrders: snapshotPort },
      { companyId: "company-1", productionOrderId: "production-1" },
    );
    expect(repo.created?.materials).toEqual([
      { materialId: FABRIC, unit: "m", requiredQuantity: 1300, allocatedQuantity: null, rollNote: null },
    ]);
    expect(repo.created?.results).toEqual([
      { productVariantId: VARIANT_S, plannedQuantity: 200 },
      { productVariantId: VARIANT_M, plannedQuantity: 300 },
    ]);
  });

  it("нумерует докрой следующим номером в рамках заказа", async () => {
    repo.count = 1;
    await createCuttingOrder(
      { cuttingOrders: repo, productionOrders: snapshotPort },
      { companyId: "company-1", productionOrderId: "production-1" },
    );
    expect(repo.created?.number).toBe(2);
  });

  it("не кроит по черновику заказа и по партии без зафиксированных норм", async () => {
    const draftPort: ProductionOrderSnapshotPort = {
      async findForCutting() {
        return { status: "draft", plannedQuantity: 500, variants: [], materialNorms: [] };
      },
    };
    await expect(
      createCuttingOrder(
        { cuttingOrders: repo, productionOrders: draftPort },
        { companyId: "company-1", productionOrderId: "production-1" },
      ),
    ).rejects.toThrow(DomainError);

    const noNormsPort: ProductionOrderSnapshotPort = {
      async findForCutting() {
        return {
          status: "placed",
          plannedQuantity: 500,
          variants: [{ productVariantId: VARIANT_S, quantity: 500 }],
          materialNorms: [],
        };
      },
    };
    await expect(
      createCuttingOrder(
        { cuttingOrders: repo, productionOrders: noNormsPort },
        { companyId: "company-1", productionOrderId: "production-1" },
      ),
    ).rejects.toThrow(/нормы расхода/i);
  });

  it("требует цех для раскроя у подрядчика и запрещает его для собственного", async () => {
    await expect(
      createCuttingOrder(
        { cuttingOrders: repo, productionOrders: snapshotPort },
        { companyId: "company-1", productionOrderId: "production-1", executorType: "workshop" },
      ),
    ).rejects.toThrow(DomainError);
    await expect(
      createCuttingOrder(
        { cuttingOrders: repo, productionOrders: snapshotPort },
        {
          companyId: "company-1",
          productionOrderId: "production-1",
          executorType: "in_house",
          executorWorkshopId: "some-workshop",
        },
      ),
    ).rejects.toThrow(DomainError);
  });
});

describe("domain/cutting — факт кроя и склад", () => {
  let repo: FakeCuttingOrders;
  let stock: FakeStock;
  beforeEach(() => {
    repo = new FakeCuttingOrders();
    stock = new FakeStock();
  });

  it("выдача в крой склад не трогает", async () => {
    await issueCuttingOrder({ cuttingOrders: repo }, { companyId: "company-1", cuttingOrderId: "order-1" });
    expect(repo.order.status).toBe("issued");
    expect(stock.consumed).toEqual([]);
  });

  it("списывает фактический расход и завершает задание", async () => {
    repo.order = buildOrder({ status: "issued" });
    const outcome = await recordCuttingFact(
      { cuttingOrders: repo, materialStock: stock },
      {
        companyId: "company-1",
        cuttingOrderId: "order-1",
        warehouseId: WAREHOUSE,
        materials: [{ materialId: FABRIC, consumedQuantity: 1247 }],
        results: [
          { productVariantId: VARIANT_S, actualQuantity: 198 },
          { productVariantId: VARIANT_M, actualQuantity: 300 },
        ],
      },
    );
    expect(stock.consumed).toEqual([1247]);
    expect(outcome.shortages).toEqual([]);
    expect(outcome.cuttingOrder.status).toBe("completed");
  });

  it("не блокирует факт при нехватке остатка, но возвращает расхождение", async () => {
    repo.order = buildOrder({ status: "issued" });
    stock.onHand = 1200;
    const outcome = await recordCuttingFact(
      { cuttingOrders: repo, materialStock: stock },
      {
        companyId: "company-1",
        cuttingOrderId: "order-1",
        warehouseId: WAREHOUSE,
        materials: [{ materialId: FABRIC, consumedQuantity: 1247 }],
        results: [{ productVariantId: VARIANT_S, actualQuantity: 200 }],
      },
    );
    expect(outcome.cuttingOrder.status).toBe("completed");
    expect(stock.onHand).toBe(-47);
    expect(outcome.shortages).toEqual([
      { materialId: FABRIC, onHandBefore: 1200, consumed: 1247, shortage: 47 },
    ]);
  });

  it("исправление факта проводит корректировку на разницу, а не переписывает расход", async () => {
    repo.order = buildOrder({
      status: "completed",
      materials: [
        {
          id: "m-1",
          cuttingOrderId: "order-1",
          materialId: FABRIC,
          unit: "m",
          requiredQuantity: "1300",
          allocatedQuantity: "1300",
          consumedQuantity: "1247",
          rollNote: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const outcome = await correctCuttingFact(
      { cuttingOrders: repo, materialStock: stock },
      {
        companyId: "company-1",
        cuttingOrderId: "order-1",
        warehouseId: WAREHOUSE,
        materials: [{ materialId: FABRIC, consumedQuantity: 1230 }],
        results: [{ productVariantId: VARIANT_S, actualQuantity: 200 }],
      },
    );
    // Израсходовали меньше, чем записали, — 17 м возвращается на склад.
    expect(stock.adjusted).toEqual([17]);
    expect(stock.consumed).toEqual([]);
    expect(outcome.corrections).toEqual([{ materialId: FABRIC, before: 1247, after: 1230, delta: -17 }]);
  });

  it("защищает порядок состояний: факт только по выданному, исправление только по завершённому", async () => {
    repo.order = buildOrder({ status: "draft" });
    await expect(
      recordCuttingFact(
        { cuttingOrders: repo, materialStock: stock },
        {
          companyId: "company-1",
          cuttingOrderId: "order-1",
          warehouseId: WAREHOUSE,
          materials: [],
          results: [],
        },
      ),
    ).rejects.toThrow(DomainError);

    repo.order = buildOrder({ status: "issued" });
    await expect(
      correctCuttingFact(
        { cuttingOrders: repo, materialStock: stock },
        {
          companyId: "company-1",
          cuttingOrderId: "order-1",
          warehouseId: WAREHOUSE,
          materials: [],
          results: [],
        },
      ),
    ).rejects.toThrow(DomainError);
  });

  it("завершённое задание не отменяется — ошибку исправляют корректировкой", async () => {
    repo.order = buildOrder({ status: "completed" });
    await expect(
      cancelCuttingOrder({ cuttingOrders: repo }, { companyId: "company-1", cuttingOrderId: "order-1" }),
    ).rejects.toThrow(DomainError);
  });
});
