import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DomainError } from "./domain/errors";
import { computePrepaymentAmount, computeSpecificationTotals, type Specification, type SpecificationSnapshot } from "./domain/specification";
import type {
  NewSpecificationInput,
  ProductLookupPort,
  ProductVariantLookupPort,
  SpecificationRepository,
  WorkshopLookupPort,
} from "./application/ports";
import { createSpecificationDraft, type CreateSpecificationDraftDeps, type CreateSpecificationDraftInput } from "./application/create-specification-draft";
import { createSpecificationFromExisting } from "./application/create-specification-from-existing";
import { approveSpecification, type ApproveSpecificationInput } from "./application/approve-specification";

const COMPANY = "company-1";
const WORKSHOP = "workshop-1";
const PRODUCT = "product-1";
const VARIANT_A = "variant-a";
const VARIANT_B = "variant-b";

class FakeSpecifications implements SpecificationRepository {
  public rows: Specification[] = [];

  create(input: NewSpecificationInput): Promise<Specification> {
    const now = new Date();
    const spec: Specification = {
      id: randomUUID(),
      companyId: input.companyId,
      workshopId: input.workshopId,
      productId: input.productId,
      specNumber: null,
      status: input.status,
      version: input.version,
      basedOnSpecificationId: input.basedOnSpecificationId,
      deliveryDeadline: input.deliveryDeadline,
      totalQuantity: String(input.totalQuantity),
      totalSum: String(input.totalSum),
      totalSumCurrency: "RUB",
      prepaymentAmount: null,
      snapshotJson: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      items: input.items.map((item, index) => ({
        id: randomUUID(),
        specificationId: "",
        productVariantId: item.productVariantId,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        sum: String(item.sum),
        sortOrder: index,
      })),
    };
    spec.items = spec.items.map((item) => ({ ...item, specificationId: spec.id }));
    this.rows.push(spec);
    return Promise.resolve(spec);
  }

  findById(companyId: string, id: string): Promise<Specification | null> {
    return Promise.resolve(this.rows.find((row) => row.companyId === companyId && row.id === id) ?? null);
  }

  listByCompany(companyId: string): Promise<Specification[]> {
    return Promise.resolve(this.rows.filter((row) => row.companyId === companyId));
  }

  approve(companyId: string, id: string, input: { specNumber: number; prepaymentAmount: number; snapshotJson: SpecificationSnapshot }): Promise<Specification> {
    const row = this.rows.find((r) => r.id === id && r.companyId === companyId);
    if (!row || row.status !== "draft") {
      return Promise.reject(new DomainError("уже не черновик", "SPECIFICATION_NOT_DRAFT"));
    }
    row.status = "approved";
    row.specNumber = input.specNumber;
    row.prepaymentAmount = String(input.prepaymentAmount);
    row.snapshotJson = input.snapshotJson as unknown as Record<string, unknown>;
    return Promise.resolve(row);
  }
}

function fakeWorkshops(existingIds: string[] = [WORKSHOP]): WorkshopLookupPort & { reserved: number[] } {
  let counter = 0;
  const reserved: number[] = [];
  return {
    reserved,
    findById(_companyId: string, workshopId: string) {
      return Promise.resolve(existingIds.includes(workshopId) ? { id: workshopId } : null);
    },
    reserveNextSpecificationNumber() {
      counter += 1;
      reserved.push(counter);
      return Promise.resolve(counter);
    },
  };
}

function fakeProducts(existingIds: string[] = [PRODUCT]): ProductLookupPort {
  return {
    findById(_companyId: string, productId: string) {
      return Promise.resolve(existingIds.includes(productId) ? { id: productId } : null);
    },
  };
}

function fakeVariants(variantToProduct: Record<string, string> = { [VARIANT_A]: PRODUCT, [VARIANT_B]: PRODUCT }): ProductVariantLookupPort {
  return {
    findById(_companyId: string, variantId: string) {
      const productId = variantToProduct[variantId];
      return Promise.resolve(productId ? { id: variantId, productId } : null);
    },
  };
}

function depsFor(overrides: Partial<CreateSpecificationDraftDeps> = {}): CreateSpecificationDraftDeps {
  return {
    specifications: new FakeSpecifications(),
    workshops: fakeWorkshops(),
    products: fakeProducts(),
    productVariants: fakeVariants(),
    ...overrides,
  };
}

function draftInput(overrides: Partial<CreateSpecificationDraftInput> = {}): CreateSpecificationDraftInput {
  return {
    companyId: COMPANY,
    workshopId: WORKSHOP,
    productId: PRODUCT,
    items: [{ productVariantId: VARIANT_A, quantity: 100, unitPrice: 700 }],
    createdBy: "user-1",
    ...overrides,
  };
}

