ALTER TABLE "companies" ADD COLUMN "next_production_order_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "specification_id" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "order_number" integer;--> statement-breakpoint
ALTER TABLE "cutting_order_materials" ADD COLUMN "returned_quantity" numeric(12, 3);--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_company_order_number_idx" ON "production_orders" USING btree ("company_id","order_number") WHERE "production_orders"."order_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "production_orders_specification_idx" ON "production_orders" USING btree ("specification_id");--> statement-breakpoint
-- FK добавлен вручную (не через drizzle .references()): specification.ts
-- импортирует workshops ИЗ contract-manufacturing.ts, поэтому обратный
-- импорт specifications в contract-manufacturing.ts создал бы циклическую
-- зависимость между файлами schema/*.ts. Ограничение целостности всё равно
-- обеспечивается на уровне БД.
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_specification_id_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."specifications"("id") ON DELETE no action ON UPDATE no action;