-- Права модуля Specification (владелец проекта, 2026-09-11 — «Production
-- Master»): спецификация — самостоятельная бизнес-сущность, отдельная от
-- production_orders, поэтому получает собственный модуль прав, а не
-- переиспользует contract_manufacturing.*. specification.approve — то же
-- разделение read/write/approve, что уже есть у bom (approve = отдельное
-- право от write, единственный жёсткий кросс-модульный инвариант BOM;
-- специфика spec: approve необратимо замораживает Snapshot и коммитит
-- реальную сумму/предоплату — тот же уровень ответственности).
--
-- Хэндрайтен, как и 0007_seed_rbac_roles_permissions.sql — drizzle-kit
-- generate не умеет генерировать DML (INSERT), только DDL.

INSERT INTO "permissions" ("code", "module") VALUES
  ('specification.read', 'specification'),
  ('specification.write', 'specification'),
  ('specification.approve', 'specification');
--> statement-breakpoint

-- Матрица ролей — тот же принцип, что 0007: owner/director получают все
-- права модуля (кроме identity, уже исключённого у director); роли, уже
-- имевшие contract_manufacturing.write (procurement_manager), получают
-- specification.read/write, но не approve — как procurement_manager сегодня
-- имеет bom.read, но не bom.approve. accountant/viewer — только read
-- (финансовая видимость сумм/предоплаты, без права создавать/утверждать).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r, "permissions" p
WHERE r.company_id IS NULL AND (
  (r.code = 'owner' AND p.code IN ('specification.read', 'specification.write', 'specification.approve'))
  OR (r.code = 'director' AND p.code IN ('specification.read', 'specification.write', 'specification.approve'))
  OR (r.code = 'procurement_manager' AND p.code IN ('specification.read', 'specification.write'))
  OR (r.code = 'accountant' AND p.code IN ('specification.read'))
  OR (r.code = 'viewer' AND p.code IN ('specification.read'))
);
