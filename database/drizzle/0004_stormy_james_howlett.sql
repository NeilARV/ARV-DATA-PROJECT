CREATE INDEX "idx_company_contacts_company_id" ON "company_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_addresses_county_lower" ON "addresses" USING btree (lower(trim("county")));--> statement-breakpoint
CREATE INDEX "idx_properties_county_lower" ON "properties" USING btree (lower(trim("county")));--> statement-breakpoint
CREATE INDEX "idx_pt_property_tx_type_sort" ON "property_transactions" USING btree ("property_id",lower(trim("transaction_type")),coalesce("sort_order", 999999),"recording_date");--> statement-breakpoint
CREATE INDEX "idx_pt_property_buyer_date" ON "property_transactions" USING btree ("property_id","buyer_id","recording_date");--> statement-breakpoint
CREATE INDEX "idx_pt_seller_date" ON "property_transactions" USING btree ("seller_id","recording_date");--> statement-breakpoint
CREATE INDEX "idx_pt_buyer_date" ON "property_transactions" USING btree ("buyer_id","recording_date");--> statement-breakpoint
CREATE INDEX "idx_pt_buyer_sort1" ON "property_transactions" USING btree ("buyer_id") WHERE "property_transactions"."sort_order" = 1;--> statement-breakpoint
CREATE INDEX "idx_property_statuses_property_id" ON "property_statuses" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_property_statuses_status_id" ON "property_statuses" USING btree ("status_id");