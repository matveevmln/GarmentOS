CREATE TABLE "batch_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reversal_of_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_payments_amount_positive" CHECK ("batch_payments"."amount" > 0),
	CONSTRAINT "batch_payments_currency_rub" CHECK ("batch_payments"."currency" = 'RUB'),
	CONSTRAINT "batch_payments_direction" CHECK ("batch_payments"."direction" in ('payment', 'refund'))
);
--> statement-breakpoint
CREATE TABLE "receipt_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"before_variants" jsonb NOT NULL,
	"after_variants" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_payments" ADD CONSTRAINT "batch_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_payments" ADD CONSTRAINT "batch_payments_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_payments" ADD CONSTRAINT "batch_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_payments" ADD CONSTRAINT "batch_payments_reversal_of_id_batch_payments_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."batch_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_payments" ADD CONSTRAINT "batch_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_corrections" ADD CONSTRAINT "receipt_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_corrections" ADD CONSTRAINT "receipt_corrections_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_corrections" ADD CONSTRAINT "receipt_corrections_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_corrections" ADD CONSTRAINT "receipt_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_payments_company_order_idx" ON "batch_payments" USING btree ("company_id","production_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_payments_reversal_idx" ON "batch_payments" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_payments_transaction_idx" ON "batch_payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "receipt_corrections_company_order_idx" ON "receipt_corrections" USING btree ("company_id","production_order_id");