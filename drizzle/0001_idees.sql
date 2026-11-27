CREATE TABLE "idea_cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"access" text,
	"budget" text,
	"url" text,
	"source" text DEFAULT 'import' NOT NULL,
	"created_by" uuid,
	"hidden" boolean DEFAULT false NOT NULL,
	"retained" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_city_votes" (
	"city_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_city_votes_city_id_participant_id_pk" PRIMARY KEY("city_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "idea_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"event_id" uuid,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_event_votes" (
	"event_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_event_votes_event_id_participant_id_pk" PRIMARY KEY("event_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "idea_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'autre' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"dates_text" text,
	"price_text" text,
	"price_min_cents" integer,
	"url" text,
	"address" text,
	"source" text DEFAULT 'import' NOT NULL,
	"created_by" uuid,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_cities" ADD CONSTRAINT "idea_cities_created_by_participants_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_city_votes" ADD CONSTRAINT "idea_city_votes_city_id_idea_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."idea_cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_city_votes" ADD CONSTRAINT "idea_city_votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_comments" ADD CONSTRAINT "idea_comments_city_id_idea_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."idea_cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_comments" ADD CONSTRAINT "idea_comments_event_id_idea_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."idea_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_comments" ADD CONSTRAINT "idea_comments_author_id_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_event_votes" ADD CONSTRAINT "idea_event_votes_event_id_idea_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."idea_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_event_votes" ADD CONSTRAINT "idea_event_votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_events" ADD CONSTRAINT "idea_events_city_id_idea_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."idea_cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_events" ADD CONSTRAINT "idea_events_created_by_participants_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idea_cities_key_idx" ON "idea_cities" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idea_city_votes_participant_idx" ON "idea_city_votes" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "idea_comments_city_idx" ON "idea_comments" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "idea_event_votes_participant_idx" ON "idea_event_votes" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_events_city_key_idx" ON "idea_events" USING btree ("city_id","key");