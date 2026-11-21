CREATE TABLE "app"."episodes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."episodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"title_id" integer NOT NULL,
	"season" smallint NOT NULL,
	"number" smallint NOT NULL,
	"air_date" varchar(10),
	"name" varchar(500),
	"overview" text,
	"still_path" varchar(255),
	"runtime_minutes" smallint,
	CONSTRAINT "episodes_title_season_number_unique" UNIQUE("title_id","season","number")
);
--> statement-breakpoint
CREATE TABLE "app"."titles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."titles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"kind" varchar(8) NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" varchar(500) NOT NULL,
	"first_aired" varchar(10),
	"poster_path" varchar(255),
	"backdrop_path" varchar(255),
	"runtime_minutes" smallint,
	"is_anime" boolean DEFAULT false NOT NULL,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"studios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"network" varchar(255),
	"cast" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"crew" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail" jsonb,
	"tmdb_status" varchar(64),
	"enrichment_state" varchar(16) DEFAULT 'pending' NOT NULL,
	"enriched_at" timestamp,
	"enrichment_error" text,
	CONSTRAINT "titles_kind_tmdb_unique" UNIQUE("kind","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "app"."user_titles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."user_titles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"user_id" integer NOT NULL,
	"title_id" integer NOT NULL,
	"type_override" varchar(8),
	"held_status" varchar(8),
	CONSTRAINT "user_titles_user_title_unique" UNIQUE("user_id","title_id")
);
--> statement-breakpoint
CREATE TABLE "app"."watches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."watches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"user_id" integer NOT NULL,
	"title_id" integer NOT NULL,
	"season" smallint,
	"number" smallint,
	"watched_at" timestamp with time zone NOT NULL,
	"watched_minute" timestamp NOT NULL,
	"minutes_watched" smallint,
	"source" varchar(16) NOT NULL,
	CONSTRAINT "watches_dedup" UNIQUE NULLS NOT DISTINCT("user_id","title_id","season","number","watched_minute")
);
--> statement-breakpoint
ALTER TABLE "app"."episodes" ADD CONSTRAINT "episodes_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "app"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_titles" ADD CONSTRAINT "user_titles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_titles" ADD CONSTRAINT "user_titles_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "app"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."watches" ADD CONSTRAINT "watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."watches" ADD CONSTRAINT "watches_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "app"."titles"("id") ON DELETE cascade ON UPDATE no action;