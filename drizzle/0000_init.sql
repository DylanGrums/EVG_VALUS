CREATE TABLE "questionnaire_organizer" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer NOT NULL,
	"name" text DEFAULT 'Organisateur' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_participations" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"knowledge" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "questionnaire_versions" (
	"version" integer PRIMARY KEY NOT NULL,
	"definition" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'autre' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"vote_mode" text DEFAULT 'unique' NOT NULL,
	"deadline" timestamp,
	"depends_on_id" uuid,
	"allow_proposals" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_votes" (
	"option_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_votes_option_id_participant_id_pk" PRIMARY KEY("option_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "orga_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"option_id" uuid,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practical_infos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'autre' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"address" text,
	"url" text,
	"phone" text,
	"at" timestamp,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text,
	"image_url" text,
	"address" text,
	"price_total_cents" integer,
	"price_per_person_cents" integer,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"opening_hours" text,
	"practical_notes" text,
	"proposed_by_id" uuid,
	"proposed_by_orga" boolean DEFAULT false NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_topics" ADD CONSTRAINT "decision_topics_depends_on_id_decision_topics_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."decision_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_votes" ADD CONSTRAINT "option_votes_option_id_topic_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."topic_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_votes" ADD CONSTRAINT "option_votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orga_comments" ADD CONSTRAINT "orga_comments_topic_id_decision_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."decision_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orga_comments" ADD CONSTRAINT "orga_comments_option_id_topic_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."topic_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orga_comments" ADD CONSTRAINT "orga_comments_author_id_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_options" ADD CONSTRAINT "topic_options_topic_id_decision_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."decision_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_options" ADD CONSTRAINT "topic_options_proposed_by_id_participants_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_topics_position_idx" ON "decision_topics" USING btree ("position");--> statement-breakpoint
CREATE INDEX "option_votes_participant_idx" ON "option_votes" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "orga_comments_topic_idx" ON "orga_comments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_options_topic_idx" ON "topic_options" USING btree ("topic_id");