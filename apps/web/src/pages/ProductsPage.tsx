import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { createProductSchema, type CreateProductDto, type ProductResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ModelGrid } from "../design-system/ModelCard/ModelGrid";
import { SearchBar } from "../design-system/Search/SearchBar";
import { ApiError } from "../api/client";

export function ProductsPage() {
  const { items, isLoading, error, create } = useCrudResource<ProductResponseDto, CreateProductDto>("/products");
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
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

      <SearchBar value={query} onChange={setQuery} placeholder="Поиск модели" />

      <ModelGrid
        items={items.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
        getKey={(row) => row.id}
        getTitle={(row) => row.name}
        getSubtitle={(row) => row.code}
        onItemClick={(row) => void navigate(`/products/${row.id}`)}
        emptyTitle="Пока нет ни одной модели"
        emptyHint="Добавьте первую модель в форме выше."
      />
    </section>
  );
}
