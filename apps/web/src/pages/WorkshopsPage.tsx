import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWorkshopSchema, type CreateWorkshopDto, type WorkshopResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../components/ListCard";
import { FilterTabs, type FilterOption } from "../components/FilterTabs";
import { SearchBar } from "../components/SearchBar";
import { StatusBadge } from "../components/StatusBadge";
import { ApiError } from "../api/client";

const STATUS_FILTERS: FilterOption<"all" | "draft" | "active" | "archived">[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновик" },
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
];

export function WorkshopsPage() {
  const { items, isLoading, error, create } = useCrudResource<WorkshopResponseDto, CreateWorkshopDto>("/workshops");
  const [formError, setFormError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(
    () =>
      items
        .filter((row) => statusFilter === "all" || row.status === statusFilter)
        .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, statusFilter, query],
  );

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

      <SearchBar value={query} onChange={setQuery} placeholder="Поиск цеха" />
      <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      <ListCard
        items={filtered}
        getKey={(row) => row.id}
        getIcon={() => "factory"}
        getTitle={(row) => row.name}
        getMeta={(row) => row.specialization || row.inn || "—"}
        getTrailing={(row) => <StatusBadge status={row.status} />}
        emptyTitle="Пока нет ни одного цеха"
        emptyHint="Добавьте первый цех в форме выше."
      />
    </section>
  );
}
