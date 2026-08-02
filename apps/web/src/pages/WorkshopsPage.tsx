import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWorkshopSchema, type CreateWorkshopDto, type WorkshopResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable } from "../components/DataTable";
import { ApiError } from "../api/client";
import { useState } from "react";

export function WorkshopsPage() {
  const { items, isLoading, error, create } = useCrudResource<WorkshopResponseDto, CreateWorkshopDto>("/workshops");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkshopDto>({ resolver: zodResolver(createWorkshopSchema) });

  const onSubmit = async (data: CreateWorkshopDto) => {
    setFormError(null);
    try {
      await create(data);
      reset();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать цех");
    }
  };

  return (
    <section>
      <h1>Цеха</h1>

      <form className="entity-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <label>
          Название цеха
          <input {...register("name")} placeholder="Ак-Сарай Текстиль" />
        </label>
        {errors.name && <p className="field-error">{errors.name.message}</p>}

        <label>
          ИНН
          <input {...register("inn")} />
        </label>

        <label>
          Специализация
          <input {...register("specialization")} placeholder="трикотаж" />
        </label>

        <label>
          Контакты
          <input {...register("contactInfo")} placeholder="Телефон, Telegram" />
        </label>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Добавить цех
        </button>
      </form>

      {isLoading && <p>Загрузка…</p>}
      {error && <p className="form-error">{error}</p>}

      <DataTable
        rows={items}
        rowKey={(row) => row.id}
        emptyText="Пока нет ни одного цеха — добавьте первый выше"
        columns={[
          { header: "Название", render: (row) => row.name },
          { header: "Специализация", render: (row) => row.specialization ?? "—" },
          { header: "ИНН", render: (row) => row.inn ?? "—" },
          { header: "Статус", render: (row) => row.status },
        ]}
      />
    </section>
  );
}
