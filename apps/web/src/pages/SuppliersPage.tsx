import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSupplierSchema, type CreateSupplierDto, type SupplierResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable } from "../components/DataTable";
import { ApiError } from "../api/client";

const SUPPLIER_TYPES = [
  { value: "fabric", label: "Ткань" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "logistics", label: "Перевозчик" },
] as const;

export function SuppliersPage() {
  const { items, isLoading, error, create } = useCrudResource<SupplierResponseDto, CreateSupplierDto>("/suppliers");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSupplierDto>({ resolver: zodResolver(createSupplierSchema), defaultValues: { type: "fabric" } });

  const onSubmit = async (data: CreateSupplierDto) => {
    setFormError(null);
    try {
      await create(data);
      reset({ type: "fabric" });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать поставщика");
    }
  };

  return (
    <section>
      <h1>Поставщики</h1>

      <form className="entity-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <label>
          Название
          <input {...register("name")} placeholder="Оксфорд Текстиль" />
        </label>
        {errors.name && <p className="field-error">{errors.name.message}</p>}

        <label>
          Тип
          <select {...register("type")}>
            {SUPPLIER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          ИНН
          <input {...register("inn")} />
        </label>

        <label>
          Контакты
          <input {...register("contactInfo")} />
        </label>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Добавить поставщика
        </button>
      </form>

      {isLoading && <p>Загрузка…</p>}
      {error && <p className="form-error">{error}</p>}

      <DataTable
        rows={items}
        rowKey={(row) => row.id}
        emptyText="Пока нет ни одного поставщика — добавьте первого выше"
        columns={[
          { header: "Название", render: (row) => row.name },
          { header: "Тип", render: (row) => SUPPLIER_TYPES.find((t) => t.value === row.type)?.label ?? row.type },
          { header: "ИНН", render: (row) => row.inn ?? "—" },
          { header: "Статус", render: (row) => row.status },
        ]}
      />
    </section>
  );
}
