CREATE TABLE "production_order_defect_compensations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"defect_id" uuid NOT NULL,
	"compensating_production_order_id" uuid NOT NULL,
	"compensating_variant_id" uuid,
	"quantity" numeric(12, 3) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_defect_compensations_quantity_positive_check" CHECK ("production_order_defect_compensations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"qc_result_id" uuid,
	"product_variant_id" uuid,
	"quantity" numeric(12, 3) NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_defects_quantity_positive_check" CHECK ("production_order_defects"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "production_order_defect_compensations" ADD CONSTRAINT "production_order_defect_compensations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defect_compensations" ADD CONSTRAINT "production_order_defect_compensations_defect_id_production_order_defects_id_fk" FOREIGN KEY ("defect_id") REFERENCES "public"."production_order_defects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defect_compensations" ADD CONSTRAINT "production_order_defect_compensations_compensating_production_order_id_production_orders_id_fk" FOREIGN KEY ("compensating_production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defect_compensations" ADD CONSTRAINT "production_order_defect_compensations_compensating_variant_id_production_order_variants_id_fk" FOREIGN KEY ("compensating_variant_id") REFERENCES "public"."production_order_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defect_compensations" ADD CONSTRAINT "production_order_defect_compensations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defects" ADD CONSTRAINT "production_order_defects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defects" ADD CONSTRAINT "production_order_defects_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defects" ADD CONSTRAINT "production_order_defects_qc_result_id_production_order_qc_results_id_fk" FOREIGN KEY ("qc_result_id") REFERENCES "public"."production_order_qc_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defects" ADD CONSTRAINT "production_order_defects_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_defects" ADD CONSTRAINT "production_order_defects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_order_defect_compensations_defect_idx" ON "production_order_defect_compensations" USING btree ("defect_id");--> statement-breakpoint
CREATE INDEX "production_order_defect_compensations_order_idx" ON "production_order_defect_compensations" USING btree ("compensating_production_order_id");--> statement-breakpoint
CREATE INDEX "production_order_defects_order_idx" ON "production_order_defects" USING btree ("company_id","production_order_id");--> statement-breakpoint
CREATE INDEX "production_order_defects_qc_result_idx" ON "production_order_defects" USING btree ("qc_result_id");