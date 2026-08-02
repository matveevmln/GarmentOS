CREATE TYPE "public"."audit_source" AS ENUM('http_api', 'cli', 'telegram', 'ai');--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "source" "audit_source" DEFAULT 'http_api' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "inbox_suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_inbox_suggestion_id_inbox_suggestions_id_fk" FOREIGN KEY ("inbox_suggestion_id") REFERENCES "public"."inbox_suggestions"("id") ON DELETE no action ON UPDATE no action;