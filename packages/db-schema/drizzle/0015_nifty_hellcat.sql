CREATE INDEX "production_orders_company_status_due_idx" ON "production_orders" USING btree ("company_id","status","due_date");--> statement-breakpoint
CREATE INDEX "stock_movements_stock_item_occurred_idx" ON "stock_movements" USING btree ("stock_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_company_occurred_idx" ON "audit_log" USING btree ("company_id","occurred_at");