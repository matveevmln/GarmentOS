import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createMaterialSchema, type CreateMaterialDto, type MaterialResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable } from "../components/DataTable";
import { ApiError } from "../api/client";

const MATERIAL_TYPES = [
  { value: "fabric", label: "Ткань" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "accessory", label: "Прочее" },
] as const;
const MATERIAL_UNITS = ["m", "kg", "pcs"] as const;

export function MaterialsPage() {
  const { items, isLoading, error, create } = useCrudResource<MaterialResponseDto, CreateMaterialDto>("/materials");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateMaterialDto>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: { type: "fabric", unit: "m" },
  });

  const onSubmit = async (data: CreateMaterialDto) => {
    setFormError(null);
    try {
      await create(data);
      reset({ type: "fabric", unit: "m" });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать материал");
    }
  };

  return (
    <section>
      <h1>Материалы</h1>

      <form className="entity-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <label>
          Название
          <input {...register("name")} placeholder="Трикотаж «Петроль»" />
        </label>
        {errors.name && <p className="field-error">{errors.name.message}</p>}

        <label>
          Тип
          <select {...register("type")}>
            {MATERIAL_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Единица измерения
          <select {...register("unit")}>
            {MATERIAL_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>

        <label>
          Точка перезаказа
          <input
            type="number"
            step="0.001"
            {...register("reorderPoint", {
              setValueAs: (value: string) => (value === "" ? undefined : Number(value)),
            })}
          />
        </label>

        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Добавить материал
        </button>
      </form>

      {isLoading && <p>Загрузка…</p>}
      {error && <p className="form-error">{error}</p>}

      <DataTable
        rows={items}
        rowKey={(row) => row.id}
        emptyText="Пока нет ни одного материала — добавьте первый выше"
        columns={[
          { header: "Название", render: (row) => row.name },
          { header: "Тип", render: (row) => MATERIAL_TYPES.find((t) => t.value === row.type)?.label ?? row.type },
          { header: "Ед.", render: (row) => row.unit },
          { header: "Точка перезаказа", render: (row) => row.reorderPoint ?? "—" },
        ]}
      />
    </section>
  );
}
