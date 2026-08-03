import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSupplierSchema, type CreateSupplierDto, type SupplierResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../design-system/ListCard/ListCard";
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
    <section className="flex flex-col gap-5">
      <h1>Поставщики</h1>

      <Card>
        <CardHeader>
          <CardTitle>Новый поставщик</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Название
              <Input {...register("name")} placeholder="Оксфорд Текстиль" />
              {errors.name && <span className="text-[0.8rem] font-semibold text-destructive">{errors.name.message}</span>}
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Тип
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
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              ИНН
              <Input {...register("inn")} />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Контакты
              <Input {...register("contactInfo")} />
            </label>

            <Button type="submit" loading={isSubmitting}>
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
          <SearchBar value={query} onChange={setQuery} placeholder="Поиск поставщика" />
          <FilterTabs options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />

          <ListCard
            items={items
              .filter((row) => typeFilter === "all" || row.type === typeFilter)
              .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
            getKey={(row) => row.id}
            getIcon={(row) => SUPPLIER_ICONS[row.type] ?? "box"}
            getTitle={(row) => row.name}
            getMeta={(row) =>
              `${SUPPLIER_TYPES.find((t) => t.value === row.type)?.label ?? row.type}${row.inn ? ` · ИНН ${row.inn}` : ""}`
            }
            getTrailing={(row) => <StatusBadge status={row.status} />}
            emptyTitle="Пока нет ни одного поставщика"
            emptyHint="Добавьте первого поставщика — займёт меньше минуты."
            emptyActionLabel="Добавить поставщика"
            onEmptyAction={() => setFocus("name")}
          />
        </>
      )}
    </section>
  );
}
