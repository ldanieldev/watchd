ALTER TABLE "app"."watches" ADD COLUMN "plex_server_machine_id" varchar(64);--> statement-breakpoint
ALTER TABLE "app"."plex_unresolved_history" ADD COLUMN "section_id" varchar(32);--> statement-breakpoint
CREATE INDEX "watches_user_plex_history_idx" ON "app"."watches" USING btree ("user_id","plex_history_id");