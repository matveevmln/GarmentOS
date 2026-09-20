import { config } from "dotenv";

config({ path: "../../../.env" });

import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { describe, expect, it } from "vitest";
import { addPreset } from "./application/add-preset";
import { listPresets } from "./application/list-presets";
import { DrizzlePresetRepository } from "./infrastructure/drizzle-preset-repository";
import { DomainError } from "./domain/errors";

class RollbackTestTransaction extends Error {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

async function runInRolledBackTransaction(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new RollbackTestTransaction();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollbackTestTransaction)) throw error;
    });
}

describe("domain/preset (ПРОМПТ №3, раздел 5)", () => {
  it("добавляет новое значение и делает его доступным для выбора", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд пресетов" });
      const presets = new DrizzlePresetRepository(tx);

      // Сначала обращение к списку — досеивает дефолты (350/380/450) для
      // новой компании; затем добавляем 420 отдельным явным действием.
      await listPresets({ presets }, { companyId: company.id, kind: "sewing_cost" });
      await addPreset({ presets }, { companyId: company.id, kind: "sewing_cost", value: 420, currency: "KGS", createdBy: null });
      const list = await listPresets({ presets }, { companyId: company.id, kind: "sewing_cost" });

      const values = list.map((p) => Number(p.value));
      expect(values.sort((a, b) => a - b)).toEqual([350, 380, 420, 450]);
    });
  });

  it("повторное добавление того же значения не создаёт дубликат", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд пресетов 2" });
      const presets = new DrizzlePresetRepository(tx);

      const first = await addPreset({ presets }, { companyId: company.id, kind: "sewing_cost", value: 420, currency: "KGS", createdBy: null });
      const second = await addPreset({ presets }, { companyId: company.id, kind: "sewing_cost", value: 420, currency: "KGS", createdBy: null });
      expect(first.id).toBe(second.id);

      const list = await listPresets({ presets }, { companyId: company.id, kind: "sewing_cost" });
      expect(list.filter((p) => Number(p.value) === 420)).toHaveLength(1);
    });
  });

  it("не смешивает sewing_cost и specification_price", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд пресетов 3" });
      const presets = new DrizzlePresetRepository(tx);

      await addPreset({ presets }, { companyId: company.id, kind: "sewing_cost", value: 420, currency: "KGS", createdBy: null });
      const specPriceList = await listPresets({ presets }, { companyId: company.id, kind: "specification_price" });

      expect(specPriceList.map((p) => Number(p.value))).toEqual([700]);
      expect(specPriceList.every((p) => p.kind === "specification_price")).toBe(true);
    });
  });

  it("отклоняет неположительное значение", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд пресетов 4" });
      const presets = new DrizzlePresetRepository(tx);

      await expect(
        addPreset({ presets }, { companyId: company.id, kind: "sewing_cost", value: 0, currency: "KGS", createdBy: null }),
      ).rejects.toBeInstanceOf(DomainError);
      await expect(
        addPreset({ presets }, { companyId: company.id, kind: "sewing_cost", value: -10, currency: "KGS", createdBy: null }),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  it("новая компания без ранее заведённых пресетов сразу видит стартовые значения", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Совсем новый бренд" });
      const presets = new DrizzlePresetRepository(tx);

      const sewingCost = await listPresets({ presets }, { companyId: company.id, kind: "sewing_cost" });
      expect(sewingCost.map((p) => Number(p.value)).sort((a, b) => a - b)).toEqual([350, 380, 450]);
      expect(sewingCost.every((p) => p.currency === "KGS")).toBe(true);

      const specPrice = await listPresets({ presets }, { companyId: company.id, kind: "specification_price" });
      expect(specPrice.map((p) => Number(p.value))).toEqual([700]);
      expect(specPrice[0]?.currency).toBe("RUB");
    });
  });
});
