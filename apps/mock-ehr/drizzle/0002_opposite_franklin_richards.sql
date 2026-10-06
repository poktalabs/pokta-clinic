CREATE TYPE "public"."intake_completion" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."red_flag_severity" AS ENUM('emergencia', 'urgencia');--> statement-breakpoint
CREATE TABLE "communication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"practitioner_id" uuid NOT NULL,
	"severity" "red_flag_severity" NOT NULL,
	"conversation_id" text NOT NULL,
	"patient_words" text NOT NULL,
	"instruction" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "intake" ADD COLUMN "completion" "intake_completion" DEFAULT 'in_progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "intake" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD COLUMN "url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_practitioner_id_practitioner_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake" ADD CONSTRAINT "intake_conversation_id_unique" UNIQUE("conversation_id");--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_url_unique" UNIQUE("url");