import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWorkshopSchema, type CreateWorkshopDto, type WorkshopResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../design-system/ListCard/ListCard";
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { SearchBar } from "../design-system/Search/SearchBar";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { ApiError } from "../api/client";

// Первый из 7 экранов, перенесённых на дизайн-систему после утверждения
// формы-эталона (docs/DESIGN_SYSTEM_MAP.md). Изменения относительно старой
// версии — не только замена компонентов:
// 1. Голый текст «Загрузка…» → SkeletonList (тот же реальный пробел,
//    что уже был закрыт в форме-эталоне).
// 2. Ошибка загрузки списка (не только ошибка формы) → полностраничный
//    ErrorState с кнопкой «Повторить» (docs/UX_PRINCIPLES.md §5) — раньше
//    неудача загрузки была неотличима от пустого списка.
// 3. Ошибка отправки формы → toast.error вместо статичного <p> (не занимает
//    место в layout, не остаётся на экране после исправления).
// 4. Кнопка «Добавить цех» → loading-состояние на время отправки.
// 5. Пустой список → emptyActionLabel, ведущий к самой форме (Zero Input —
//    не просто объясняет, что пусто, а сразу предлагает действие).
// Не добавлено: hover-меню действий (архивировать/редактировать) на строках
// цеха — у API сегодня нет ни одного эндпоинта для такого действия;
// добавление кнопки без реального действия было бы «мёртвой кнопкой»
// (UX_PRINCIPLES.md §3), нарушением, а не улучшением.
const STATUS_FILTERS: FilterOption<"all" | "draft" | "active" | "archived">[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновик" },
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
];

export function WorkshopsPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<WorkshopResponseDto, CreateWorkshopDto>(
    "/workshops",
  );
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkshopDto>({ resolver: zodResolver(createWorkshopSchema) });

  const onSubmit = async (data: CreateWorkshopDto) => {
    try {
      await create(data);
      reset();
      toast.success("Цех добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать цех");
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
    <section className="flex flex-col gap-5">
      <h1>Цеха</h1>

      <Card>
        <CardHeader>
          <CardTitle>Новый цех</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Название цеха
              <Input {...register("name")} placeholder="Ак-Сарай Текстиль" />
              {errors.name && <span className="text-[0.8rem] font-semibold text-destructive">{errors.name.message}</span>}
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              ИНН
              <Input {...register("inn")} />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Специализация
              <Input {...register("specialization")} placeholder="трикотаж" />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Контакты
              <Input {...register("contactInfo")} placeholder="Телефон, Telegram" />
            </label>

            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? "Добавляем..." : "Добавить цех"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить цеха" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
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
            emptyHint="Добавьте первый цех — займёт меньше минуты."
            emptyActionLabel="Добавить цех"
            onEmptyAction={() => setFocus("name")}
          />
        </>
      )}
    </section>
  );
}
