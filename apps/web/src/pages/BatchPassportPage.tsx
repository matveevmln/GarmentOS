import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { BatchPassportResponseDto } from "@garmentos/shared-types";
import { apiDownload, apiRequest, ApiError } from "../api/client";
import { Card, CardTitle, SectionLabel } from "../design-system/Card/Card";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Button } from "../design-system/Button/Button";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { IconAlert } from "../design-system/Icons/icons";
import {
  Accordion,
  CostBreakdown,
  DocumentRow,
  MoneyBlock,
  ProductionStepper,
  Timeline,
  isProductionStage,
  type CostRow,
} from "../design-system/Blocks";
import { statusMeta } from "../lib/status";
import { formatDate, formatMoney, formatQuantity } from "../lib/format";
import { cn } from "../design-system/utils";
import { toast } from "../design-system/Toast/Toast";

// «Паспорт партии» — центральный экран заказа пошива.
//
// Композиция перенесена из GitHub-прототипа (`matveevmln/garmentos-ea4078f2`,
// PassportScreen) — единого источника визуальной истины
// (docs/UI_MIGRATION_PLAN.md §0, этап 5): шапка с хлебными крошками →
// тёмная полоса идентичности → деньги + «требует внимания» →
// производственная шкала → детали (табы на десктопе, аккордеоны на
// мобильном).
//
// Данные и действия — только реальные, из `GET /production-orders/:id/passport`
// и `GET /documents/:id/file`. Mock-файл прототипа не используется, новых
// метрик и статусов не вводится.
//
// Три раздела (Материалы/ОТК/Логистика) остаются честными пустыми
// состояниями: агрегировать их не из чего, пока не утверждены разделы
// 16/4/22 docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md. В прототипе им
// соответствия нет, поэтому они показаны отдельными карточками через
// перенесённый EmptyState, а не выдуманной вкладкой с нулями.

type TabKey = "cost" | "docs" | "colors" | "contract" | "history";

const TABS: { key: TabKey; label: string }[] = [
  { key: "cost", label: "Себестоимость" },
  { key: "docs", label: "Документы" },
  { key: "colors", label: "Размеры и цвета" },
  { key: "contract", label: "Договор" },
  { key: "history", label: "История" },
];


