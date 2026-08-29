import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { createProductSchema, type CreateProductDto, type ProductResponseDto } from "@garmentos/shared-types";
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
