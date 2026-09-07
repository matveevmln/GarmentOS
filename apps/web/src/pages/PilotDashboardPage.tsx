import { useEffect, useState } from "react";
import type { PilotDashboardResponseDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { MetricStrip } from "../design-system/Blocks";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";

// Pilot Dashboard (владелец проекта, 2026-08-04): «Именно этот экран
// позволит быстро понять, что система вообще работает штатно» — отдельная
// страница, не раздел «Главной» (DashboardPage.tsx — что требует действия
// сегодня; здесь — сама система в целом, а не конкретные партии/закупки).
// Действует только на время Pilot v1 (docs/MASTER_BACKLOG.md, раздел 0.5).
function formatDateTime(value: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function PilotDashboardPage() {
  const [data, setData] = useState<PilotDashboardResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiRequest<PilotDashboardResponseDto>("/pilot-dashboard")
      .then((response) => setData(response))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить сводку"))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  if (isLoading) return <SkeletonList />;
  if (error || !data) {
    return <ErrorState title="Не удалось загрузить сводку" description={error ?? undefined} onRetry={load} />;
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Pilot v1"
        subtitle="Сегодня"
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Pilot v1" }]} />}
      />

      {/* Те же четыре показателя, что были в KpiCard, без изменений
          смысла. errorsToday приходит null, когда мониторинг сознательно
          не подключён на пилоте — CountUp показывает прочерк, а не 0
          (infra/PRODUCTION_CHECKLIST.md, п.5). */}
      <MetricStrip
        items={[
          { label: "Партий сегодня", value: data.productionOrdersToday },
          { label: "В работе", value: data.inProgressCount },
          {
            label: "Просрочено",
            value: data.overdueCount,
            ...(data.overdueCount > 0 ? { tone: "danger" as const } : {}),
          },
          { label: "Ошибок", value: data.errorsToday ?? Number.NaN },
        ]}
      />

      {data.errorsToday === null && (
        <p className="t-meta mt-2">Мониторинг ошибок не подключён — смотрите логи Railway.</p>
      )}

      <div className="mt-5 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Состояние системы</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последняя спецификация</span>
            <span className="text-[0.85rem] text-muted-foreground">
              {data.lastSpecificationNumber !== null ? `№${data.lastSpecificationNumber}` : "ещё не создана"}
              {data.lastSpecificationAt && ` · ${formatDateTime(data.lastSpecificationAt)}`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последняя зафиксированная партия</span>
            <span className="text-[0.85rem] text-muted-foreground">{formatDateTime(data.lastSnapshotAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последний бэкап</span>
            <span className="text-[0.85rem] text-muted-foreground">
              {data.lastBackupAt ? formatDateTime(data.lastBackupAt) : "не отслеживается автоматически — проверить вручную (infra/backup/)"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последний деплой</span>
            <span className="text-[0.85rem] text-muted-foreground">
              {data.lastDeployCommit ? `commit ${data.lastDeployCommit}` : "неизвестно (не Railway)"}
            </span>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
