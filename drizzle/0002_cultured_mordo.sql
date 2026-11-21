CREATE TABLE "app"."plex_connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."plex_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"user_id" integer NOT NULL,
	"account_token" text NOT NULL,
	"server_token" text NOT NULL,
	"server_machine_id" varchar(64) NOT NULL,
	"server_name" varchar(255) NOT NULL,
	"server_url" text NOT NULL,
	"server_url_override" text,
	"owner_account_id" integer NOT NULL,
	"plex_username" varchar(255) NOT NULL,
	"section_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history_cursor" integer,
	"last_scan_at" timestamp with time zone,
	"last_play_at" timestamp with time zone,
	"last_report" jsonb,
	"token_invalid" boolean DEFAULT false NOT NULL,
	CONSTRAINT "plex_connections_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."plex_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."plex_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"connection_id" integer NOT NULL,
	"rating_key" varchar(32) NOT NULL,
	"kind" varchar(8) NOT NULL,
	"section_id" varchar(32) NOT NULL,
	"parent_rating_key" varchar(32),
	"title_id" integer,
	"season" integer,
	"number" integer,
	"unmatched_reason" varchar(24),
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" integer,
	"expected_view_count" integer,
	"outbound_pending" boolean DEFAULT false NOT NULL,
	CONSTRAINT "plex_items_connection_rating_key_unique" UNIQUE("connection_id","rating_key")
);
--> statement-breakpoint
CREATE TABLE "app"."plex_unmarked" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."plex_unmarked_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"connection_id" integer NOT NULL,
	"rating_key" varchar(32) NOT NULL,
	"title_id" integer NOT NULL,
	"season" integer,
	"number" integer,
	"unmarked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plex_unmarked_connection_rating_key_unique" UNIQUE("connection_id","rating_key")
);
--> statement-breakpoint
CREATE TABLE "app"."plex_unresolved_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."plex_unresolved_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"connection_id" integer NOT NULL,
	"history_id" integer NOT NULL,
	"rating_key" varchar(32) NOT NULL,
	"viewed_at" integer NOT NULL,
	CONSTRAINT "plex_unresolved_history_connection_history_unique" UNIQUE("connection_id","history_id")
);
--> statement-breakpoint
ALTER TABLE "app"."episodes" ADD COLUMN "tmdb_episode_id" integer;--> statement-breakpoint
ALTER TABLE "app"."watches" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."watches" ADD COLUMN "plex_history_id" integer;--> statement-breakpoint
ALTER TABLE "app"."plex_connections" ADD CONSTRAINT "plex_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plex_items" ADD CONSTRAINT "plex_items_connection_id_plex_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."plex_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plex_items" ADD CONSTRAINT "plex_items_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "app"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plex_unmarked" ADD CONSTRAINT "plex_unmarked_connection_id_plex_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."plex_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plex_unmarked" ADD CONSTRAINT "plex_unmarked_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "app"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plex_unresolved_history" ADD CONSTRAINT "plex_unresolved_history_connection_id_plex_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."plex_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episodes_tmdb_episode_id_idx" ON "app"."episodes" USING btree ("tmdb_episode_id");