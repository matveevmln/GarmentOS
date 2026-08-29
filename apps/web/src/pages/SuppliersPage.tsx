import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSupplierSchema, type CreateSupplierDto, type SupplierResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { formatQuantity } from "../lib/format";
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { SearchBar } from "../design-system/Search/SearchBar";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { ApiError } from "../api/client";

// Второй из 7 перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md, задача #72).
// Тип поставщика — Select (не Combobox): 4 варианта, поиск по такому
// короткому списку не нужен (docs/DESIGN_SYSTEM_MAP.md §3.3 — Combobox
// оправдан при росте справочника, здесь список фиксирован и мал).
const SUPPLIER_TYPES = [
  { value: "fabric", label: "Ткань" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "logistics", label: "Перевозчик" },
] as const;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  SUPPLIER_TYPES.map((type) => [type.value, type.label]),
);

const TYPE_FILTERS: FilterOption<"all" | (typeof SUPPLIER_TYPES)[number]["value"]>[] = [
  { value: "all", label: "Все" },
  ...SUPPLIER_TYPES.map((type) => ({ value: type.value, label: type.label })),
];

export function SuppliersPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<SupplierResponseDto, CreateSupplierDto>(
    "/suppliers",
  );
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateSupplierDto>({ resolver: zodResolver(createSupplierSchema), defaultValues: { type: "fabric" } });

  const visibleSuppliers = items
    .filter((row) => typeFilter === "all" || row.type === typeFilter)
    .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));

  const onSubmit = async (data: CreateSupplierDto) => {
    try {
      await create(data);
      reset({ type: "fabric" });
      toast.success("Поставщик добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать поставщика");
    }
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Поставщики"
        subtitle={`${formatQuantity(items.length, "поставщиков")} в справочнике`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Поставщики" }]} />}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Новый поставщик</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Название" error={errors.name?.message}>
              <Input {...register("name")} placeholder="Оксфорд Текстиль" />
            </Field>

            <Field label="Тип">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPLIER_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="ИНН">
              <Input {...register("inn")} />
            </Field>

            <Field label="Контакты">
              <Input {...register("contactInfo")} />
            </Field>
            </div>

            <Button type="submit" size="sm" loading={isSubmitting} className="md:self-start">
              {isSubmitting ? "Добавляем..." : "Добавить поставщика"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить поставщиков" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
          <div className="mb-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <SearchBar value={query} onChange={setQuery} placeholder="Поиск поставщика" className="md:w-[340px]" />
            <FilterTabs options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
          </div>

          {visibleSuppliers.length === 0 ? (
            <EmptyState
              compact
              title={items.length === 0 ? "Пока нет ни одного поставщика" : "Ничего не найдено"}
              description={
                items.length === 0
                  ? "Добавьте первого поставщика — займёт меньше минуты."
                  : "По заданным условиям поиска и фильтрам поставщиков нет."
              }
              action={
                items.length === 0 ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setFocus("name")}>
                    Добавить поставщика
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
                    { key: "type", label: "Тип", width: "170px" },
                    { key: "inn", label: "ИНН", width: "150px" },
                    { key: "status", label: "Статус", align: "right", width: "150px" },
                  ]}
                >
                  {visibleSuppliers.map((row) => (
                    <tr key={row.id} className="cursor-default">
                      <Td className="t-object">{row.name}</Td>
                      <Td className="text-muted-foreground">{TYPE_LABEL[row.type] ?? row.type}</Td>
                      <Td className="num text-muted-foreground">{row.inn ?? "—"}</Td>
                      <Td align="right">
                        <StatusBadge status={row.status} />
                      </Td>
                    </tr>
                  ))}
                </DataTable>
              </div>

              <div className="space-y-2 md:hidden">
                {visibleSuppliers.map((row) => (
                  <MobileListItem key={row.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{row.name}</div>
                        <div className="mt-1 text-[12px] text-muted-foreground">
                          {TYPE_LABEL[row.type] ?? row.type}
                        </div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="num mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[12px]">
                      <span className="text-muted-foreground">ИНН</span>
                      <span>{row.inn ?? "—"}</span>
                    </div>
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
