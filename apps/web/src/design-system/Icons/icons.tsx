/* Иконочный набор GarmentOS — перенесён из утверждённого прототипа
   (matveevmln/garmentos-ea4078f2), docs/UI_MIGRATION_PLAN.md, этап 2.

   Собственный inline-SVG набор, а не иконочная библиотека: единая толщина
   штриха 1.5 и единый viewBox 24, поэтому иконки не «разъезжаются» по весу
   рядом друг с другом. lucide-react остаётся в зависимостях — его точечно
   используют отдельные компоненты (Button-спиннер, ErrorState), заменять
   их в этом этапе не требуется. */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Base>
);
export const IconBatch = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
    <path d="M4 8.5 12 13l8-4.5M12 13v7" />
  </Base>
);
export const IconModel = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4h6l4 2.5-2 3-2-1v11.5H9V8.5l-2 1-2-3z" />
  </Base>
);
export const IconWorkshop = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20V10l5 3V10l5 3V6l6 4v10z" />
  </Base>
);
export const IconMaterial = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M4 9h16M9 4v16" />
  </Base>
);
export const IconPurchase = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5h2l2 10h9l2-7H7" />
    <circle cx="10" cy="19" r="1.2" />
    <circle cx="17" cy="19" r="1.2" />
  </Base>
);
export const IconWarehouse = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10 12 5l9 5v10H3z" />
    <path d="M8 20v-5h8v5" />
  </Base>
);
export const IconSupplier = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 16V9h10v7M13 11h4l3 3v2h-7" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </Base>
);
export const IconDocument = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Base>
);
export const IconFinance = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Base>
);
export const IconStates = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
  </Base>
);
export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);
export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);
export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 9 7 7 7-7" />
  </Base>
);
export const IconChevronLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 5-7 7 7 7" />
  </Base>
);
export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4 3 20h18z" />
    <path d="M12 10v4M12 17h.01" />
  </Base>
);
export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 1.8" />
  </Base>
);
export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
);
export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </Base>
);
export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);
export const IconPanel = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M9 4v16" />
  </Base>
);
export const IconLock = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="10" width="14" height="10" rx="1.5" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
  </Base>
);
export const IconInbox = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 13 6.5 5h11L20 13v6H4z" />
    <path d="M4 13h4l1.5 2.5h5L16 13h4" />
  </Base>
);
export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
  </Base>
);
export const IconMore = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Base>
);
export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 1 0-.6 4" />
    <path d="M20 5v6h-6" />
  </Base>
);
export const IconUser = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Base>
);
