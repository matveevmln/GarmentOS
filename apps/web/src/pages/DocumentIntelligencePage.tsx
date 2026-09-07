import { useEffect, useState } from "react";
import type {
  ConfirmDocumentRequestDto,
  ConfirmDocumentResponseDto,
  DocumentIntelligenceTypeDto,
  ExtractDocumentResponseDto,
  PurchaseCurrency,
  PurchaseOrderResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardTitle } from "../design-system/Card/Card";
import { Button } from "../design-system/Button/Button";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Field } from "../design-system/Form/Field";
import { Input } from "../design-system/Input/Input";
import { NumberInput, MoneyInput } from "../design-system/Input/NumberInput";
import { Textarea } from "../design-system/Textarea/Textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { unitLabel } from "../lib/format";
import { cn } from "../design-system/utils";
import { toast } from "../design-system/Toast/Toast";

// Импорт документов (P6, Document Intelligence, владелец проекта, 2026-09-06).
//
// ВАЖНО: этот экран работает с ТЕКСТОМ документа, не с изображением/PDF.
// Распознавания отсканированных документов (OCR) в системе нет — если у вас
// только скан/фото, откройте его и наберите/скопируйте текст сюда вручную,
// либо перепечатайте нужные строки. Сам файл при желании отдельно
// прикладывается на вкладке «Документы» — это не заменяет и не требует
// извлечения.
//
// Поток: вставить текст → «Извлечь данные» (AI только предлагает, ничего не
// сохраняет) → проверить/поправить → подтвердить (только после этого
// появляются реальные материалы/поставщик/закупка).
const NEW_MATERIAL_VALUE = "__new__";

const MATERIAL_TYPES = [
  { value: "fabric", label: "Ткань" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "accessory", label: "Прочее" },
] as const;
const MATERIAL_UNITS = [
  { value: "m", label: "м (метры)" },
  { value: "kg", label: "кг (килограммы)" },
  { value: "pcs", label: "шт (штуки)" },
] as const;
const CURRENCIES: PurchaseCurrency[] = ["USD", "KGS", "RUB"];

const RECONCILIATION_LABEL: Record<string, string> = {
  match: "Совпадает",
  discrepancy: "Расхождение",
  unknown: "Нельзя проверить",
};

function normalizeCurrency(raw: string | null): PurchaseCurrency | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toUpperCase();
  if (value === "$" || value === "USD") return "USD";
  if (value === "СОМ" || value === "KGS") return "KGS";
  if (value === "₽" || value === "РУБ" || value === "RUB") return "RUB";
  return CURRENCIES.includes(value as PurchaseCurrency) ? (value as PurchaseCurrency) : undefined;
}

interface LineState {
  description: string;
  materialCode: string | null;
  color: string | null;
  // "__new__" — создать новую карточку материала; иначе id существующей.
  materialChoice: string;
  materialName: string;
  materialType: (typeof MATERIAL_TYPES)[number]["value"];
  materialUnit: (typeof MATERIAL_UNITS)[number]["value"];
  matchSource: "ai" | "manual";
  quantity: number | undefined;
  unit: string | null;
  unitPrice: number | undefined;
  packageCount: number | null;
  packageUnit: string | null;
  netWeight: number | null;
  grossWeight: number | null;
  cbm: number | null;
}

