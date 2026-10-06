CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"razon_social" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_razon_social_unique" UNIQUE("razon_social")
);
--> statement-breakpoint
CREATE TABLE "practitioner_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_role_practitioner_id_establishment_id_unique" UNIQUE("practitioner_id","establishment_id")
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "establishment_id" uuid;--> statement-breakpoint
ALTER TABLE "establishment" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "establishment" ADD COLUMN "codigo" text;--> statement-breakpoint
ALTER TABLE "establishment" ADD COLUMN "horarios" jsonb;--> statement-breakpoint
ALTER TABLE "practitioner_role" ADD CONSTRAINT "practitioner_role_practitioner_id_practitioner_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_role" ADD CONSTRAINT "practitioner_role_establishment_id_establishment_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_establishment_id_establishment_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishment" ADD CONSTRAINT "establishment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishment" ADD CONSTRAINT "establishment_codigo_unique" UNIQUE("codigo");--> statement-breakpoint
-- Backfill (hand-edited): every old practitioner works at the establishment they already belong to, and every old
-- appointment took place there. Only then is the appointment column made NOT NULL. No row is deleted or rewritten otherwise.
INSERT INTO "practitioner_role" ("practitioner_id", "establishment_id") SELECT "id", "establishment_id" FROM "practitioner" ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "appointment" SET "establishment_id" = "practitioner"."establishment_id" FROM "practitioner" WHERE "appointment"."practitioner_id" = "practitioner"."id" AND "appointment"."establishment_id" IS NULL;--> statement-breakpoint
ALTER TABLE "appointment" ALTER COLUMN "establishment_id" SET NOT NULL;
