import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { createProductSchema, type CreateProductDto, type ProductResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable } from "../components/DataTable";
import { ApiError } from "../api/client";

export function ProductsPage() {
  const { items, isLoading, error, create } = useCrudResource<ProductResponseDto, CreateProductDto>("/products");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProductDto>({ resolver: zodResolver(createProductSchema) });

  const onSubmit = async (data: CreateProductDto) => {
    setFormError(null);
    try {
      await create(data);
      reset();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать модель");
    }
  };

  return (
    <section>
      <h1>Модели</h1>

      <form className="entity-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <label>
          Название модели
          <input {...register("name")} placeholder="Двойка" />
        </label>
        {errors.name && <p className="field-error">{errors.name.message}</p>}

        <label>
          Артикул
          <input {...register("code")} placeholder="DVOIKA-001" />
        </label>
        {errors.code && <p className="field-error">{errors.code.message}</p>}

        <label>
          Категория
          <input {...register("category")} />
        </label>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Добавить модель
        </button>
      </form>

      {isLoading && <p>Загрузка…</p>}
      {error && <p className="form-error">{error}</p>}

      <DataTable
        rows={items}
        rowKey={(row) => row.id}
        emptyText="Пока нет ни одной модели — добавьте первую выше"
        columns={[
          {
            header: "Название",
            render: (row) => <Link to={`/products/${row.id}`}>{row.name}</Link>,
          },
          { header: "Артикул", render: (row) => row.code },
          { header: "Статус", render: (row) => row.status },
        ]}
      />
    </section>
  );
}
