CREATE TYPE "public"."telegram_invite_target_type" AS ENUM('company', 'workshop');--> statement-breakpoint
CREATE TABLE "telegram_invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"target_type" "telegram_invite_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "telegram_update_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_channel_telegram_update_idx" ON "inbox_items" USING btree ("inbox_channel_id","telegram_update_id");