-- Code-Violation Alerts (MVP) — additive migration. Apply directly; do NOT db:push
-- (push wants to truncate market_scan_queue — known unrelated drift). FKs + uniques
-- are inlined and every object uses IF NOT EXISTS so this file is safe to re-run.

CREATE TABLE IF NOT EXISTS "cv_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"uploaded_by" uuid,
	"file_name" text NOT NULL,
	"raw_ref" text,
	"status" text DEFAULT 'enqueued' NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_matched" integer DEFAULT 0 NOT NULL,
	"rows_unmatched" integer DEFAULT 0 NOT NULL,
	"violations_new" integer DEFAULT 0 NOT NULL,
	"notifications_sent" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "cv_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_number" text NOT NULL,
	"record_type" text,
	"application_name" text,
	"status_text" text,
	"description" text,
	"violation_date" date,
	"raw_address" text NOT NULL,
	"normalized_address" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"first_seen_upload_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_violations_record_number_unique" UNIQUE("record_number"),
	CONSTRAINT "cv_violations_first_seen_upload_id_cv_uploads_id_fk" FOREIGN KEY ("first_seen_upload_id") REFERENCES "public"."cv_uploads"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"violation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"owner_company_id" uuid,
	"owner_name" text,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_matches_violation_id_unique" UNIQUE("violation_id"),
	CONSTRAINT "cv_matches_violation_id_cv_violations_id_fk" FOREIGN KEY ("violation_id") REFERENCES "public"."cv_violations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "cv_matches_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "cv_matches_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_notifications_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"violation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cv_notifications_violation_user_channel" UNIQUE("violation_id","user_id","channel"),
	CONSTRAINT "cv_notifications_sent_violation_id_cv_violations_id_fk" FOREIGN KEY ("violation_id") REFERENCES "public"."cv_violations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "cv_notifications_sent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "cv_notifications_sent_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cv_violations_status_created" ON "cv_violations" USING btree ("processing_status","created_at");
