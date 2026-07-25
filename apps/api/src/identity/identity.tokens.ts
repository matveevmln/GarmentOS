// Токены DI для доменных портов Identity (packages/domain/identity —
// application/ports.ts). Сервис зависит от интерфейса (CompanyRepository /
// UserRepository), а не от конкретного Drizzle-класса — конкретная
// инфраструктурная реализация регистрируется один раз здесь, в модуле
// (identity.module.ts), тем же принципом Dependency Inversion, что уже
// применяется внутри packages/domain/*, теперь распространённым и на
// DI-проводку apps/api.
export const COMPANY_REPOSITORY = Symbol("COMPANY_REPOSITORY");
export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
