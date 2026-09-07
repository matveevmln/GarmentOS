ALTER TABLE "products" ADD COLUMN "standard_sewing_cost_currency" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "other_production_cost_currency" text;--> statement-breakpoint
-- Обратная совместимость (P1, hardening перед «Стеганкой», владелец проекта,
-- 2026-09-07): costing.service.ts до этой миграции жёстко считал обе суммы в
-- RUB (SEWING_AND_OTHER_CURRENCY = "RUB") — для уже существующих строк с
-- заданной суммой явно фиксируем ровно то же значение, которое раньше
-- подразумевалось кодом, а не оставляем валюту неопределённой.
UPDATE "products" SET "standard_sewing_cost_currency" = 'RUB' WHERE "standard_sewing_cost" IS NOT NULL;--> statement-breakpoint
UPDATE "products" SET "other_production_cost_currency" = 'RUB' WHERE "other_production_cost" IS NOT NULL;