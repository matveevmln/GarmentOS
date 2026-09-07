import { IconDocument, IconDownload } from "../Icons/icons";
import { VersionBadge } from "../StatusBadge/StatusBadge";
import { formatDate } from "../../lib/format";

// DocumentRow — строка документа в списке (инвойс, спецификация, накладная).
// Оформление перенесено из утверждённого прототипа дословно
// (docs/UI_MIGRATION_PLAN.md, этап 3).
//
// Отличие от прототипа: `date` принимает ISO-строку из API и форматируется
// внутри, а не приходит уже готовой подписью (docs/UI_MIGRATION_PLAN.md §3).
export function DocumentRow({
  title,
  version,
  format,
  date,
  onOpen,
}: {
  title: string;
  /** Подпись версии («Актуальная», «v2»). Оригинал документа неизменяем —
   *  новая редакция это новая строка (docs/PRINCIPLES.md, принцип 19). */
  version?: string | null;
  /** Формат файла: PDF, XLSX, JPG. */
  format?: string;
  date?: string | Date | null;
  onOpen?: () => void;
}) {
  const meta = [format, date ? formatDate(date) : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[44px] w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-muted/50 text-muted-foreground">
        <IconDocument size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="num mt-0.5 block text-[11px] text-muted-foreground">{meta || "—"}</span>
      </span>
      {version ? <VersionBadge label={version} /> : null}
      <IconDownload size={14} className="ml-1 shrink-0 text-muted-foreground" />
    </button>
  );
}
