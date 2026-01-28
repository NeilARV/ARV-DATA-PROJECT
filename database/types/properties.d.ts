import { z } from "zod";
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
} from "../schemas/properties.schema";
import {
  insertPropertySchema,
  insertAddressSchema,
  insertAssessmentSchema,
  insertExemptionSchema,
  insertParcelSchema,
  insertSchoolDistrictSchema,
  insertStructureSchema,
  insertTaxRecordSchema,
  insertValuationSchema,
  insertPreForeclosureSchema,
  insertLastSaleSchema,
  insertCurrentSaleSchema,
  insertStreetviewCacheSchema,
  insertPropertyTransactionSchema,
  manualPropertyEntrySchema,
} from "../inserts/properties.insert";
import {
  updatePropertySchema,
  updateAddressSchema,
  updateStructureSchema,
} from "../updates/properties.update";

export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type UpdateProperty = z.infer<typeof updatePropertySchema>;

export type Address = typeof addresses.$inferSelect;
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type UpdateAddress = z.infer<typeof updateAddressSchema>;

export type Assessment = typeof assessments.$inferSelect;
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;

export type Exemption = typeof exemptions.$inferSelect;
export type InsertExemption = z.infer<typeof insertExemptionSchema>;

export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = z.infer<typeof insertParcelSchema>;

export type SchoolDistrict = typeof schoolDistricts.$inferSelect;
export type InsertSchoolDistrict = z.infer<typeof insertSchoolDistrictSchema>;

export type Structure = typeof structures.$inferSelect;
export type InsertStructure = z.infer<typeof insertStructureSchema>;
export type UpdateStructure = z.infer<typeof updateStructureSchema>;

export type TaxRecord = typeof taxRecords.$inferSelect;
export type InsertTaxRecord = z.infer<typeof insertTaxRecordSchema>;

export type Valuation = typeof valuations.$inferSelect;
export type InsertValuation = z.infer<typeof insertValuationSchema>;

export type PreForeclosure = typeof preForeclosures.$inferSelect;
export type InsertPreForeclosure = z.infer<typeof insertPreForeclosureSchema>;

export type LastSale = typeof lastSales.$inferSelect;
export type InsertLastSale = z.infer<typeof insertLastSaleSchema>;

export type CurrentSale = typeof currentSales.$inferSelect;
export type InsertCurrentSale = z.infer<typeof insertCurrentSaleSchema>;

export type StreetviewCache = typeof streetviewCache.$inferSelect;
export type InsertStreetviewCache = z.infer<typeof insertStreetviewCacheSchema>;

export type PropertyTransaction = typeof propertyTransactions.$inferSelect;
export type InsertPropertyTransaction = z.infer<typeof insertPropertyTransactionSchema>;

export type ManualPropertyEntry = z.infer<typeof manualPropertyEntrySchema>;