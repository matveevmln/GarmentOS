-- Отмена заказа пошива (владелец проекта, 2026-09-22) — своё право, отдельное
-- от обычного contract_manufacturing.write, того же класса риска, что и
-- contract_manufacturing.rollback (миграция 0033): отмена каскадно закрывает
-- спецификацию/раскройные задания и необратима для самого заказа. По
-- умолчанию — только owner/director, тот же принцип, что и rollback/
-- bom.approve/specification.approve (право более высокого доверия отдельно
-- от write).
--
-- Хэндрайтен, как 0007/0027/0033 — drizzle-kit generate не умеет
-- генерировать DML.

INSERT INTO "permissions" ("code", "module") VALUES
  ('contract_manufacturing.cancel', 'contract_manufacturing');
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r, "permissions" p
WHERE r.company_id IS NULL AND p.code = 'contract_manufacturing.cancel'
  AND r.code IN ('owner', 'director');
