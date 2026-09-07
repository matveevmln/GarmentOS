import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@garmentos/db-schema";
import { DATABASE_CONNECTION } from "../database/database.module";
import { Public } from "../auth/public.decorator";

interface HealthStatus {
  status: "ok";
  timestamp: string;
}

// Публичный — балансировщик/оркестратор не аутентифицируется (Итерация 5,
// JwtAuthGuard теперь глобальный). Проверяет не только liveness процесса, но
// и доступность Postgres (production hardening перед Railway) — переиспользует
// единственное подключение из DatabaseModule (DATABASE_CONNECTION), новое не
// создаётся. При недоступной БД отвечает 503, не раскрывая текст ошибки
// драйвера/connection string клиенту (DomainExceptionFilter в любом случае не
// пропускает внутренние детали дальше, но здесь это дополнительно явно).
@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthStatus> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: "error", timestamp: new Date().toISOString() });
    }
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
