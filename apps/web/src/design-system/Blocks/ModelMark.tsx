// ModelMark — типографический знак модели вместо фотографии. Перенесён из
// утверждённого прототипа дословно (docs/UI_MIGRATION_PLAN.md, этап 3).
//
// Решение прототипа: фото изделия в системе может не быть (модель заводится
// до первой съёмки), а плейсхолдер-картинка занимает место и ничего не
// сообщает. Артикул, набранный крупно, читается и работает как опознавание.
export function ModelMark({ code }: { code: string }) {
  const parts = code.split("-");
  return (
    <div className="relative flex h-[88px] items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted/25">
      <span className="absolute left-0 top-0 h-[2px] w-10 bg-primary/60" />
      <span className="absolute inset-x-3 top-1/2 h-px bg-border" />
      <div className="relative flex flex-col items-center bg-[color-mix(in_oklab,var(--muted)_25%,var(--card))] px-3">
        <span className="num text-[20px] font-semibold tracking-[0.06em]">{parts[0]}</span>
        <span className="num mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {parts[1] ?? ""}
        </span>
      </div>
    </div>
  );
}
