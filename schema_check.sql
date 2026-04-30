E ONLY public.addresses
    ADD CONSTRAINT addresses_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: company_contacts company_contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_contacts
    ADD CONSTRAINT company_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_contacts company_contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_contacts
    ADD CONSTRAINT company_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: company_counties company_counties_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_counties
    ADD CONSTRAINT company_counties_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_msas company_msas_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_msas
    ADD CONSTRAINT company_msas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_msas company_msas_msa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_msas
    ADD CONSTRAINT company_msas_msa_id_fkey FOREIGN KEY (msa_id) REFERENCES public.msas(id) ON DELETE CASCADE;


--
-- Name: current_sales current_sales_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.current_sales
    ADD CONSTRAINT current_sales_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: deal_links deal_links_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_links
    ADD CONSTRAINT deal_links_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deals deals_msa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_msa_id_fkey FOREIGN KEY (msa_id) REFERENCES public.msas(id) ON DELETE RESTRICT;


--
-- Name: deals deals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_subscription_list email_subscription_list_msa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_subscription_list
    ADD CONSTRAINT email_subscription_list_msa_fkey FOREIGN KEY (msa) REFERENCES public.msas(id) ON DELETE SET NULL;


--
-- Name: email_subscription_list email_subscription_list_relationship_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_subscription_list
    ADD CONSTRAINT email_subscription_list_relationship_manager_id_fkey FOREIGN KEY (relationship_manager_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: exemptions exemptions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exemptions
    ADD CONSTRAINT exemptions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: last_sales last_sales_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.last_sales
    ADD CONSTRAINT last_sales_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: market_scan_queue market_scan_queue_msa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_scan_queue
    ADD CONSTRAINT market_scan_queue_msa_id_fkey FOREIGN KEY (msa_id) REFERENCES public.msas(id) ON DELETE RESTRICT;


--
-- Name: parcels parcels_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcels
    ADD CONSTRAINT parcels_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: pre_foreclosures pre_foreclosures_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_foreclosures
    ADD CONSTRAINT pre_foreclosures_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_statuses property_statuses_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_statuses
    ADD CONSTRAINT property_statuses_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_statuses property_statuses_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_statuses
    ADD CONSTRAINT property_statuses_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.statuses(id) ON DELETE CASCADE;


--
-- Name: property_transactions property_transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_transactions
    ADD CONSTRAINT property_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: property_transactions property_transactions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_transactions
    ADD CONSTRAINT property_transactions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: school_districts school_districts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_districts
    ADD CONSTRAINT school_districts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: sent_property_ids sent_property_ids_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sent_property_ids
    ADD CONSTRAINT sent_property_ids_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: structures structures_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.structures
    ADD CONSTRAINT structures_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: tax_records tax_records_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_records
    ADD CONSTRAINT tax_records_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: user_account_types user_account_types_account_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account_types
    ADD CONSTRAINT user_account_types_account_type_id_fkey FOREIGN KEY (account_type_id) REFERENCES public.account_types(id) ON DELETE CASCADE;


--
-- Name: user_account_types user_account_types_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account_types
    ADD CONSTRAINT user_account_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_msa_subscriptions user_msa_subscriptions_msa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_msa_subscriptions
    ADD CONSTRAINT user_msa_subscriptions_msa_id_fkey FOREIGN KEY (msa_id) REFERENCES public.msas(id) ON DELETE CASCADE;


--
-- Name: user_msa_subscriptions user_msa_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_msa_subscriptions
    ADD CONSTRAINT user_msa_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_relationship_managers user_relationship_managers_relationship_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_relationship_managers
    ADD CONSTRAINT user_relationship_managers_relationship_manager_id_fkey FOREIGN KEY (relationship_manager_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_relationship_managers user_relationship_managers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_relationship_managers
    ADD CONSTRAINT user_relationship_managers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: valuations valuations_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valuations
    ADD CONSTRAINT valuations_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 5pf1RLgivepK2ue4THCON1YClaGqcejXm6MpBqV7A8bNohmsO7qvfXsLqmjmQYr

