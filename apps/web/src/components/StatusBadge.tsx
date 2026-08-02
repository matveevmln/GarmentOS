const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлено",
  confirmed: "Подтверждено",
  placed: "Размещён",
  in_progress: "В работе",
  ready_for_pickup: "Готово к отгрузке",
  received: "Принято",
  cancelled: "Отменено",
  approved: "Утверждено",
  archived: "В архиве",
};

const STATUS_TONES: Record<string, string> = {
  draft: "tone-warning",
  sent: "tone-info",
  confirmed: "tone-info",
  placed: "tone-accent",
  in_progress: "tone-accent",
  ready_for_pickup: "tone-warning",
  received: "tone-success",
  cancelled: "tone-danger",
  approved: "tone-success",
  archived: "",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "";
  return <span className={`status-badge ${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}
