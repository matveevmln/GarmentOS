import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  createProductSchema,
  type CreateProductDto,
  type DocumentResponseDto,
  type ProductionOrderResponseDto,
  type ProductResponseDto,
} from "@garmentos/shared-types";
import { apiRequest } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { ModelGrid } from "../design-system/ModelCard/ModelGrid";
import { SearchBar } from "../design-system/Search/SearchBar";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Button } from "../design-system/Button/Button";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { formatQuantity } from "../lib/format";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { ApiError } from "../api/client";

// Пятый из 7 перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md, задача #72).
export function ProductsPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<ProductResponseDto, CreateProductDto>(
    "/products",
  );
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Витрина моделей стала production-first (визуальная переработка
  // 2026-09-13): модель показывает не только паспортные поля, но и свою
  // производственную активность. Партии берутся ОДНИМ запросом на весь
  // список (не по запросу на модель) и считаются по тем же статусам, что и
  // на Главной; «произведено» тут сознательно не дублируется — это число
  // считает backend на карточке модели (GET /products/:id/production), и
  // второй реализации того же правила в интерфейсе быть не должно.
  const [orders, setOrders] = useState<ProductionOrderResponseDto[]>([]);
  useEffect(() => {
    void apiRequest<ProductionOrderResponseDto[]>("/production-orders")
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  const ACTIVE_STATUSES = new Set(["placed", "in_progress", "ready_for_pickup"]);
  const activityByProduct = new Map<string, { batches: number; inProgress: number }>();
  for (const order of orders) {
    const current = activityByProduct.get(order.productId) ?? { batches: 0, inProgress: 0 };
    current.batches += 1;
    if (ACTIVE_STATUSES.has(order.status)) current.inProgress += 1;
    activityByProduct.set(order.productId, current);
  }

  // Фото — из существующего Document Engine, по одному запросу на модель и
  // строго один раз (без повторов при перерисовке фильтра).
  const [photoByProduct, setPhotoByProduct] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const missing = items.filter((item) => !(item.id in photoByProduct)).map((item) => item.id);
    if (missing.length === 0) return;
    for (const productId of missing) {
      void apiRequest<DocumentResponseDto[]>(`/documents?entityType=product&entityId=${productId}`)
        .then((docs) => {
          const photo = docs.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion) ?? null;
          setPhotoByProduct((prev) => ({ ...prev, [productId]: photo?.id ?? null }));
        })
        .catch(() => setPhotoByProduct((prev) => ({ ...prev, [productId]: null })));
    }
  }, [items]);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateProductDto>({ resolver: zodResolver(createProductSchema) });

  const onSubmit = async (data: CreateProductDto) => {
    try {
      await create(data);
      reset();
      toast.success("Модель добавлена");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать модель");
    }
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Модели"
        subtitle={`${formatQuantity(items.length, "моделей")} в системе`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Модели" }]} />}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Новая модель</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Название модели" error={errors.name?.message}>
                <Input {...register("name")} placeholder="Двойка" />
              </Field>
              <Field label="Артикул" error={errors.code?.message}>
                <Input {...register("code")} placeholder="DVOIKA-001" />
              </Field>
              <Field label="Категория">
                <Input {...register("category")} placeholder="Худи" />
              </Field>
            </div>

            <Button type="submit" size="sm" loading={isSubmitting} className="md:self-start">
              {isSubmitting ? "Добавляем..." : "Добавить модель"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить модели" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Поиск модели" className="mb-3 md:w-[340px]" />

          <ModelGrid
            items={items.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
            getKey={(row) => row.id}
            getTitle={(row) => row.name}
            getSubtitle={(row) => row.code}
            getCode={(row) => row.code}
            getStatus={(row) => row.status}
            getMeta={(row) => row.category ?? null}
            getPhotoDocumentId={(row) => photoByProduct[row.id] ?? null}
            getActivity={(row) => {
              const activity = activityByProduct.get(row.id);
              if (!activity) return null;
              return activity.inProgress > 0
                ? `${formatQuantity(activity.batches, "партии")} · ${activity.inProgress} в работе`
                : formatQuantity(activity.batches, "партии");
            }}
            onItemClick={(row) => void navigate(`/products/${row.id}`)}
            emptyTitle="Пока нет ни одной модели"
            emptyHint="Добавьте первую модель — займёт меньше минуты."
            emptyActionLabel="Добавить модель"
            onEmptyAction={() => setFocus("name")}
          />
        </>
      )}
    </div>
  );
}
