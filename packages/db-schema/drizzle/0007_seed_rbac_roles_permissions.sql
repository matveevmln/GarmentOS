-- Сид глобальных предустановленных ролей и прав (docs/AUTH_ARCHITECTURE.md,
-- разделы 4-6, утверждено владельцем проекта 2026-07-25). Роли/права — это
-- данные, не константы в прикладном коде (см. документ, раздел 4): этот сид
-- задаёт начальное состояние, конкретная компания может переопределить его
-- под себя кастомной ролью (roles.company_id != NULL), не правкой этого
-- файла. Хэндрайтен, как и 0005_document_immutability_trigger.sql —
-- drizzle-kit generate не умеет генерировать DML (INSERT), только DDL.

INSERT INTO "roles" ("company_id", "code", "name") VALUES
  (NULL, 'owner', 'Владелец'),
  (NULL, 'director', 'Директор'),
  (NULL, 'accountant', 'Бухгалтер'),
  (NULL, 'procurement_manager', 'Менеджер закупок'),
  (NULL, 'marketplace_manager', 'Менеджер маркетплейсов'),
  (NULL, 'warehouse_keeper', 'Кладовщик'),
  (NULL, 'viewer', 'Просмотр');
--> statement-breakpoint

-- Формат кода права: <module>.<action> (docs/AUTH_ARCHITECTURE.md, раздел 5).
-- 11 модулей × read/write (22) + bom.approve = 23 права.
INSERT INTO "permissions" ("code", "module") VALUES
  ('identity.read', 'identity'),
  ('identity.write', 'identity'),
  ('catalog.read', 'catalog'),
  ('catalog.write', 'catalog'),
  ('procurement.read', 'procurement'),
  ('procurement.write', 'procurement'),
  ('bom.read', 'bom'),
  ('bom.write', 'bom'),
  ('bom.approve', 'bom'),
  ('contract_manufacturing.read', 'contract_manufacturing'),
  ('contract_manufacturing.write', 'contract_manufacturing'),
  ('warehouse.read', 'warehouse'),
  ('warehouse.write', 'warehouse'),
  ('sales.read', 'sales'),
  ('sales.write', 'sales'),
  ('marketplace_integration.read', 'marketplace_integration'),
  ('marketplace_integration.write', 'marketplace_integration'),
  ('honest_sign.read', 'honest_sign'),
  ('honest_sign.write', 'honest_sign'),
  ('finance.read', 'finance'),
  ('finance.write', 'finance'),
  ('notifications.read', 'notifications'),
  ('notifications.write', 'notifications');
--> statement-breakpoint

-- Матрица permissions по ролям (docs/AUTH_ARCHITECTURE.md, раздел 6).
-- notifications.* намеренно не назначается ни одной роли — доступ к
-- уведомлениям определяется владением записью (userId), а не ролью
-- (документ, раздел 7) — контроллер проверяет только аутентификацию.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r, "permissions" p
WHERE r.company_id IS NULL AND (
  (r.code = 'owner' AND p.code NOT IN ('notifications.read', 'notifications.write'))
  OR (r.code = 'director' AND p.code NOT IN ('notifications.read', 'notifications.write', 'identity.read', 'identity.write'))
  OR (r.code = 'accountant' AND p.code IN (
    'catalog.read', 'procurement.read', 'bom.read', 'contract_manufacturing.read',
    'warehouse.read', 'sales.read', 'honest_sign.read', 'finance.read', 'finance.write'
  ))
  OR (r.code = 'procurement_manager' AND p.code IN (
    'catalog.read', 'procurement.read', 'procurement.write', 'bom.read',
    'contract_manufacturing.read', 'contract_manufacturing.write', 'warehouse.read'
  ))
  OR (r.code = 'marketplace_manager' AND p.code IN (
    'catalog.read', 'catalog.write', 'warehouse.read', 'sales.read', 'sales.write',
    'marketplace_integration.read', 'marketplace_integration.write'
  ))
  OR (r.code = 'warehouse_keeper' AND p.code IN (
    'catalog.read', 'procurement.read', 'contract_manufacturing.read', 'warehouse.read',
    'warehouse.write', 'sales.read', 'honest_sign.read', 'honest_sign.write'
  ))
  OR (r.code = 'viewer' AND p.code IN (
    'catalog.read', 'procurement.read', 'bom.read', 'contract_manufacturing.read',
    'warehouse.read', 'sales.read', 'marketplace_integration.read', 'honest_sign.read', 'finance.read'
  ))
);
