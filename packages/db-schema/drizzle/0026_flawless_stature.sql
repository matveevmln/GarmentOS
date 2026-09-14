CREATE TYPE "public"."specification_status" AS ENUM('draft', 'approved', 'cancelled');--> statement-breakpoint
CREATE TABLE "specification_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specification_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"sum" numeric(14, 2) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"spec_number" integer,
	"status" "specification_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"based_on_specification_id" uuid,
	"delivery_deadline" date,
	"total_quantity" numeric(12, 3) NOT NULL,
	"total_sum" numeric(14, 2) NOT NULL,
	"total_sum_currency" text DEFAULT 'RUB' NOT NULL,
	"prepayment_amount" numeric(14, 2),
	"snapshot_json" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "specification_items" ADD CONSTRAINT "specification_items_specification_id_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."specifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specification_items" ADD CONSTRAINT "specification_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_based_on_specification_id_specifications_id_fk" FOREIGN KEY ("based_on_specification_id") REFERENCES "public"."specifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "specifications_workshop_number_idx" ON "specifications" USING btree ("workshop_id","spec_number") WHERE "specifications"."spec_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "specifications_company_status_idx" ON "specifications" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "specifications_based_on_idx" ON "specifications" USING btree ("based_on_specification_id");