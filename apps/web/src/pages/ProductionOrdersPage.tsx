import { useNewBatch } from "../lib/new-batch";
import { MobileActionBar } from "../design-system/Blocks/MobileActionBar";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  WorkshopResponseDto,
  SpecificationResponseDto,
  DocumentResponseDto,
} from "@garmentos/shared-types";
import { apiRequest } from "../api/client";
import { Button } from "../design-system/Button/Button";
import { SearchBar } from "../design-system/Search/SearchBar";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { FilterTabs } from "../design-system/Tabs/FilterTabs";
import { BatchCard } from "../design-system/Blocks";
import { buildBatchCardFromOrder } from "../lib/batch-card";
import { formatBatchNumber } from "../lib/format";

export function ProductionOrdersPage() {
  const navigate = useNavigate();
  const openNewBatch = useNewBatch();
  const [orders, setOrders] = useState<ProductionOrderResponseDto[]>([]);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [specs, setSpecs] = useState<SpecificationResponseDto[]>([]);
  const [variants, setVariants] = useState<Record<string, ProductVariantResponseDto[]>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("open");
  const load = () => {
    setLoading(true);
    setError("");
    void Promise.all([
      apiRequest<ProductionOrderResponseDto[]>("/production-orders"),
      apiRequest<ProductResponseDto[]>("/products"),
      apiRequest<WorkshopResponseDto[]>("/workshops"),
      apiRequest<SpecificationResponseDto[]>("/specifications"),
    ])
      .then(([rows, models, shops, documents]) => {
        setOrders(rows);
        setProducts(models);
        setWorkshops(shops);
        setSpecs(documents);
        for (const productId of new Set(rows.map((row) => row.productId))) {
          void apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`)
            .then((value) => setVariants((prev) => ({ ...prev, [productId]: value })))
            .catch(() => {});
          void apiRequest<DocumentResponseDto[]>(
            `/documents?entityType=product&entityId=${productId}`,
          )
            .then((value) =>
              setPhotos((prev) => ({
                ...prev,
                [productId]:
                  value.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion)
                    ?.id ?? null,
              })),
            )
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить партии"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const modelName = (id: string) => products.find((row) => row.id === id)?.name ?? "Модель";
  const workshopName = (id: string) => workshops.find((row) => row.id === id)?.name ?? "Цех";
  const visible = orders.filter((row) => {
    const matchesStatus =
      filter === "all" ||
      (filter === "draft"
        ? row.status === "draft"
        : filter === "closed"
          ? ["completed", "cancelled"].includes(row.status)
          : !["completed", "cancelled", "draft"].includes(row.status));
    return (
      matchesStatus &&
      `${modelName(row.productId)} ${workshopName(row.workshopId)} ${row.orderNumber ?? ""} ${row.orderNumber ? formatBatchNumber(row.orderNumber, row.createdAt) : ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  });
  return (
    <div className="seller-screen">
      <h1 className="mb-5">Партии</h1>
      <SearchBar value={query} onChange={setQuery} placeholder="Найти партию" className="mb-3" />
      <div className="seller-filter">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "В работе" },
            { value: "draft", label: "Черновики" },
            { value: "closed", label: "Закрытые" },
          ]}
        />
      </div>
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState title={error} onRetry={load} />
      ) : !visible.length ? (
        <EmptyState
          title="Здесь пока нет партий"
          description="Создайте новую партию или выберите другой фильтр."
        />
      ) : (
        <div className="mt-4 grid grid-cols-1 items-start gap-3">
          {visible.map((order) => (
            <BatchCard
              key={order.id}
              data={buildBatchCardFromOrder(
                order,
                modelName(order.productId),
                workshopName(order.workshopId),
                photos[order.productId] ?? null,
                specs.find(
                  (spec) =>
                    spec.productionOrderId === order.id || spec.id === order.specificationId,
                )?.specNumber ?? null,
                new Map((variants[order.productId] ?? []).map((row) => [row.id, row])),
              )}
              onClick={() => void navigate(`/production-orders/${order.id}`)}
            />
          ))}
        </div>
      )}
      <MobileActionBar>
        <Button size="lg" onClick={() => openNewBatch()}>
          + Новая партия
        </Button>
      </MobileActionBar>
    </div>
  );
}
