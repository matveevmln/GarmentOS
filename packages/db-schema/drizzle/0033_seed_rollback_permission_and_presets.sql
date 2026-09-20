-- ПРОМПТ №2.1/№3 (владелец проекта) — узкий корректирующий механизм отката
-- статуса производственного заказа получает СВОЁ право, отдельное от
-- обычного contract_manufacturing.write, потому что откат — операция
-- другого класса риска (исправление ошибки, не рядовое действие оператора).
-- По умолчанию — только owner/director, тот же принцип, что и bom.approve/
-- specification.approve (право более высокого доверия отдельно от write).
--
-- Хэндрайтен, как и 0007/0027 — drizzle-kit generate не умеет генерировать DML.

INSERT INTO "permissions" ("code", "module") VALUES
  ('contract_manufacturing.rollback', 'contract_manufacturing');
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r, "permissions" p
WHERE r.company_id IS NULL AND p.code = 'contract_manufacturing.rollback'
  AND r.code IN ('owner', 'director');
--> statement-breakpoint

-- Сид пресетов (ПРОМПТ №3, раздел 5) — стартовые значения, доступные каждой
-- компании сразу, без ручного добавления первого варианта. Company-scoped
-- таблица, поэтому сеется по каждой уже существующей компании (для новых
-- компаний, созданных позже, соответствующий use case должен подставлять те
-- же стартовые значения при первом обращении, если пресетов ещё нет —
-- см. preset.service.ts).
INSERT INTO "numeric_value_presets" ("company_id", "kind", "value", "currency")
SELECT c.id, v.kind::numeric_value_preset_kind, v.value::numeric, v.currency
FROM "companies" c
CROSS JOIN (VALUES
  ('sewing_cost', 350, 'KGS'),
  ('sewing_cost', 380, 'KGS'),
  ('sewing_cost', 450, 'KGS'),
  ('specification_price', 700, 'RUB')
) AS v(kind, value, currency)
ON CONFLICT DO NOTHING;
