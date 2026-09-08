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
//     --bootstrap-key garmentos-pilot-v1-initial-company \
//     --name "ООО Пример" --owner-email owner@example.com \
//     --owner-full-name "Имя Фамилия" --owner-password "секрет12345" \
//     [--inn 1234567890] [--signer-name "Иванов И.И."]
//
// Идентичность bootstrap (аудит идемпотентности перед первой реальной
// production-компанией) — --bootstrap-key ОБЯЗАТЕЛЕН и вводится оператором
// явно на каждом запуске (не имеет скрытого значения по умолчанию, чтобы не
// маскировать, какой именно ключ используется). DB-level защита
// (companies_bootstrap_key_idx, partial unique index) гарантирует, что ПОВТОР
// с ТЕМ ЖЕ значением ключа никогда не создаст вторую компанию — см. resume-
// логику в IdentityService.bootstrapCompany(). Ответственность за то, чтобы
// значение ключа между запусками совпадало буква-в-букву (не отличалось
// опечаткой), лежит на операторе — см. риск в отчёте о реализации.
async function run(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "bootstrap-key": { type: "string" },
      name: { type: "string" },
      inn: { type: "string" },
      "signer-name": { type: "string" },
      "owner-email": { type: "string" },
      "owner-full-name": { type: "string" },
      "owner-password": { type: "string" },
    },
  });

  const {
    "bootstrap-key": bootstrapKey,
    name,
    inn,
    "signer-name": signerName,
    "owner-email": ownerEmail,
    "owner-full-name": ownerFullName,
    "owner-password": ownerPassword,
  } = values;

  if (!bootstrapKey || !name || !ownerEmail || !ownerFullName || !ownerPassword) {
    console.error(
      "Использование: bootstrap-company --bootstrap-key <стабильный-идентификатор> --name <название> " +
        "--owner-email <email> --owner-full-name <имя> --owner-password <пароль> " +
        "[--inn <инн>] [--signer-name <ФИО>]",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Bootstrap key: "${bootstrapKey}" — сверьте с ключом предыдущего запуска перед продолжением.`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const identityService = app.get(IdentityService);

    const result = await identityService.bootstrapCompany({
      bootstrapKey,
      company: { name, inn, signerName },
      ownerEmail,
      ownerFullName,
      ownerPassword,
      ownerRoleCode: "owner",
    });

    // Пароль нигде ниже не выводится и не логируется — только email/id.
    switch (result.outcome) {
      case "created":
        console.log(`Компания создана: ${result.company.name} (${result.company.id})`);
        console.log(`Владелец создан: ${result.owner.email} (${result.owner.id}), роль "owner" назначена`);
        return;

      case "resumed":
        console.log(`Компания уже существовала (bootstrap продолжен): ${result.company.name} (${result.company.id})`);
        console.log(`Владелец дозаполнен: ${result.owner.email} (${result.owner.id}), роль "owner" назначена`);
        return;

      case "already_initialized":
        console.log(
          `Bootstrap для этого ключа уже завершён ранее — повторных изменений не потребовалось. ` +
            `Компания: ${result.company.name} (${result.company.id}), владелец: ${result.owner.email} (${result.owner.id}).`,
        );
        return;

      case "owner_mismatch":
        console.error(
          "Bootstrap company already exists with a different owner. Manual verification required. " +
            `company.id=${result.company.id}, existing owner email=${result.existingOwnerEmail}`,
        );
        process.exitCode = 1;
        return;
    }
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
