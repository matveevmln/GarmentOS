import { useEffect, useState } from "react";
import type { PilotDashboardResponseDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { KpiCard } from "../design-system/Card/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { Icon } from "../design-system/Icons/Icon";

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
    <section className="flex flex-col gap-5">
      <div>
        <h1>Pilot v1</h1>
        <p className="text-[0.85rem] text-muted-foreground">Сегодня</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Партий сегодня" value={data.productionOrdersToday} icon={<Icon name="scissors" />} />
        <KpiCard label="В работе" value={data.inProgressCount} icon={<Icon name="factory" />} />
        <KpiCard
          label="Просрочено"
          value={data.overdueCount}
          icon={<Icon name="tag" />}
          className={data.overdueCount > 0 ? "border-destructive/40" : undefined}
        />
        <KpiCard
          label="Ошибок"
          value={data.errorsToday ?? "—"}
          hint={data.errorsToday === null ? "мониторинг не подключён, см. логи Railway" : undefined}
          icon={<Icon name="check" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Состояние системы</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последняя спецификация</span>
            <span className="text-[0.85rem] text-muted-foreground">
              {data.lastSpecificationNumber !== null ? `№${data.lastSpecificationNumber}` : "ещё не создана"}
              {data.lastSpecificationAt && ` · ${formatDateTime(data.lastSpecificationAt)}`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последний Snapshot партии</span>
            <span className="text-[0.85rem] text-muted-foreground">{formatDateTime(data.lastSnapshotAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последний бэкап</span>
            <span className="text-[0.85rem] text-muted-foreground">
              {data.lastBackupAt ? formatDateTime(data.lastBackupAt) : "не отслеживается автоматически — проверить вручную (infra/backup/)"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
            <span className="font-semibold text-foreground">Последний деплой</span>
            <span className="text-[0.85rem] text-muted-foreground">
              {data.lastDeployCommit ? `commit ${data.lastDeployCommit}` : "неизвестно (не Railway)"}
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
