import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWarehouseSchema, type CreateWarehouseDto, type WarehouseResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../design-system/ListCard/ListCard";
import { SearchBar } from "../design-system/Search/SearchBar";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { ApiError } from "../api/client";

// Четвёртый из 7 перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md, задача #72).
export function WarehousesPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<WarehouseResponseDto, CreateWarehouseDto>(
    "/warehouses",
  );
  const [query, setQuery] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateWarehouseDto>({ resolver: zodResolver(createWarehouseSchema) });

  const onSubmit = async (data: CreateWarehouseDto) => {
    try {
      await create(data);
      reset();
      toast.success("Склад добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать склад");
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <h1>Склады</h1>

      <Card>
        <CardHeader>
          <CardTitle>Новый склад</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Название
              <Input {...register("name")} placeholder="Основной склад" />
              {errors.name && <span className="text-[0.8rem] font-semibold text-destructive">{errors.name.message}</span>}
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Страна
              <Input {...register("country")} placeholder="Киргизия" />
            </label>

            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? "Добавляем..." : "Добавить склад"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить склады" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Поиск склада" />

          <ListCard
            items={items.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
            getKey={(row) => row.id}
            getIcon={() => "building"}
            getTitle={(row) => row.name}
            getMeta={(row) => row.country ?? "—"}
            emptyTitle="Пока нет ни одного склада"
            emptyHint="Добавьте первый склад — займёт меньше минуты."
            emptyActionLabel="Добавить склад"
            onEmptyAction={() => setFocus("name")}
          />
        </>
      )}
    </section>
  );
}
