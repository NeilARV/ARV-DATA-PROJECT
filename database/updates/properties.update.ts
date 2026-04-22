import { z } from "zod";

const PROPERTY_STATUSES = ["in-renovation", "on-market", "sold", "wholesale"] as const;

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const patchTransactionInputSchema = z.object({
  transactionType: z.string().nullable().optional(),
  recordingDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  buyerName: z.string().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  salePrice: z.string().nullable().optional(),
  firstMtgLenderName: z.string().nullable().optional(),
});

export type PatchTransactionInput = z.infer<typeof patchTransactionInputSchema>;

export const patchPropertySchema = z.object({
  isArvFunded: z.boolean().optional(),
  statuses: z.array(z.enum(PROPERTY_STATUSES)).min(1).optional(),
  buyerCompanyName: z.string().optional(),
  sellerCompanyName: z.string().optional(),
  transactions: z.array(patchTransactionInputSchema).optional(),
  deletedTransactionIds: z.array(z.number().int().positive()).optional(),
}).strict().refine(
  (data) =>
    data.isArvFunded !== undefined ||
    data.statuses !== undefined ||
    data.buyerCompanyName !== undefined ||
    data.sellerCompanyName !== undefined ||
    data.transactions !== undefined ||
    data.deletedTransactionIds !== undefined,
  { message: "At least one field must be provided" }
);

export const updatePropertySchema = z.object({
  sfrPropertyId: z.coerce.number().int().optional(),
  buyerId: z.string().uuid().nullable().optional(),
  sellerId: z.string().uuid().nullable().optional(),
  propertyClassDescription: z.string().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  vacant: z.boolean().nullable().optional(),
  hoa: z.string().nullable().optional(),
  ownerType: z.string().nullable().optional(),
  purchaseMethod: z.string().nullable().optional(),
  listingStatus: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  monthsOwned: z.coerce.number().int().nullable().optional(),
  msa: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
}).strict();

export const updateAddressSchema = z.object({
  formattedStreetAddress: z.string().nullable().optional(),
  streetNumber: z.string().nullable().optional(),
  streetSuffix: z.string().nullable().optional(),
  streetPreDirection: z.string().nullable().optional(),
  streetName: z.string().nullable().optional(),
  streetPostDirection: z.string().nullable().optional(),
  unitType: z.string().nullable().optional(),
  unitNumber: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  zipPlusFourCode: z.string().nullable().optional(),
  carrierCode: z.string().nullable().optional(),
  latitude: z.coerce.number().nullable().optional(),
  longitude: z.coerce.number().nullable().optional(),
  geocodingAccuracy: z.string().nullable().optional(),
  censusTract: z.string().nullable().optional(),
  censusBlock: z.string().nullable().optional(),
}).strict();

export const updateStructureSchema = z.object({
  totalAreaSqFt: z.coerce.number().int().nullable().optional(),
  yearBuilt: z.coerce.number().int().nullable().optional(),
  effectiveYearBuilt: z.coerce.number().int().nullable().optional(),
  bedsCount: z.coerce.number().int().nullable().optional(),
  roomsCount: z.coerce.number().int().nullable().optional(),
  baths: z.coerce.number().nullable().optional(),
  basementType: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  constructionType: z.string().nullable().optional(),
  exteriorWallType: z.string().nullable().optional(),
  fireplaces: z.coerce.number().int().nullable().optional(),
  heatingType: z.string().nullable().optional(),
  heatingFuelType: z.string().nullable().optional(),
  parkingSpacesCount: z.coerce.number().int().nullable().optional(),
  poolType: z.string().nullable().optional(),
  quality: z.string().nullable().optional(),
  roofMaterialType: z.string().nullable().optional(),
  roofStyleType: z.string().nullable().optional(),
  sewerType: z.string().nullable().optional(),
  stories: z.string().nullable().optional(),
  unitsCount: z.coerce.number().int().nullable().optional(),
  waterType: z.string().nullable().optional(),
  livingAreaSqft: z.coerce.number().int().nullable().optional(),
  acDescription: z.string().nullable().optional(),
  garageDescription: z.string().nullable().optional(),
  buildingClassDescription: z.string().nullable().optional(),
  sqftDescription: z.string().nullable().optional(),
}).strict();