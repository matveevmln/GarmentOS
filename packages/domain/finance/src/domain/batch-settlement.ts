// All calculations use integer kopecks. Receipt quantities do not change the
// agreed liability; a shortage needs a separate agreement with the workshop.
export function computeBatchSettlement(
  agreedAmount: number,
  entries: Array<{ direction: string; amount: string | number }>,
  hasUnknownLegacy: boolean,
) {
  const paidCents = entries.reduce(
    (sum, entry) =>
      sum + (entry.direction === "payment" ? 1 : -1) * Math.round(Number(entry.amount) * 100),
    0,
  );
  const balanceCents = Math.round(agreedAmount * 100) - paidCents;
  return {
    netPaid: paidCents / 100,
    outstanding: hasUnknownLegacy ? null : Math.max(0, balanceCents) / 100,
    overpaid: hasUnknownLegacy ? null : Math.max(0, -balanceCents) / 100,
  };
}
