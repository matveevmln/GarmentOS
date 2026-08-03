// GarmentEmptyIllustration — визуальное ревью 2026-08-03 ("качественные
// иллюстрации и пустые экраны"): собственная лёгкая иллюстрация в стиле
// фирменных иконок (stroke-width 1.75, viewBox 24×24, docs/UI_FOUNDATION.md
// раздел 3), не внешняя библиотека иллюстраций (Undraw/Humaaans и т.п. —
// был бы виден чужой стиль поверх собственного визуального языка).
// Стопка карточек с одной приподнятой (намёк на "здесь появятся записи") +
// акцентная точка фирменным цветом — не абстрактная картинка ни о чём.
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 72" className={className} fill="none" aria-hidden="true">
      <rect x="14" y="34" width="68" height="30" rx="10" className="fill-secondary" />
      <rect x="20" y="20" width="56" height="30" rx="10" className="fill-card stroke-border" strokeWidth="1.75" />
      <path d="M30 32h20M30 39h32" className="stroke-muted-foreground/50" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="74" cy="16" r="6" className="fill-accent" />
      <path d="M74 13v6M71 16h6" className="stroke-primary" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
