import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  correctReceiptSchema,
  recordBatchPaymentSchema,
  reverseBatchPaymentSchema,
  type BatchPassportResponseDto,
  type BatchSettlementDto,
  type ReceiptCorrectionAvailabilityDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../design-system/Button/Button";
import { NumberInput } from "../design-system/Input/NumberInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../design-system/Modal/Dialog";
import { formatMoney, formatQuantity } from "../lib/format";

const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("payment"), body: recordBatchPaymentSchema }),
  z.object({
    kind: z.literal("reverse"),
    paymentId: z.string().uuid(),
    body: reverseBatchPaymentSchema,
  }),
  z.object({ kind: z.literal("receipt"), body: correctReceiptSchema }),
]);
type Command = z.infer<typeof commandSchema>;

export function BatchOperationsPanel({
  passport: p,
  onChanged,
}: {
  passport: BatchPassportResponseDto;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const storageKey = `garmentos.batch-operation:${user?.companyId}:${user?.id}:${p.id}`;
  const [pending, setPending] = useState<Command | null>(() => {
    try {
      const parsed = commandSchema.safeParse(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  });
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [settlement, setSettlement] = useState<BatchSettlementDto | null>(null);
  const [availability, setAvailability] = useState<ReceiptCorrectionAvailabilityDto | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dialog, setDialog] = useState<"payment" | "receipt" | "reverse" | null>(null);
  const [amount, setAmount] = useState<number | undefined>();
  const [direction, setDirection] = useState<"payment" | "refund">("payment");
  const [note, setNote] = useState("");
  const [reverseId, setReverseId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [expected, setExpected] = useState<Array<{ productVariantId: string; quantity: number }>>(
    [],
  );
  const [showLedger, setShowLedger] = useState(false);
  const reload = async () => {
    const results = await Promise.allSettled([
      apiRequest<BatchSettlementDto>(`/production-orders/${p.id}/settlement`),
      apiRequest<ReceiptCorrectionAvailabilityDto>(`/production-orders/${p.id}/receipt-correction`),
    ]);
    if (results[0].status === "fulfilled") {
      setSettlement(results[0].value);
      setLoadError("");
    } else
      setLoadError(
        results[0].reason instanceof ApiError && results[0].reason.status === 403
          ? "У вашего аккаунта нет доступа к расчётам."
          : "Не удалось загрузить расчёты. Суммы не подставлены.",
      );
    if (results[1].status === "fulfilled") setAvailability(results[1].value);
  };
  useEffect(() => {
    void reload();
  }, [p.id, p.status, p.variants.map((v) => v.receivedQuantity).join(",")]);

  const execute = async (command: Command) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      // Persist the exact request BEFORE sending. After a lost response/reload,
      // only this immutable request may be retried, with the same UUID.
      localStorage.setItem(storageKey, JSON.stringify(command));
      setPending(command);
      const path =
        command.kind === "payment"
          ? "payments"
          : command.kind === "reverse"
            ? `payments/${command.paymentId}/reverse`
            : "receipt-correction";
      await apiRequest(`/production-orders/${p.id}/${path}`, {
        method: "POST",
        body: command.body,
      });
      localStorage.removeItem(storageKey);
      setPending(null);
      setDialog(null);
      setSuccess(
        command.kind === "receipt"
          ? "Приёмка и остатки исправлены. История сохранена."
          : command.kind === "reverse"
            ? "Ошибочная запись отменена. При необходимости запишите правильную сумму."
            : "Платёж записан.",
      );
      await reload();
      onChanged();
    } catch (err) {
      // Definite rejection is safe to edit; transport/5xx remains pending.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        localStorage.removeItem(storageKey);
        setPending(null);
      }
      setError(err instanceof Error ? err.message : "Не удалось подтвердить результат");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const submit = () => {
    const candidate =
      dialog === "receipt"
        ? {
            kind: "receipt",
            body: {
              requestId: crypto.randomUUID(),
              reason: note,
              expectedVariants: expected,
              variants: p.variants.map((v) => ({
                productVariantId: v.productVariantId,
                quantity: quantities[v.productVariantId],
              })),
            },
          }
        : dialog === "reverse"
          ? {
              kind: "reverse",
              paymentId: reverseId,
              body: { requestId: crypto.randomUUID(), reason: note },
            }
          : {
              kind: "payment",
              body: { requestId: crypto.randomUUID(), direction, currency: "RUB", amount, note },
            };
    const parsed = commandSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    void execute(parsed.data);
  };
  const received = p.variants.every((v) => v.receivedQuantity !== null)
    ? p.variants.reduce((n, v) => n + Number(v.receivedQuantity), 0)
    : null;
  const money = (n: number) => formatMoney(n, "₽", 2);
  return (
    <section
      className="mt-4 rounded-xl border border-border bg-card p-4"
      aria-label="Приёмка и расчёты"
    >
      {received !== null && (
        <div className="mb-4 border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Принято <strong className="num">{formatQuantity(received, "шт.")}</strong> из{" "}
              {formatQuantity(Number(p.plannedQuantity), "шт.")}
            </span>
            {availability?.allowed && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || Boolean(pending)}
                onClick={() => {
                  setExpected(
                    p.variants.map((v) => ({
                      productVariantId: v.productVariantId,
                      quantity: Number(v.receivedQuantity),
                    })),
                  );
                  setQuantities(
                    Object.fromEntries(
                      p.variants.map((v) => [v.productVariantId, Number(v.receivedQuantity)]),
                    ),
                  );
                  setNote("");
                  setError("");
                  setDialog("receipt");
                }}
              >
                Исправить приёмку
              </Button>
            )}
          </div>
          {received !== Number(p.plannedQuantity) && (
            <p className="mt-2 text-sm text-warning">
              {received < Number(p.plannedQuantity) ? "Недостача" : "Сверх заказа"}:{" "}
              {formatQuantity(Math.abs(Number(p.plannedQuantity) - received), "шт")}. Сумма
              соглашения с цехом автоматически не меняется.
            </p>
          )}
          {availability && !availability.allowed && (
            <details className="mt-2 text-sm text-muted-foreground">
              <summary className="cursor-pointer">Почему нельзя исправить отдельно?</summary>
              <p className="mt-2">{availability.reason}</p>
            </details>
          )}
        </div>
      )}
      <h2 className="!text-base">Расчёты с цехом</h2>
      {loadError ? (
        <div className="mt-2 text-sm" role="alert">
          {loadError}
          <Button className="mt-2" variant="secondary" onClick={() => void reload()}>
            Повторить загрузку
          </Button>
        </div>
      ) : !settlement ? (
        <p className="mt-2 text-sm text-muted-foreground">Загружаем записанные платежи…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Согласовано {money(settlement.agreedAmount)}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-sm text-muted-foreground">Записано оплаты</dt>
              <dd className="num mt-1 text-xl font-semibold">{money(settlement.netPaid)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {p.status === "cancelled" ? "Расчёт при отмене" : "Осталось оплатить"}
              </dt>
              <dd className="num mt-1 text-xl font-semibold">
                {settlement.outstanding === null ? "Не сверено" : money(settlement.outstanding)}
              </dd>
            </div>
          </dl>
          {p.status === "cancelled" && (
            <p className="mt-2 text-sm text-warning">
              Партия отменена. Обязательства согласуйте с цехом отдельно; отмена не означает возврат
              денег. Здесь можно записать полученный возврат или исправить ошибочную запись.
            </p>
          )}
          {settlement.unclassifiedTransactions > 0 && (
            <p className="mt-2 text-sm text-warning">
              Есть прежние отметки об оплате или операции без указанной валюты. Остаток оплаты
              неизвестен до сверки; не записывайте их повторно.
            </p>
          )}
          {Boolean(settlement.overpaid) && (
            <p className="mt-2 text-sm">
              Переплата: {money(settlement.overpaid!)}. Можно записать возврат от цеха.
            </p>
          )}
          {settlement.canWrite && (
            <Button
              className="mt-3 w-full"
              variant="secondary"
              disabled={busy || Boolean(pending)}
              onClick={() => {
                setAmount(undefined);
                setDirection(p.status === "cancelled" ? "refund" : "payment");
                setNote("");
                setError("");
                setDialog("payment");
              }}
            >
              {p.status === "cancelled" ? "Записать возврат" : "Записать оплату"}
            </Button>
          )}
          {settlement.payments.length > 0 && (
            <>
              <Button
                className="mt-2 w-full"
                variant="ghost"
                onClick={() => setShowLedger(!showLedger)}
                aria-expanded={showLedger}
              >
                История платежей · {settlement.payments.length}
              </Button>
              {showLedger && (
                <ul className="mt-2 divide-y divide-border">
                  {settlement.payments.map((payment) => (
                    <li key={payment.id} className="py-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>
                          {payment.reversalOfId
                            ? "Исправление записи"
                            : payment.direction === "payment"
                              ? "Оплата цеху"
                              : "Возврат от цеха"}{" "}
                          · {money(payment.amount)}
                        </strong>
                        <span className="text-muted-foreground">
                          {payment.reversed ? "Исправлена" : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {new Date(payment.createdAt).toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      {payment.note && <p className="mt-1 break-words">{payment.note}</p>}
                      {settlement.canWrite && !payment.reversalOfId && !payment.reversed && (
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="secondary"
                          disabled={busy || Boolean(pending)}
                          onClick={() => {
                            setReverseId(payment.id);
                            setNote("");
                            setError("");
                            setDialog("reverse");
                          }}
                        >
                          Исправить запись
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {pending && (
        <div className="mt-3 rounded-lg bg-warning/10 p-3 text-sm" role="status">
          <p>
            Результат отправленного действия ещё не подтверждён. Повторная проверка не создаст
            дубль.
          </p>
          <Button className="mt-2 w-full" disabled={busy} onClick={() => void execute(pending)}>
            Проверить и повторить
          </Button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-success" role="status">
          {success}
        </p>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "receipt"
                ? "Исправить приёмку"
                : dialog === "reverse"
                  ? "Исправить запись платежа"
                  : "Записать платёж"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "receipt"
                ? "Укажите правильные количества и причину. Остатки изменятся на разницу. Закрытая партия вернётся на проверку."
                : dialog === "reverse"
                  ? "Оригинал останется в истории. Его влияние на расчёты будет отменено обратной записью; затем можно записать правильную сумму. Это исправление учёта, а не банковский перевод."
                  : "Запишите уже совершённую оплату или возврат. Кнопка не переводит деньги."}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy || Boolean(pending)} className="flex min-w-0 flex-col gap-4">
            {dialog === "payment" && (
              <>
                <label className="text-sm">
                  Операция
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "payment" | "refund")}
                    className="field mt-2 min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base"
                  >
                    {p.status !== "cancelled" && <option value="payment">Оплата цеху</option>}
                    <option value="refund">Возврат от цеха</option>
                  </select>
                </label>
                <label className="text-sm">
                  Сумма, ₽
                  <NumberInput
                    className="mt-2 !min-h-11 !text-base"
                    aria-label="Сумма платежа, ₽"
                    value={amount}
                    onChange={setAmount}
                    decimals={2}
                    min={0}
                  />
                </label>
              </>
            )}
            {dialog === "receipt" && (
              <div className="divide-y divide-border">
                {p.variants.map((v) => (
                  <label
                    key={v.productVariantId}
                    className="grid grid-cols-[1fr_110px] items-center gap-3 py-2 text-sm"
                  >
                    <span>
                      {v.color} · {v.size}
                      <span className="block text-muted-foreground">
                        Было{" "}
                        {expected.find((r) => r.productVariantId === v.productVariantId)?.quantity}{" "}
                        шт.
                      </span>
                    </span>
                    <NumberInput
                      aria-label={`Принято ${v.color} ${v.size}`}
                      className="!min-h-11 !text-base"
                      value={quantities[v.productVariantId]}
                      onChange={(n) =>
                        setQuantities((prev) => ({ ...prev, [v.productVariantId]: n ?? 0 }))
                      }
                      min={0}
                    />
                  </label>
                ))}
              </div>
            )}
            <label className="text-sm">
              {dialog === "payment" ? "Комментарий (необязательно)" : "Причина исправления"}
              <textarea
                aria-label={dialog === "payment" ? "Комментарий платежа" : "Причина исправления"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                className="field mt-2 min-h-20 w-full rounded-lg border border-border bg-card p-3 text-base"
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {pending ? (
            <Button disabled={busy} onClick={() => void execute(pending)}>
              Проверить и повторить
            </Button>
          ) : (
            <Button disabled={busy} onClick={submit}>
              {dialog === "receipt"
                ? "Сохранить исправление"
                : dialog === "reverse"
                  ? "Отменить влияние записи"
                  : "Сохранить платёж"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
