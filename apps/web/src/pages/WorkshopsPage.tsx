import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWorkshopSchema, type CreateWorkshopDto, type WorkshopResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { formatDate, formatQuantity } from "../lib/format";
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
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Цеха"
        subtitle={`${formatQuantity(items.length, "подрядных цехов")} в справочнике`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Цеха" }]} />}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Новый цех</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Название цеха" error={errors.name?.message}>
                <Input {...register("name")} placeholder="Ак-Сарай Текстиль" />
              </Field>
              <Field label="ИНН">
                <Input {...register("inn")} />
              </Field>
              <Field label="Специализация">
                <Input {...register("specialization")} placeholder="трикотаж" />
              </Field>
              <Field label="Контакты">
                <Input {...register("contactInfo")} placeholder="Телефон, Telegram" />
              </Field>
            </div>

            <Button type="submit" size="sm" loading={isSubmitting} className="md:self-start">
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
          <div className="mb-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <SearchBar value={query} onChange={setQuery} placeholder="Поиск цеха" className="md:w-[340px]" />
            <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              compact
              title={items.length === 0 ? "Пока нет ни одного цеха" : "Ничего не найдено"}
              description={
                items.length === 0
                  ? "Добавьте первый цех — займёт меньше минуты."
                  : "По заданным условиям поиска и фильтрам цехов нет."
              }
              action={
                items.length === 0 ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setFocus("name")}>
                    Добавить цех
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable
                  columns={[
                    { key: "name", label: "Название" },
                    { key: "spec", label: "Специализация", width: "170px" },
                    { key: "inn", label: "ИНН", width: "140px" },
                    { key: "contract", label: "Договор", width: "180px" },
                    { key: "status", label: "Статус", align: "right", width: "150px" },
                  ]}
                >
                  {filtered.map((row) => (
                    <tr key={row.id} className="cursor-default">
                      <Td className="t-object">{row.name}</Td>
                      <Td className="text-muted-foreground">{row.specialization ?? "—"}</Td>
                      <Td className="num text-muted-foreground">{row.inn ?? "—"}</Td>
                      <Td className="num text-muted-foreground">
                        {row.contractNumber
                          ? `${row.contractNumber}${row.contractDate ? ` от ${formatDate(row.contractDate)}` : ""}`
                          : "—"}
                      </Td>
                      <Td align="right">
                        <StatusBadge status={row.status} />
                      </Td>
                    </tr>
                  ))}
                </DataTable>
              </div>

              <div className="space-y-2 md:hidden">
                {filtered.map((row) => (
                  <MobileListItem key={row.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{row.name}</div>
                        <div className="mt-1 text-[12px] text-muted-foreground">{row.specialization ?? "—"}</div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    <dl className="num mt-2.5 grid grid-cols-2 gap-y-1.5 border-t border-border pt-2.5 text-[12px]">
                      <dt className="text-muted-foreground">ИНН</dt>
                      <dd className="text-right">{row.inn ?? "—"}</dd>
                      <dt className="text-muted-foreground">Договор</dt>
                      <dd className="text-right">
                        {row.contractNumber
                          ? `${row.contractNumber}${row.contractDate ? ` от ${formatDate(row.contractDate)}` : ""}`
                          : "—"}
                      </dd>
                    </dl>
                  </MobileListItem>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
