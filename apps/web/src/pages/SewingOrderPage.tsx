import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ProductResponseDto, SewingOrderWithProductionOrdersResponseDto, WorkshopResponseDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardContent } from "../design-system/Card/Card";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Button } from "../design-system/Button/Button";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";

// Штаб заказа на пошив — B01 basic (ADR 0002, T01: «базовый B01»). Каждая
// модель заказа — своя партия (production_order), карточка ведёт в уже
// существующий Паспорт партии (BatchPassportPage, /production-orders/:id) —
// раскрой/пошив/приёмка/ОТК остаются там, эта страница их не дублирует.
export function SewingOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SewingOrderWithProductionOrdersResponseDto | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopResponseDto | null>(null);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiRequest<SewingOrderWithProductionOrdersResponseDto>(`/sewing-orders/${id}`)
      .then(async (order) => {
        setData(order);
        const [workshops, allProducts] = await Promise.all([
          apiRequest<WorkshopResponseDto[]>("/workshops"),
          apiRequest<ProductResponseDto[]>("/products"),
        ]);
        setWorkshop(workshops.find((w) => w.id === order.workshopId) ?? null);
        setProducts(allProducts);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить заказ"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const productName = (productId: string) => products.find((p) => p.id === productId)?.name ?? "Модель";

  if (loading) return <SkeletonList />;
  if (error || !data) return <ErrorState title="Не удалось открыть заказ" description={error ?? "Заказ не найден"} onRetry={load} />;

  if (data.status === "draft") {
    return (
      <div className="mx-auto max-w-[640px] py-16 text-center">
        <p className="t-body text-muted-foreground">Это черновик — заказ ещё не размещён.</p>
        <Button className="mt-4" onClick={() => void navigate(`/sewing-orders/${data.id}/edit`)}>
          Продолжить редактирование
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader
        title={`Заказ №${data.number ?? ""}`}
        subtitle={workshop ? `Цех: ${workshop.name}` : undefined}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Заказы на пошив", onClick: () => void navigate("/sewing-orders") },
              { label: `Заказ №${data.number ?? ""}` },
            ]}
          />
        }
        actions={<StatusBadge status={data.status} />}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {data.productionOrders.map((order) => (
          <Card
            key={order.id}
            interactive
            className="cursor-pointer"
            data-testid="production-order-card"
            onClick={() => void navigate(`/production-orders/${order.id}`)}
          >
            <CardContent className="flex flex-col gap-2 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="t-body font-medium">{productName(order.productId)}</p>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-[13px] text-muted-foreground">Плановое количество: {order.plannedQuantity}</p>
              <p className="text-[13px] text-muted-foreground">Вариантов SKU: {order.variants.length}</p>
              <Button variant="secondary" size="sm" className="mt-1 self-start">
                Открыть партию →
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
