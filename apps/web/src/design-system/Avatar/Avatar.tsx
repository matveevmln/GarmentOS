import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../utils";

// GarmentAvatar — формализует монограм-паттерн, уже использованный в
// ListCard/list-card .thumb (docs/UI_FOUNDATION.md, Tier A). Не Radix Avatar
// (там нет изображений для сущностей ERP — только инициалы/иконка), проще
// собственная реализация с теми же токенами тонов, что StatusBadge.
export type AvatarTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<AvatarTone, string> = {
  accent: "bg-accent text-accent-foreground",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info-tint text-info",
  neutral: "bg-secondary text-muted-foreground",
};

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: AvatarTone;
  size?: "sm" | "md";
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, tone = "neutral", size = "md", children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "flex flex-none items-center justify-center rounded-xl font-extrabold",
        size === "md" ? "h-[42px] w-[42px] text-[13px]" : "h-8 w-8 text-[11px]",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  ),
);
Avatar.displayName = "Avatar";
