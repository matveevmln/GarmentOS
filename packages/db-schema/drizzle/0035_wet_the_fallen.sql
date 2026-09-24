CREATE TYPE "public"."sewing_order_status" AS ENUM('draft', 'placed', 'cancelled');--> statement-breakpoint
CREATE TABLE "sewing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workshop_id" uuid,
	"number" integer,
	"status" "sewing_order_status" DEFAULT 'draft' NOT NULL,
	"draft_payload" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"client_request_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "next_sewing_order_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "sewing_order_id" uuid;--> statement-breakpoint
ALTER TABLE "sewing_orders" ADD CONSTRAINT "sewing_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sewing_orders" ADD CONSTRAINT "sewing_orders_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sewing_orders" ADD CONSTRAINT "sewing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sewing_orders_company_number_idx" ON "sewing_orders" USING btree ("company_id","number") WHERE "sewing_orders"."number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sewing_orders_company_client_request_idx" ON "sewing_orders" USING btree ("company_id","client_request_id") WHERE "sewing_orders"."client_request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sewing_orders_company_status_idx" ON "sewing_orders" USING btree ("company_id","status");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_sewing_order_id_sewing_orders_id_fk" FOREIGN KEY ("sewing_order_id") REFERENCES "public"."sewing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_sewing_order_product_idx" ON "production_orders" USING btree ("sewing_order_id","product_id") WHERE "production_orders"."sewing_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "production_orders_sewing_order_idx" ON "production_orders" USING btree ("sewing_order_id");