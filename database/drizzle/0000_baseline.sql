CREATE TYPE "public"."deal_type" AS ENUM('wholesale', 'agent', 'sold');--> statement-breakpoint
CREATE TABLE "account_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "account_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "email_subscription_list" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"msa" integer,
	"relationship_manager_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscription_list_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" text NOT NULL,
	"expire" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriptions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_account_types" (
	"user_id" uuid NOT NULL,
	"account_type_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_account_types_user_id_account_type_id_pk" PRIMARY KEY("user_id","account_type_id")
);
--> statement-breakpoint
CREATE TABLE "user_relationship_managers" (
	"user_id" uuid NOT NULL,
	"relationship_manager_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_relationship_managers_user_id_relationship_manager_id_pk" PRIMARY KEY("user_id","relationship_manager_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notifications" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"subscription_id" integer,
	"county" text DEFAULT 'San Diego',
	"state" varchar(2) DEFAULT 'CA',
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "msas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "msas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_msa_subscriptions" (
	"user_id" uuid NOT NULL,
	"msa_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_msa_subscriptions_user_id_msa_id_pk" PRIMARY KEY("user_id","msa_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"is_arv_client" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "companies_company_unique" UNIQUE("company")
);
--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone_number" varchar(20),
	"title" text,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_counties" (
	"company_id" uuid NOT NULL,
	"county" text NOT NULL,
	"state" varchar(2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "company_counties_company_id_county_state_pk" PRIMARY KEY("company_id","county","state")
);
--> statement-breakpoint
CREATE TABLE "company_msas" (
	"company_id" uuid NOT NULL,
	"msa_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "company_msas_company_id_msa_id_pk" PRIMARY KEY("company_id","msa_id")
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"addresses_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"formatted_street_address" varchar(200),
	"street_number" varchar(20),
	"street_suffix" varchar(20),
	"street_pre_direction" varchar(10),
	"street_name" varchar(100),
	"street_post_direction" varchar(10),
	"unit_type" varchar(20),
	"unit_number" varchar(20),
	"city" varchar(100),
	"county" varchar(100),
	"state" varchar(2),
	"zip_code" varchar(10),
	"zip_plus_four_code" varchar(10),
	"carrier_code" varchar(20),
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"geocoding_accuracy" varchar(200),
	"census_tract" varchar(20),
	"census_block" varchar(20),
	CONSTRAINT "addresses_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"assessments_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"assessed_year" integer NOT NULL,
	"land_value" numeric(15, 2),
	"improvement_value" numeric(15, 2),
	"assessed_value" numeric(15, 2),
	"market_value" numeric(15, 2),
	CONSTRAINT "assessments_property_id_assessed_year_unique" UNIQUE("property_id","assessed_year")
);
--> statement-breakpoint
CREATE TABLE "current_sales" (
	"current_sales_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"doc_num" varchar(50),
	"buyer_1" varchar(200),
	"buyer_2" varchar(200),
	"seller_1" varchar(200),
	"seller_2" varchar(200),
	CONSTRAINT "current_sales_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "exemptions" (
	"exemptions_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"homeowner" boolean,
	"veteran" boolean,
	"disabled" boolean,
	"widow" boolean,
	"senior" boolean,
	"school" boolean,
	"religious" boolean,
	"welfare" boolean,
	"public" boolean,
	"cemetery" boolean,
	"hospital" boolean,
	"library" boolean,
	CONSTRAINT "exemptions_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "last_sales" (
	"last_sales_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"sale_date" date,
	"recording_date" date,
	"price" numeric(15, 2),
	"document_type" text,
	"mtg_amount" numeric(15, 2),
	"mtg_type" text,
	"lender" varchar(200),
	"mtg_interest_rate" varchar(20),
	"mtg_term_months" varchar(10),
	CONSTRAINT "last_sales_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"parcels_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"apn_original" varchar(50),
	"fips_code" varchar(10),
	"frontage_ft" varchar(20),
	"depth_ft" varchar(20),
	"area_acres" varchar(20),
	"area_sq_ft" integer,
	"zoning" varchar(50),
	"county_land_use_code" varchar(20),
	"lot_number" varchar(50),
	"subdivision" varchar(200),
	"section_township_range" text,
	"legal_description" text,
	"state_land_use_code" varchar(20),
	"building_count" integer,
	CONSTRAINT "parcels_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "pre_foreclosures" (
	"pre_foreclosures_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"flag" boolean,
	"ind" varchar(50),
	"reason" text,
	"doc_type" text,
	"recording_date" date,
	CONSTRAINT "pre_foreclosures_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sfr_property_id" bigint NOT NULL,
	"property_class_description" text,
	"property_type" varchar(100),
	"vacant" varchar(50),
	"hoa" varchar(50),
	"owner_type" varchar(50),
	"purchase_method" varchar(50),
	"listing_status" varchar(50),
	"status" varchar(50) DEFAULT 'in-renovation',
	"months_owned" integer,
	"msa" varchar(200),
	"county" varchar(200),
	"is_arv_funded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "properties_sfr_property_id_unique" UNIQUE("sfr_property_id")
);
--> statement-breakpoint
CREATE TABLE "property_transactions" (
	"property_transactions_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"seller_id" uuid,
	"seller_name" varchar(200),
	"buyer_id" uuid,
	"buyer_name" varchar(200),
	"apn" varchar(50),
	"transaction_type" varchar(50),
	"sale_date" date NOT NULL,
	"recording_date" date NOT NULL,
	"sale_price" numeric(15, 2),
	"first_mtg_recording_date" date,
	"first_mtg_amount" numeric(15, 2),
	"first_mtg_lender_name" varchar(200),
	"first_mtg_due_date" date,
	"sort_order" integer,
	"user_created" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "school_districts" (
	"school_districts_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"school_tax_district_1" text,
	"school_tax_district_2" text,
	"school_tax_district_3" text,
	"school_district_name" varchar(200),
	CONSTRAINT "school_districts_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "streetview_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sfr_property_id" bigint,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"size" text DEFAULT '600x400' NOT NULL,
	"image_data" "bytea",
	"content_type" text DEFAULT 'image/jpeg',
	"metadata_status" text,
	"image_source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structures" (
	"structures_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"total_area_sq_ft" integer,
	"year_built" integer,
	"effective_year_built" integer,
	"beds_count" integer,
	"rooms_count" integer,
	"baths" numeric(3, 1),
	"basement_type" varchar(50),
	"condition" varchar(50),
	"construction_type" varchar(50),
	"exterior_wall_type" varchar(50),
	"fireplaces" integer,
	"heating_type" varchar(50),
	"heating_fuel_type" varchar(50),
	"parking_spaces_count" integer,
	"pool_type" varchar(50),
	"quality" varchar(50),
	"roof_material_type" varchar(50),
	"roof_style_type" varchar(50),
	"sewer_type" varchar(50),
	"stories" varchar(50),
	"units_count" integer,
	"water_type" varchar(50),
	"living_area_sqft" integer,
	"ac_description" text,
	"garage_description" text,
	"building_class_description" text,
	"sqft_description" text,
	CONSTRAINT "structures_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "tax_records" (
	"tax_records_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"tax_amount" numeric(15, 2),
	"tax_delinquent_year" integer,
	"tax_rate_code_area" varchar(50),
	CONSTRAINT "tax_records_property_id_tax_year_unique" UNIQUE("property_id","tax_year")
);
--> statement-breakpoint
CREATE TABLE "valuations" (
	"valuations_id" serial PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"value" numeric(15, 2),
	"high" numeric(15, 2),
	"low" numeric(15, 2),
	"forecast_standard_deviation" numeric(18, 15),
	"valuation_date" date,
	CONSTRAINT "valuations_property_id_valuation_date_unique" UNIQUE("property_id","valuation_date")
);
--> statement-breakpoint
CREATE TABLE "market_scan_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sfr_market_id" integer NOT NULL,
	"sfr_property_id" bigint NOT NULL,
	"address" text,
	"city" text,
	"state" varchar(2),
	"zip_code" varchar(10),
	"msa_id" integer NOT NULL,
	"sale_date" date NOT NULL,
	"recording_date" date NOT NULL,
	"buyer_name" text,
	"seller_name" text,
	"sale_value" numeric(15, 2),
	"lender_name" text,
	"is_corporate" boolean,
	"is_private_lender" boolean,
	"property_type" text,
	"raw_data" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"scan_window" varchar(10),
	"error_message" text,
	"enqueued_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "market_scan_queue_sfr_market_id_unique" UNIQUE("sfr_market_id"),
	CONSTRAINT "uq_msq_msa_property" UNIQUE("msa_id","sfr_property_id")
);
--> statement-breakpoint
CREATE TABLE "sent_property_ids" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sfr_sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"msa" varchar(255) NOT NULL,
	"last_sale_date" date,
	"last_recording_date" date,
	"total_records_synced" integer DEFAULT 0,
	"last_sync_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "sfr_sync_state_msa_unique" UNIQUE("msa")
);
--> statement-breakpoint
CREATE TABLE "property_statuses" (
	"property_id" uuid NOT NULL,
	"status_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "property_statuses_property_id_status_id_pk" PRIMARY KEY("property_id","status_id")
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "deal_links" (
	"deal_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "deal_links_deal_id_sort_order_pk" PRIMARY KEY("deal_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sfr_property_id" bigint,
	"user_id" uuid NOT NULL,
	"msa_id" integer,
	"type" "deal_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"address" text,
	"city" text,
	"state" varchar(2),
	"zip_code" varchar(10) NOT NULL,
	"price" numeric(15, 2),
	"potential_arv" numeric(15, 2),
	"beds" integer,
	"baths" numeric(3, 1),
	"sqft" integer,
	"property_type" varchar(100),
	"notes" text,
	"close_of_escrow" numeric(15, 2)
);
--> statement-breakpoint
ALTER TABLE "email_subscription_list" ADD CONSTRAINT "email_subscription_list_relationship_manager_id_users_id_fk" FOREIGN KEY ("relationship_manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_account_types" ADD CONSTRAINT "user_account_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_account_types" ADD CONSTRAINT "user_account_types_account_type_id_account_types_id_fk" FOREIGN KEY ("account_type_id") REFERENCES "public"."account_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationship_managers" ADD CONSTRAINT "user_relationship_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationship_managers" ADD CONSTRAINT "user_relationship_managers_relationship_manager_id_users_id_fk" FOREIGN KEY ("relationship_manager_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_msa_subscriptions" ADD CONSTRAINT "user_msa_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_msa_subscriptions" ADD CONSTRAINT "user_msa_subscriptions_msa_id_msas_id_fk" FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_counties" ADD CONSTRAINT "company_counties_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_msas" ADD CONSTRAINT "company_msas_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_msas" ADD CONSTRAINT "company_msas_msa_id_msas_id_fk" FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_sales" ADD CONSTRAINT "current_sales_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exemptions" ADD CONSTRAINT "exemptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_sales" ADD CONSTRAINT "last_sales_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_foreclosures" ADD CONSTRAINT "pre_foreclosures_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_seller_id_companies_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_buyer_id_companies_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_districts" ADD CONSTRAINT "school_districts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structures" ADD CONSTRAINT "structures_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_records" ADD CONSTRAINT "tax_records_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_scan_queue" ADD CONSTRAINT "market_scan_queue_msa_id_msas_id_fk" FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_property_ids" ADD CONSTRAINT "sent_property_ids_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_statuses" ADD CONSTRAINT "property_statuses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_statuses" ADD CONSTRAINT "property_statuses_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_links" ADD CONSTRAINT "deal_links_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_msa_id_msas_id_fk" FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE restrict ON UPDATE no action;