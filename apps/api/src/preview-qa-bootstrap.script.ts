import { spawnSync } from "node:child_process";

// Временный QA-раннер (ПРОМПТ №14.6.3) — НЕ часть постоянной архитектуры,
// удаляется сразу после однократного использования для Preview. Причина
// существования: Railway preDeployCommand на Preview API выполняет только
// ОДНУ команду надёжно — цепочка "db:migrate && bootstrap-company" внутри
// одной строки preDeployCommand молча обрывалась после первой команды
// (подтверждено логами деплоя №14.6). Обходит это не изменением
// IdentityService/бизнес-логики, а простой оркестрацией двух уже
// существующих CLI-команд как отдельных процессов — ровно то же самое,
// что оператор ввёл бы вручную по очереди.
//
// Секретов не хардкодит: значения владельца тестовой компании берутся
// исключительно из уже установленных на Preview API переменных окружения
// (см. docs/AUTH_ARCHITECTURE.md, раздел 9 — bootstrap остаётся CLI-only,
// без публичного HTTP-эндпоинта). Если запустить это где угодно без этих
// переменных (в первую очередь — в Production, где их нет и не будет) —
// bootstrap-company сам откажет с понятным сообщением об использовании,
// не создав ничего по умолчанию.
const REQUIRED_ENV_VARS = [
  "PREVIEW_QA_BOOTSTRAP_KEY",
  "PREVIEW_QA_COMPANY_NAME",
  "PREVIEW_QA_OWNER_EMAIL",
  "PREVIEW_QA_OWNER_FULL_NAME",
  "PREVIEW_QA_OWNER_PASSWORD",
] as const;

function runOrExit(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`Не удалось запустить команду "${command}":`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Команда завершилась с ошибкой (код ${String(result.status)}): ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  for (const name of REQUIRED_ENV_VARS) {
    if (!process.env[name]) {
      console.error(`Отсутствует обязательная переменная окружения: ${name}`);
      process.exit(1);
    }
  }

  runOrExit("pnpm", ["--filter", "@garmentos/db-schema", "db:migrate"]);

  // Значения переменных передаются как есть в argv дочернего процесса —
  // ни один пароль/секрет этим скриптом никогда не логируется явно;
  // bootstrap-company.script.ts (см. его собственный код) тоже никогда
  // не печатает пароль, только email/id созданного владельца.
  runOrExit("pnpm", [
    "--filter",
    "@garmentos/api",
    "bootstrap-company",
    "--bootstrap-key",
    process.env.PREVIEW_QA_BOOTSTRAP_KEY!,
    "--name",
    process.env.PREVIEW_QA_COMPANY_NAME!,
    "--owner-email",
    process.env.PREVIEW_QA_OWNER_EMAIL!,
    "--owner-full-name",
    process.env.PREVIEW_QA_OWNER_FULL_NAME!,
    "--owner-password",
    process.env.PREVIEW_QA_OWNER_PASSWORD!,
  ]);

  console.log("Preview QA bootstrap runner: миграция и bootstrap-company выполнены успешно.");
  process.exit(0);
}

main();
