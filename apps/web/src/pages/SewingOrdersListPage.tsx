import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SewingOrderResponseDto, WorkshopResponseDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardContent } from "../design-system/Card/Card";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Button } from "../design-system/Button/Button";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { IconBatch } from "../design-system/Icons/icons";
import { formatDate } from "../lib/format";

// Список заказов на пошив (ADR 0002) — новая шапка над `production_orders`.
// Существующий /production-orders (партии одной модели) не заменён и
// остаётся доступен по прямой ссылке (docs/GOS-PARTY-V1-EXECUTION.md).
export function SewingOrdersListPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SewingOrderResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiRequest<SewingOrderResponseDto[]>("/sewing-orders"),
      apiRequest<WorkshopResponseDto[]>("/workshops"),
    ])
      .then(([orderRows, workshopRows]) => {
        setOrders(orderRows);
        setWorkshops(workshopRows);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить заказы"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const workshopName = (id: string | null) => workshops.find((w) => w.id === id)?.name ?? "—";

  if (loading) return <SkeletonList />;
  if (error) return <ErrorState title="Не удалось загрузить заказы" description={error} onRetry={load} />;

  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader
        title="Заказы на пошив"
        subtitle="Один заказ — один цех, одна или несколько моделей"
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Заказы на пошив" }]} />}
        actions={
          <Button onClick={() => void navigate("/sewing-orders/new")} data-testid="new-sewing-order">
            + Заказ на пошив
          </Button>
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={<IconBatch size={28} />}
          title="Заказов пока нет"
          description="Создайте первый заказ на пошив — выберите цех и одну или несколько моделей."
          action={<Button onClick={() => void navigate("/sewing-orders/new")}>+ Заказ на пошив</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Card
              key={order.id}
              interactive
              className="cursor-pointer"
              onClick={() => void navigate(order.status === "draft" ? `/sewing-orders/${order.id}/edit` : `/sewing-orders/${order.id}`)}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="t-body font-medium">
                    {order.number ? `Заказ №${order.number}` : "Черновик заказа"} — {workshopName(order.workshopId)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">Обновлён {formatDate(order.updatedAt)}</p>
                </div>
                <StatusBadge status={order.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
