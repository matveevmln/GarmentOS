import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProductResponseDto, SpecificationResponseDto, WorkshopResponseDto } from "@garmentos/shared-types";
import { apiRequest } from "../api/client";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Button } from "../design-system/Button/Button";
import { currencyLabel, formatDate, formatMoney, formatQuantity } from "../lib/format";

// «Спецификации» (Этап 2 — «Паспорт модели», владелец проекта, 2026-09-12,
// требование №7) — самостоятельный раздел, спецификация больше не спрятана
// внутри карточки партии (там она была раньше, как производный документ
// production_order — архитектура Этапа 1 это отменила).
export function SpecificationsPage() {
  const navigate = useNavigate();
  const [specs, setSpecs] = useState<SpecificationResponseDto[] | null>(null);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    Promise.all([
      apiRequest<SpecificationResponseDto[]>("/specifications"),
      apiRequest<ProductResponseDto[]>("/products"),
      apiRequest<WorkshopResponseDto[]>("/workshops"),
    ])
      .then(([specsData, productsData, workshopsData]) => {
        setSpecs([...specsData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setProducts(productsData);
        setWorkshops(workshopsData);
      })
      .catch(() => setError(true));
  };
  useEffect(load, []);

  if (error) return <ErrorState title="Не удалось загрузить спецификации" onRetry={load} />;
  if (!specs) return <SkeletonList />;

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const workshopName = (id: string) => workshops.find((w) => w.id === id)?.name ?? "—";
  const specTitle = (spec: SpecificationResponseDto) => (spec.specNumber ? `№${spec.specNumber}` : "Черновик");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Спецификации"
        subtitle={`${formatQuantity(specs.length, "спецификаций")} в системе`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Спецификации" }]} />}
        actions={
          <Button size="sm" onClick={() => void navigate("/specifications/new")}>
            + Новая спецификация
          </Button>
        }
      />

      {specs.length === 0 ? (
        <EmptyState
          title="Пока нет ни одной спецификации"
          description="Спецификация — первый шаг производства: модель, цех, количество и цена."
          action={
            <Button size="sm" onClick={() => void navigate("/specifications/new")}>
              Создать спецификацию
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={[
                { key: "number", label: "№", width: "90px" },
                { key: "date", label: "Дата", width: "120px" },
                { key: "product", label: "Модель" },
                { key: "workshop", label: "Цех" },
                { key: "quantity", label: "Количество", align: "right", width: "130px" },
                { key: "sum", label: "Сумма", align: "right", width: "150px" },
                { key: "status", label: "Статус", align: "right", width: "150px" },
              ]}
            >
              {specs.map((spec) => (
                <tr key={spec.id} className="cursor-pointer" onClick={() => void navigate(`/specifications/${spec.id}`)}>
                  <Td className="num t-object">{specTitle(spec)}</Td>
                  <Td className="num text-muted-foreground">{formatDate(spec.createdAt)}</Td>
                  <Td>{productName(spec.productId)}</Td>
                  <Td className="text-muted-foreground">{workshopName(spec.workshopId)}</Td>
                  <Td align="right" className="num">
                    {formatQuantity(Math.round(Number(spec.totalQuantity)))}
                  </Td>
                  <Td align="right" className="num">
                    {formatMoney(Number(spec.totalSum), currencyLabel(spec.totalSumCurrency))}
                  </Td>
                  <Td align="right">
                    <StatusBadge status={spec.status} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>

          <div className="space-y-2 md:hidden">
            {specs.map((spec) => (
              <MobileListItem key={spec.id} onClick={() => void navigate(`/specifications/${spec.id}`)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">
                      {specTitle(spec)} · {productName(spec.productId)}
                    </div>
                    <div className="t-secondary mt-0.5 truncate">{workshopName(spec.workshopId)}</div>
                    <div className="num mt-1 text-[12px] text-muted-foreground">
                      {formatQuantity(Math.round(Number(spec.totalQuantity)))} · {formatMoney(Number(spec.totalSum), currencyLabel(spec.totalSumCurrency))}
                    </div>
                  </div>
                  <StatusBadge status={spec.status} />
                </div>
              </MobileListItem>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
