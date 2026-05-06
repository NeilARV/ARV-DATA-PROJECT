CREATE TYPE "public"."address_type" AS ENUM('registered', 'mailing', 'head_office');--> statement-breakpoint
CREATE TABLE "company_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"address_type" "address_type" NOT NULL,
	"street_address" text,
	"locality" text,
	"region" varchar(10),
	"postal_code" varchar(20),
	"country" text,
	"address_in_full" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"jurisdiction_code" varchar(20) NOT NULL,
	"oc_company_number" varchar(50) NOT NULL,
	"incorporation_date" date,
	"dissolution_date" date,
	"company_type" varchar(100),
	"registry_url" text,
	"branch" text,
	"branch_status" text,
	"inactive" boolean DEFAULT false NOT NULL,
	"source_name" text,
	"source_url" text,
	"agent_name" text,
	"agent_address" text,
	"alternative_names" jsonb,
	"previous_names" jsonb,
	"number_of_employees" integer,
	"native_company_number" varchar(50),
	"alternate_registration_entities" jsonb,
	"previous_registration_entities" jsonb,
	"subsequent_registration_entities" jsonb,
	"industry_codes" jsonb,
	"identifiers" jsonb,
	"trademark_registrations" jsonb,
	"corporate_groupings" jsonb,
	"financial_summary" text,
	"home_company" text,
	"controlling_entity" text,
	"ultimate_beneficial_owners" jsonb,
	"ultimate_controlling_company" text,
	"filings" jsonb,
	"enriched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "company_details_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "company_contacts" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_details" ADD CONSTRAINT "company_details_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_company_addresses_company_id" ON "company_addresses" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_company_contacts_unique_name" ON "company_contacts" USING btree ("company_id","first_name","last_name");