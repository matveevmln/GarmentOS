CREATE TYPE "public"."document_derivative_type" AS ENUM('ocr_text', 'translation', 'structured_data', 'ai_summary');--> statement-breakpoint
CREATE TABLE "document_derivatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"type" "document_derivative_type" NOT NULL,
	"content" jsonb NOT NULL,
	"language" text,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "supersedes_document_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "is_current_version" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "document_derivatives" ADD CONSTRAINT "document_derivatives_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_derivatives_document_idx" ON "document_derivatives" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedes_document_id_documents_id_fk" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_company_current_idx" ON "documents" USING btree ("company_id","is_current_version");--> statement-breakpoint
CREATE INDEX "documents_supersedes_idx" ON "documents" USING btree ("supersedes_document_id");