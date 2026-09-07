CREATE TYPE "public"."cutting_executor" AS ENUM('in_house', 'workshop');--> statement-breakpoint
CREATE TYPE "public"."cutting_order_status" AS ENUM('draft', 'issued', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "product_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size" text NOT NULL,
	"sort_order" integer NOT NULL,
	"ratio_weight" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutting_order_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cutting_order_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"required_quantity" numeric(12, 3) NOT NULL,
	"allocated_quantity" numeric(12, 3),
	"consumed_quantity" numeric(12, 3),
	"roll_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutting_order_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cutting_order_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"planned_quantity" numeric(12, 3) NOT NULL,
	"actual_quantity" numeric(12, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutting_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "cutting_order_status" DEFAULT 'draft' NOT NULL,
	"executor_type" "cutting_executor" DEFAULT 'in_house' NOT NULL,
	"executor_workshop_id" uuid,
	"issued_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"comment" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_order_materials" ADD CONSTRAINT "cutting_order_materials_cutting_order_id_cutting_orders_id_fk" FOREIGN KEY ("cutting_order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_order_materials" ADD CONSTRAINT "cutting_order_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_order_results" ADD CONSTRAINT "cutting_order_results_cutting_order_id_cutting_orders_id_fk" FOREIGN KEY ("cutting_order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_order_results" ADD CONSTRAINT "cutting_order_results_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_executor_workshop_id_workshops_id_fk" FOREIGN KEY ("executor_workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_sizes_product_size_idx" ON "product_sizes" USING btree ("product_id","size");--> statement-breakpoint
CREATE UNIQUE INDEX "cutting_order_materials_order_material_idx" ON "cutting_order_materials" USING btree ("cutting_order_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cutting_order_results_order_variant_idx" ON "cutting_order_results" USING btree ("cutting_order_id","product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cutting_orders_order_number_idx" ON "cutting_orders" USING btree ("production_order_id","number");