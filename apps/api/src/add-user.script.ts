import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });

import "reflect-metadata";
import { parseArgs } from "node:util";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { IdentityService } from "./identity/identity.service";

// CLI-добавление ещё одного пользователя в УЖЕ существующую компанию
// (docs/AUTH_ARCHITECTURE.md, раздел 9 — та же логика, что и
// bootstrap-company.script.ts: без self-service, только CLI). Отдельный
// скрипт, а не расширение bootstrap-company: тот создаёт новую компанию,
// этот — второго/третьего пользователя в компании, которая уже есть
// (пример из практики — Owner Богдан + Co-owner Артём в одной компании).
//
// POST /users (UsersController) создаёт пользователя, но не назначает роль
// (нет своего HTTP-эндпоинта для назначения роли) — без роли у нового
// пользователя нет ни одного permission, он не сможет ничего сделать после
// входа. Этот скрипт делает оба шага одним вызовом, как и bootstrap-company.
//
// Запуск (после pnpm build):
//   node dist/add-user.script.js --company-id <uuid> --email owner2@example.com \
//     --full-name "Имя Фамилия" --password "секрет12345" --role owner
async function run(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "company-id": { type: "string" },
      email: { type: "string" },
      "full-name": { type: "string" },
      password: { type: "string" },
      role: { type: "string" },
    },
  });

  const { "company-id": companyId, email, "full-name": fullName, password, role } = values;

  if (!companyId || !email || !fullName || !password || !role) {
    console.error(
      "Использование: add-user --company-id <uuid> --email <email> " +
        "--full-name <имя> --password <пароль> --role <owner|director|accountant|procurement_manager|marketplace_manager|warehouse_keeper|viewer>",
    );
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const identityService = app.get(IdentityService);

    const user = await identityService.createUser(
      companyId,
      { email, fullName, password },
      { userId: null, source: "cli" },
    );
    await identityService.assignRole(companyId, user.id, role, { userId: null, source: "cli" });

    console.log(`Пользователь создан: ${user.email} (${user.id}), роль "${role}" назначена`);
  } finally {
    await app.close();
  }
}

run()
  .catch((error: unknown) => {
    console.error("Ошибка добавления пользователя:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
