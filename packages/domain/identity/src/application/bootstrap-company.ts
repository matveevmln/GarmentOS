import type { CreateCompanyInput } from "./create-company";
import { createUser } from "./create-user";
import { assignRoleToUser, resolveRole } from "./manage-user-roles";
import { assertValidCompanyName } from "../domain/company";
import { DomainError } from "../domain/errors";
import type { Company } from "../domain/company";
import type { User } from "../domain/user";
import type { CompanyRepository, NewCompanyInput, RoleRepository, UserRepository, UserRoleRepository } from "./ports";

// Единственная точка входа для initial-бутстрапа компании
// (apps/api/src/bootstrap-company.script.ts, docs/AUTH_ARCHITECTURE.md,
// раздел 9). Отличается от обычного createCompany() тем, что безопасна для
// повторного/параллельного запуска с тем же bootstrapKey — см. аудит
// идемпотентности bootstrap перед первой реальной production-компанией.
// Обычный createCompany остаётся отдельной, не изменённой функцией — её
// использует будущий multi-company onboarding, где bootstrapKey не нужен.
export interface BootstrapCompanyInput {
  bootstrapKey: string;
  company: CreateCompanyInput;
  ownerEmail: string;
  ownerFullName: string;
  ownerPasswordHash: string;
  ownerRoleCode: string;
}

export interface BootstrapCompanyDeps {
  companies: CompanyRepository;
  users: UserRepository;
  roles: RoleRepository;
  userRoles: UserRoleRepository;
}

// created — этим вызовом создано всё с нуля (первый настоящий запуск).
// resumed — компания для этого bootstrapKey уже существовала (частично
//   незавершённый предыдущий запуск), этим вызовом безопасно дозаполнено
//   недостающее (owner и/или роль) — но НЕ создана вторая компания.
// already_initialized — bootstrap для этого ключа уже полностью завершён
//   этим же owner-email раньше; ничего не изменено, вызов безопасен.
export type BootstrapCompanyResult =
  | { outcome: "created"; company: Company; owner: User }
  | { outcome: "resumed"; company: Company; owner: User }
  | { outcome: "already_initialized"; company: Company; owner: User }
  | { outcome: "owner_mismatch"; company: Company; existingOwnerEmail: string };

// Та же нормализация полей, что и обычный createCompany() (create-company.ts)
// — продублирована намеренно, а не вызвана через него: createCompany()
// вызывает deps.companies.create() напрямую и не подходит для
// ON CONFLICT-вставки ниже. Обычный createCompany() этим не затронут.
function normalizeCompanyInput(input: CreateCompanyInput): NewCompanyInput {
  const name = input.name.trim();
  assertValidCompanyName(name);

  return {
    name,
    legalName: input.legalName?.trim() ?? null,
    inn: input.inn?.trim() ?? null,
    timezone: input.timezone ?? "UTC",
    defaultCurrency: input.defaultCurrency ?? "KGS",
    signerName: input.signerName?.trim() ?? null,
  };
}

export async function bootstrapCompany(
  deps: BootstrapCompanyDeps,
  input: BootstrapCompanyInput,
): Promise<BootstrapCompanyResult> {
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const normalizedCompany = normalizeCompanyInput(input.company);

  // Атомарная попытка "создать компанию для этого bootstrapKey". Возвращает
  // null при конфликте (partial unique index на companies.bootstrap_key) —
  // это НЕ ошибка, а сигнал "кто-то (этот же или параллельный запуск) уже
  // прошёл этот шаг", обрабатываемый ниже как resume, а не выброшенное
  // исключение — check-then-act здесь намеренно не используется вообще,
  // единственная защита от гонки — сам INSERT ... ON CONFLICT в репозитории.
  const createdCompany = await deps.companies.createIfAbsentByBootstrapKey(input.bootstrapKey, normalizedCompany);

  if (createdCompany) {
    const owner = await createUser(
      { users: deps.users },
      { companyId: createdCompany.id, email: ownerEmail, passwordHash: input.ownerPasswordHash, fullName: input.ownerFullName },
    );
    await assignRoleToUser(
      { users: deps.users, roles: deps.roles, userRoles: deps.userRoles },
      { companyId: createdCompany.id, userId: owner.id, roleCode: input.ownerRoleCode },
    );
    return { outcome: "created", company: createdCompany, owner };
  }

  // Конфликт — компания для этого bootstrapKey уже существует. Найти её
  // обязано получиться (уникальный индекс гарантирует, что конфликт возможен
  // только если строка реально есть) — иначе это несогласованное состояние,
  // которое не должно тихо продолжаться дальше.
  const company = await deps.companies.findByBootstrapKey(input.bootstrapKey);
  if (!company) {
    throw new DomainError(
      "Bootstrap conflict detected, but the company row could not be found. Manual verification required.",
      "BOOTSTRAP_INCONSISTENT_STATE",
    );
  }

  const role = await resolveRole({ users: deps.users, roles: deps.roles, userRoles: deps.userRoles }, company.id, input.ownerRoleCode);
  const existingHolderIds = await deps.userRoles.findUserIdsWithRole(company.id, role.id);

  if (existingHolderIds.length > 0) {
    const existingOwner = await deps.users.findById(company.id, existingHolderIds[0]);
    if (!existingOwner) {
      throw new DomainError(
        "Bootstrap conflict detected: role is assigned but the owner user row is missing. Manual verification required.",
        "BOOTSTRAP_INCONSISTENT_STATE",
      );
    }

    // Ключевое правило безопасности (аудит, раздел 2): другой email у уже
    // назначенного владельца НИКОГДА не считается "успешно завершённым" и
    // НИКОГДА не создаёт второго owner — только явная остановка с понятной
    // причиной. Ничего не меняем, не удаляем, не "чиним" автоматически.
    if (existingOwner.email !== ownerEmail) {
      return { outcome: "owner_mismatch", company, existingOwnerEmail: existingOwner.email };
    }

    return { outcome: "already_initialized", company, owner: existingOwner };
  }

  // Роль ещё никому не назначена в этой компании — возможно, предыдущий
  // запуск прервался между созданием компании и созданием owner (сценарий A)
  // либо между созданием owner и назначением роли (сценарий B, тот же
  // email). Оба случая безопасно дозавершить: createUser сам бросит понятную
  // ошибку, если пользователь с этим email уже есть в компании, но роль ему
  // не назначена по какой-то другой причине — тогда ветка ниже не выполнит
  // повторную вставку, а findByEmail найдёт существующего.
  const existingUserByEmail = await deps.users.findByEmail(company.id, ownerEmail);
  const owner =
    existingUserByEmail ??
    (await createUser(
      { users: deps.users },
      { companyId: company.id, email: ownerEmail, passwordHash: input.ownerPasswordHash, fullName: input.ownerFullName },
    ));

  await assignRoleToUser(
    { users: deps.users, roles: deps.roles, userRoles: deps.userRoles },
    { companyId: company.id, userId: owner.id, roleCode: input.ownerRoleCode },
  );

  return { outcome: "resumed", company, owner };
}
