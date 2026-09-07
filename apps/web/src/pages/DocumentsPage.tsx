import { useEffect, useState } from "react";
import type { DocumentResponseDto, ProductResponseDto, ProductionOrderResponseDto } from "@garmentos/shared-types";
import { apiDownload, apiRequest, ApiError } from "../api/client";
import { Card, CardTitle } from "../design-system/Card/Card";
import { Button } from "../design-system/Button/Button";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SearchBar } from "../design-system/Search/SearchBar";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { DocumentRow, MobileListItem } from "../design-system/Blocks";
import { IconDocument } from "../design-system/Icons/icons";
import { formatDate, formatQuantity } from "../lib/format";
import { cn } from "../design-system/utils";
import { toast } from "../design-system/Toast/Toast";

// Документы (docs/UI_MIGRATION_PLAN.md, этап 8).
//
// ВАЖНО про контракт API. `GET /documents` — это НЕ лента документов
// компании: эндпоинт обязательно требует пару entityType+entityId и
// возвращает документы одной сущности
// (apps/api/src/document/documents.controller.ts, listForEntity). Единственная
// связка, которую сегодня создаёт система, — `production_order`: к заказу
// пошива привязывается сгенерированная спецификация.
//
// Поэтому экран построен по тому, что API реально умеет: слева список
// заказов пошива, справа документы выбранного заказа. Искусственная
// «лента документов компании» не собирается — для неё нет ни эндпоинта,
// ни данных, а склейка на клиенте из N запросов была бы выдуманной
// сущностью, а не переносом дизайна.
//
// Действия — только существующие: открыть файл через
// `GET /documents/:id/file`. Загрузки, удаления и редактирования на
// экране нет, потому что таких эндпоинтов нет.

const ENTITY_TYPE = "production_order";

