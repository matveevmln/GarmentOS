import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BatchPassportResponseDto } from "@garmentos/shared-types";
import { apiDownload, apiRequest, ApiError } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";

// «Паспорт партии» (владелец проекта, 2026-08-03) — центральный экран
// заказа пошива, утверждённый макет (артефакт "Паспорт партии — макет").
// Порядок блоков — не порядок таблиц в БД, а порядок вопросов владельца
// бренда: деньги → производство → материалы → ОТК → документы → размеры →
// логистика → история (docs/PRINCIPLES.md, принцип 23).
//
// Три раздела макета (Материалы/ОТК/Логистика) намеренно не подключены к
// API — для них нет источника данных (MRP-lite и разделы 4/22 «Баланса
// партии» не реализованы, docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md,
// §26.5) — честные пустые состояния вместо выдуманных нулей.

const STATUS_STEPS: { key: string; label: string }[] = [
  { key: "placed", label: "Размещён" },
  { key: "in_progress", label: "В работе" },
  { key: "ready_for_pickup", label: "Готово к отгрузке" },
  { key: "received", label: "Принято" },
];

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  issued: "Выставлен",
  paid: "Оплачен",
  overdue: "Просрочен",
  cancelled: "Отменён",
};

export function BatchPassportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [passport, setPassport] = useState<BatchPassportResponseDto | null>(null);
  const [error, setError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  if (error) {
    return <ErrorState title="Не удалось загрузить партию" onRetry={load} />;
  }
  if (!passport) return <SkeletonList />;

  const isTerminalStatus = passport.status === "received" || passport.status === "cancelled";
  const currentStepIndex = STATUS_STEPS.findIndex((step) => step.key === passport.status);
  const snapshot = passport.costSnapshot;
  // apiRequest не восстанавливает Date из JSON (createdAt приходит строкой,
  // хотя тип DocumentResponseDto утверждает Date) — сравнение через new
  // Date(...) обязательно, .valueOf() на сырой строке даёт NaN и ломает
  // сортировку молча. Самый свежий документ считается "текущей версией" по
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
  const quantityFor = (color: string, size: string): string | null => {
    const variant = passport.variants.find((row) => row.color === color && row.size === size);
    return variant ? String(Math.round(Number(variant.quantity))) : null;
  };

  const batchSum = snapshot ? snapshot.specificationPricePerUnit * Number(passport.plannedQuantity) : null;
  const costBreakdown = snapshot
    ? [
        { label: "Ткань", value: snapshot.fabricCostPerUnit, color: "#d7263d" },
        { label: "Пошив", value: snapshot.sewingCostPerUnit, color: "#f2a154" },
        { label: "Фурнитура", value: snapshot.trimCostPerUnit, color: "#2563eb" },
        { label: "Упаковка", value: snapshot.packagingCostPerUnit, color: "#16a34a" },
        { label: "Прочее", value: snapshot.otherCostPerUnit, color: "#a0a0a8" },
      ].filter((row) => row.value > 0)
    : [];
  const costTotal = costBreakdown.reduce((sum, row) => sum + row.value, 0);

  return (
    <section className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => void navigate("/production-orders")}
        className="w-fit border-none bg-transparent p-0 text-[0.82rem] font-semibold text-muted-foreground hover:text-foreground"
      >
        ← Заказы пошива
      </button>

      {/* ---------- Заголовок ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{passport.product.name}</h1>
            <StatusBadge status={passport.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.85rem] text-muted-foreground">
            <span>Цех <b className="font-semibold text-foreground">{passport.workshop.name}</b></span>
            {passport.workshop.contractNumber && (
              <span>
                Договор <b className="font-semibold text-foreground">№{passport.workshop.contractNumber}</b>
                {passport.workshop.contractDate && ` от ${formatDate(passport.workshop.contractDate)}`}
              </span>
            )}
            <span>Срок <b className="font-semibold text-foreground">{formatDate(passport.dueDate)}</b></span>
          </div>
        </div>
        {currentDoc && (
          <Button type="button" loading={downloadingId === currentDoc.id} onClick={() => void openDocument(currentDoc.id, currentDoc.title ?? "Спецификация")}>
            Скачать спецификацию
          </Button>
        )}
      </div>

      {passport.daysOverdue !== null && (
        <div className="flex items-center gap-2.5 rounded-[16px] bg-destructive/10 px-4 py-3 text-[0.86rem] font-semibold text-destructive">
          ⏰ Просрочено на {passport.daysOverdue} {passport.daysOverdue === 1 ? "день" : "дней"} — срок сдачи цехом был {formatDate(passport.dueDate)}
        </div>
      )}

      {/* ---------- Экономика партии ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Экономика партии</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!snapshot ? (
            <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
              <p className="text-[0.86rem] font-bold text-foreground">
                {passport.status === "draft" ? "Себестоимость появится после подтверждения" : "Снимок стоимости недоступен"}
              </p>
              <p className="max-w-[420px] text-[0.8rem] leading-relaxed">
                {passport.status === "draft"
                  ? "При подтверждении заказа GarmentOS зафиксирует себестоимость по текущим закупочным ценам — этот снимок больше не изменится, даже если цены вырастут."
                  : "Этот заказ подтверждён до появления Snapshot партии — данные о себестоимости для него не сохранены."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-[16px] bg-secondary p-3.5">
                  <div className="text-[0.72rem] text-muted-foreground">Фактическая себестоимость</div>
                  <div className="text-[1.15rem] font-extrabold tabular-nums">{formatMoney(snapshot.actualCostPerUnit)} ₽<span className="text-[0.7rem] font-normal text-muted-2"> /шт</span></div>
                </div>
                <div className="rounded-[16px] bg-secondary p-3.5">
                  <div className="text-[0.72rem] text-muted-foreground">Цена в спецификации</div>
                  <div className="text-[1.15rem] font-extrabold tabular-nums text-primary">{formatMoney(snapshot.specificationPricePerUnit)} ₽<span className="text-[0.7rem] font-normal text-muted-2"> /шт</span></div>
                </div>
                <div className="rounded-[16px] bg-secondary p-3.5">
                  <div className="text-[0.72rem] text-muted-foreground">Разница (нал.)</div>
                  <div className="text-[1.15rem] font-extrabold tabular-nums">{formatMoney(snapshot.deductionPerUnit)} ₽<span className="text-[0.7rem] font-normal text-muted-2"> /шт</span></div>
                </div>
                <div className="rounded-[16px] bg-secondary p-3.5">
                  <div className="text-[0.72rem] text-muted-foreground">Сумма партии</div>
                  <div className="text-[1.15rem] font-extrabold tabular-nums">{formatMoney(batchSum ?? 0)} ₽</div>
                  <div className="text-[0.7rem] text-muted-2">по спецификации, {Math.round(Number(passport.plannedQuantity))} шт</div>
                </div>
              </div>

              {costBreakdown.length > 0 && (
                <div>
                  <div className="flex h-2.5 overflow-hidden rounded-full">
                    {costBreakdown.map((row) => (
                      <span key={row.label} style={{ width: `${(row.value / costTotal) * 100}%`, background: row.color }} />
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.78rem] text-muted-foreground">
                    {costBreakdown.map((row) => (
                      <span key={row.label} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-[2px]" style={{ background: row.color }} />
                        {row.label} <b className="tabular-nums text-foreground">{formatMoney(row.value)} ₽</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.materialsWithoutPriceHistory.length > 0 && (
                <p className="rounded-[12px] bg-warning-tint px-3 py-2 text-[0.78rem] font-semibold text-warning">
                  Без истории закупочной цены на момент снимка: {snapshot.materialsWithoutPriceHistory.join(", ")} — не учтены в себестоимости.
                </p>
              )}

              <div className="rounded-[16px] bg-secondary p-3.5 text-[0.8rem] leading-relaxed text-muted-foreground">
                {snapshot.paymentTerms}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-[0.78rem] font-bold uppercase tracking-wide text-muted-foreground">Счета по этой партии</div>
                {passport.invoices.length === 0 ? (
                  <p className="text-[0.82rem] text-muted-2">Пока не выставлены.</p>
                ) : (
                  passport.invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between rounded-2xl border border-border px-3 py-2">
                      <span className="text-[0.85rem] font-semibold">{formatMoney(invoice.amount)} ₽</span>
                      <span className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
                        {invoice.dueDate && `до ${formatDate(invoice.dueDate)}`}
                        <span className="status-badge">{INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- Производство ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Производство</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {passport.status === "cancelled" ? (
            <p className="text-[0.85rem] text-muted-foreground">Заказ отменён.</p>
          ) : (
            <div className="flex items-start">
              {STATUS_STEPS.map((step, index) => {
                const done = currentStepIndex >= 0 && index < currentStepIndex;
                const now = index === currentStepIndex || (passport.status === "received" && step.key === "received");
                return (
                  <div key={step.key} className="relative flex flex-1 flex-col items-center">
                    {index > 0 && (
                      <span
                        className="absolute left-[-50%] top-[11px] h-0.5 w-full"
                        style={{ background: done || now ? "var(--color-success)" : "var(--color-border)" }}
                      />
                    )}
                    <span
                      className="z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[0.66rem] font-extrabold"
                      style={
                        done
                          ? { background: "var(--color-success)", borderColor: "var(--color-success)", color: "#fff" }
                          : now
                            ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#fff" }
                            : { background: "var(--color-secondary)", borderColor: "var(--color-border)", color: "var(--color-muted-2)" }
                      }
                    >
                      {done ? "✓" : index + 1}
                    </span>
                    <span className={`mt-1.5 max-w-[100px] text-center text-[0.7rem] ${done || now ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-col items-center gap-1 rounded-[16px] bg-secondary py-6 text-center text-muted-foreground">
            <p className="text-[0.82rem] font-bold text-foreground">Детальный ход кроя и пошива появится здесь</p>
            <p className="max-w-[380px] text-[0.76rem] leading-relaxed">
              Проценты готовности, комментарии и фото от цеха — раздел 19–20 «Баланса производственной партии», ждёт реализации.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Материалы / ОТК / Логистика — честные заглушки ---------- */}
      {[
        { title: "Материалы", hint: "Что уже куплено, что заказано, чего не хватает для кроя — автоматически по BOM и остаткам склада (MRP-lite, раздел 16), ждёт реализации." },
        { title: "ОТК и брак", hint: "Отправлено / принято / брак / устранение — появится после утверждения раздела 4 «Баланса производственной партии»." },
        { title: "Логистика", hint: "Трек Red Express — раздел 22 архитектуры партии, интеграция с перевозчиком." },
      ].map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
              <p className="max-w-[420px] text-[0.8rem] leading-relaxed">{section.hint}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* ---------- Документы ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Документы</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {passport.documents.length === 0 && <p className="text-[0.82rem] text-muted-2">Спецификация ещё не сформирована.</p>}
          {currentDoc && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[0.85rem] font-bold text-foreground">{currentDoc.title ?? currentDoc.docType}</div>
                <div className="text-[0.74rem] text-muted-foreground">
                  Текущая версия · {formatDateTime(currentDoc.createdAt)}
                  {previousDocs.length > 0 && ` · ${previousDocs.length} предыдущих`}
                </div>
              </div>
              <Button type="button" size="sm" loading={downloadingId === currentDoc.id} onClick={() => void openDocument(currentDoc.id, currentDoc.title ?? "Спецификация")}>
                Открыть
              </Button>
            </div>
          )}
          {previousDocs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2.5 opacity-70">
              <div className="min-w-0">
                <div className="truncate text-[0.82rem] font-semibold text-foreground">{doc.title ?? doc.docType}</div>
                <div className="text-[0.74rem] text-muted-foreground">{formatDateTime(doc.createdAt)}</div>
              </div>
              <Button type="button" size="sm" variant="secondary" loading={downloadingId === doc.id} onClick={() => void openDocument(doc.id, doc.title ?? "Спецификация")}>
                Открыть
              </Button>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-3 py-2.5 opacity-50">
            <span className="text-[0.8rem] text-muted-foreground">Счета, накладные, акты</span>
            <span className="text-[0.74rem] text-muted-2">будет добавлено</span>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Размеры и цвета ---------- */}
      {colors.length > 0 && sizes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Размеры и цвета</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[0.82rem]">
              <thead>
                <tr>
                  <th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground"></th>
                  {sizes.map((size) => (
                    <th key={size} className="border-b border-border px-2 py-1.5 text-center font-semibold text-muted-foreground">
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map((color) => (
                  <tr key={color}>
                    <td className="border-b border-border px-2 py-1.5 font-semibold text-foreground">{color}</td>
                    {sizes.map((size) => (
                      <td key={size} className="border-b border-border px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                        {quantityFor(color, size) ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ---------- История ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>История</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3.5 border-l-2 border-border pl-4">
            {passport.timeline.map((event, index) => (
              <div key={index} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
                <div className="text-[0.84rem] font-semibold text-foreground">{event.label}</div>
                <div className="text-[0.74rem] text-muted-foreground">{formatDateTime(event.occurredAt)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isTerminalStatus && (
        <Link to="/production-orders" className="text-center text-[0.82rem] font-semibold text-muted-foreground no-underline hover:text-foreground">
          ← Ко всем заказам пошива
        </Link>
      )}
    </section>
  );
}
