import { formatDate } from "../../lib/format";

// Timeline — хронология событий по сущности (кто и когда что сделал).
// Оформление перенесено из утверждённого прототипа дословно
// (docs/UI_MIGRATION_PLAN.md, этап 3): вертикальная линия слева, точки-узлы.
//
// Отличие от прототипа: `date` принимает ISO-строку из API (аудит-лог
// отдаёт timestamp) и форматируется внутри.
export interface TimelineItem {
  title: string;
  date: string | Date;
  /** Кто выполнил действие. */
  by?: string | null;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ml-1 border-l border-border pl-5">
      {items.map((it, i) => (
        <li key={`${it.title}-${i}`} className="relative pb-4 last:pb-0">
          <span className="absolute -left-[23px] top-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          <div className="text-[13px]">{it.title}</div>
          <div className="num mt-0.5 text-[11px] text-muted-foreground">
            {[formatDate(it.date), it.by].filter(Boolean).join(" · ")}
          </div>
        </li>
      ))}
    </ol>
  );
}
