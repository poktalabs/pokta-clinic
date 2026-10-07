CREATE TYPE "public"."callback_status" AS ENUM('requested', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "callback_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"establishment_id" uuid,
	"conversation_id" text NOT NULL,
	"status" "callback_status" DEFAULT 'requested' NOT NULL,
	"availability" text NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"calendar_event_id" text,
	"authored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "callback_task_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "contacto_emergencia_nombre" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "contacto_emergencia_telefono" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "aseguradora" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "poliza" text;--> statement-breakpoint
ALTER TABLE "callback_task" ADD CONSTRAINT "callback_task_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_task" ADD CONSTRAINT "callback_task_establishment_id_establishment_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishment"("id") ON DELETE no action ON UPDATE no action;