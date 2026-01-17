import { relations } from "drizzle-orm";
import { properties } from "./properties.schema";
import { companies } from "./companies.schema";
import {
  addresses,
  structures,
  assessments,
  exemptions,
  parcels,
  schoolDistricts,
  taxRecords,
  valuations,
  preForeclosures,
  lastSales,
  currentSales,
  streetviewCache,
  propertyTransactions,
} from "./properties.schema";

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  company: one(companies, {
    fields: [properties.companyId],
    references: [companies.id],
  }),
  address: one(addresses, {
    fields: [properties.id],
    references: [addresses.propertyId],
  }),
  structure: one(structures, {
    fields: [properties.id],
    references: [structures.propertyId],
  }),
  exemptions: one(exemptions, {
    fields: [properties.id],
    references: [exemptions.propertyId],
  }),
  parcel: one(parcels, {
    fields: [properties.id],
    references: [parcels.propertyId],
  }),
  schoolDistrict: one(schoolDistricts, {
    fields: [properties.id],
    references: [schoolDistricts.propertyId],
  }),
  preForeclosure: one(preForeclosures, {
    fields: [properties.id],
    references: [preForeclosures.propertyId],
  }),
  lastSale: one(lastSales, {
    fields: [properties.id],
    references: [lastSales.propertyId],
  }),
  currentSale: one(currentSales, {
    fields: [properties.id],
    references: [currentSales.propertyId],
  }),
  assessments: many(assessments),
  taxRecords: many(taxRecords),
  valuations: many(valuations),
  transactions: many(propertyTransactions),
  streetviewCache: many(streetviewCache),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  properties: many(properties),
  transactions: many(propertyTransactions),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  property: one(properties, {
    fields: [addresses.propertyId],
    references: [properties.id],
  }),
}));

export const structuresRelations = relations(structures, ({ one }) => ({
  property: one(properties, {
    fields: [structures.propertyId],
    references: [properties.id],
  }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  property: one(properties, {
    fields: [assessments.propertyId],
    references: [properties.id],
  }),
}));

export const exemptionsRelations = relations(exemptions, ({ one }) => ({
  property: one(properties, {
    fields: [exemptions.propertyId],
    references: [properties.id],
  }),
}));

export const parcelsRelations = relations(parcels, ({ one }) => ({
  property: one(properties, {
    fields: [parcels.propertyId],
    references: [properties.id],
  }),
}));

export const schoolDistrictsRelations = relations(schoolDistricts, ({ one }) => ({
  property: one(properties, {
    fields: [schoolDistricts.propertyId],
    references: [properties.id],
  }),
}));

export const taxRecordsRelations = relations(taxRecords, ({ one }) => ({
  property: one(properties, {
    fields: [taxRecords.propertyId],
    references: [properties.id],
  }),
}));

export const valuationsRelations = relations(valuations, ({ one }) => ({
  property: one(properties, {
    fields: [valuations.propertyId],
    references: [properties.id],
  }),
}));

export const preForeclosuresRelations = relations(preForeclosures, ({ one }) => ({
  property: one(properties, {
    fields: [preForeclosures.propertyId],
    references: [properties.id],
  }),
}));

export const lastSalesRelations = relations(lastSales, ({ one }) => ({
  property: one(properties, {
    fields: [lastSales.propertyId],
    references: [properties.id],
  }),
}));

export const currentSalesRelations = relations(currentSales, ({ one }) => ({
  property: one(properties, {
    fields: [currentSales.propertyId],
    references: [properties.id],
  }),
}));

export const streetviewCacheRelations = relations(streetviewCache, ({ one }) => ({
  property: one(properties, {
    fields: [streetviewCache.propertyId],
    references: [properties.id],
  }),
}));

export const propertyTransactionsRelations = relations(propertyTransactions, ({ one }) => ({
  property: one(properties, {
    fields: [propertyTransactions.propertyId],
    references: [properties.id],
  }),
  company: one(companies, {
    fields: [propertyTransactions.companyId],
    references: [companies.id],
  }),
}));