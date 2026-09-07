import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import type { Database } from "@garmentos/db-schema";

// db.execute — единственный метод, который здесь нужен от Database; полный
// драйвер не поднимаем (модульный тест, не e2e — реальный Postgres уже
// проверяется в apps/api/src/**/*.e2e.spec.ts на других контроллерах).
function fakeDb(execute: () => Promise<unknown>): Database {
  return { execute } as unknown as Database;
}

describe("HealthController", () => {
  it("возвращает ok, когда БД отвечает", async () => {
    const controller = new HealthController(fakeDb(() => Promise.resolve()));
    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it("бросает 503 (без деталей ошибки БД), когда БД недоступна", async () => {
    const controller = new HealthController(
      fakeDb(() => Promise.reject(new Error("connection refused: postgres://user:secret@host/db"))),
    );

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await controller.check();
    } catch (error) {
      const response = (error as ServiceUnavailableException).getResponse() as Record<string, unknown>;
      expect(response.status).toBe("error");
      // Текст исходной ошибки (адрес БД, credentials) не должен просочиться
      // наружу — тело ответа не содержит ничего, кроме status/timestamp.
      expect(JSON.stringify(response)).not.toContain("secret");
      expect(JSON.stringify(response)).not.toContain("postgres://");
    }
  });
});
