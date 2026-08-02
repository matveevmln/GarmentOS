// Иконки перенесены дословно (те же id и path) из утверждённого владельцем
// прототипа (apps/prototype/index.html) — единая визуальная система, не
// повторное изобретение (см. обсуждение дизайн-системы Итерации 11).
import type { CSSProperties } from "react";
const ICON_SYMBOLS = `
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11 12 4l8 7"/><path d="M6 10v10h5v-6h2v6h5V10"/></symbol>
  <symbol id="i-factory" viewBox="0 0 24 24"><path d="M3 21V10l5 3.4V10l5 3.4V7l6 4v10H3Z"/><path d="M7 21v-3.5M12 21v-3.5M17 21v-3.5"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15 14.3c2.6.4 4.5 2.6 4.5 5.7"/></symbol>
  <symbol id="i-box" viewBox="0 0 24 24"><path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/></symbol>
  <symbol id="i-building" viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16"/><path d="M12 10h7a1 1 0 0 1 1 1v10"/><path d="M7 8h.01M7 12h.01M7 16h.01M15.5 14h.01M15.5 17h.01"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/></symbol>
  <symbol id="i-cash" viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></symbol>
  <symbol id="i-scissors" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="m20 4-12 12M8 12l12 8M12 12l-2-2"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7"/></symbol>
  <symbol id="i-truck" viewBox="0 0 24 24"><path d="M2.5 7h11v9h-11z"/><path d="M13.5 10h3.6l3.4 3v3h-7z"/><circle cx="7" cy="18.2" r="1.6"/><circle cx="17.5" cy="18.2" r="1.6"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24"><path d="m12.5 3 8 8-9 9-8-8V4h8Z"/><circle cx="8.2" cy="7.8" r="1.4"/></symbol>
  <symbol id="i-file" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/><path d="M9.5 13h5M9.5 16.5h5"/></symbol>
`;

export function IconSpriteDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs dangerouslySetInnerHTML={{ __html: ICON_SYMBOLS }} />
    </svg>
  );
}

export function Icon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} style={style} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
