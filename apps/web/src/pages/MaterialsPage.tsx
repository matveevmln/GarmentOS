import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createMaterialSchema, type CreateMaterialDto, type MaterialResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../components/ListCard";
import { FilterTabs, type FilterOption } from "../components/FilterTabs";
import { SearchBar } from "../components/SearchBar";
import { ApiError } from "../api/client";

const MATERIAL_TYPES = [
  { value: "fabric", label: "Ткани" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "accessory", label: "Прочее" },
] as const;
const MATERIAL_UNITS = ["m", "kg", "pcs"] as const;
const MATERIAL_ICONS: Record<string, string> = {
  fabric: "box",
  trim: "scissors",
  packaging: "layers",
  accessory: "tag",
};

const TYPE_FILTERS: FilterOption<"all" | (typeof MATERIAL_TYPES)[number]["value"]>[] = [
  { value: "all", label: "Все" },
  ...MATERIAL_TYPES.map((type) => ({ value: type.value, label: type.label })),
];

export function MaterialsPage() {
  const { items, isLoading, error, create } = useCrudResource<MaterialResponseDto, CreateMaterialDto>("/materials");
  const [formError, setFormError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
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

      <SearchBar value={query} onChange={setQuery} placeholder="Поиск материала" />
      <FilterTabs options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />

      <ListCard
        items={items
          .filter((row) => typeFilter === "all" || row.type === typeFilter)
          .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
        getKey={(row) => row.id}
        getIcon={(row) => MATERIAL_ICONS[row.type] ?? "box"}
        getTitle={(row) => row.name}
        getMeta={(row) => (row.reorderPoint ? `Точка перезаказа: ${row.reorderPoint} ${row.unit}` : row.unit)}
        emptyTitle="Пока нет ни одного материала"
        emptyHint="Добавьте первый материал в форме выше."
      />
    </section>
  );
}
