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
    <section className="flex flex-col gap-5">
      <h1>Модели</h1>

      <Card>
        <CardHeader>
          <CardTitle>Новая модель</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Название модели
              <Input {...register("name")} placeholder="Двойка" />
              {errors.name && <span className="text-[0.8rem] font-semibold text-destructive">{errors.name.message}</span>}
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Артикул
              <Input {...register("code")} placeholder="DVOIKA-001" />
              {errors.code && <span className="text-[0.8rem] font-semibold text-destructive">{errors.code.message}</span>}
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Категория
              <Input {...register("category")} placeholder="Худи" />
            </label>

            <Button type="submit" loading={isSubmitting}>
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
          <SearchBar value={query} onChange={setQuery} placeholder="Поиск модели" />

          <ModelGrid
            items={items.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
            getKey={(row) => row.id}
            getTitle={(row) => row.name}
            getSubtitle={(row) => row.code}
            onItemClick={(row) => void navigate(`/products/${row.id}`)}
            emptyTitle="Пока нет ни одной модели"
            emptyHint="Добавьте первую модель — займёт меньше минуты."
            emptyActionLabel="Добавить модель"
            onEmptyAction={() => setFocus("name")}
          />
        </>
      )}
    </section>
  );
}