describe("domain/specification — расчёты (backend-only)", () => {
  it("считает сумму строки и итоги по нескольким строкам", () => {
    const result = computeSpecificationTotals([
      { productVariantId: VARIANT_A, quantity: 163, unitPrice: 700 },
      { productVariantId: VARIANT_B, quantity: 336, unitPrice: 700 },
    ]);
    expect(result.items[0]?.sum).toBe(114100);
    expect(result.items[1]?.sum).toBe(235200);
    expect(result.totalQuantity).toBe(499);
    expect(result.totalSum).toBe(349300);
  });

  it("предоплата 70% — эталонный пример (2 800 000 → 1 960 000)", () => {
    expect(computePrepaymentAmount(2_800_000)).toBe(1_960_000);
  });

  it("округляет предоплату до копеек", () => {
    expect(computePrepaymentAmount(100)).toBe(70);
    expect(computePrepaymentAmount(10.01)).toBe(7.01);
  });
});

describe("domain/specification — createSpecificationDraft", () => {
  it("создаёт черновик без номера, со статусом draft и рассчитанными итогами", async () => {
    const deps = depsFor();
    const spec = await createSpecificationDraft(
      deps,
      draftInput({ items: [{ productVariantId: VARIANT_A, quantity: 163, unitPrice: 700 }] }),
    );
    expect(spec.status).toBe("draft");
    expect(spec.specNumber).toBeNull();
    expect(spec.version).toBe(1);
    expect(spec.basedOnSpecificationId).toBeNull();
    expect(spec.totalQuantity).toBe("163");
    expect(spec.totalSum).toBe("114100");
    expect(spec.items).toHaveLength(1);
  });

  it("отклоняет спецификацию без строк", async () => {
    await expect(createSpecificationDraft(depsFor(), draftInput({ items: [] }))).rejects.toMatchObject({
      code: "SPECIFICATION_EMPTY",
    });
  });

  it("отклоняет строку с нулевым/отрицательным количеством", async () => {
    await expect(
      createSpecificationDraft(depsFor(), draftInput({ items: [{ productVariantId: VARIANT_A, quantity: 0, unitPrice: 700 }] })),
    ).rejects.toMatchObject({ code: "SPECIFICATION_ITEM_QUANTITY_INVALID" });
  });

  it("отклоняет строку с отрицательной ценой", async () => {
    await expect(
      createSpecificationDraft(depsFor(), draftInput({ items: [{ productVariantId: VARIANT_A, quantity: 10, unitPrice: -1 }] })),
    ).rejects.toMatchObject({ code: "SPECIFICATION_ITEM_PRICE_INVALID" });
  });

  it("отклоняет неизвестный цех", async () => {
    await expect(createSpecificationDraft(depsFor(), draftInput({ workshopId: "no-such-workshop" }))).rejects.toMatchObject({
      code: "SPECIFICATION_WORKSHOP_NOT_FOUND",
    });
  });

  it("отклоняет неизвестную модель", async () => {
    await expect(createSpecificationDraft(depsFor(), draftInput({ productId: "no-such-product" }))).rejects.toMatchObject({
      code: "SPECIFICATION_PRODUCT_NOT_FOUND",
    });
  });

  it("отклоняет неизвестный вариант", async () => {
    await expect(
      createSpecificationDraft(depsFor(), draftInput({ items: [{ productVariantId: "no-such-variant", quantity: 1, unitPrice: 1 }] })),
    ).rejects.toMatchObject({ code: "SPECIFICATION_VARIANT_NOT_FOUND" });
  });

  it("отклоняет вариант, принадлежащий другой модели", async () => {
    const deps = depsFor({
      products: fakeProducts([PRODUCT, "other-product"]),
      productVariants: fakeVariants({ [VARIANT_A]: "other-product" }),
    });
    await expect(createSpecificationDraft(deps, draftInput())).rejects.toMatchObject({
      code: "SPECIFICATION_VARIANT_PRODUCT_MISMATCH",
    });
  });
});

