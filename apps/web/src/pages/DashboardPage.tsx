import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AttentionResponseDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { KpiCard } from "../design-system/Card/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyIllustration } from "../design-system/Feedback/EmptyIllustration";
import { Icon } from "../design-system/Icons/Icon";

// Главная страница (docs/PRINCIPLES.md, принцип 22: «Главная → Что
// происходит сейчас?», принцип 23: сценарий пользователя, не схема данных).
// Владелец бренда открывает GarmentOS утром и должен сразу увидеть, что
// требует внимания сегодня, не заходя по очереди в Закупки/Заказы пошива/
// Материалы/Финансы (apps/api/src/reporting/attention.service.ts).
function formatMoney(amount: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(amount);
}

const UNIT_LABEL: Record<string, string> = { m: "м", kg: "кг", pcs: "шт" };

export function DashboardPage() {
  const [data, setData] = useState<AttentionResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiRequest<AttentionResponseDto>("/attention")
      .then((response) => setData(response))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить сводку"))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  if (isLoading) return <SkeletonList />;
  if (error || !data) {
    return <ErrorState title="Не удалось загрузить сводку" description={error ?? undefined} onRetry={load} />;
  }

  const totalAttentionItems =
    data.overdueProductionOrders.length +
    data.overduePurchaseOrders.length +
    data.lowStockMaterials.length +
    data.overdueInvoices.length;

  return (
    <section className="flex flex-col gap-5">
      <h1>Внимание сегодня</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Просрочено пошива" value={data.overdueProductionOrders.length} icon={<Icon name="scissors" />} />
        <KpiCard label="Просрочено закупок" value={data.overduePurchaseOrders.length} icon={<Icon name="cash" />} />
        <KpiCard label="Материалы заканчиваются" value={data.lowStockMaterials.length} icon={<Icon name="layers" />} />
        <KpiCard label="Просроченные счета" value={data.overdueInvoices.length} icon={<Icon name="tag" />} />
      </div>

      {totalAttentionItems === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <EmptyIllustration className="h-16 w-20" />
            <p className="font-semibold">Сегодня всё под контролем</p>
            <p className="text-sm text-muted-foreground">Просроченных партий, закупок и счетов нет.</p>
          </CardContent>
        </Card>
      )}

      {data.overdueProductionOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Заказы пошива с просроченным сроком сдачи</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.overdueProductionOrders.map((row) => (
              <Link
                key={row.id}
                to="/production-orders"
                className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5 no-underline transition-colors hover:bg-secondary"
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-foreground">{row.productName}</span>
                  <span className="text-[0.82rem] text-muted-foreground">{row.workshopName} · срок был {row.dueDate}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[0.82rem] font-bold text-destructive">на {row.daysOverdue} дн.</span>
                  <StatusBadge status={row.status} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {data.overduePurchaseOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Закупки с просроченной датой поставки</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.overduePurchaseOrders.map((row) => (
              <Link
                key={row.id}
                to="/purchase-orders"
                className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5 no-underline transition-colors hover:bg-secondary"
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-foreground">{row.supplierName}</span>
                  <span className="text-[0.82rem] text-muted-foreground">ожидалась {row.expectedDate}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[0.82rem] font-bold text-destructive">на {row.daysOverdue} дн.</span>
                  <StatusBadge status={row.status} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {data.lowStockMaterials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Материалы ниже точки перезаказа</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.lowStockMaterials.slice(0, 20).map((row) => (
              <div key={row.materialId} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
                <span className="font-semibold text-foreground">{row.materialName}</span>
                <span className="text-[0.82rem] text-muted-foreground">
                  {row.quantityOnHand} из {row.reorderPoint} {UNIT_LABEL[row.unit] ?? row.unit}
                </span>
              </div>
            ))}
            {data.lowStockMaterials.length > 20 && (
              <Link to="/materials" className="text-[0.82rem] font-semibold text-primary no-underline">
                Ещё {data.lowStockMaterials.length - 20} — открыть материалы
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {data.overdueInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Просроченные счета</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.overdueInvoices.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
                <span className="font-semibold text-foreground">{row.referenceLabel}</span>
                <span className="text-[0.82rem] font-bold text-destructive">{formatMoney(row.amount)} сом</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
