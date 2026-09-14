import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  AttentionResponseDto,
  DocumentResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  ProductionOrderResponseDto,
  SpecificationResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardTitle } from "../design-system/Card/Card";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { Button } from "../design-system/Button/Button";
import { AttentionList, BatchCard, type AttentionItem } from "../design-system/Blocks";
import { buildBatchCardFromOrder } from "../lib/batch-card";
import { currencyLabel, formatDate, formatMoney, formatQuantity } from "../lib/format";
import { cn } from "../design-system/utils";

// Главная (Model-first Minimal Core, владелец проекта, 2026-09-12, ПРОМПТ
// №06.1 §7) — переписана вокруг цепочки Модель → Спецификация → Партия.
// Прежняя версия строилась на GET /attention (Закупки/Материалы/Счета —
// снабжение и финансы, скрытые из пользовательского меню Этапом ПРОМПТа
// №06.1) — GET /attention НЕ ИЗМЕНЁН, но из четырёх его полей здесь
// используется только overdueProductionOrders («Требует внимания»
// исторически про просроченный пошив, это остаётся). Остальные разделы
// экрана — новые данные (заказы пошива, спецификации), потому что модуля
// «последних событий»/«последних документов» из GitHub-прототипа в
// apps/web нет (см. прежний комментарий на этом экране).

const ACTIVE_STATUSES = new Set(["placed", "in_progress", "ready_for_pickup"]);
const MAX_ACTIVE_BATCHES = 6;
const MAX_RECENT_SPECS = 5;

