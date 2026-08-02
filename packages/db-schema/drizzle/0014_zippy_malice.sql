CREATE TYPE "public"."material_stock_movement_type" AS ENUM('receipt', 'consumption', 'adjustment');--> statement-breakpoint
CREATE TABLE "material_stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity_on_hand" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_stock_item_id" uuid NOT NULL,
	"type" "material_stock_movement_type" NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_stock_items" ADD CONSTRAINT "material_stock_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_stock_items" ADD CONSTRAINT "material_stock_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_material_stock_item_id_material_stock_items_id_fk" FOREIGN KEY ("material_stock_item_id") REFERENCES "public"."material_stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_stock_movements" ADD CONSTRAINT "material_stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "material_stock_items_warehouse_material_idx" ON "material_stock_items" USING btree ("warehouse_id","material_id");