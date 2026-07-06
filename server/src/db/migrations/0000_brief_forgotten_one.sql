CREATE TABLE "game_players" (
	"game_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"user_id" uuid,
	"username_snapshot" text NOT NULL,
	"final_score" integer NOT NULL,
	"final_position" integer NOT NULL,
	"contracts_made" integer NOT NULL,
	"contracts_total" integer NOT NULL,
	"xishts" integer NOT NULL,
	"ranking_points" integer DEFAULT 0 NOT NULL,
	"xp_awarded" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "game_players_game_id_seat_pk" PRIMARY KEY("game_id","seat")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text NOT NULL,
	"visibility" text NOT NULL,
	"ranked" boolean NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_players_user_id_idx" ON "game_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));