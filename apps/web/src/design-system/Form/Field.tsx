import type { ReactNode } from "react";
import { cn } from "../utils";

// Field — подпись + контрол + сообщение об ошибке.
//
// Новый компонент (docs/UI_MIGRATION_PLAN.md, этап 7). В GitHub-прототипе
// формы не реализованы вовсе — там есть только SearchField, задающий
// конвенцию поля (10px радиус, 40/36px высота, 13px текст, утилита
// `field`). Этот компонент не изобретает новый визуальный язык: он
// применяет ту же конвенцию к подписи и переносит её в одно место вместо
// восьми одинаковых <label> с ручными классами на страницах.
//
// `label-unset` обязателен: легаси-правило `label { display:flex;
// flex-direction:column; gap:4px; font-size:.9rem; font-weight:650 }`
// иначе навязывает подписи прежнюю типографику (изоляция в tokens.css,
// уходит на этапе 9).

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  /** Короткое пояснение справа от подписи. */
  hint?: ReactNode;
  /** Сообщение валидации — показывается под контролом. */
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="label-unset flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"
      >
        {label}
        {hint}
      </label>
      {children}
      {error ? <span className="text-[11.5px] font-medium text-danger">{error}</span> : null}
    </div>
  );
}