export function DashboardPage() {
  const navigate = useNavigate();
  const [attention, setAttention] = useState<AttentionResponseDto | null>(null);
  const [orders, setOrders] = useState<ProductionOrderResponseDto[] | null>(null);
  const [specs, setSpecs] = useState<SpecificationResponseDto[] | null>(null);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [photoByProduct, setPhotoByProduct] = useState<Record<string, string | null>>({});
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, ProductVariantResponseDto[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiRequest<AttentionResponseDto>("/attention"),
      apiRequest<ProductionOrderResponseDto[]>("/production-orders"),
      apiRequest<SpecificationResponseDto[]>("/specifications"),
      apiRequest<ProductResponseDto[]>("/products"),
      apiRequest<WorkshopResponseDto[]>("/workshops"),
    ])
      .then(([attentionData, ordersData, specsData, productsData, workshopsData]) => {
        setAttention(attentionData);
        setOrders(ordersData);
        setSpecs([...specsData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setProducts(productsData);
        setWorkshops(workshopsData);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить сводку"))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const activeOrders = (orders ?? [])
    .filter((order) => ACTIVE_STATUSES.has(order.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ACTIVE_BATCHES);

  // Фото/варианты модели — только для моделей активных партий (без N+1 на
  // весь список заказов компании, тот же принцип, что в ProductionOrdersPage).
  useEffect(() => {
    const missingProductIds = [...new Set(activeOrders.map((order) => order.productId))].filter(
      (productId) => !(productId in variantsByProduct),
    );
    if (missingProductIds.length === 0) return;
    for (const productId of missingProductIds) {
      void apiRequest<DocumentResponseDto[]>(`/documents?entityType=product&entityId=${productId}`)
        .then((docs) => {
          const photo = docs.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion) ?? null;
          setPhotoByProduct((prev) => ({ ...prev, [productId]: photo?.id ?? null }));
        })
        .catch(() => setPhotoByProduct((prev) => ({ ...prev, [productId]: null })));
      void apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`)
        .then((rows) => setVariantsByProduct((prev) => ({ ...prev, [productId]: rows })))
        .catch(() => setVariantsByProduct((prev) => ({ ...prev, [productId]: [] })));
    }
  }, [orders]);

  if (isLoading) return <SkeletonList />;
  if (error || !attention) {
    return <ErrorState title="Не удалось загрузить сводку" description={error ?? undefined} onRetry={load} />;
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const workshopName = (id: string) => workshops.find((w) => w.id === id)?.name ?? id;

  const activeAllOrders = (orders ?? []).filter((o) => ACTIVE_STATUSES.has(o.status));
  const inProgressCount = activeAllOrders.length;
  const inProgressQuantity = activeAllOrders.reduce((sum, o) => sum + Number(o.plannedQuantity), 0);
  const readyForPickupCount = (orders ?? []).filter((o) => o.status === "ready_for_pickup").length;
  // Считается по полному списку активных заказов, а не по activeOrders
  // (обрезан до MAX_ACTIVE_BATCHES карточек ниже) — иначе число моделей
  // занижалось бы при более чем 6 активных партиях.
  const activeModelsCount = new Set(activeAllOrders.map((o) => o.productId)).size;

  const attentionItems: AttentionItem[] = attention.overdueProductionOrders.map((row) => ({
    id: row.id,
    tone: "danger",
    title: row.productName,
    sub: `${row.workshopName} · срок был ${formatDate(row.dueDate)}`,
    meta: `на ${row.daysOverdue} дн.`,
  }));

  const recentSpecs = (specs ?? []).slice(0, MAX_RECENT_SPECS);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Главная"
        subtitle="Что происходит сейчас"
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Главная" }]} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void navigate("/products")}>
              + Модель
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void navigate("/specifications")}>
              + Спецификация
            </Button>
            <Button size="sm" onClick={() => void navigate("/production-orders")}>
              + Партия
            </Button>
          </div>
        }
      />

      {/* Тёмный hero главного показателя — перенесено дословно из
          production-lab.tsx (ProductionHome, ПРОМПТ №09): единственный
          настоящий dark-акцент вне BatchCard в актуальном Lovable — не
          весь интерфейс тёмный, а только самый важный производственный
          показатель на входе в систему. Мини-плитки справа (Активно/
          Моделей/Просрочено) и подпись — те же данные, что раньше лежали
          в светлом MetricStrip, посчитанные из уже загруженных заказов и
          attention, ничего не выдумано. */}
      <section className="production-summary overflow-hidden rounded-[16px] bg-sidebar p-5 text-sidebar-foreground md:p-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="eyebrow text-sidebar-foreground/45">Сейчас в работе</span>
            <div className="num mt-3 text-[42px] font-medium leading-none sm:text-[52px]">
              {formatQuantity(inProgressQuantity)}{" "}
              <small className="text-[15px] font-normal text-sidebar-foreground/55">изделий</small>
            </div>
            <p className="mt-3 max-w-xl text-[13px] text-sidebar-foreground/60">
              {inProgressCount === 0
                ? "Активных партий пока нет."
                : `${formatQuantity(inProgressCount, "партий")} в работе` +
                  (readyForPickupCount > 0 ? `, из них ${formatQuantity(readyForPickupCount, "готовы")} к отгрузке` : "") +
                  (attentionItems.length > 0 ? `; ${formatQuantity(attentionItems.length, "требуют")} внимания` : "") +
                  "."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-sidebar-border bg-sidebar-border">
            <div className="bg-sidebar-accent px-4 py-3">
              <span className="micro text-sidebar-foreground/40">Активно</span>
              <strong className="num mt-2 block text-[22px]">{inProgressCount}</strong>
            </div>
            <div className="bg-sidebar-accent px-4 py-3">
              <span className="micro text-sidebar-foreground/40">Моделей</span>
              <strong className="num mt-2 block text-[22px]">{activeModelsCount}</strong>
            </div>
            <div className="bg-sidebar-accent px-4 py-3">
              <span className="micro text-sidebar-foreground/40">Просрочено</span>
              <strong className={cn("num mt-2 block text-[22px]", attentionItems.length > 0 && "text-danger")}>
                {attentionItems.length}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {attentionItems.length > 0 && (
        <div className="mt-5">
          <Card className="elev-2 overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-sidebar bg-[radial-gradient(120%_180%_at_0%_0%,color-mix(in_oklab,var(--sidebar-primary)_26%,transparent)_0%,transparent_62%)] px-4 py-4 text-sidebar-foreground md:px-5">
              <div className="flex items-baseline gap-2.5">
                <h2 className="font-display text-[16px] font-semibold tracking-[-0.018em]">Требует внимания</h2>
                <span className="t-meta text-sidebar-foreground/55">{formatQuantity(attentionItems.length, "партий")}</span>
              </div>
            </div>
            <div className="px-4 md:px-5">
              <AttentionList items={attentionItems} onSelect={() => void navigate("/production-orders")} />
            </div>
          </Card>
        </div>
      )}

      <div className="stagger mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[16px] font-semibold">Активные партии</h2>
            <span className="t-meta">{formatQuantity(activeOrders.length)}</span>
          </div>
          {activeOrders.length === 0 ? (
            <EmptyState compact title="Сейчас нет партий в работе" description="Новая партия создаётся из утверждённой спецификации." />
          ) : (
            // 2 колонки — с lg (1024px), не с md (768px, ПРОМПТ №08.3): на
            // 768-1023px рельс навигации сжимает вторую колонку сильнее, чем
            // один столбец на мобильном — см. тот же комментарий в
            // ProductionOrdersPage.tsx.
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              {activeOrders.map((order) => {
                const variantsById = new Map(
                  (variantsByProduct[order.productId] ?? []).map((variant) => [variant.id, variant]),
                );
                const spec = order.specificationId ? (specs ?? []).find((s) => s.id === order.specificationId) : undefined;
                const cardData = buildBatchCardFromOrder(
                  order,
                  productName(order.productId),
                  workshopName(order.workshopId),
                  photoByProduct[order.productId] ?? null,
                  spec?.specNumber ?? null,
                  variantsById,
                );
                return <BatchCard key={order.id} data={cardData} onClick={() => void navigate(`/production-orders/${order.id}`)} />;
              })}
            </div>
          )}
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
            <CardTitle className="text-[16px]">Последние спецификации</CardTitle>
            <span className="t-meta shrink-0">{recentSpecs.length}</span>
          </div>
          {recentSpecs.length === 0 ? (
            <div className="p-4 md:p-5">
              <EmptyState compact title="Пока нет спецификаций" description="Первый шаг производства — спецификация." />
            </div>
          ) : (
            <ul className="mt-1 divide-y divide-border px-4 pb-2 md:px-5">
              {recentSpecs.map((spec) => (
                <li
                  key={spec.id}
                  className="interactive flex cursor-pointer items-center justify-between gap-3 py-2.5"
                  onClick={() => void navigate(`/specifications/${spec.id}`)}
                >
                  <div className="min-w-0">
                    <div className="t-object truncate">
                      {spec.specNumber ? `№${spec.specNumber}` : "Черновик"} · {productName(spec.productId)}
                    </div>
                    <div className="num mt-0.5 text-[12px] text-muted-foreground">
                      {formatQuantity(Math.round(Number(spec.totalQuantity)), "шт")} ·{" "}
                      {formatMoney(Number(spec.totalSum), currencyLabel(spec.totalSumCurrency))}
                    </div>
                  </div>
                  <StatusBadge status={spec.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
