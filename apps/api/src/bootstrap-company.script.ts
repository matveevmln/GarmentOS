import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });

import "reflect-metadata";
import { parseArgs } from "node:util";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { IdentityService } from "./identity/identity.service";

// CLI-бутстрап новой компании (docs/AUTH_ARCHITECTURE.md, раздел 9) — решение
// владельца проекта: self-service регистрации в MVP нет (PROJECT_VISION.md,
// раздел 6), поэтому создание компании и её первого пользователя выведено из
// публичного HTTP API целиком. Скрипт переиспользует ту же DI-проводку, что
// и apps/api (NestFactory.createApplicationContext — без поднятия HTTP-сервера),
// поэтому использует ровно тот же IdentityService/доменные use case, что и
// контроллеры — не отдельный, параллельный путь создания данных.
//
// Запуск (после pnpm build, скрипт компилируется вместе с main.ts):
//   pnpm --filter @garmentos/api bootstrap-company \
//     --name "ООО Пример" --owner-email owner@example.com \
//     --owner-full-name "Имя Фамилия" --owner-password "секрет12345" \
//     [--inn 1234567890] [--signer-name "Иванов И.И."]
async function run(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      inn: { type: "string" },
      "signer-name": { type: "string" },
      "owner-email": { type: "string" },
      "owner-full-name": { type: "string" },
      "owner-password": { type: "string" },
    },
  });

  const {
    name,
    inn,
    "signer-name": signerName,
    "owner-email": ownerEmail,
    "owner-full-name": ownerFullName,
    "owner-password": ownerPassword,
  } = values;

  if (!name || !ownerEmail || !ownerFullName || !ownerPassword) {
    console.error(
      "Использование: bootstrap-company --name <название> --owner-email <email> " +
        "--owner-full-name <имя> --owner-password <пароль> [--inn <инн>] [--signer-name <ФИО>]",
    );
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const identityService = app.get(IdentityService);

    const company = await identityService.createCompany({ name, inn, signerName });
    const owner = await identityService.createUser(
      company.id,
      { email: ownerEmail, fullName: ownerFullName, password: ownerPassword },
      { userId: null, source: "cli" },
    );
    await identityService.assignRole(company.id, owner.id, "owner", { userId: null, source: "cli" });

    console.log(`Компания создана: ${company.name} (${company.id})`);
    console.log(`Владелец создан: ${owner.email} (${owner.id}), роль "owner" назначена`);
  } finally {
    await app.close();
  }
}

run()
  .catch((error: unknown) => {
    console.error("Ошибка бутстрапа компании:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    // DATABASE_CONNECTION (postgres.js) не закрывается автоматически по
    // app.close() — у него нет onModuleDestroy-хука (единственный процесс,
    // которому это нужно: HTTP-сервер в main.ts рассчитанно работает вечно).
    // Явный exit — стандартная практика для одноразовых Nest-скриптов.
    process.exit(process.exitCode ?? 0);
  });
