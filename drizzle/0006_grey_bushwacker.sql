ALTER TABLE "app"."titles" ADD COLUMN "original_name" varchar(500);--> statement-breakpoint
ALTER TABLE "app"."titles" ADD COLUMN "alternative_names" jsonb;