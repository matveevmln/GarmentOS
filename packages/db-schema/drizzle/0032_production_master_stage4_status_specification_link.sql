CREATE TYPE "public"."numeric_value_preset_kind" AS ENUM('sewing_cost', 'specification_price');--> statement-breakpoint
ALTER TYPE "public"."production_order_status" ADD VALUE 'sewing_completed' BEFORE 'ready_for_pickup';--> statement-breakpoint
ALTER TYPE "public"."production_order_status" ADD VALUE 'shipped_to_fulfillment' BEFORE 'received';--> statement-breakpoint
CREATE TABLE "numeric_value_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" numeric_value_preset_kind NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "legal_address" text;--> statement-breakpoint
ALTER TABLE "specifications" ADD COLUMN "production_order_id" uuid;--> statement-breakpoint
ALTER TABLE "numeric_value_presets" ADD CONSTRAINT "numeric_value_presets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeric_value_presets" ADD CONSTRAINT "numeric_value_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "numeric_value_presets_company_kind_value_currency_idx" ON "numeric_value_presets" USING btree ("company_id","kind","value","currency");--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "specifications_production_order_idx" ON "specifications" USING btree ("production_order_id") WHERE "specifications"."production_order_id" IS NOT NULL;