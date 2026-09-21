import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  createProductSchema,
  type CreateProductDto,
  type DocumentResponseDto,
  type ProductProductionResponseDto,
  type ProductResponseDto,
} from "@garmentos/shared-types";
import { apiRequest } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { generateProductCode } from "../lib/product-code";
import { ModelGrid, type ModelGridItem } from "../design-system/ModelCard/ModelGrid";
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

  // Витрина моделей — production-first (визуальная переработка 2026-09-13,
  // карточка модели переоформлена в ПРОМПТ №09.1): каждая карточка несёт
  // цвета/размеры/число партий, реально встречающиеся в производстве этой
  // модели. Считает backend (GET /products/:id/production, тот же
  // источник, что и на карточке модели) — второй реализации того же
  // правила в интерфейсе быть не должно, поэтому запрос идёт по одному
  // на модель (тот же паттерн N-запросов, что уже применяется ниже для
  // фото), а не общим списком заказов с подсчётом на клиенте.
  const [productionByProduct, setProductionByProduct] = useState<Record<string, ProductProductionResponseDto | null>>(
    {},
  );
  useEffect(() => {
    const missing = items.filter((item) => !(item.id in productionByProduct)).map((item) => item.id);
    if (missing.length === 0) return;
    for (const productId of missing) {
      void apiRequest<ProductProductionResponseDto>(`/products/${productId}/production`)
        .then((data) => setProductionByProduct((prev) => ({ ...prev, [productId]: data })))
        .catch(() => setProductionByProduct((prev) => ({ ...prev, [productId]: null })));
    }
  }, [items]);

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
  // Артикул и категория (владелец проекта, 2026-09-21 — «скрыть, они
  // никому не нужны») убраны из формы: артикул генерируется автоматически
  // из названия (products.code остаётся NOT NULL UNIQUE в БД, но
  // пользователь его никогда не вводит и не видит), категория просто не
  // заполняется (поле опционально уже на уровне схемы). Форма валидирует
  // только name — остальное собирается в onSubmit.
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Pick<CreateProductDto, "name">>({
    resolver: zodResolver(createProductSchema.pick({ name: true })),
  });

  // Цвета/размеры/партии — агрегированы из breakdown реальных партий этой
  // модели (тот же формат, что у BatchCard), не из выдуманного справочника.
  // Числовые размеры сортируются по значению, нечисловые — по алфавиту
  // как запасной вариант (Number(a)-Number(b) даёт NaN, а NaN ложно в JS —
  // ("" || x) переходит на localeCompare).
  function deriveModelStats(data: ProductProductionResponseDto | null | undefined) {
    if (!data) return { colorNames: [] as string[], sizeLabels: [] as string[], batchCount: 0, inProgressCount: 0 };
    const colors = new Set<string>();
    const sizes = new Set<string>();
    for (const batch of data.batches) {
      for (const row of batch.breakdown) {
        colors.add(row.color);
        for (const size of row.sizes) sizes.add(size.size);
      }
    }
    return {
      colorNames: Array.from(colors),
      sizeLabels: Array.from(sizes).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
      batchCount: data.aggregates.batchCount,
      inProgressCount: data.aggregates.inProgress,
    };
  }

  const onSubmit = async (data: Pick<CreateProductDto, "name">) => {
    try {
      await create({ name: data.name, code: generateProductCode(data.name) });
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
            <div className="grid grid-cols-1 gap-4 md:max-w-sm">
              <Field label="Название модели" error={errors.name?.message}>
                <Input {...register("name")} placeholder="Двойка" />
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
            items={items
              .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))
              .map((row): ModelGridItem => ({
                product: row,
                photoDocumentId: photoByProduct[row.id] ?? null,
                ...deriveModelStats(productionByProduct[row.id]),
              }))}
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
