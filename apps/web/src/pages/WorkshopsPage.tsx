import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createWorkshopSchema, type CreateWorkshopDto, type WorkshopResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DatePicker } from "../design-system/Form/DatePicker";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { formatDate, formatQuantity } from "../lib/format";
import { SearchBar } from "../design-system/Search/SearchBar";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { ApiError, apiRequest } from "../api/client";

// Активные цеха выбираются в партии автоматически. Архив доступен здесь
// с восстановлением; договорные реквизиты необязательны (ADR 0004).

// Договорная дата хранится в БД строкой (workshops.contract_date — text), а
// DatePicker работает с Date. Обе стороны конвертации — здесь, чтобы формат
// не разъезжался: в API уходит ISO-дата без времени, тот же вид, что уже
// лежит в данных ("2026-04-10").
function toDateValue(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

// Пустая строка в PATCH означает «очистить поле» (см. updateWorkshopSchema),
// поэтому форма редактирования отправляет все поля целиком: незаполненное
// поле должно очищать значение, а не молча сохранять прежнее.
//
// Дата договора намеренно НЕ входит в состояние react-hook-form: zodResolver
// возвращает форме результат разбора схемы, а `createWorkshopSchema` ничего
// не знает о поле типа Date и вырезает его как посторонний ключ — выбранная
// дата молча терялась по пути к отправке (поймано UI-проверкой этапа).
// Поэтому дата живёт отдельным состоянием, а в payload попадает строкой.
const EMPTY_FORM: CreateWorkshopDto = {
  name: "",
  inn: "",
  specialization: "",
  contactInfo: "",
  contractNumber: "",
  contractDate: "",
  paymentTerms: "",
  deliveryMethod: "",
  signerRole: "",
  signerName: "",
};

export function WorkshopsPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<
    WorkshopResponseDto,
    CreateWorkshopDto
  >("/workshops?includeArchived=true");
  const [query, setQuery] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // null — режим создания, иначе правим этот цех той же формой.
  const [editing, setEditing] = useState<WorkshopResponseDto | null>(null);
  const [contractDate, setContractDate] = useState<Date | undefined>(undefined);
  const formRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkshopDto>({
    resolver: zodResolver(createWorkshopSchema),
    defaultValues: EMPTY_FORM,
  });

  // Форма заполняется выбранным цехом и прокручивается в зону видимости:
  // без этого клик по строке внизу таблицы выглядел бы как отсутствие
  // реакции — форма стоит наверху экрана.
  useEffect(() => {
    if (!editing) {
      reset(EMPTY_FORM);
      setContractDate(undefined);
      return;
    }
    reset({
      name: editing.name,
      inn: editing.inn ?? "",
      specialization: editing.specialization ?? "",
      contactInfo: editing.contactInfo ?? "",
      contractNumber: editing.contractNumber ?? "",
      contractDate: editing.contractDate ?? "",
      paymentTerms: editing.paymentTerms ?? "",
      deliveryMethod: editing.deliveryMethod ?? "",
      signerRole: editing.signerRole ?? "",
      signerName: editing.signerName ?? "",
    });
    setContractDate(toDateValue(editing.contractDate));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing, reset]);

  const onSubmit = async (data: CreateWorkshopDto) => {
    const payload = { ...data, contractDate: toIsoDate(contractDate) };
    try {
      if (editing) {
        await apiRequest<WorkshopResponseDto>(`/workshops/${editing.id}`, { method: "PATCH", body: payload });
        await reload();
        setEditing(null);
        toast.success("Карточка цеха обновлена");
        return;
      }
      await create(payload);
      reset(EMPTY_FORM);
      setContractDate(undefined);
      toast.success("Цех добавлен");
    } catch (err) {
      const fallback = editing ? "Не удалось сохранить изменения" : "Не удалось создать цех";
      toast.error(err instanceof ApiError ? err.message : fallback);
    }
  };

  const toggleArchive = async () => {
    if (!editing || archiving) return;
    const archive = editing.status !== "archived";
    if (
      archive &&
      !window.confirm(
        "Убрать цех в архив? Он перестанет предлагаться для новых партий. Текущие партии и документы сохранятся; цех можно восстановить.",
      )
    )
      return;
    setArchiving(true);
    try {
      await apiRequest(`/workshops/${editing.id}`, {
        method: "PATCH",
        body: { status: archive ? "archived" : "active" },
      });
      await reload();
      setEditing(null);
      toast.success(archive ? "Цех убран в архив" : "Цех восстановлен");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setArchiving(false);
    }
  };

  const filtered = useMemo(
    () =>
      items.filter(
        (row) =>
          (showArchive ? row.status === "archived" : row.status === "active") &&
          row.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [items, query, showArchive],
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Цеха"
        subtitle={`${formatQuantity(items.length, "подрядных цехов")} в справочнике`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Цеха" }]} />}
      />

      <Card className="mb-4" ref={formRef}>
        <CardHeader>
          <CardTitle>{editing ? `Карточка цеха: ${editing.name}` : "Новый цех"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
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

            {/* Договор и постоянные условия. Подставляются в спецификацию и
                замораживаются в Snapshot партии при подтверждении заказа —
                поэтому подпись говорит, на что они влияют. */}
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[12px] text-muted-foreground">
                Договор и условия — необязательно для создания партии
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Номер договора">
                  <Input {...register("contractNumber")} placeholder="12" />
                </Field>
                <Field label="Дата договора">
                  <DatePicker value={contractDate} onChange={setContractDate} />
                </Field>
                <Field label="Условия оплаты">
                  <Input {...register("paymentTerms")} placeholder="Предоплата 50%, остаток по приёмке" />
                </Field>
                <Field label="Способ доставки">
                  <Input {...register("deliveryMethod")} placeholder="Самовывоз со склада цеха" />
                </Field>
                <Field label="Должность подписанта">
                  <Input {...register("signerRole")} placeholder="Генеральный директор" />
                </Field>
                <Field label="ФИО подписанта">
                  <Input {...register("signerName")} placeholder="Нормуродов О.А." />
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:self-start">
              {editing && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={archiving}
                  disabled={isSubmitting}
                  onClick={() => void toggleArchive()}
                >
                  {editing.status === "archived" ? "Восстановить цех" : "Убрать цех в архив"}
                </Button>
              )}
              <Button type="submit" size="sm" loading={isSubmitting} disabled={archiving}>
                {editing ? "Сохранить" : isSubmitting ? "Добавляем..." : "Добавить цех"}
              </Button>
              {editing && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(null)}>
                  Отменить
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить цеха" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
          <div className="mb-3">
            <Button
              type="button"
              variant="secondary"
              className="mb-3"
              onClick={() => {
                setShowArchive((value) => !value);
                setEditing(null);
              }}
            >
              {showArchive ? "Показать рабочие цеха" : "Открыть архив цехов"}
            </Button>
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Поиск цеха"
              className="md:w-[340px]"
            />
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
                    <tr key={row.id} onClick={() => setEditing(row)}>
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
                  <MobileListItem key={row.id} onClick={() => setEditing(row)}>
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
