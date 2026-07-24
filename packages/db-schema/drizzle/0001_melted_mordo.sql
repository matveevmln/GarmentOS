CREATE TYPE "public"."partner_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."inbox_channel_type" AS ENUM('telegram', 'whatsapp', 'wechat', 'email', 'upload');--> statement-breakpoint
CREATE TYPE "public"."inbox_item_status" AS ENUM('new', 'processing', 'suggested', 'confirmed', 'rejected', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."inbox_suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'edited_and_accepted');--> statement-breakpoint
ALTER TYPE "public"."production_order_status" ADD VALUE 'draft' BEFORE 'placed';--> statement-breakpoint
CREATE TABLE "inbox_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "inbox_channel_type" NOT NULL,
	"external_identifier" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"inbox_channel_id" uuid NOT NULL,
	"source_identifier" text,
	"raw_text" text,
	"file_url" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "inbox_item_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_item_id" uuid NOT NULL,
	"suggestion_type" text NOT NULL,
	"extracted_data" jsonb,
	"suggested_entity_type" text,
	"suggested_entity_id" uuid,
	"confidence" numeric(3, 2),
	"status" "inbox_suggestion_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "status" "partner_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "status" "partner_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_channels" ADD CONSTRAINT "inbox_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_inbox_channel_id_inbox_channels_id_fk" FOREIGN KEY ("inbox_channel_id") REFERENCES "public"."inbox_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_suggestions" ADD CONSTRAINT "inbox_suggestions_inbox_item_id_inbox_items_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_suggestions" ADD CONSTRAINT "inbox_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" DROP COLUMN "is_active";