export function DocumentIntelligencePage() {
  const [documentType, setDocumentType] = useState<DocumentIntelligenceTypeDto>("invoice");
  const [text, setText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractDocumentResponseDto | null>(null);

  const [supplierMode, setSupplierMode] = useState<"match" | "new">("new");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierMatchSource, setSupplierMatchSource] = useState<"ai" | "manual">("manual");

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderResponseDto[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [currency, setCurrency] = useState<PurchaseCurrency | undefined>(undefined);

  const [lines, setLines] = useState<LineState[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmDocumentResponseDto | null>(null);

  // Пакинг-лист привязывается к уже существующей закупке (обычно созданной
  // подтверждением инвойса той же поставки), а не заводит новую — поэтому
  // список закупок нужен только для него.
  useEffect(() => {
    if (documentType !== "packing_list") return;
    apiRequest<PurchaseOrderResponseDto[]>("/purchase-orders")
      .then(setPurchaseOrders)
      .catch(() => setPurchaseOrders([]));
  }, [documentType]);

  const resetForNewAttempt = () => {
    setExtraction(null);
    setConfirmResult(null);
    setLines([]);
  };

  const runExtraction = async () => {
    if (!text.trim()) return;
    setIsExtracting(true);
    setConfirmResult(null);
    try {
      const result = await apiRequest<ExtractDocumentResponseDto>("/document-intelligence/extract", {
        method: "POST",
        body: { documentType, text },
      });
      setExtraction(result);

      const firstSupplierMatch = result.supplierMatches[0];
      if (firstSupplierMatch) {
        setSupplierMode("match");
        setSupplierId(firstSupplierMatch.id);
        setSupplierMatchSource("ai");
      } else {
        setSupplierMode("new");
        setSupplierName(result.extracted.supplierName ?? "");
        setSupplierMatchSource("manual");
      }
      setCurrency(normalizeCurrency(result.extracted.currency));
      setPurchaseOrderId("");

      setLines(
        result.extracted.lines.map((line, index) => {
          const bestMatch = result.materialMatches[index]?.[0];
          const unit = line.unit?.toLowerCase() ?? null;
          return {
            description: line.description,
            materialCode: line.materialCode,
            color: line.color,
            materialChoice: bestMatch ? bestMatch.id : NEW_MATERIAL_VALUE,
            materialName: line.description,
            materialType: "fabric",
            materialUnit: unit === "kg" ? "kg" : unit === "pcs" || unit === "шт" ? "pcs" : "m",
            matchSource: bestMatch ? "ai" : "manual",
            quantity: line.quantity ?? undefined,
            unit: line.unit,
            unitPrice: line.unitPrice ?? undefined,
            packageCount: line.packageCount,
            packageUnit: line.packageUnit,
            netWeight: line.netWeight,
            grossWeight: line.grossWeight,
            cbm: line.cbm,
          };
        }),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось извлечь данные из текста");
    } finally {
      setIsExtracting(false);
    }
  };

  const updateLine = (index: number, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const materialOptionsFor = (index: number): { id: string; name: string; kind: "exact" | "similar" }[] =>
    extraction?.materialMatches[index] ?? [];

  const canConfirm =
    extraction !== null &&
    lines.length > 0 &&
    (documentType === "invoice"
      ? (supplierMode === "match" && supplierId) || (supplierMode === "new" && supplierName.trim())
      : Boolean(purchaseOrderId)) &&
    lines.every((line) => (line.materialChoice === NEW_MATERIAL_VALUE ? line.materialName.trim().length > 0 : true)) &&
    (documentType !== "invoice" || lines.every((line) => line.quantity !== undefined && line.quantity > 0));

  const submitConfirm = async () => {
    if (!extraction || !canConfirm) return;
    setIsConfirming(true);
    try {
      const body: ConfirmDocumentRequestDto = {
        documentId: extraction.documentId,
        documentType,
        supplier:
          documentType === "invoice"
            ? supplierMode === "match"
              ? { id: supplierId }
              : { name: supplierName.trim() }
            : undefined,
        supplierMatchSource: documentType === "invoice" ? supplierMatchSource : undefined,
        purchaseOrder: documentType === "packing_list" ? { id: purchaseOrderId } : undefined,
        currency: documentType === "invoice" ? currency : undefined,
        lines: lines.map((line) => ({
          material:
            line.materialChoice === NEW_MATERIAL_VALUE
              ? { name: line.materialName.trim(), type: line.materialType, unit: line.materialUnit }
              : { id: line.materialChoice },
          // Пакинг-лист не задаёт закупочное количество — используется
          // ближайшее число мест/веса только для того, чтобы связать материал
          // с документом; сама закупка (цена, объём) уже определена инвойсом.
          quantity:
            documentType === "invoice"
              ? (line.quantity ?? 0)
              : (line.packageCount ?? line.netWeight ?? line.grossWeight ?? 1),
          unitPrice: documentType === "invoice" ? line.unitPrice : undefined,
          matchSource: line.materialChoice === NEW_MATERIAL_VALUE ? "manual" : line.matchSource,
        })),
      };
      const result = await apiRequest<ConfirmDocumentResponseDto>("/document-intelligence/confirm", {
        method: "POST",
        body,
      });
      setConfirmResult(result);
      toast.success("Данные подтверждены", {
        description: "Материалы и закупка сохранены — их можно найти в разделах «Материалы» и «Закупки»",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось подтвердить данные");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1000px]">
      <Breadcrumbs items={[{ label: "Снабжение" }, { label: "Импорт документов" }]} />
      <PageHeader title="Импорт документов" />
      <p className="t-secondary mt-1">
        Вставьте текст инвойса или пакинг-листа — распознавания сканов и фото (OCR) в системе нет, работаем только с
        текстом. Если нужно сохранить сам файл, загрузите его отдельно на вкладке «Документы» партии.
      </p>

      <Card className="mt-4 p-4 md:p-5">
        <CardTitle className="text-[16px]">1. Текст документа</CardTitle>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
          <Field label="Тип документа">
            <Select
              value={documentType}
              onValueChange={(value) => {
                setDocumentType(value as DocumentIntelligenceTypeDto);
                resetForNewAttempt();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Инвойс</SelectItem>
                <SelectItem value="packing_list">Пакинг-лист</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Вставьте текст">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder="Скопируйте сюда текст инвойса или пакинг-листа как есть — с номерами, датой, строками и итогом."
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button type="button" size="sm" loading={isExtracting} disabled={!text.trim()} onClick={() => void runExtraction()}>
            Извлечь данные
          </Button>
        </div>
      </Card>

      {extraction ? (
        <Card className="mt-4 p-4 md:p-5">
          <CardTitle className="text-[16px]">2. Проверьте и подтвердите</CardTitle>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Номер документа">
              <Input value={extraction.extracted.documentNumber ?? "—"} readOnly disabled />
            </Field>
            <Field label="Дата">
              <Input value={extraction.extracted.documentDate ?? "—"} readOnly disabled />
            </Field>
            <Field label="Валюта">
              <Select value={currency ?? ""} onValueChange={(value) => setCurrency(value as PurchaseCurrency)}>
                <SelectTrigger>
                  <SelectValue placeholder="Не определена" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {documentType === "invoice" ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Поставщик">
                <Select
                  value={supplierMode === "match" ? supplierId : NEW_MATERIAL_VALUE}
                  onValueChange={(value) => {
                    if (value === NEW_MATERIAL_VALUE) {
                      setSupplierMode("new");
                      setSupplierMatchSource("manual");
                    } else {
                      setSupplierMode("match");
                      setSupplierId(value);
                      setSupplierMatchSource("ai");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {extraction.supplierMatches.map((match) => (
                      <SelectItem key={match.id} value={match.id}>
                        {match.kind === "exact" ? "Найдено совпадение: " : "Возможное совпадение: "}
                        {match.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_MATERIAL_VALUE}>Создать нового поставщика</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {supplierMode === "new" ? (
                <Field label="Название поставщика">
                  <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
                </Field>
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <Field label="Закупка, к которой относится пакинг-лист">
                <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите закупку (обычно созданную по инвойсу этой же поставки)" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        Закупка от {order.orderedAt}
                        {order.currency ? ` · ${order.currency}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <div className="mt-5">
            <h3 className="t-section">Строки</h3>
            <div className="mt-2 space-y-3">
              {lines.map((line, index) => (
                <div key={`${line.description}-${index}`} className="rounded-[10px] border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="t-object">{line.description}</span>
                    <span className="t-meta text-muted-foreground">
                      {line.materialCode ? `Код: ${line.materialCode}` : null}
                      {line.color ? ` · Цвет: ${line.color}` : null}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Материал">
                      <Select
                        value={line.materialChoice}
                        onValueChange={(value) =>
                          updateLine(index, { materialChoice: value, matchSource: value === NEW_MATERIAL_VALUE ? "manual" : "ai" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {materialOptionsFor(index).map((match) => (
                            <SelectItem key={match.id} value={match.id}>
                              {match.kind === "exact" ? "Найдено совпадение: " : "Возможное совпадение: "}
                              {match.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={NEW_MATERIAL_VALUE}>Создать новый материал</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {materialOptionsFor(index).length === 0 && line.materialChoice === NEW_MATERIAL_VALUE ? (
                      <p className="t-meta self-end text-muted-foreground">Совпадений не найдено — создаётся новый материал</p>
                    ) : null}
                  </div>

                  {line.materialChoice === NEW_MATERIAL_VALUE ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Название материала">
                        <Input value={line.materialName} onChange={(event) => updateLine(index, { materialName: event.target.value })} />
                      </Field>
                      <Field label="Тип">
                        <Select value={line.materialType} onValueChange={(value) => updateLine(index, { materialType: value as LineState["materialType"] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MATERIAL_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Ед. измерения">
                        <Select value={line.materialUnit} onValueChange={(value) => updateLine(index, { materialUnit: value as LineState["materialUnit"] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MATERIAL_UNITS.map((unit) => (
                              <SelectItem key={unit.value} value={unit.value}>
                                {unit.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  ) : null}

                  {documentType === "invoice" ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label={`Количество${line.unit ? `, ${unitLabel(line.unit)}` : ""}`}>
                        <NumberInput value={line.quantity} onChange={(value) => updateLine(index, { quantity: value })} min={0} decimals={2} />
                      </Field>
                      <Field label="Цена за единицу">
                        <MoneyInput currency={currency ?? "USD"} value={line.unitPrice} onChange={(value) => updateLine(index, { unitPrice: value })} />
                      </Field>
                      <div className="flex flex-col justify-end">
                        <span className="t-meta text-muted-foreground">Сумма по строке</span>
                        <span className="t-value">
                          {line.quantity !== undefined && line.unitPrice !== undefined
                            ? (line.quantity * line.unitPrice).toFixed(2)
                            : "—"}{" "}
                          {currency ?? ""}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <dl className="num mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                      <div>
                        <dt className="t-meta text-muted-foreground">Мест</dt>
                        <dd>{line.packageCount ?? "—"} {line.packageUnit ?? ""}</dd>
                      </div>
                      <div>
                        <dt className="t-meta text-muted-foreground">Вес нетто</dt>
                        <dd>{line.netWeight ?? "—"} кг</dd>
                      </div>
                      <div>
                        <dt className="t-meta text-muted-foreground">Вес брутто</dt>
                        <dd>{line.grossWeight ?? "—"} кг</dd>
                      </div>
                      <div>
                        <dt className="t-meta text-muted-foreground">CBM</dt>
                        <dd>{line.cbm ?? "—"}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              ))}
            </div>
          </div>

          {extraction.reconciliation.length > 0 ? (
            <div className="mt-5">
              <h3 className="t-section">Проверка</h3>
              <div className="num mt-2 overflow-x-auto rounded-[10px] border border-border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-2 font-normal">Показатель</th>
                      <th className="p-2 font-normal">Сумма по строкам</th>
                      <th className="p-2 font-normal">В документе</th>
                      <th className="p-2 font-normal">Разница</th>
                      <th className="p-2 font-normal">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.reconciliation.map((field) => (
                      <tr key={field.label} className="border-b border-border last:border-0">
                        <td className="p-2">{field.label}</td>
                        <td className="p-2">{field.sumOfLines}</td>
                        <td className="p-2">{field.statedTotal ?? "—"}</td>
                        <td className="p-2">{field.difference ?? "—"}</td>
                        <td className="p-2">
                          <span
                            className={cn(
                              "eyebrow rounded-full px-2 py-0.5",
                              field.status === "match" && "bg-success/10 text-success",
                              field.status === "discrepancy" && "bg-danger/10 text-danger",
                              field.status === "unknown" && "bg-muted text-muted-foreground",
                            )}
                          >
                            {RECONCILIATION_LABEL[field.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="t-meta mt-2 text-muted-foreground">
                Это проверка, а не исправление: при расхождении ни строки, ни итог документа не меняются — решение
                остаётся за вами.
              </p>
            </div>
          ) : null}

          <div className="mt-5">
            <Button type="button" loading={isConfirming} disabled={!canConfirm} onClick={() => void submitConfirm()}>
              Подтвердить
            </Button>
          </div>

          {confirmResult ? (
            <div className="mt-4 rounded-[10px] border border-success/25 bg-success/[0.06] p-3 text-[13px]">
              Сохранено: {confirmResult.materialIds.length} материал(ов){confirmResult.supplierId ? ", новый поставщик" : ""},
              закупка создана/обновлена. Проверьте разделы «Материалы» и «Закупки».
            </div>
          ) : null}
        </Card>
      ) : (
        <div className="mt-4">
          <EmptyState
            compact
            title="Извлечённые данные появятся здесь"
            description="Вставьте текст документа выше и нажмите «Извлечь данные»."
          />
        </div>
      )}
    </div>
  );
}
