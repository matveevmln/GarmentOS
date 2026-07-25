// Право — гранулярная возможность действия в модуле, код формата
// `<module>.<action>` (docs/AUTH_ARCHITECTURE.md, раздел 5). Глобальный
// справочник — не привязан к компании, засевается миграцией 0007.
export interface Permission {
  id: string;
  code: string;
  module: string;
  createdAt: Date;
  updatedAt: Date;
}
