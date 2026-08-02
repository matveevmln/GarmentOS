import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWarehouseSchema, type CreateWarehouseDto, type WarehouseResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable } from "../components/DataTable";
import { ApiError } from "../api/client";

export function WarehousesPage() {
  const { items, isLoading, error, create } = useCrudResource<WarehouseResponseDto, CreateWarehouseDto>("/warehouses");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWarehouseDto>({ resolver: zodResolver(createWarehouseSchema) });

  const onSubmit = async (data: CreateWarehouseDto) => {
    setFormError(null);
    try {
      await create(data);
      reset();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать склад");
    }
  };

  return (
    <section>
      <h1>Склады</h1>

      <form className="entity-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <label>
          Название
          <input {...register("name")} placeholder="Основной склад" />
        </label>
        {errors.name && <p className="field-error">{errors.name.message}</p>}

        <label>
          Страна
          <input {...register("country")} placeholder="Киргизия" />
        </label>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Добавить склад
        </button>
      </form>

      {isLoading && <p>Загрузка…</p>}
      {error && <p className="form-error">{error}</p>}

      <DataTable
        rows={items}
        rowKey={(row) => row.id}
        emptyText="Пока нет ни одного склада — добавьте первый выше"
        columns={[
          { header: "Название", render: (row) => row.name },
          { header: "Тип", render: (row) => row.type },
          { header: "Страна", render: (row) => row.country ?? "—" },
        ]}
      />
    </section>
  );
}
