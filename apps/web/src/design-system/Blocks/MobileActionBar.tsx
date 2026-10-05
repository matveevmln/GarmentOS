import type { ReactNode } from "react";

/** Одна зона действий над навигацией; зарезервированное место не закрывает поля. */
export function MobileActionBar({
  children,
  wizard = false,
}: {
  children: ReactNode;
  wizard?: boolean;
}) {
  return (
    <div className={`seller-action-bar ${wizard ? "seller-action-bar-wizard" : ""}`}>
      <div className="seller-action-inner">{children}</div>
    </div>
  );
}
