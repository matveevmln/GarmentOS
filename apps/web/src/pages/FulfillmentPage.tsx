import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FulfillmentBatchListItemDto } from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { PageHeader } from "../design-system/PageHeader/PageHeader";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { formatQuantity } from "../lib/format";

// Фулфилмент ОТК (ПРОМПТ №3, раздел 10) — минимум на партию: модель, фото,
// номер партии, спецификация, отправлено/принято/брак, статус ОТК. Read-model
// поверх уже существующих данных (GET /fulfillment/batches) — сама фиксация
// результата ОТК уже реализована на карточке партии (Batch Passport), этот
// экран только показывает список партий, дошедших до фулфилмента.
export function FulfillmentPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FulfillmentBatchListItemDto[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    apiRequest<{ items: FulfillmentBatchListItemDto[] }>("/fulfillment/batches")
      .then((response) => setItems(response.items))
      .catch((err: unknown) => {
        setError(true);
        if (err instanceof ApiError) setItems([]);
      });
  };
  useEffect(load, []);

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-6 md:px-6">
      <PageHeader title="Фулфилмент ОТК" subtitle="Партии, отправленные на фулфилмент-центр, и статус их приёмки/ОТК." />

      {error ? (
        <ErrorState title="Не удалось загрузить список" onRetry={load} />
      ) : items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          title="Пока нет партий на фулфилменте"
          description="Партии появятся здесь после перехода в статус «Отправлено на фулфилмент»."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={[
                { key: "product", label: "Модель" },
                { key: "batch", label: "Партия", width: "110px" },
                { key: "spec", label: "Спецификация", width: "150px" },
                { key: "sent", label: "Отправлено", align: "right", width: "110px" },
                { key: "received", label: "Принято", align: "right", width: "110px" },
                { key: "defect", label: "Брак", align: "right", width: "90px" },
                { key: "qc", label: "ОТК", width: "160px" },
              ]}
            >
              {items.map((row) => (
                <tr key={row.productionOrderId} onClick={() => void navigate(`/production-orders/${row.productionOrderId}`)}>
                  <Td className="flex items-center gap-2.5">
                    {row.productPhotoUrl ? (
                      <img src={row.productPhotoUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-muted" />
                    )}
                    <span className="t-object">{row.productName}</span>
                  </Td>
                  <Td className="num text-muted-foreground">{row.orderNumber ? `№${row.orderNumber}` : "—"}</Td>
                  <Td className="num text-muted-foreground">{row.specNumber ? `№${row.specNumber}` : "—"}</Td>
                  <Td align="right" className="num">
                    {formatQuantity(Number(row.sentQuantity), "шт")}
                  </Td>
                  <Td align="right" className="num">
                    {row.receivedQuantity !== null ? formatQuantity(Number(row.receivedQuantity), "шт") : "—"}
                  </Td>
                  <Td align="right" className="num">
                    {row.defectQuantity !== null ? formatQuantity(Number(row.defectQuantity), "шт") : "—"}
                  </Td>
                  <Td>
                    <StatusBadge status={row.qcStatus} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>

          <div className="space-y-2 md:hidden">
            {items.map((row) => (
              <MobileListItem key={row.productionOrderId} onClick={() => void navigate(`/production-orders/${row.productionOrderId}`)}>
                <div className="flex items-center gap-2.5">
                  {row.productPhotoUrl ? (
                    <img src={row.productPhotoUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="t-object truncate">{row.productName}</p>
                    <p className="t-meta">
                      {row.orderNumber ? `№${row.orderNumber}` : "—"} · {row.specNumber ? `Спец. №${row.specNumber}` : "без спецификации"}
                    </p>
                  </div>
                  <StatusBadge status={row.qcStatus} />
                </div>
                <div className="mt-2 flex items-center gap-4 t-meta">
                  <span>Отправлено: {formatQuantity(Number(row.sentQuantity), "шт")}</span>
                  {row.receivedQuantity !== null ? <span>Принято: {formatQuantity(Number(row.receivedQuantity), "шт")}</span> : null}
                  {row.defectQuantity !== null ? <span>Брак: {formatQuantity(Number(row.defectQuantity), "шт")}</span> : null}
                </div>
              </MobileListItem>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