export function BatchPassportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [passport, setPassport] = useState<BatchPassportResponseDto | null>(null);
  const [error, setError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("cost");

  const load = () => {
    if (!id) return;
    setError(false);
    apiRequest<BatchPassportResponseDto>(`/production-orders/${id}/passport`)
      .then(setPassport)
      .catch(() => setError(true));
  };

  useEffect(load, [id]);

  const openDocument = async (docId: string, title: string) => {
    setDownloadingId(docId);
    try {
      const blob = await apiDownload(`/documents/${docId}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Не удалось открыть «${title}»`);
    } finally {
      setDownloadingId(null);
    }
  };

  if (error) return <ErrorState title="Не удалось загрузить партию" onRetry={load} />;
  if (!passport) return <SkeletonList />;

  const snapshot = passport.costSnapshot;
  const plannedQuantity = Math.round(Number(passport.plannedQuantity));

  // apiRequest не восстанавливает Date из JSON (createdAt приходит строкой,
  // хотя тип DocumentResponseDto утверждает Date) — сравнение через new
  // Date(...) обязательно, .valueOf() на сырой строке даёт NaN и ломает
  // сортировку молча. Самый свежий документ считается «текущей версией» по
  // факту, а не по isCurrentVersion — на сегодня повторная генерация
  // спецификации создаёт независимый документ, не новую версию через
  // supersedesDocumentId (известный пробел, не в объёме этой задачи).
  const sortedDocuments = [...passport.documents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const [currentDoc, ...previousDocs] = sortedDocuments;

  // Матрица размер×цвет — союз всех размеров/цветов в порядке первого
  // появления (не предполагаем, что у каждого цвета один и тот же набор
  // размеров — реальные данные могут быть неравномерными).
  const colors: string[] = [];
  const sizes: string[] = [];
  for (const variant of passport.variants) {
    if (!colors.includes(variant.color)) colors.push(variant.color);
    if (!sizes.includes(variant.size)) sizes.push(variant.size);
  }
  const quantityFor = (color: string, size: string): number | null => {
    const variant = passport.variants.find((row) => row.color === color && row.size === size);
    return variant ? Math.round(Number(variant.quantity)) : null;
  };

  const batchSum = snapshot ? snapshot.specificationPricePerUnit * plannedQuantity : null;

  // Строки себестоимости — те же пять статей, что показывались и раньше;
  // доля считается от их суммы, а не вводится как новая величина.
  const rawCost = snapshot
    ? [
        { label: "Ткань", unitCost: snapshot.fabricCostPerUnit },
        { label: "Пошив", unitCost: snapshot.sewingCostPerUnit },
        { label: "Фурнитура", unitCost: snapshot.trimCostPerUnit },
        { label: "Упаковка", unitCost: snapshot.packagingCostPerUnit },
        { label: "Прочее", unitCost: snapshot.otherCostPerUnit },
      ].filter((row) => row.unitCost > 0)
    : [];
  const costUnitTotal = rawCost.reduce((sum, row) => sum + row.unitCost, 0);
  const costRows: CostRow[] = rawCost.map((row) => ({
    label: row.label,
    unitCost: row.unitCost,
    total: row.unitCost * plannedQuantity,
    share: costUnitTotal > 0 ? Math.round((row.unitCost / costUnitTotal) * 100) : 0,
  }));

  const renderTab = (key: TabKey) => {
    if (key === "cost") {
      if (!snapshot) {
        return (
          <EmptyState
            compact
            title={
              passport.status === "draft"
                ? "Себестоимость появится после подтверждения"
                : "Снимок стоимости недоступен"
            }
            description={
              passport.status === "draft"
                ? "При подтверждении заказа GarmentOS зафиксирует себестоимость по текущим закупочным ценам — этот снимок больше не изменится, даже если цены вырастут."
                : "Этот заказ подтверждён до появления Snapshot партии — данные о себестоимости для него не сохранены."
            }
          />
        );
      }
      return (
        <div>
          <div className="num mb-3 text-[11px] text-muted-foreground">
            Snapshot зафиксирован: {formatDate(snapshot.capturedAt)} · больше не пересчитывается
          </div>
          {costRows.length > 0 ? (
            <CostBreakdown
              rows={costRows}
              total={{
                label: "Себестоимость факт",
                unitCost: snapshot.actualCostPerUnit,
                total: snapshot.actualCostPerUnit * plannedQuantity,
              }}
            />
          ) : null}

          {snapshot.materialsWithoutPriceHistory.length > 0 && (
            <p className="mt-4 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] font-medium text-warning">
              Без истории закупочной цены на момент снимка:{" "}
              {snapshot.materialsWithoutPriceHistory.join(", ")} — не учтены в себестоимости.
            </p>
          )}

          <div className="mt-4">
            <SectionLabel>Счета по этой партии</SectionLabel>
            {passport.invoices.length === 0 ? (
              <p className="t-meta mt-2">Пока не выставлены.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-[10px] border border-border px-3">
                {passport.invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="num text-[13px] font-medium">{formatMoney(invoice.amount, "сом", 2)}</span>
                    <span className="flex items-center gap-2">
                      {invoice.dueDate ? (
                        <span className="num text-[11px] text-muted-foreground">до {formatDate(invoice.dueDate)}</span>
                      ) : null}
                      <StatusBadge status={invoice.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    if (key === "docs") {
      if (passport.documents.length === 0) {
        return (
          <EmptyState
            compact
            title="Спецификация ещё не сформирована"
            description="Документы партии появятся здесь после генерации спецификации."
          />
        );
      }
      return (
        <div className="divide-y divide-border">
          {currentDoc ? (
            <DocumentRow
              title={currentDoc.title ?? currentDoc.docType}
              version="Актуальная"
              format="PDF"
              date={currentDoc.createdAt}
              onOpen={() => void openDocument(currentDoc.id, currentDoc.title ?? "Спецификация")}
            />
          ) : null}
          {previousDocs.map((doc) => (
            <DocumentRow
              key={doc.id}
              title={doc.title ?? doc.docType}
              format="PDF"
              date={doc.createdAt}
              onOpen={() => void openDocument(doc.id, doc.title ?? "Спецификация")}
            />
          ))}
        </div>
      );
    }

    if (key === "colors") {
      if (colors.length === 0 || sizes.length === 0) {
        return (
          <EmptyState compact title="Размеры не заданы" description="В заказе нет ни одного SKU с размером и цветом." />
        );
      }
      return (
        <div className="space-y-4">
          {colors.map((color) => (
            <div key={color}>
              <SectionLabel>{color}</SectionLabel>
              {/* Три колонки — как в прототипе; при большем числе размеров
                  ячейки переносятся на следующую строку. */}
              <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-border bg-border">
                {sizes.map((size) => (
                  <div key={size} className="bg-card px-3 py-2.5 text-center">
                    <div className="num text-[11px] text-muted-foreground">{size}</div>
                    <div className="num mt-1 text-[16px] font-semibold">{quantityFor(color, size) ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (key === "contract") {
      // Все поля — из снимка партии (productionOrderCostSnapshotSchema);
      // до этого экрана они доезжали, но не показывались.
      if (!snapshot) {
        return (
          <EmptyState
            compact
            title="Условия договора не зафиксированы"
            description="Реквизиты договора сохраняются в снимке партии при подтверждении заказа."
          />
        );
      }
      return (
        <dl className="grid grid-cols-1 gap-y-2.5 text-[13px] sm:grid-cols-[180px_1fr]">
          <dt className="text-muted-foreground">Договор</dt>
          <dd className="num">
            {snapshot.contractNumber} от {formatDate(snapshot.contractDate)}
          </dd>
          <dt className="text-muted-foreground">Заказчик</dt>
          <dd>{snapshot.customerName}</dd>
          <dt className="text-muted-foreground">Исполнитель</dt>
          <dd>{snapshot.contractorName}</dd>
          <dt className="text-muted-foreground">Доставка</dt>
          <dd>{snapshot.deliveryMethod}</dd>
          <dt className="text-muted-foreground">Условия оплаты</dt>
          <dd>{snapshot.paymentTerms}</dd>
        </dl>
      );
    }

    return passport.timeline.length > 0 ? (
      <Timeline
        items={passport.timeline.map((event) => ({
          title: event.label,
          date: event.occurredAt,
        }))}
      />
    ) : (
      <EmptyState compact title="Событий пока нет" description="История заказа наполняется по мере его прохождения." />
    );
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Заказы пошива", onClick: () => void navigate("/production-orders") },
              { label: passport.product.name },
            ]}
          />
        }
        title={passport.product.name}
        subtitle={
          <span className="num">
            {passport.workshop.name} · {formatQuantity(plannedQuantity, "изделий")} · срок{" "}
            {formatDate(passport.dueDate)}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void navigate("/production-orders")}>
              К списку
            </Button>
            {currentDoc ? (
              <Button
                size="sm"
                loading={downloadingId === currentDoc.id}
                onClick={() => void openDocument(currentDoc.id, currentDoc.title ?? "Спецификация")}
              >
                Скачать спецификацию
              </Button>
            ) : null}
          </>
        }
      />

      {/* 1. Идентичность */}
      <section className="elev-2 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[10px] bg-sidebar bg-[linear-gradient(180deg,color-mix(in_oklab,var(--sidebar-primary)_9%,transparent)_0%,transparent_60%)] px-4 py-4 text-sidebar-foreground md:px-5">
        <div className="flex items-center gap-3">
          <div>
            <div className="editorial text-[17px] leading-tight">{passport.product.name}</div>
            <div className="text-[12px] text-sidebar-foreground/60">{passport.workshop.name}</div>
          </div>
        </div>
        <div className="h-8 w-px bg-sidebar-border max-md:hidden" />
        <div>
          <div className="eyebrow text-sidebar-foreground/50">Количество</div>
          <div className="num mt-1 text-[14px] font-medium">{formatQuantity(plannedQuantity, "изделий")}</div>
        </div>
        <div className="ml-auto inline-flex items-center gap-2 rounded-[4px] border border-sidebar-border bg-sidebar-accent px-2.5 py-1.5 text-[12px] font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
          {statusMeta(passport.status).label}
        </div>
      </section>

      {/* 2. Деньги + 4. Требует внимания */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="px-4 pt-4 md:px-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[16px]">Деньги</CardTitle>
              <span className="t-meta shrink-0">по партии</span>
            </div>
          </div>
          {snapshot ? (
            <div className="mt-2 grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-card">
                <MoneyBlock
                  label="Сумма партии"
                  value={batchSum ?? 0}
                  sub={`по спецификации, ${formatQuantity(plannedQuantity, "шт")}`}
                />
              </div>
              <div className="bg-card">
                <MoneyBlock
                  label="Цена в спецификации"
                  value={snapshot.specificationPricePerUnit}
                  decimals={2}
                  sub="за единицу"
                />
              </div>
              <div className="bg-card">
                <MoneyBlock
                  label="Себестоимость факт"
                  value={snapshot.actualCostPerUnit}
                  decimals={2}
                  sub="за единицу"
                />
              </div>
              <div className="bg-card">
                <MoneyBlock
                  label="Разница (нал.)"
                  value={snapshot.deductionPerUnit}
                  decimals={2}
                  sub="за единицу"
                  tone="warning"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-5">
              <EmptyState
                compact
                title={
                  passport.status === "draft"
                    ? "Себестоимость появится после подтверждения"
                    : "Снимок стоимости недоступен"
                }
                description={
                  passport.status === "draft"
                    ? "При подтверждении заказа GarmentOS зафиксирует себестоимость по текущим закупочным ценам."
                    : "Этот заказ подтверждён до появления Snapshot партии."
                }
              />
            </div>
          )}
        </Card>

        {/* Слот «Требует внимания» из прототипа. В apps/web единственный
            реальный повод для тревоги на этом экране — просрочка срока
            сдачи; сумма неоплаченного счёта здесь не считается, чтобы не
            вводить метрику, которой в системе нет. */}
        {passport.daysOverdue !== null ? (
          <Card className="border-warning/30 bg-warning/[0.03] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[16px]">Требует внимания</CardTitle>
              <span className="t-meta shrink-0">1 позиция</span>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-warning/[0.1] text-warning">
                <IconAlert size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">Просрочен срок сдачи цехом</div>
                <div className="num mt-1 text-[20px] font-semibold text-warning">
                  {passport.daysOverdue} дн.
                </div>
                <div className="num mt-1 text-[11px] text-muted-foreground">
                  срок был {formatDate(passport.dueDate)}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[16px]">Требует внимания</CardTitle>
            </div>
            <p className="t-secondary mt-3">Срок сдачи не нарушен.</p>
          </Card>
        )}
      </div>

      {/* 3. Производство */}
      <Card className="mt-4 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[16px]">Производство</CardTitle>
          <span className="t-meta shrink-0">5 этапов</span>
        </div>
        <div className="mt-4">
          {isProductionStage(passport.status) ? (
            <ProductionStepper current={passport.status} />
          ) : (
            <p className="t-secondary">Заказ отменён — партия вышла из производственной шкалы.</p>
          )}
        </div>
        <div className="mt-4">
          <EmptyState
            compact
            title="Детальный ход кроя и пошива появится здесь"
            description="Проценты готовности, комментарии и фото от цеха — разделы 19-20 «Баланса производственной партии», ждёт реализации."
          />
        </div>
      </Card>

      {/* 5. Детали — табы на десктопе */}
      <div className="mt-4 hidden md:block">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "btn-unset interactive relative -mb-px h-9 rounded-t-[6px] px-3 text-[13px]",
                  tab === t.key
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-primary transition-[opacity,transform] duration-200",
                    tab === t.key ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                  )}
                />
              </button>
            ))}
          </div>
          <div key={tab} className="anim-content p-5">
            {renderTab(tab)}
          </div>
        </Card>
      </div>

      {/* 5. Детали — аккордеоны на мобильном */}
      <div className="mt-4 space-y-2 md:hidden">
        {TABS.map((t, i) => (
          <Accordion key={t.key} title={t.label} defaultOpen={i === 0}>
            {renderTab(t.key)}
          </Accordion>
        ))}
      </div>

      {/* Разделы без источника данных. В прототипе им соответствия нет —
          показываем честные пустые состояния, а не выдуманные нули. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          {
            title: "Материалы",
            hint: "Что уже куплено, что заказано, чего не хватает для кроя — автоматически по BOM и остаткам склада (MRP-lite, раздел 16), ждёт реализации.",
          },
          {
            title: "ОТК и брак",
            hint: "Отправлено / принято / брак / устранение — появится после утверждения раздела 4 «Баланса производственной партии».",
          },
          {
            title: "Логистика",
            hint: "Трек Red Express — раздел 22 архитектуры партии, интеграция с перевозчиком.",
          },
        ].map((section) => (
          <Card key={section.title} className="p-4 md:p-5">
            <CardTitle className="text-[16px]">{section.title}</CardTitle>
            <div className="mt-3">
              <EmptyState compact title="Раздел ещё не подключён" description={section.hint} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
