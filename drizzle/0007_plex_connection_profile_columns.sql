ALTER TABLE "app"."plex_connections" RENAME COLUMN "owner_account_id" TO "profile_account_id";--> statement-breakpoint
ALTER TABLE "app"."plex_connections" RENAME COLUMN "plex_username" TO "profile_name";--> statement-breakpoint
ALTER TABLE "app"."plex_connections" ADD COLUMN "is_server_owner" boolean DEFAULT true NOT NULL;
