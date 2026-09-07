import { Inject, Injectable } from "@nestjs/common";
import { documents, productionOrders, type Database } from "@garmentos/db-schema";
import type { PilotDashboardResponseDto, ProductionOrderCostSnapshot } from "@garmentos/shared-types";
import { and, desc, eq, gte, inArray, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { DATABASE_CONNECTION } from "../database/database.module";

const IN_PROGRESS_STATUSES = ["placed", "in_progress", "ready_for_pickup"] as const;
const CLOSED_STATUSES = ["received", "cancelled"] as const;

// Pilot Dashboard (владелец проекта, 2026-08-04): "Именно этот экран
// позволит быстро понять, что система вообще работает штатно" — отдельная
// страница, не раздел «Внимание сегодня» (attention.service.ts — про то, что
// требует действия; этот экран — про то, что вся цепочка Pilot v1 в принципе
// функционирует). Тот же принцип, что и остальной Reporting/BI: только
// чтение, читает несколько модулей напрямую из БД.
@Injectable()
export class PilotDashboardService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getDashboard(companyId: string): Promise<PilotDashboardResponseDto> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayIso = now.toISOString().slice(0, 10);

    const [productionOrdersToday, inProgressCount, overdueCount, lastSpecification, lastSnapshotAt] =
      await Promise.all([
        this.countProductionOrders(companyId, gte(productionOrders.createdAt, startOfToday)),
        this.countProductionOrders(companyId, inArray(productionOrders.status, [...IN_PROGRESS_STATUSES])),
        this.countProductionOrders(
          companyId,
          and(
            notInArray(productionOrders.status, [...CLOSED_STATUSES]),
            lt(productionOrders.dueDate, todayIso),
          ) as SQL,
        ),
        this.findLastSpecification(companyId),
        this.findLastSnapshotAt(companyId),
      ]);

    return {
      productionOrdersToday,
      inProgressCount,
      overdueCount,
      // Мониторинг ошибок (Sentry/аналог) сознательно не подключён на пилоте
      // (infra/PRODUCTION_CHECKLIST.md, п.5) — честное "нет данных", а не
      // выдуманный 0. Пересмотреть при появлении внешних пользователей.
      errorsToday: null,
      lastSpecificationNumber: lastSpecification?.number ?? null,
      lastSpecificationAt: lastSpecification?.createdAt ?? null,
      lastSnapshotAt,
      // Нет в приложении источника данных о последнем бэкапе — backup.sh
      // работает вне API, пишет дампы на диск/Volume, не в БД
      // (infra/backup/README.md). Честное "нет данных" вместо выдумки.
      lastBackupAt: null,
      // Railway автоматически прокидывает SHA текущего деплоя в переменную
      // окружения сервиса — бесплатно, без дополнительной настройки.
      lastDeployCommit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    };
  }

  private async countProductionOrders(companyId: string, extra: SQL): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(productionOrders)
      .where(and(eq(productionOrders.companyId, companyId), extra));
    return Number(row?.count ?? 0);
  }

  // Номер спецификации хранится только в заголовке документа ("Спецификация
  // №25") — нумерация атомарно ведётся per-цех (workshops.nextSpecificationNumber),
  // общего сквозного счётчика по компании нет, поэтому дашборд показывает
  // номер последней ПО ВРЕМЕНИ созданной спецификации, не "самый большой".
  private async findLastSpecification(companyId: string): Promise<{ number: number | null; createdAt: Date } | null> {
    const [row] = await this.db
      .select({ title: documents.title, createdAt: documents.createdAt })
      .from(documents)
      .where(
        and(
          eq(documents.companyId, companyId),
          eq(documents.docType, "specification"),
          eq(documents.isCurrentVersion, true),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(1);
    if (!row) return null;
    const match = row.title?.match(/№\s*(\d+)/);
    return { number: match ? Number(match[1]) : null, createdAt: row.createdAt };
  }

  private async findLastSnapshotAt(companyId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ costSnapshot: productionOrders.costSnapshot, updatedAt: productionOrders.updatedAt })
      .from(productionOrders)
      .where(and(eq(productionOrders.companyId, companyId), sql`${productionOrders.costSnapshot} is not null`))
      .orderBy(desc(productionOrders.updatedAt))
      .limit(1);
    if (!row) return null;
    const snapshot = row.costSnapshot as ProductionOrderCostSnapshot | null;
    return snapshot?.capturedAt ? new Date(snapshot.capturedAt) : row.updatedAt;
  }
}