describe("domain/specification — approveSpecification", () => {
  function approveInputFor(specificationId: string, overrides: Partial<ApproveSpecificationInput> = {}): ApproveSpecificationInput {
    return {
      companyId: COMPANY,
      specificationId,
      product: { name: "Худи Пилот", code: "HUD-01" },
      workshop: {
        name: "Цех №1",
        contractNumber: "П-22-04",
        contractDate: "2026-04-22",
        paymentTerms: null,
        deliveryMethod: null,
        legalAddress: null,
        signerRole: null,
        signerName: null,
      },
      company: { legalName: "ООО Пример", signerName: null },
      itemLines: [{ productVariantId: VARIANT_A, name: "Худи Пилот, Чёрный", unit: "шт", size: "48-50" }],
      ...overrides,
    };
  }

  it("утверждает черновик: резервирует номер, считает предоплату, замораживает snapshot", async () => {
    const specifications = new FakeSpecifications();
    const workshops = fakeWorkshops();
    const deps = { specifications, workshops };
    const draft = await createSpecificationDraft(
      { specifications, workshops, products: fakeProducts(), productVariants: fakeVariants() },
      draftInput({ items: [{ productVariantId: VARIANT_A, quantity: 100000 / 25, unitPrice: 700 }] }),
    );

    const approved = await approveSpecification(deps, approveInputFor(draft.id));

    expect(approved.status).toBe("approved");
    expect(approved.specNumber).toBe(1);
    expect(workshops.reserved).toEqual([1]);
    expect(approved.prepaymentAmount).toBe(String(computePrepaymentAmount(Number(approved.totalSum))));
    expect(approved.snapshotJson).toMatchObject({
      product: { name: "Худи Пилот", code: "HUD-01" },
      prepaymentPercent: 70,
    });
  });

  it("не даёт утвердить одну и ту же спецификацию дважды", async () => {
    const specifications = new FakeSpecifications();
    const workshops = fakeWorkshops();
    const deps = { specifications, workshops };
    const draft = await createSpecificationDraft(
      { specifications, workshops, products: fakeProducts(), productVariants: fakeVariants() },
      draftInput(),
    );
    await approveSpecification(deps, approveInputFor(draft.id));

    await expect(approveSpecification(deps, approveInputFor(draft.id))).rejects.toMatchObject({
      code: "SPECIFICATION_NOT_DRAFT",
    });
  });

  it("бросает ошибку на неизвестную спецификацию", async () => {
    const deps = { specifications: new FakeSpecifications(), workshops: fakeWorkshops() };
    await expect(approveSpecification(deps, approveInputFor("no-such-spec"))).rejects.toMatchObject({
      code: "SPECIFICATION_NOT_FOUND",
    });
  });

  it("требует данные (itemLines) для каждой строки спецификации", async () => {
    const specifications = new FakeSpecifications();
    const workshops = fakeWorkshops();
    const deps = { specifications, workshops };
    const draft = await createSpecificationDraft(
      { specifications, workshops, products: fakeProducts(), productVariants: fakeVariants() },
      draftInput(),
    );

    await expect(approveSpecification(deps, approveInputFor(draft.id, { itemLines: [] }))).rejects.toMatchObject({
      code: "SPECIFICATION_SNAPSHOT_LINE_MISSING",
    });
  });
});

describe("domain/specification — createSpecificationFromExisting", () => {
  it("копирует данные источника в новый независимый черновик, источник не трогает", async () => {
    const specifications = new FakeSpecifications();
    const workshops = fakeWorkshops();
    const shared = { specifications, workshops, products: fakeProducts(), productVariants: fakeVariants() };

    const source = await createSpecificationDraft(shared, draftInput());
    await approveSpecification(
      { specifications, workshops },
      {
        companyId: COMPANY,
        specificationId: source.id,
        product: { name: "Худи Пилот", code: "HUD-01" },
        workshop: {
          name: "Цех №1",
          contractNumber: null,
          contractDate: null,
          paymentTerms: null,
          deliveryMethod: null,
          legalAddress: null,
          signerRole: null,
          signerName: null,
        },
        company: { legalName: "ООО Пример", signerName: null },
        itemLines: [{ productVariantId: VARIANT_A, name: "Худи Пилот, Чёрный", unit: "шт", size: "48-50" }],
      },
    );
    const approvedSource = await specifications.findById(COMPANY, source.id);

    const copy = await createSpecificationFromExisting(shared, {
      companyId: COMPANY,
      sourceSpecificationId: source.id,
      createdBy: "user-2",
    });

    expect(copy.id).not.toBe(source.id);
    expect(copy.status).toBe("draft");
    expect(copy.specNumber).toBeNull();
    expect(copy.basedOnSpecificationId).toBe(source.id);
    expect(copy.workshopId).toBe(source.workshopId);
    expect(copy.productId).toBe(source.productId);
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]?.productVariantId).toBe(VARIANT_A);

    // Источник — approved и полностью неизменен после копирования.
    expect(approvedSource?.status).toBe("approved");
    expect(approvedSource?.specNumber).toBe(1);
  });

  it("позволяет переопределить строки при создании на основе (частичный перезапуск партии)", async () => {
    const specifications = new FakeSpecifications();
    const workshops = fakeWorkshops();
    const shared = { specifications, workshops, products: fakeProducts(), productVariants: fakeVariants() };
    const source = await createSpecificationDraft(
      shared,
      draftInput({ items: [{ productVariantId: VARIANT_A, quantity: 4000, unitPrice: 700 }] }),
    );

    const copy = await createSpecificationFromExisting(shared, {
      companyId: COMPANY,
      sourceSpecificationId: source.id,
      overrideItems: [{ productVariantId: VARIANT_A, quantity: 2000, unitPrice: 700 }],
    });

    expect(copy.totalQuantity).toBe("2000");
    expect(copy.totalSum).toBe("1400000");
  });

  it("бросает ошибку на неизвестный источник", async () => {
    const deps = depsFor();
    await expect(
      createSpecificationFromExisting(deps, { companyId: COMPANY, sourceSpecificationId: "no-such-spec" }),
    ).rejects.toMatchObject({ code: "SPECIFICATION_SOURCE_NOT_FOUND" });
  });
});

describe("DomainError", () => {
  it("несёт код ошибки", () => {
    const error = new DomainError("тест", "TEST_CODE");
    expect(error.code).toBe("TEST_CODE");
  });
});
