import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSupplierSchema, type CreateSupplierDto, type SupplierResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../components/ListCard";
import { FilterTabs, type FilterOption } from "../components/FilterTabs";
import { SearchBar } from "../components/SearchBar";
import { StatusBadge } from "../components/StatusBadge";
import { ApiError } from "../api/client";

const SUPPLIER_TYPES = [
  { value: "fabric", label: "Ткань" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "logistics", label: "Перевозчик" },
] as const;

const SUPPLIER_ICONS: Record<string, string> = {
  fabric: "box",
  trim: "scissors",
  packaging: "layers",
  logistics: "truck",
};

const TYPE_FILTERS: FilterOption<"all" | (typeof SUPPLIER_TYPES)[number]["value"]>[] = [
  { value: "all", label: "Все" },
  ...SUPPLIER_TYPES.map((type) => ({ value: type.value, label: type.label })),
];

export function SuppliersPage() {
  const { items, isLoading, error, create } = useCrudResource<SupplierResponseDto, CreateSupplierDto>("/suppliers");
  const [formError, setFormError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
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

      <SearchBar value={query} onChange={setQuery} placeholder="Поиск поставщика" />
      <FilterTabs options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />

      <ListCard
        items={items
          .filter((row) => typeFilter === "all" || row.type === typeFilter)
          .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
        getKey={(row) => row.id}
        getIcon={(row) => SUPPLIER_ICONS[row.type] ?? "box"}
        getTitle={(row) => row.name}
        getMeta={(row) => `${SUPPLIER_TYPES.find((t) => t.value === row.type)?.label ?? row.type}${row.inn ? ` · ИНН ${row.inn}` : ""}`}
        getTrailing={(row) => <StatusBadge status={row.status} />}
        emptyTitle="Пока нет ни одного поставщика"
        emptyHint="Добавьте первого поставщика в форме выше."
      />
    </section>
  );
}
