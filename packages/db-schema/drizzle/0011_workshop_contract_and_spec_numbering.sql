ALTER TABLE "workshops" ADD COLUMN "contract_number" text;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "contract_date" text;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "next_specification_number" integer DEFAULT 1 NOT NULL;