export function DocumentsPage() {
  const [orders, setOrders] = useState<ProductionOrderResponseDto[] | null>(null);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentResponseDto[] | null>(null);
  const [documentsError, setDocumentsError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadOrders = () => {
    setOrdersError(null);
    Promise.all([
      apiRequest<ProductionOrderResponseDto[]>("/production-orders"),
      apiRequest<ProductResponseDto[]>("/products"),
    ])
      .then(([orderRows, productRows]) => {
        setOrders(orderRows);
        setProducts(productRows);
        setSelectedId((current) => current ?? orderRows[0]?.id ?? null);
      })
      .catch((err: unknown) =>
        setOrdersError(err instanceof ApiError ? err.message : "Не удалось загрузить заказы пошива"),
      );
  };

  useEffect(loadOrders, []);

  const loadDocuments = (orderId: string) => {
    setDocuments(null);
    setDocumentsError(false);
    apiRequest<DocumentResponseDto[]>(`/documents?entityType=${ENTITY_TYPE}&entityId=${orderId}`)
      .then(setDocuments)
      .catch(() => setDocumentsError(true));
  };

  useEffect(() => {
    if (selectedId) loadDocuments(selectedId);
  }, [selectedId]);

  const openDocument = async (docId: string, title: string) => {
    setDownloadingId(docId);
    try {
      const blob = await apiDownload(`/documents/${docId}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Не удалось открыть «${title}»`);
    } finally {
      setDownloadingId(null);
    }
  };

  if (ordersError) {
    return <ErrorState title="Не удалось загрузить заказы пошива" description={ordersError} onRetry={loadOrders} />;
  }
  if (!orders) return <SkeletonList />;

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const q = query.trim().toLowerCase();
  const visibleOrders = q ? orders.filter((row) => productName(row.productId).toLowerCase().includes(q)) : orders;
  const selectedOrder = orders.find((row) => row.id === selectedId) ?? null;

  // Оригинал документа неизменяем; новая редакция — новая строка
  // (docs/PRINCIPLES.md, принцип 19). Самая свежая показывается первой.
  const sortedDocuments = documents
    ? [...documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Документы"
        subtitle="Документы привязаны к заказу пошива — выберите заказ слева"
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Документы" }]} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Левая колонка — выбор заказа пошива */}
        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
            <CardTitle className="text-[16px]">Заказы пошива</CardTitle>
            <span className="t-meta shrink-0">{orders.length}</span>
          </div>
          <div className="px-4 pb-3 pt-3 md:px-5">
            <SearchBar value={query} onChange={setQuery} placeholder="Поиск по модели" />
          </div>

          {visibleOrders.length === 0 ? (
            <div className="px-4 pb-4 md:px-5">
              <EmptyState compact title="Ничего не найдено" description="По этому запросу заказов пошива нет." />
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-border overflow-y-auto px-4 md:px-5 xl:max-h-[560px]">
              {visibleOrders.map((row) => {
                const isActive = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      aria-current={isActive || undefined}
                      className={cn(
                        "interactive focus-ring -mx-2 flex w-full items-center gap-3 rounded-[8px] px-2 py-3 text-left",
                        isActive ? "bg-primary/[0.07]" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="t-object block truncate">{productName(row.productId)}</span>
                        <span className="t-meta mt-1 block">
                          {formatQuantity(Number(row.plannedQuantity), "шт")}
                          {row.dueDate ? ` · срок ${formatDate(row.dueDate)}` : ""}
                        </span>
                      </span>
                      <StatusBadge status={row.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Правая колонка — документы выбранного заказа */}
        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4 md:px-5">
            <CardTitle className="text-[16px]">
              {selectedOrder ? productName(selectedOrder.productId) : "Документы"}
            </CardTitle>
            {sortedDocuments ? <span className="t-meta shrink-0">{sortedDocuments.length}</span> : null}
          </div>

          <div className="px-4 pb-4 pt-2 md:px-5">
            {!selectedOrder ? (
              <EmptyState
                compact
                icon={<IconDocument size={18} />}
                title="Заказ не выбран"
                description="Выберите заказ пошива слева, чтобы увидеть его документы."
              />
            ) : documentsError ? (
              <ErrorState
                title="Не удалось загрузить документы"
                onRetry={() => selectedId && loadDocuments(selectedId)}
              />
            ) : !sortedDocuments ? (
              <SkeletonList rows={3} />
            ) : sortedDocuments.length === 0 ? (
              <EmptyState
                compact
                icon={<IconDocument size={18} />}
                title="У этого заказа пока нет документов"
                description="Спецификация появится здесь после генерации на карточке заказа."
              />
            ) : (
              <>
                {/* Строки документа — на всех ширинах один и тот же блок
                    DocumentRow: у документа нет колонок, которые имело бы
                    смысл раскладывать таблицей. */}
                <div className="hidden divide-y divide-border md:block">
                  {sortedDocuments.map((doc, index) => (
                    <DocumentRow
                      key={doc.id}
                      title={doc.title ?? doc.docType}
                      version={index === 0 ? "Актуальная" : null}
                      format="PDF"
                      date={doc.createdAt}
                      onOpen={() => void openDocument(doc.id, doc.title ?? doc.docType)}
                    />
                  ))}
                </div>

                <div className="space-y-2 md:hidden">
                  {sortedDocuments.map((doc, index) => (
                    <MobileListItem
                      key={doc.id}
                      onClick={() => void openDocument(doc.id, doc.title ?? doc.docType)}
                      footer={
                        <div className="mt-3 border-t border-border pt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={downloadingId === doc.id}
                            onClick={() => void openDocument(doc.id, doc.title ?? doc.docType)}
                          >
                            Открыть PDF
                          </Button>
                        </div>
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{doc.title ?? doc.docType}</div>
                          <div className="num mt-1 text-[12px] text-muted-foreground">
                            PDF · {formatDate(doc.createdAt)}
                          </div>
                        </div>
                        {index === 0 ? (
                          <span className="inline-flex shrink-0 items-center rounded-[4px] border border-success/25 bg-success/[0.08] px-1.5 py-[2px] text-[11px] font-medium text-success">
                            Актуальная
                          </span>
                        ) : null}
                      </div>
                    </MobileListItem>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
