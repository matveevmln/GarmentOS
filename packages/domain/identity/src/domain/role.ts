// Роль — именованный набор permissions (docs/AUTH_ARCHITECTURE.md, раздел 4).
// companyId=null — глобальная предустановленная роль (сид миграции 0007);
// companyId — кастомная роль конкретной компании. Роли — это данные, не
// перечисление в коде: прикладной код не должен ветвиться по role.code,
// только по наличию конкретного permission у пользователя.
export interface Role {
  id: string;
  companyId: string | null;
  code: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
