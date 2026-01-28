import { createInsertSchema } from "drizzle-zod";
import {
  properties,
  addresses,
  assessments,
  exemptions,
  parcels,
  schoolDistricts,
  structures,
  taxRecords,
  valuations,
  preForeclosures,
  lastSales,
  currentSales,
  streetviewCache,
  propertyTransactions,
} from "../schemas";
import { z } from "zod";

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAddressSchema = createInsertSchema(addresses).omit({
  addressesId: true,
});

export const insertAssessmentSchema = createInsertSchema(assessments).omit({
  assessmentsId: true,
});

export const insertExemptionSchema = createInsertSchema(exemptions).omit({
  exemptionsId: true,
});

export const insertParcelSchema = createInsertSchema(parcels).omit({
  parcelsId: true,
});

export const insertSchoolDistrictSchema = createInsertSchema(schoolDistricts).omit({
  schoolDistrictsId: true,
});

export const insertStructureSchema = createInsertSchema(structures).omit({
  structuresId: true,
});

export const insertTaxRecordSchema = createInsertSchema(taxRecords).omit({
  taxRecordsId: true,
});

export const insertValuationSchema = createInsertSchema(valuations).omit({
  valuationsId: true,
});

export const insertPreForeclosureSchema = createInsertSchema(preForeclosures).omit({
  preForeclosuresId: true,
});

export const insertLastSaleSchema = createInsertSchema(lastSales).omit({
  lastSalesId: true,
});

export const insertCurrentSaleSchema = createInsertSchema(currentSales).omit({
  currentSalesId: true,
});

export const insertStreetviewCacheSchema = createInsertSchema(streetviewCache).omit({
  id: true,
  createdAt: true,
});

export const insertPropertyTransactionSchema = createInsertSchema(propertyTransactions).omit({
  propertyTransactionsId: true,
  createdAt: true,
});

export const manualPropertyEntrySchema = z.object({
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(5, "Valid zip code is required"),
});