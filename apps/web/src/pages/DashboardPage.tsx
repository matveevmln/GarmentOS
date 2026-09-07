import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AttentionResponseDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardTitle } from "../design-system/Card/Card";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { AttentionList, MetricStrip, MobileListItem, type AttentionItem } from "../design-system/Blocks";
import { formatDate, formatMoney, formatQuantity, unitLabel } from "../lib/format";

// Главная (docs/PRINCIPLES.md, принцип 22: «Главная → Что происходит
// сейчас?»). Владелец бренда открывает GarmentOS утром и должен сразу
// увидеть, что требует внимания сегодня.
//
// Композиция перенесена из GitHub-прототипа (HomeScreen) — единого
// источника визуальной истины (docs/UI_MIGRATION_PLAN.md §0, этап 6):
// шапка с хлебными крошками → MetricStrip → две колонки
// xl:[1.55fr_1fr], слева карточка с тёмной шапкой «Требует внимания» и
// таблица/мобильный список, справа две вторичные карточки.
//
// Данные — прежние, единственный запрос GET /attention. Ни одной новой
// метрики не заведено: в MetricStrip те же четыре числа, что были в
// KpiCard, а в списках — те же строки, что показывались и раньше.


export function DashboardPage() {
  const navigate = useNavigate();
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

  // Список «Требует внимания» — просроченные заказы пошива. Переход по
  // строке ведёт туда же, куда вела ссылка прежней вёрстки.
  const attentionItems: AttentionItem[] = data.overdueProductionOrders.map((row) => ({
    id: row.id,
    tone: "danger",
    title: row.productName,
    sub: `${row.workshopName} · срок был ${formatDate(row.dueDate)}`,
    meta: `на ${row.daysOverdue} дн.`,
  }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Главная"
        subtitle="Что требует внимания сегодня"
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Главная" }]} />}
      />

      <MetricStrip
        items={[
          { label: "Просрочено пошива", value: data.overdueProductionOrders.length, tone: "danger" },
          { label: "Просрочено закупок", value: data.overduePurchaseOrders.length, tone: "danger" },
          { label: "Материалы заканчиваются", value: data.lowStockMaterials.length, tone: "warning" },
          { label: "Просроченные счета", value: data.overdueInvoices.length, tone: "danger" },
        ]}
      />

      {totalAttentionItems === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Сегодня всё под контролем"
            description="Просроченных партий, закупок и счетов нет."
          />
        </div>
      ) : (
        <div className="stagger mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {data.overdueProductionOrders.length > 0 && (
              <Card className="elev-2 overflow-hidden">
                {/* Тёмная шапка карточки — из прототипа: единственный
                    акцентный блок на экране, чтобы взгляд шёл сюда первым. */}
                <div className="flex items-center justify-between gap-3 bg-sidebar bg-[radial-gradient(120%_180%_at_0%_0%,color-mix(in_oklab,var(--sidebar-primary)_26%,transparent)_0%,transparent_62%)] px-4 py-4 text-sidebar-foreground md:px-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="font-display text-[16px] font-semibold tracking-[-0.018em]">Требует внимания</h2>
                    <span className="t-meta text-sidebar-foreground/55">
                      {formatQuantity(data.overdueProductionOrders.length, "позиций")}
                    </span>
                  </div>
                </div>
                <div className="px-4 md:px-5">
                  <AttentionList items={attentionItems} onSelect={() => void navigate("/production-orders")} />
                </div>
              </Card>
            )}

            {data.overduePurchaseOrders.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
                  <CardTitle className="text-[16px]">Закупки с просроченной датой поставки</CardTitle>
                  <span className="t-meta shrink-0">{data.overduePurchaseOrders.length}</span>
                </div>

                {/* Таблица на планшете и десктопе */}
                <div className="mt-3 hidden md:block">
                  <table className="w-full table-fixed border-collapse text-[13px]">
                    <thead>
                      <tr className="border-t border-border text-left text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <th className="h-10 pl-4 pr-2 font-medium">Поставщик</th>
                        <th className="h-10 w-[104px] px-2 text-right font-medium">Ожидалась</th>
                        <th className="h-10 w-[96px] px-2 text-right font-medium">Просрочка</th>
                        {/* Статус прячется до lg: рядом с рельсом 260px на
                            768px под контент остаётся 444px, и четыре
                            фиксированные колонки съедали имя поставщика
                            целиком. Статус виден в мобильных карточках и
                            на широком экране. */}
                        <th className="hidden h-10 w-[150px] pl-2 pr-4 text-right font-medium lg:table-cell">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border border-t border-border">
                      {data.overduePurchaseOrders.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => void navigate("/purchase-orders")}
                          className="group cursor-pointer transition-colors duration-200 hover:bg-primary/[0.045]"
                        >
                          <td className="t-object h-[52px] truncate pl-4 pr-2 align-middle">{row.supplierName}</td>
                          <td className="t-value h-[52px] whitespace-nowrap px-2 text-right align-middle text-muted-foreground">
                            {formatDate(row.expectedDate)}
                          </td>
                          <td className="t-value h-[52px] whitespace-nowrap px-2 text-right align-middle text-danger">
                            на {row.daysOverdue} дн.
                          </td>
                          <td className="hidden h-[52px] py-0 pl-2 pr-4 text-right align-middle lg:table-cell">
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Карточки на мобильном — мобильная композиция прототипа,
                    а не сжатая таблица */}
                <div className="mt-3 space-y-2 px-4 pb-4 md:hidden">
                  {data.overduePurchaseOrders.map((row) => (
                    <MobileListItem key={row.id} onClick={() => void navigate("/purchase-orders")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium">{row.supplierName}</div>
                          <div className="mt-1 text-[12px] text-muted-foreground">
                            ожидалась {formatDate(row.expectedDate)}
                          </div>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="num mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[12px]">
                        <span className="text-muted-foreground">Просрочка</span>
                        <span className="text-danger">на {row.daysOverdue} дн.</span>
                      </div>
                    </MobileListItem>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Правая колонка прототипа — вторичные списки. У прототипа это
              «Последние документы» и «Последние события»; в apps/web таких
              источников нет (GET /documents отдаёт документы одной
              сущности, ленты событий наружу нет), поэтому в тех же слотах
              стоят реальные списки этого экрана. */}
          <div className="space-y-4">
            {data.lowStockMaterials.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
                  <CardTitle className="text-[16px]">Материалы ниже точки перезаказа</CardTitle>
                  <span className="t-meta shrink-0">{data.lowStockMaterials.length}</span>
                </div>
                <ul className="mt-1 divide-y divide-border px-4 md:px-5">
                  {data.lowStockMaterials.slice(0, 20).map((row) => (
                    <li key={row.materialId} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="t-object min-w-0 truncate">{row.materialName}</span>
                      <span className="num shrink-0 text-[12px] text-muted-foreground">
                        {formatQuantity(row.quantityOnHand)} из{" "}
                        {formatQuantity(row.reorderPoint, unitLabel(row.unit))}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.lowStockMaterials.length > 20 && (
                  <div className="px-4 pb-4 pt-2 md:px-5">
                    <Link to="/materials" className="text-[12px] font-medium text-primary no-underline hover:underline">
                      Ещё {data.lowStockMaterials.length - 20} — открыть материалы
                    </Link>
                  </div>
                )}
              </Card>
            )}

            {data.overdueInvoices.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
                  <CardTitle className="text-[16px]">Просроченные счета</CardTitle>
                  <span className="t-meta shrink-0">{data.overdueInvoices.length}</span>
                </div>
                <ul className="mt-1 divide-y divide-border px-4 pb-2 md:px-5">
                  {data.overdueInvoices.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="t-object min-w-0 truncate">{row.referenceLabel}</span>
                      <span className="t-value shrink-0 text-danger">{formatMoney(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
